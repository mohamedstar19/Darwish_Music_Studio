import { hashPassword, publicUser, requireAdmin, requireAdminGate, requireEditor, validatePassword } from '../auth.js';
import { many, one, PLAYABLE, query, tx } from '../db.js';
import { enqueueTrack, queueLength, removeMedia, saveAudioUpload, saveUpload } from '../media.js';
import { importStatus, importStoredFile, scanImportDir, startImport, stopImport } from '../importer.js';
import { applyLyrics, searchLyrics } from '../lyrics.js';
import { applyImage, artworkStatus, searchArtist, searchTrack, searchWork, startArtworkJob, stopArtworkJob } from '../artwork.js';
import { coverUrl, shapeStation } from '../shape.js';
import { cleanText, httpError, likePattern, slugify, toInt } from '../util.js';
import { officialPlaylists } from './catalog.js';
import { onlineSessions, updatePeak } from '../presence.js';
import { forgetTitle, isHttpUrl, probeStream } from '../streams.js';

const RIGHTS = ['original', 'licensed', 'pending'];
const SCOPES = ['on_demand', 'radio', 'download', 'commercial'];
const WORK_KINDS = ['cartoon', 'anime', 'series', 'film', 'original', 'other'];

function adminTrack(t) {
  return {
    id: t.id,
    title: t.title,
    artistId: t.artist_id,
    artistName: t.artist_name,
    workId: t.work_id,
    workTitle: t.work_title,
    categoryId: t.category_id,
    categoryName: t.category_name,
    year: t.year,
    duration: t.duration_sec,
    lyrics: t.lyrics,
    lyricsSynced: !!t.lyrics_synced,
    lyricsSource: t.lyrics_source,
    credits: t.credits,
    cover: coverUrl(t.cover_path || t.artist_photo_path || t.work_cover_path),
    hasOwnCover: !!t.cover_path,
    // Where the shown picture comes from: the song itself, its artist, or its show.
    coverSource: t.cover_path ? 'own' : t.artist_photo_path ? 'artist' : t.work_cover_path ? 'work' : null,
    artistHasPhoto: !!t.artist_photo_path,
    fileSize: t.file_size,
    processingStatus: t.processing_status,
    processingError: t.processing_error,
    rightsType: t.rights_type,
    rightsSource: t.rights_source,
    rightsNotes: t.rights_notes,
    licenseScope: t.license_scope,
    licenseRegions: t.license_regions,
    licenseExpiresAt: t.license_expires_at,
    isPublished: t.is_published,
    isPlayable: t.playable,
    playCount: t.play_count,
    stationIds: t.station_ids || [],
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

const ADMIN_TRACK_SELECT = `
  SELECT t.*, a.name AS artist_name, a.photo_path AS artist_photo_path, w.title AS work_title, w.cover_path AS work_cover_path,
         c.name AS category_name, ${PLAYABLE} AS playable,
         (SELECT array_agg(st.station_id) FROM station_tracks st WHERE st.track_id = t.id) AS station_ids
  FROM tracks t
  LEFT JOIN artists a ON a.id = t.artist_id
  LEFT JOIN works w ON w.id = t.work_id
  LEFT JOIN categories c ON c.id = t.category_id`;

async function getAdminTrack(id) {
  const t = await one(`${ADMIN_TRACK_SELECT} WHERE t.id = $1`, [id]);
  if (!t) throw httpError(404, 'الأغنية غير موجودة');
  return adminTrack(t);
}

async function artistIdFor(name, client = null) {
  const clean = cleanText(name, 120);
  if (!clean) return null;
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    'INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [clean],
  );
  return rows[0].id;
}

function assertPublishable(t) {
  if (!['original', 'licensed'].includes(t.rights_type)) {
    throw httpError(400, 'مينفعش تنشر أغنية حقوقها لسه "قيد المراجعة". حدد إنها أصلية أو مرخّصة الأول.');
  }
  if (t.processing_status !== 'ready') throw httpError(400, 'الملف لسه بيتجهز أو فشل في المعالجة');
  if (t.license_expires_at && new Date(t.license_expires_at) < new Date(new Date().toDateString())) {
    throw httpError(400, 'الترخيص منتهي');
  }
}

export default async function adminRoutes(app) {
  // Every admin API call must carry the secret admin path; otherwise it looks like it doesn't exist.
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/admin/')) await requireAdminGate(request);
  });

  const editor = { onRequest: requireEditor };
  const admin = { onRequest: requireAdmin };

  // ---- Lookups for forms ----
  app.get('/api/admin/lookups', editor, async () => {
    const [categories, works, artists, stations] = await Promise.all([
      many('SELECT id, name, slug FROM categories ORDER BY sort_order, name'),
      many('SELECT id, title, kind, year FROM works ORDER BY title'),
      many('SELECT id, name FROM artists ORDER BY name'),
      many('SELECT id, name, slug FROM stations ORDER BY sort_order, name'),
    ]);
    return { categories, works, artists, stations, scopes: SCOPES, workKinds: WORK_KINDS };
  });

  // ---- Tracks ----
  app.get('/api/admin/tracks', editor, async (request) => {
    const q = request.query;
    const where = [];
    const params = [];
    if (q.q) {
      params.push(likePattern(String(q.q).toLowerCase()));
      where.push(`(lower(t.title) LIKE $${params.length} OR lower(a.name) LIKE $${params.length} OR lower(w.title) LIKE $${params.length})`);
    }
    if (q.status) {
      params.push(q.status);
      where.push(`t.processing_status = $${params.length}`);
    }
    if (q.rights) {
      params.push(q.rights);
      where.push(`t.rights_type = $${params.length}`);
    }
    if (q.published === 'yes') where.push('t.is_published');
    if (q.published === 'no') where.push('NOT t.is_published');
    if (q.category) {
      params.push(toInt(q.category));
      where.push(`t.category_id = $${params.length}`);
    }
    if (q.work) {
      params.push(toInt(q.work));
      where.push(`t.work_id = $${params.length}`);
    }
    if (q.missing === 'category') where.push('t.category_id IS NULL');
    if (q.missing === 'artist') where.push('t.artist_id IS NULL');
    if (q.missing === 'lyrics') where.push('t.lyrics IS NULL');
    if (q.missing === 'image') where.push('t.cover_path IS NULL AND a.photo_path IS NULL AND w.cover_path IS NULL');
    if (q.ready === 'unpublished') where.push("NOT t.is_published AND t.processing_status = 'ready' AND t.rights_type IN ('original', 'licensed')");
    if (q.station) {
      params.push(toInt(q.station));
      where.push(`t.id IN (SELECT track_id FROM station_tracks WHERE station_id = $${params.length})`);
    }
    const limit = Math.min(toInt(q.limit, 50), 200);
    const offset = Math.max(toInt(q.offset, 0), 0);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, total] = await Promise.all([
      many(`${ADMIN_TRACK_SELECT} ${whereSql} ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
      one(
        `SELECT count(*)::int AS n FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id
         LEFT JOIN works w ON w.id = t.work_id ${whereSql}`,
        params,
      ),
    ]);
    return { items: rows.map(adminTrack), total: total.n, queue: queueLength() };
  });

  app.get('/api/admin/tracks/:id', editor, async (request) => getAdminTrack(toInt(request.params.id)));

  // Upload one audio file. Text fields first, then an optional `cover` image (the folder's picture),
  // then `file`. With smart=1 the category / work / artist come from the folder path and the tags.
  app.post('/api/admin/tracks/upload', editor, async (request) => {
    const fields = {};
    let stored = null;
    let folderCover = null;
    let uploadedName = null;
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      } else if (part.fieldname === 'cover' && !folderCover && !stored) {
        folderCover = await saveUpload(part, 'image').catch(() => null);
      } else if (part.fieldname === 'file' && !stored) {
        stored = await saveAudioUpload(part);
        uploadedName = part.filename;
      } else {
        part.file.resume();
      }
    }
    if (!stored) throw httpError(400, 'اختار ملف صوت');
    const smart = fields.smart === '1';
    const opts = {
      auto: smart,
      createMissing: fields.createMissing === '1',
      publish: fields.publish === '1',
      categoryId: toInt(fields.categoryId),
      workId: toInt(fields.workId),
      stationId: toInt(fields.stationId),
      artistName: cleanText(fields.artistName, 120),
      title: smart ? null : cleanText(fields.title, 200),
      rightsType: fields.rightsType,
      rightsSource: fields.rightsSource,
    };
    const result = await importStoredFile({
      originalName: stored.name,
      hash: stored.hash,
      relPath: cleanText(fields.relPath, 1000) || uploadedName || 'track',
      folderCover,
      opts,
    });
    if (folderCover) {
      const used = await one('SELECT 1 FROM works WHERE cover_path = $1 LIMIT 1', [folderCover]);
      if (!used) await removeMedia('covers', folderCover);
    }
    return { ...result, track: await getAdminTrack(result.trackId) };
  });

  // ---- Pictures from the internet ----
  app.get('/api/admin/artwork/search', editor, async (request) => {
    const type = request.query.type;
    const id = toInt(request.query.id);
    const q = cleanText(request.query.q, 200);
    if (type === 'artist') {
      const a = await one('SELECT name FROM artists WHERE id = $1', [id]);
      if (!a && !q) throw httpError(404, 'غير موجود');
      return searchArtist(q || a.name);
    }
    if (type === 'work') {
      const w = await one('SELECT title, kind FROM works WHERE id = $1', [id]);
      if (!w && !q) throw httpError(404, 'غير موجود');
      return searchWork(q || w.title, w?.kind);
    }
    if (type === 'track') {
      const t = await one('SELECT t.title, a.name AS artist FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id WHERE t.id = $1', [id]);
      if (!t && !q) throw httpError(404, 'غير موجود');
      return searchTrack(q || t.title, q ? null : t.artist);
    }
    throw httpError(400, 'نوع غير معروف');
  });

  app.post('/api/admin/artwork/apply', editor, async (request) => {
    const b = request.body || {};
    const name = await applyImage(b.type, toInt(b.id), String(b.url || ''));
    return { ok: true, image: coverUrl(name) };
  });

  app.post('/api/admin/artwork/auto', editor, async (request) => {
    const b = request.body || {};
    return startArtworkJob({ artists: b.artists !== false, works: b.works !== false, tracks: b.tracks !== false, lyrics: b.lyrics !== false });
  });
  app.get('/api/admin/artwork/status', editor, async () => artworkStatus());

  // ---- Lyrics from the internet (LRCLIB) ----
  app.get('/api/admin/lyrics/search', editor, async (request) => {
    const t = await one(
      'SELECT t.title, t.duration_sec, a.name AS artist FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id WHERE t.id = $1',
      [toInt(request.query.id)],
    );
    if (!t) throw httpError(404, 'الأغنية غير موجودة');
    const q = cleanText(request.query.q, 200);
    return searchLyrics(q || t.title, q ? cleanText(request.query.artist, 120) : t.artist, t.duration_sec);
  });

  app.post('/api/admin/lyrics/apply', editor, async (request) => {
    const id = toInt(request.body?.id);
    if (!(await one('SELECT id FROM tracks WHERE id = $1', [id]))) throw httpError(404, 'الأغنية غير موجودة');
    await applyLyrics(id, toInt(request.body?.lrclibId));
    return getAdminTrack(id);
  });
  app.post('/api/admin/artwork/stop', editor, async () => stopArtworkJob());

  // ---- Library health: what's missing, and what looks duplicated ----
  app.get('/api/admin/health', editor, async () => {
    const [counts, dupes] = await Promise.all([
      one(`SELECT
        (SELECT count(*)::int FROM tracks) AS tracks,
        (SELECT count(*)::int FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id LEFT JOIN works w ON w.id = t.work_id
           WHERE t.cover_path IS NULL AND a.photo_path IS NULL AND w.cover_path IS NULL) AS no_image,
        (SELECT count(*)::int FROM artists a WHERE a.photo_path IS NULL AND EXISTS (SELECT 1 FROM tracks t WHERE t.artist_id = a.id)) AS artists_no_photo,
        (SELECT count(*)::int FROM works w WHERE w.cover_path IS NULL AND EXISTS (SELECT 1 FROM tracks t WHERE t.work_id = w.id)) AS works_no_cover,
        (SELECT count(*)::int FROM tracks WHERE category_id IS NULL) AS no_category,
        (SELECT count(*)::int FROM tracks WHERE lyrics IS NULL) AS no_lyrics,
        (SELECT count(*)::int FROM tracks WHERE artist_id IS NULL) AS no_artist,
        (SELECT count(*)::int FROM tracks WHERE rights_type = 'pending') AS pending_rights,
        (SELECT count(*)::int FROM tracks WHERE processing_status = 'failed') AS failed,
        (SELECT count(*)::int FROM tracks WHERE processing_status IN ('pending', 'processing')) AS processing,
        (SELECT count(*)::int FROM tracks t WHERE NOT t.is_published AND t.processing_status = 'ready'
           AND t.rights_type IN ('original', 'licensed')) AS ready_unpublished,
        (SELECT count(*)::int FROM tracks t WHERE t.is_published AND NOT EXISTS (SELECT 1 FROM station_tracks st WHERE st.track_id = t.id)) AS not_on_station`),
      many(`SELECT norm_ar(t.title) AS key, min(t.title) AS title, min(a.name) AS artist,
              array_agg(t.id ORDER BY t.id) AS ids, count(*)::int AS n
            FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id
            GROUP BY norm_ar(t.title), t.artist_id HAVING count(*) > 1
            ORDER BY count(*) DESC, min(t.title) LIMIT 30`),
    ]);
    return { counts, duplicates: dupes, artwork: artworkStatus() };
  });

  // ---- Import from a folder on the server (for hundreds or thousands of songs) ----
  app.get('/api/admin/import/scan', editor, async () => scanImportDir());
  app.get('/api/admin/import/status', editor, async () => importStatus());
  app.post('/api/admin/import/stop', editor, async () => stopImport());
  app.post('/api/admin/import/start', editor, async (request) => {
    const b = request.body || {};
    return startImport({
      auto: true,
      createMissing: b.createMissing !== false,
      publish: !!b.publish,
      moveFiles: b.moveFiles !== false,
      fetchArt: !!b.fetchArt,
      categoryId: toInt(b.categoryId),
      stationId: toInt(b.stationId),
      artistName: null,
      rightsType: RIGHTS.includes(b.rightsType) ? b.rightsType : 'pending',
      rightsSource: cleanText(b.rightsSource, 300),
    });
  });

  app.patch('/api/admin/tracks/:id', editor, async (request) => {
    const id = toInt(request.params.id);
    const current = await one('SELECT * FROM tracks WHERE id = $1', [id]);
    if (!current) throw httpError(404, 'الأغنية غير موجودة');
    const b = request.body || {};
    const next = { ...current };
    if (b.title !== undefined) next.title = cleanText(b.title, 200) || current.title;
    if (b.artistName !== undefined) next.artist_id = await artistIdFor(b.artistName);
    if (b.workId !== undefined) next.work_id = toInt(b.workId);
    if (b.categoryId !== undefined) next.category_id = toInt(b.categoryId);
    if (b.year !== undefined) next.year = toInt(b.year);
    if (b.lyrics !== undefined) next.lyrics = cleanText(b.lyrics, 20000);
    if (b.credits !== undefined) next.credits = cleanText(b.credits, 5000);
    if (b.rightsType !== undefined) {
      if (!RIGHTS.includes(b.rightsType)) throw httpError(400, 'نوع حقوق غير صحيح');
      next.rights_type = b.rightsType;
    }
    if (b.rightsSource !== undefined) next.rights_source = cleanText(b.rightsSource, 300);
    if (b.rightsNotes !== undefined) next.rights_notes = cleanText(b.rightsNotes, 3000);
    if (b.licenseScope !== undefined) next.license_scope = [].concat(b.licenseScope || []).filter((s) => SCOPES.includes(s));
    if (b.licenseRegions !== undefined) next.license_regions = cleanText(b.licenseRegions, 300);
    if (b.licenseExpiresAt !== undefined) next.license_expires_at = b.licenseExpiresAt || null;
    if (b.isPublished !== undefined) next.is_published = !!b.isPublished;
    // A track stays published only while its rights allow it.
    if (next.is_published) assertPublishable(next);

    await query(
      `UPDATE tracks SET title = $2, artist_id = $3, work_id = $4, category_id = $5, year = $6, lyrics = $7,
         credits = $8, rights_type = $9, rights_source = $10, rights_notes = $11, license_scope = $12,
         license_regions = $13, license_expires_at = $14, is_published = $15, updated_at = now()
       WHERE id = $1`,
      [
        id, next.title, next.artist_id, next.work_id, next.category_id, next.year, next.lyrics, next.credits,
        next.rights_type, next.rights_source, next.rights_notes, next.license_scope, next.license_regions,
        next.license_expires_at, next.is_published,
      ],
    );
    // Lyrics edited by hand: the timed copy no longer matches, drop it.
    if (b.lyrics !== undefined && next.lyrics !== current.lyrics) {
      await query('UPDATE tracks SET lyrics_synced = NULL, lyrics_source = NULL WHERE id = $1', [id]);
    }
    if (Array.isArray(b.stationIds)) {
      const ids = b.stationIds.map((x) => toInt(x)).filter(Boolean);
      await tx(async (c) => {
        await c.query('DELETE FROM station_tracks WHERE track_id = $1 AND NOT (station_id = ANY($2::int[]))', [id, ids]);
        for (const sid of ids) {
          await c.query(
            `INSERT INTO station_tracks (station_id, track_id, position)
             VALUES ($1, $2, (SELECT coalesce(max(position), 0) + 1 FROM station_tracks WHERE station_id = $1))
             ON CONFLICT DO NOTHING`,
            [sid, id],
          );
        }
      });
    }
    return getAdminTrack(id);
  });

  app.post('/api/admin/tracks/:id/cover', editor, async (request) => {
    const id = toInt(request.params.id);
    const t = await one('SELECT cover_path FROM tracks WHERE id = $1', [id]);
    if (!t) throw httpError(404, 'الأغنية غير موجودة');
    const part = await request.file();
    if (!part) throw httpError(400, 'اختار صورة');
    const name = await saveUpload(part, 'image');
    await query('UPDATE tracks SET cover_path = $2, updated_at = now() WHERE id = $1', [id, name]);
    await removeMedia('covers', t.cover_path);
    return getAdminTrack(id);
  });

  // Drop the song's own picture so it goes back to the artist photo (or the show cover).
  app.delete('/api/admin/tracks/:id/cover', editor, async (request) => {
    const id = toInt(request.params.id);
    const t = await one('SELECT cover_path FROM tracks WHERE id = $1', [id]);
    if (!t) throw httpError(404, 'الأغنية غير موجودة');
    await query('UPDATE tracks SET cover_path = NULL, updated_at = now() WHERE id = $1', [id]);
    await removeMedia('covers', t.cover_path);
    return getAdminTrack(id);
  });

  app.post('/api/admin/tracks/:id/reprocess', editor, async (request) => {
    const id = toInt(request.params.id);
    await query("UPDATE tracks SET processing_status = 'pending', processing_error = NULL WHERE id = $1", [id]);
    enqueueTrack(id);
    return getAdminTrack(id);
  });

  app.delete('/api/admin/tracks/:id', editor, async (request) => {
    const t = await one('DELETE FROM tracks WHERE id = $1 RETURNING *', [toInt(request.params.id)]);
    if (t) {
      await removeMedia('originals', t.original_path);
      await removeMedia('audio', t.audio_path);
      await removeMedia('covers', t.cover_path);
    }
    return { ok: true };
  });

  // Bulk edits from the library table.
  app.post('/api/admin/tracks/bulk', editor, async (request) => {
    const b = request.body || {};
    const ids = (b.ids || []).map((x) => toInt(x)).filter(Boolean);
    if (!ids.length) throw httpError(400, 'مفيش أغاني متحددة');
    let skipped = 0;
    if (b.action === 'publish') {
      const rows = await many('SELECT * FROM tracks WHERE id = ANY($1::int[])', [ids]);
      const ok = rows.filter((t) => {
        try {
          assertPublishable(t);
          return true;
        } catch {
          return false;
        }
      });
      skipped = rows.length - ok.length;
      await query('UPDATE tracks SET is_published = TRUE, updated_at = now() WHERE id = ANY($1::int[])', [ok.map((t) => t.id)]);
    } else if (b.action === 'unpublish') {
      await query('UPDATE tracks SET is_published = FALSE, updated_at = now() WHERE id = ANY($1::int[])', [ids]);
    } else if (b.action === 'category') {
      await query('UPDATE tracks SET category_id = $2, updated_at = now() WHERE id = ANY($1::int[])', [ids, toInt(b.value)]);
    } else if (b.action === 'work') {
      await query('UPDATE tracks SET work_id = $2, updated_at = now() WHERE id = ANY($1::int[])', [ids, toInt(b.value)]);
    } else if (b.action === 'rights') {
      if (!RIGHTS.includes(b.value)) throw httpError(400, 'نوع حقوق غير صحيح');
      await query(
        `UPDATE tracks SET rights_type = $2, is_published = CASE WHEN $2 = 'pending' THEN FALSE ELSE is_published END,
         updated_at = now() WHERE id = ANY($1::int[])`,
        [ids, b.value],
      );
    } else if (b.action === 'station') {
      const sid = toInt(b.value);
      for (const id of ids) {
        await query(
          `INSERT INTO station_tracks (station_id, track_id, position)
           VALUES ($1, $2, (SELECT coalesce(max(position), 0) + 1 FROM station_tracks WHERE station_id = $1))
           ON CONFLICT DO NOTHING`,
          [sid, id],
        );
      }
    } else if (b.action === 'delete') {
      const rows = await many('DELETE FROM tracks WHERE id = ANY($1::int[]) RETURNING *', [ids]);
      for (const t of rows) {
        await removeMedia('originals', t.original_path);
        await removeMedia('audio', t.audio_path);
        await removeMedia('covers', t.cover_path);
      }
    } else {
      throw httpError(400, 'عملية غير معروفة');
    }
    return { ok: true, skipped };
  });

  // ---- Categories ----
  app.post('/api/admin/categories', editor, async (request) => {
    const b = request.body || {};
    const name = cleanText(b.name, 80);
    if (!name) throw httpError(400, 'اكتب اسم التصنيف');
    return one(
      'INSERT INTO categories (name, slug, description, color, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, slugify(b.slug || name), cleanText(b.description, 500), cleanText(b.color, 20) || '#7c3aed', toInt(b.sortOrder, 0)],
    );
  });

  app.patch('/api/admin/categories/:id', editor, async (request) => {
    const b = request.body || {};
    const c = await one('SELECT * FROM categories WHERE id = $1', [toInt(request.params.id)]);
    if (!c) throw httpError(404, 'غير موجود');
    return one(
      'UPDATE categories SET name = $2, slug = $3, description = $4, color = $5, sort_order = $6 WHERE id = $1 RETURNING *',
      [
        c.id,
        cleanText(b.name, 80) || c.name,
        b.slug ? slugify(b.slug) : c.slug,
        b.description !== undefined ? cleanText(b.description, 500) : c.description,
        cleanText(b.color, 20) || c.color,
        toInt(b.sortOrder, c.sort_order),
      ],
    );
  });

  app.delete('/api/admin/categories/:id', editor, async (request) => {
    await query('DELETE FROM categories WHERE id = $1', [toInt(request.params.id)]);
    return { ok: true };
  });

  app.get('/api/admin/categories', editor, async () =>
    many(`SELECT c.*, count(t.id)::int AS track_count FROM categories c
          LEFT JOIN tracks t ON t.category_id = c.id GROUP BY c.id ORDER BY c.sort_order, c.name`),
  );

  // ---- Works (shows / anime / films) ----
  app.get('/api/admin/works', editor, async () => {
    const rows = await many(`SELECT w.*, count(t.id)::int AS track_count FROM works w
      LEFT JOIN tracks t ON t.work_id = w.id GROUP BY w.id ORDER BY w.title`);
    return rows.map((w) => ({ ...w, cover: coverUrl(w.cover_path) }));
  });

  function workValues(b, current = {}) {
    const title = b.title !== undefined ? cleanText(b.title, 200) : current.title;
    if (!title) throw httpError(400, 'اكتب اسم العمل');
    const kind = b.kind !== undefined ? b.kind : current.kind || 'cartoon';
    if (!WORK_KINDS.includes(kind)) throw httpError(400, 'نوع العمل غير صحيح');
    return [
      title,
      b.originalTitle !== undefined ? cleanText(b.originalTitle, 200) : current.original_title ?? null,
      kind,
      b.year !== undefined ? toInt(b.year) : current.year ?? null,
      b.studio !== undefined ? cleanText(b.studio, 200) : current.studio ?? null,
      b.description !== undefined ? cleanText(b.description, 3000) : current.description ?? null,
    ];
  }

  app.post('/api/admin/works', editor, async (request) => {
    const w = await one(
      'INSERT INTO works (title, original_title, kind, year, studio, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      workValues(request.body || {}),
    );
    return { ...w, cover: null };
  });

  app.patch('/api/admin/works/:id', editor, async (request) => {
    const current = await one('SELECT * FROM works WHERE id = $1', [toInt(request.params.id)]);
    if (!current) throw httpError(404, 'غير موجود');
    const w = await one(
      `UPDATE works SET title = $2, original_title = $3, kind = $4, year = $5, studio = $6, description = $7
       WHERE id = $1 RETURNING *`,
      [current.id, ...workValues(request.body || {}, current)],
    );
    return { ...w, cover: coverUrl(w.cover_path) };
  });

  app.post('/api/admin/works/:id/cover', editor, async (request) => {
    const w = await one('SELECT * FROM works WHERE id = $1', [toInt(request.params.id)]);
    if (!w) throw httpError(404, 'غير موجود');
    const part = await request.file();
    if (!part) throw httpError(400, 'اختار صورة');
    const name = await saveUpload(part, 'image');
    await query('UPDATE works SET cover_path = $2 WHERE id = $1', [w.id, name]);
    await removeMedia('covers', w.cover_path);
    return { ...w, cover_path: name, cover: coverUrl(name) };
  });

  app.delete('/api/admin/works/:id', editor, async (request) => {
    const w = await one('DELETE FROM works WHERE id = $1 RETURNING cover_path', [toInt(request.params.id)]);
    if (w) await removeMedia('covers', w.cover_path);
    return { ok: true };
  });

  // ---- Artists ----
  const shapeAdminArtist = (a) => ({ ...a, photo: coverUrl(a.photo_path) });

  app.get('/api/admin/artists', editor, async () => {
    const rows = await many(`SELECT a.*, count(t.id)::int AS track_count,
            count(t.id) FILTER (WHERE t.cover_path IS NOT NULL)::int AS own_cover_count
          FROM artists a
          LEFT JOIN tracks t ON t.artist_id = a.id GROUP BY a.id ORDER BY a.name`);
    return rows.map(shapeAdminArtist);
  });

  app.post('/api/admin/artists', editor, async (request) => {
    const b = request.body || {};
    const name = cleanText(b.name, 120);
    if (!name) throw httpError(400, 'اكتب اسم الفنان');
    const exists = await one('SELECT id FROM artists WHERE name = $1', [name]);
    if (exists) throw httpError(409, 'الفنان ده موجود بالفعل');
    const a = await one('INSERT INTO artists (name, bio) VALUES ($1, $2) RETURNING *', [name, cleanText(b.bio, 3000)]);
    return shapeAdminArtist({ ...a, track_count: 0 });
  });

  app.patch('/api/admin/artists/:id', editor, async (request) => {
    const b = request.body || {};
    const a = await one('SELECT * FROM artists WHERE id = $1', [toInt(request.params.id)]);
    if (!a) throw httpError(404, 'غير موجود');
    const name = cleanText(b.name, 120) || a.name;
    if (name !== a.name) {
      const clash = await one('SELECT id FROM artists WHERE name = $1 AND id <> $2', [name, a.id]);
      if (clash) throw httpError(409, 'فيه فنان تاني بنفس الاسم');
    }
    const updated = await one('UPDATE artists SET name = $2, bio = $3 WHERE id = $1 RETURNING *', [
      a.id,
      name,
      b.bio !== undefined ? cleanText(b.bio, 3000) : a.bio,
    ]);
    return shapeAdminArtist(updated);
  });

  app.post('/api/admin/artists/:id/photo', editor, async (request) => {
    const a = await one('SELECT * FROM artists WHERE id = $1', [toInt(request.params.id)]);
    if (!a) throw httpError(404, 'غير موجود');
    const part = await request.file();
    if (!part) throw httpError(400, 'اختار صورة');
    const name = await saveUpload(part, 'image');
    const updated = await one('UPDATE artists SET photo_path = $2 WHERE id = $1 RETURNING *', [a.id, name]);
    await removeMedia('covers', a.photo_path);
    return shapeAdminArtist(updated);
  });

  // Make every song of this artist use the artist photo (removes the songs' own pictures).
  app.post('/api/admin/artists/:id/apply-photo', editor, async (request) => {
    const a = await one('SELECT * FROM artists WHERE id = $1', [toInt(request.params.id)]);
    if (!a) throw httpError(404, 'غير موجود');
    if (!a.photo_path) throw httpError(400, 'ارفع صورة للفنان الأول');
    const rows = await many(
      `UPDATE tracks t SET cover_path = NULL, updated_at = now()
       FROM (SELECT id, cover_path AS old FROM tracks WHERE artist_id = $1 AND cover_path IS NOT NULL) o
       WHERE t.id = o.id RETURNING o.old`,
      [a.id],
    );
    for (const r of rows) await removeMedia('covers', r.old);
    return { ok: true, changed: rows.length };
  });

  app.delete('/api/admin/artists/:id/photo', editor, async (request) => {
    const a = await one('SELECT * FROM artists WHERE id = $1', [toInt(request.params.id)]);
    if (!a) throw httpError(404, 'غير موجود');
    await query('UPDATE artists SET photo_path = NULL WHERE id = $1', [a.id]);
    await removeMedia('covers', a.photo_path);
    return { ok: true };
  });

  app.delete('/api/admin/artists/:id', editor, async (request) => {
    const a = await one('DELETE FROM artists WHERE id = $1 RETURNING photo_path', [toInt(request.params.id)]);
    if (a) await removeMedia('covers', a.photo_path);
    return { ok: true };
  });

  // ---- Stations ----
  app.get('/api/admin/stations', editor, async () => {
    const rows = await many(`SELECT s.*, count(st.track_id)::int AS track_count FROM stations s
      LEFT JOIN station_tracks st ON st.station_id = s.id GROUP BY s.id ORDER BY s.sort_order, s.name`);
    return rows.map(shapeStation);
  });

  async function uniqueStationSlug(base, exceptId = null) {
    const root = slugify(base);
    for (let i = 0; i < 50; i += 1) {
      const slug = i ? `${root}-${i + 1}` : root;
      const hit = await one('SELECT id FROM stations WHERE slug = $1 AND id IS DISTINCT FROM $2', [slug, exceptId]);
      if (!hit) return slug;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  async function stationValues(b, current = {}) {
    const name = b.name !== undefined ? cleanText(b.name, 80) : current.name;
    if (!name) throw httpError(400, 'اكتب اسم المحطة');
    const mode = b.requestsMode ?? current.requests_mode ?? 'moderated';
    if (!['off', 'moderated', 'auto'].includes(mode)) throw httpError(400, 'وضع الطلبات غير صحيح');
    const kind = b.kind ?? current.kind ?? 'synced';
    if (!['synced', 'external'].includes(kind)) throw httpError(400, 'نوع المحطة غير صحيح');
    const streamUrl = b.streamUrl !== undefined ? cleanText(b.streamUrl, 1000) : current.stream_url ?? null;
    if (kind === 'external' && !isHttpUrl(streamUrl)) {
      throw httpError(400, 'حط رابط البث، لازم يبدأ بـ http:// أو https://');
    }
    const homepage = b.homepage !== undefined ? cleanText(b.homepage, 500) : current.homepage_url ?? null;
    if (homepage && !isHttpUrl(homepage)) throw httpError(400, 'رابط موقع المحطة غير صحيح');
    const wantedSlug = b.slug ? slugify(b.slug) : current.slug || name;
    return {
      name,
      slug: await uniqueStationSlug(wantedSlug, current.id ?? null),
      description: b.description !== undefined ? cleanText(b.description, 500) : current.description ?? null,
      color: cleanText(b.color, 20) || current.color || '#f97316',
      isActive: typeof b.isActive === 'boolean' ? b.isActive : current.is_active ?? true,
      shuffle: typeof b.shuffle === 'boolean' ? b.shuffle : current.shuffle ?? true,
      mode,
      sortOrder: toInt(b.sortOrder, current.sort_order ?? 0),
      kind,
      streamUrl: kind === 'external' ? streamUrl : null,
      homepage,
    };
  }

  async function insertStation(v) {
    return one(
      `INSERT INTO stations (name, slug, description, color, is_active, shuffle, requests_mode, sort_order,
         kind, stream_url, homepage_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [v.name, v.slug, v.description, v.color, v.isActive, v.shuffle, v.mode, v.sortOrder, v.kind, v.streamUrl, v.homepage],
    );
  }

  app.post('/api/admin/stations', editor, async (request) => {
    const s = await insertStation(await stationValues(request.body || {}));
    return shapeStation(s);
  });

  app.patch('/api/admin/stations/:id', editor, async (request) => {
    const current = await one('SELECT * FROM stations WHERE id = $1', [toInt(request.params.id)]);
    if (!current) throw httpError(404, 'غير موجود');
    const v = await stationValues(request.body || {}, current);
    const s = await one(
      `UPDATE stations SET name = $2, slug = $3, description = $4, color = $5, is_active = $6, shuffle = $7,
         requests_mode = $8, sort_order = $9, kind = $10, stream_url = $11, homepage_url = $12
       WHERE id = $1 RETURNING *`,
      [current.id, v.name, v.slug, v.description, v.color, v.isActive, v.shuffle, v.mode, v.sortOrder, v.kind, v.streamUrl, v.homepage],
    );
    forgetTitle(current.id);
    return shapeStation(s);
  });

  app.delete('/api/admin/stations/:id', editor, async (request) => {
    const s = await one('DELETE FROM stations WHERE id = $1 RETURNING logo_path', [toInt(request.params.id)]);
    if (s) await removeMedia('covers', s.logo_path);
    return { ok: true };
  });

  app.post('/api/admin/stations/:id/logo', editor, async (request) => {
    const s = await one('SELECT * FROM stations WHERE id = $1', [toInt(request.params.id)]);
    if (!s) throw httpError(404, 'غير موجود');
    const part = await request.file();
    if (!part) throw httpError(400, 'اختار صورة');
    const name = await saveUpload(part, 'image');
    const updated = await one('UPDATE stations SET logo_path = $2 WHERE id = $1 RETURNING *', [s.id, name]);
    await removeMedia('covers', s.logo_path);
    return shapeStation(updated);
  });

  // Check a stream link before saving: is it reachable, what does it call itself, what's playing.
  app.post('/api/admin/stations/test-stream', editor, async (request) => {
    const url = cleanText(request.body?.url, 1000);
    return probeStream(url, { wantTitle: true });
  });

  /*
   * Add many external stations at once. One per line, any of:
   *   https://example.com/stream
   *   اسم المحطة | https://example.com/stream
   *   اسم المحطة https://example.com/listen.pls
   * Names are read from the stream itself when missing.
   */
  app.post('/api/admin/stations/bulk', editor, async (request) => {
    const lines = String(request.body?.text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (!lines.length) throw httpError(400, 'الصق رابط واحد على الأقل');
    const palette = ['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#10b981', '#3b82f6', '#ec4899', '#f97316'];
    const { rows: countRows } = await query('SELECT count(*)::int AS n FROM stations');
    let order = countRows[0].n;

    const results = [];
    const queue = lines.map((line, i) => ({ line, i }));
    async function worker() {
      while (queue.length) {
        const { line, i } = queue.shift();
        const m = /(https?:\/\/\S+)/i.exec(line);
        if (!m) {
          results[i] = { line, ok: false, error: 'مفيش رابط في السطر ده' };
          continue;
        }
        const url = m[1].replace(/[),.;]+$/, '');
        const givenName = line.replace(m[0], '').replace(/[|\t,;:]+/g, ' ').trim();
        const info = await probeStream(url, { wantTitle: false });
        const streamUrl = info.ok && info.resolvedFrom ? info.url : url;
        // Some servers report the mount file ("live.mp3") as their name; that's not a real name.
        const streamName = info.name && !/\.(mp3|aac|ogg|opus|m3u8?|pls)$/i.test(info.name) ? info.name : null;
        let name = cleanText(givenName, 80) || cleanText(streamName, 80);
        if (!name) {
          try {
            name = new URL(url).hostname.replace(/^www\./, '');
          } catch {
            name = `Station ${i + 1}`;
          }
        }
        try {
          order += 1;
          const v = await stationValues({
            name,
            kind: 'external',
            streamUrl,
            description: cleanText([info.genre, info.description].filter(Boolean).join(' · '), 500),
            homepage: isHttpUrl(info.homepage) ? info.homepage : undefined,
            color: palette[i % palette.length],
            sortOrder: order,
            requestsMode: 'off',
          });
          const s = await insertStation(v);
          results[i] = {
            line,
            ok: true,
            reachable: info.ok,
            warning: info.ok ? null : info.error,
            station: shapeStation(s),
          };
        } catch (err) {
          results[i] = { line, ok: false, error: err.message };
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { results };
  });

  // Skip to the next song for everyone listening.
  app.post('/api/admin/stations/:id/skip', editor, async (request) => {
    // End the current song right now, so the next request (or rotation song) starts immediately.
    await query(
      `UPDATE stations s SET current_started_at = now() - make_interval(secs =>
         coalesce((SELECT duration_sec FROM tracks WHERE id = s.current_track_id), 0) + 0.05)
       WHERE id = $1`,
      [toInt(request.params.id)],
    );
    return { ok: true };
  });

  app.delete('/api/admin/stations/:id/tracks/:trackId', editor, async (request) => {
    await query('DELETE FROM station_tracks WHERE station_id = $1 AND track_id = $2', [
      toInt(request.params.id),
      toInt(request.params.trackId),
    ]);
    return { ok: true };
  });

  // ---- Song requests ----
  app.get('/api/admin/requests', editor, async (request) => {
    const status = request.query.status || 'pending';
    return many(
      `SELECT r.*, s.name AS station_name, t.title AS track_title, u.display_name AS user_name
       FROM song_requests r JOIN stations s ON s.id = r.station_id
       JOIN tracks t ON t.id = r.track_id LEFT JOIN users u ON u.id = r.user_id
       WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 200`,
      [status],
    );
  });

  app.patch('/api/admin/requests/:id', editor, async (request) => {
    const status = request.body?.status;
    if (!['approved', 'rejected'].includes(status)) throw httpError(400, 'حالة غير صحيحة');
    await query('UPDATE song_requests SET status = $2, decided_at = now() WHERE id = $1', [toInt(request.params.id), status]);
    return { ok: true };
  });

  // ---- Official playlists ----
  app.get('/api/admin/playlists', editor, async () => officialPlaylists(200));

  // ---- Reports ----
  app.get('/api/admin/reports', editor, async (request) => {
    const status = request.query.status || 'open';
    return many(
      `SELECT r.*, t.title AS track_title, u.email AS user_email FROM reports r
       LEFT JOIN tracks t ON t.id = r.track_id LEFT JOIN users u ON u.id = r.user_id
       WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 200`,
      [status],
    );
  });

  app.patch('/api/admin/reports/:id', editor, async (request) => {
    const b = request.body || {};
    if (!['open', 'resolved', 'dismissed'].includes(b.status)) throw httpError(400, 'حالة غير صحيحة');
    await query(
      `UPDATE reports SET status = $2, admin_note = $3, resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
       WHERE id = $1`,
      [toInt(request.params.id), b.status, cleanText(b.adminNote, 2000)],
    );
    return { ok: true };
  });

  // ---- Users (admin only) ----
  app.get('/api/admin/users', admin, async (request) => {
    const q = request.query.q ? likePattern(String(request.query.q).toLowerCase()) : null;
    const rows = await many(
      `SELECT u.*, (SELECT count(*)::int FROM plays p WHERE p.user_id = u.id) AS plays FROM users u
       ${q ? 'WHERE lower(u.email) LIKE $1 OR lower(u.display_name) LIKE $1' : ''}
       ORDER BY u.created_at DESC LIMIT 500`,
      q ? [q] : [],
    );
    return rows.map((u) => ({ ...publicUser(u), isDisabled: u.is_disabled, lastLoginAt: u.last_login_at, plays: u.plays }));
  });

  app.patch('/api/admin/users/:id', admin, async (request) => {
    const id = toInt(request.params.id);
    const b = request.body || {};
    const u = await one('SELECT * FROM users WHERE id = $1', [id]);
    if (!u) throw httpError(404, 'غير موجود');
    if (id === request.currentUser.id && (b.role && b.role !== 'admin' || b.isDisabled)) {
      throw httpError(400, 'مينفعش تشيل صلاحيتك أو توقف حسابك بنفسك');
    }
    const role = b.role ?? u.role;
    if (!['user', 'editor', 'admin'].includes(role)) throw httpError(400, 'دور غير صحيح');
    let hash = u.password_hash;
    if (b.newPassword) {
      validatePassword(b.newPassword);
      hash = await hashPassword(b.newPassword);
    }
    const updated = await one(
      'UPDATE users SET role = $2, is_disabled = $3, password_hash = $4 WHERE id = $1 RETURNING *',
      [id, role, typeof b.isDisabled === 'boolean' ? b.isDisabled : u.is_disabled, hash],
    );
    return { ...publicUser(updated), isDisabled: updated.is_disabled };
  });

  // ---- Live: who is online and what they are listening to ----
  app.get('/api/admin/live', editor, async () => {
    const list = onlineSessions();
    const trackIds = [...new Set(list.map((s) => s.trackId).filter(Boolean))];
    const tracks = trackIds.length
      ? await many(
          `SELECT t.id, t.title, w.title AS work_title, coalesce(t.cover_path, a.photo_path, w.cover_path) AS cover_path
           FROM tracks t LEFT JOIN works w ON w.id = t.work_id LEFT JOIN artists a ON a.id = t.artist_id
           WHERE t.id = ANY($1::int[])`,
          [trackIds],
        )
      : [];
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const stations = new Map((await many('SELECT slug, name, color, kind FROM stations')).map((s) => [s.slug, s]));

    const sessionsOut = list.map((s) => {
      const t = byId.get(s.trackId);
      return {
        id: s.listenerId.slice(0, 8),
        user: s.userId ? { id: s.userId, name: s.userName, email: s.userEmail } : null,
        platform: s.platform,
        installed: s.installed,
        page: s.page,
        playing: s.playing,
        mode: s.mode,
        station: s.mode === 'radio' && s.stationSlug ? stations.get(s.stationSlug) || { slug: s.stationSlug, name: s.stationSlug } : null,
        track: t ? { id: t.id, title: t.title, work: t.work_title, cover: coverUrl(t.cover_path) } : null,
        nowTitle: s.nowTitle,
        position: s.position,
        onlineSince: new Date(s.firstSeen).toISOString(),
        lastSeen: new Date(s.lastSeen).toISOString(),
      };
    });

    const listening = sessionsOut.filter((s) => s.playing && (s.track || s.station));
    const nowTracks = new Map();
    for (const s of listening.filter((x) => x.track)) {
      const k = s.track.id;
      nowTracks.set(k, { ...s.track, listeners: (nowTracks.get(k)?.listeners || 0) + 1 });
    }
    const nowStations = new Map();
    for (const s of listening.filter((x) => x.station)) {
      const k = s.station.slug;
      nowStations.set(k, { ...s.station, listeners: (nowStations.get(k)?.listeners || 0) + 1 });
    }
    const platforms = {};
    for (const s of sessionsOut) platforms[s.platform] = (platforms[s.platform] || 0) + 1;

    const [installs, downloads, topDownloads, installPlatforms, dailyInstalls] = await Promise.all([
      one(`SELECT
        (SELECT count(*)::int FROM app_events WHERE kind = 'install') AS installs_total,
        (SELECT count(*)::int FROM app_events WHERE kind = 'install' AND created_at > now() - interval '30 days') AS installs_30d,
        (SELECT count(*)::int FROM app_events WHERE kind = 'app_open' AND created_at > now() - interval '30 days') AS app_opens_30d,
        (SELECT count(DISTINCT listener_id)::int FROM app_events WHERE kind = 'visit' AND created_at > CURRENT_DATE) AS visitors_today,
        (SELECT count(DISTINCT listener_id)::int FROM app_events WHERE kind = 'visit' AND created_at > now() - interval '30 days') AS visitors_30d`),
      one(`SELECT count(*)::int AS total,
             count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30d,
             count(*) FILTER (WHERE created_at > CURRENT_DATE)::int AS today
           FROM app_events WHERE kind = 'download'`),
      many(`SELECT t.id, t.title, count(*)::int AS downloads FROM app_events e JOIN tracks t ON t.id = e.track_id
            WHERE e.kind = 'download' GROUP BY t.id ORDER BY downloads DESC LIMIT 10`),
      many(`SELECT coalesce(platform, 'أخرى') AS platform, count(*)::int AS n FROM app_events
            WHERE kind = 'install' GROUP BY 1 ORDER BY n DESC`),
      many(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
              coalesce((SELECT count(*) FROM app_events e WHERE e.kind = 'install' AND e.created_at::date = d::date), 0)::int AS installs,
              coalesce((SELECT count(*) FROM app_events e WHERE e.kind = 'download' AND e.created_at::date = d::date), 0)::int AS downloads
            FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d ORDER BY d`),
    ]);

    return {
      serverTime: new Date().toISOString(),
      counts: {
        online: sessionsOut.length,
        listening: listening.length,
        signedIn: sessionsOut.filter((s) => s.user).length,
        guests: sessionsOut.filter((s) => !s.user).length,
        fromInstalledApp: sessionsOut.filter((s) => s.installed).length,
        onRadio: listening.filter((s) => s.station).length,
      },
      peak: updatePeak(sessionsOut.length),
      platforms,
      sessions: sessionsOut,
      nowTracks: [...nowTracks.values()].sort((a, b) => b.listeners - a.listeners),
      nowStations: [...nowStations.values()].sort((a, b) => b.listeners - a.listeners),
      installs,
      installPlatforms,
      downloads,
      topDownloads,
      daily: dailyInstalls,
    };
  });

  // ---- Dashboard stats ----
  app.get('/api/admin/stats', editor, async () => {
    const [counts, daily, topTracks, topStations, bandwidth, errors, expiring, processing] = await Promise.all([
      one(`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users WHERE created_at > now() - interval '30 days') AS new_users,
        (SELECT count(*)::int FROM tracks) AS tracks,
        (SELECT count(*)::int FROM tracks t WHERE ${PLAYABLE}) AS live_tracks,
        (SELECT count(*)::int FROM tracks WHERE rights_type = 'pending') AS pending_rights,
        (SELECT count(*)::int FROM plays WHERE played_at > now() - interval '1 day') AS plays_today,
        (SELECT count(*)::int FROM plays WHERE played_at > now() - interval '30 days') AS plays_30d,
        (SELECT coalesce(sum(seconds_listened), 0)::int FROM plays WHERE played_at > now() - interval '30 days') AS seconds_30d,
        (SELECT count(DISTINCT user_id)::int FROM plays WHERE played_at > now() - interval '7 days') AS active_users_7d,
        (SELECT count(*)::int FROM reports WHERE status = 'open') AS open_reports,
        (SELECT count(*)::int FROM song_requests WHERE status = 'pending') AS pending_requests`),
      many(`SELECT to_char(d, 'YYYY-MM-DD') AS day, coalesce(p.n, 0)::int AS plays
            FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d
            LEFT JOIN (SELECT played_at::date AS day, count(*) AS n FROM plays
                       WHERE played_at > CURRENT_DATE - 30 GROUP BY 1) p ON p.day = d::date
            ORDER BY d`),
      many(`SELECT t.id, t.title, count(p.id)::int AS plays FROM plays p JOIN tracks t ON t.id = p.track_id
            WHERE p.played_at > now() - interval '30 days' GROUP BY t.id ORDER BY plays DESC LIMIT 10`),
      many(`SELECT s.name, coalesce(sum(p.seconds_listened), 0)::int AS seconds FROM plays p
            JOIN stations s ON s.id = p.station_id WHERE p.played_at > now() - interval '30 days'
            GROUP BY s.id ORDER BY seconds DESC LIMIT 10`),
      many(`SELECT to_char(day, 'YYYY-MM-DD') AS day, bytes FROM bandwidth_daily
            WHERE day > CURRENT_DATE - 30 ORDER BY day`),
      many(`SELECT e.message, e.created_at, t.title FROM playback_errors e LEFT JOIN tracks t ON t.id = e.track_id
            ORDER BY e.created_at DESC LIMIT 15`),
      many(`SELECT id, title, license_expires_at FROM tracks
            WHERE license_expires_at IS NOT NULL AND license_expires_at <= CURRENT_DATE + 30
            ORDER BY license_expires_at LIMIT 50`),
      many(`SELECT processing_status, count(*)::int AS n FROM tracks GROUP BY 1`),
    ]);
    return { counts, daily, topTracks, topStations, bandwidth, errors, expiring, processing, queue: queueLength() };
  });
}
