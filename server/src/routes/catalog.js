import { isStaff } from '../auth.js';
import { many, one, PLAYABLE, query, TRACK_SELECT } from '../db.js';
import { dirs } from '../media.js';
import { coverUrl, normAr, shapeStation, shapeTrack, shapeTracks, shapeWork } from '../shape.js';
import { httpError, likePattern, toInt } from '../util.js';
import { platformFrom } from '../presence.js';

const WORKS_WITH_COUNT = `
  SELECT w.*, count(t.id)::int AS track_count
  FROM works w JOIN tracks t ON t.work_id = w.id AND ${PLAYABLE}
  GROUP BY w.id`;

export async function officialPlaylists(limit = 12) {
  const rows = await many(
    `SELECT p.id, p.title, p.description, p.mood,
            count(t.id)::int AS track_count,
            (array_agg(coalesce(t.cover_path, ar.photo_path, w.cover_path) ORDER BY pt.position)
               FILTER (WHERE coalesce(t.cover_path, ar.photo_path, w.cover_path) IS NOT NULL))[1:4] AS covers
     FROM playlists p
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     LEFT JOIN tracks t ON t.id = pt.track_id AND ${PLAYABLE}
     LEFT JOIN works w ON w.id = t.work_id
     LEFT JOIN artists ar ON ar.id = t.artist_id
     WHERE p.is_official
     GROUP BY p.id
     ORDER BY p.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    mood: p.mood,
    trackCount: p.track_count,
    covers: (p.covers || []).map(coverUrl),
  }));
}

export function addBandwidth(bytes) {
  if (!bytes || bytes <= 0) return;
  query(
    `INSERT INTO bandwidth_daily (day, bytes) VALUES (CURRENT_DATE, $1)
     ON CONFLICT (day) DO UPDATE SET bytes = bandwidth_daily.bytes + EXCLUDED.bytes`,
    [bytes],
  ).catch(() => {});
}

function rangeBytes(rangeHeader, size) {
  if (!rangeHeader || !size) return size || 0;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!m) return size;
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null) {
    start = Math.max(0, size - (end || 0));
    end = size - 1;
  }
  if (end === null || end >= size) end = size - 1;
  return Math.max(0, end - start + 1);
}

export default async function catalogRoutes(app) {
  app.get('/api/home', async (request) => {
    const user = request.currentUser;
    const [categories, stations, newest, popular, works, playlists, decades, recent] = await Promise.all([
      many(`SELECT c.*, count(t.id)::int AS track_count FROM categories c
            LEFT JOIN tracks t ON t.category_id = c.id AND ${PLAYABLE}
            GROUP BY c.id ORDER BY c.sort_order, c.name`),
      many(`SELECT * FROM stations WHERE is_active ORDER BY sort_order, name`),
      many(`${TRACK_SELECT} WHERE ${PLAYABLE} ORDER BY t.created_at DESC LIMIT 12`),
      many(`${TRACK_SELECT} WHERE ${PLAYABLE} AND t.play_count > 0 ORDER BY t.play_count DESC LIMIT 12`),
      many(`${WORKS_WITH_COUNT} ORDER BY max(t.created_at) DESC LIMIT 12`),
      officialPlaylists(12),
      many(`SELECT (coalesce(t.year, w.year) / 10) * 10 AS decade, count(*)::int AS count
            FROM tracks t LEFT JOIN works w ON w.id = t.work_id
            WHERE ${PLAYABLE} AND coalesce(t.year, w.year) IS NOT NULL
            GROUP BY 1 ORDER BY 1`),
      user && user.history_enabled
        ? many(
            `${TRACK_SELECT} JOIN (
               SELECT track_id, max(played_at) AS last_played FROM plays
               WHERE user_id = $1 GROUP BY track_id ORDER BY last_played DESC LIMIT 12
             ) r ON r.track_id = t.id
             WHERE ${PLAYABLE} ORDER BY r.last_played DESC`,
            [user.id],
          )
        : [],
    ]);
    // One row per category that has songs (أغاني الأفلام, أنمي, …), newest first.
    const shelfCats = categories.filter((c) => c.track_count > 0).slice(0, 8);
    const categoryShelves = await Promise.all(
      shelfCats.map(async (c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color,
        tracks: shapeTracks(
          await many(`${TRACK_SELECT} WHERE t.category_id = $1 AND ${PLAYABLE} ORDER BY t.created_at DESC LIMIT 12`, [c.id]),
        ),
      })),
    );
    return {
      categoryShelves,
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, color: c.color, trackCount: c.track_count })),
      stations: stations.map(shapeStation),
      newest: shapeTracks(newest),
      popular: shapeTracks(popular),
      works: works.map(shapeWork),
      playlists,
      decades,
      recent: shapeTracks(recent),
    };
  });

  app.get('/api/categories', async () => {
    const rows = await many(`SELECT c.*, count(t.id)::int AS track_count FROM categories c
      LEFT JOIN tracks t ON t.category_id = c.id AND ${PLAYABLE}
      GROUP BY c.id ORDER BY c.sort_order, c.name`);
    return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, color: c.color, description: c.description, trackCount: c.track_count }));
  });

  app.get('/api/categories/:slug', async (request) => {
    const c = await one('SELECT * FROM categories WHERE slug = $1', [request.params.slug]);
    if (!c) throw httpError(404, 'التصنيف غير موجود');
    const tracks = await many(`${TRACK_SELECT} WHERE t.category_id = $1 AND ${PLAYABLE} ORDER BY t.title LIMIT 1000`, [c.id]);
    return {
      category: { id: c.id, name: c.name, slug: c.slug, color: c.color, description: c.description },
      tracks: shapeTracks(tracks),
    };
  });

  app.get('/api/works', async (request) => {
    const kind = request.query.kind;
    const rows = await many(
      `${WORKS_WITH_COUNT.replace('GROUP BY w.id', `${kind ? 'WHERE w.kind = $1' : ''} GROUP BY w.id`)} ORDER BY w.title`,
      kind ? [kind] : [],
    );
    return rows.map(shapeWork);
  });

  app.get('/api/works/:id', async (request) => {
    const w = await one('SELECT * FROM works WHERE id = $1', [toInt(request.params.id)]);
    if (!w) throw httpError(404, 'العمل غير موجود');
    const tracks = await many(`${TRACK_SELECT} WHERE t.work_id = $1 AND ${PLAYABLE} ORDER BY t.title`, [w.id]);
    return { work: shapeWork(w), tracks: shapeTracks(tracks) };
  });

  // Artists that have at least one playable song (for Explore).
  app.get('/api/artists', async () => {
    const rows = await many(
      `SELECT a.id, a.name, a.photo_path, count(t.id)::int AS track_count FROM artists a
       JOIN tracks t ON t.artist_id = a.id AND ${PLAYABLE}
       GROUP BY a.id ORDER BY (a.photo_path IS NULL), count(t.id) DESC, a.name LIMIT 200`,
    );
    return rows.map((a) => ({ id: a.id, name: a.name, photo: coverUrl(a.photo_path), trackCount: a.track_count }));
  });

  app.get('/api/artists/:id', async (request) => {
    const a = await one('SELECT * FROM artists WHERE id = $1', [toInt(request.params.id)]);
    if (!a) throw httpError(404, 'الفنان غير موجود');
    const tracks = await many(`${TRACK_SELECT} WHERE t.artist_id = $1 AND ${PLAYABLE} ORDER BY t.title`, [a.id]);
    return { artist: { id: a.id, name: a.name, bio: a.bio, photo: coverUrl(a.photo_path) }, tracks: shapeTracks(tracks) };
  });

  app.get('/api/years', async () => {
    return many(`SELECT coalesce(t.year, w.year) AS year, count(*)::int AS count
      FROM tracks t LEFT JOIN works w ON w.id = t.work_id
      WHERE ${PLAYABLE} AND coalesce(t.year, w.year) IS NOT NULL
      GROUP BY 1 ORDER BY 1`);
  });

  app.get('/api/years/:year', async (request) => {
    const year = toInt(request.params.year);
    if (!year) throw httpError(400, 'سنة غير صحيحة');
    const decade = request.query.decade === '1';
    const tracks = await many(
      `${TRACK_SELECT} WHERE ${PLAYABLE} AND coalesce(t.year, w.year) BETWEEN $1 AND $2 ORDER BY coalesce(t.year, w.year), t.title`,
      decade ? [year, year + 9] : [year, year],
    );
    const worksRows = await many(
      `SELECT DISTINCT w.* FROM works w JOIN tracks t ON t.work_id = w.id
       WHERE ${PLAYABLE} AND coalesce(t.year, w.year) BETWEEN $1 AND $2 ORDER BY w.title`,
      decade ? [year, year + 9] : [year, year],
    );
    return { tracks: shapeTracks(tracks), works: worksRows.map(shapeWork) };
  });

  app.get('/api/search', async (request) => {
    const q = normAr(request.query.q).slice(0, 100);
    if (!q) return { tracks: [], works: [], artists: [] };
    const pattern = likePattern(q);
    const [tracks, works, artists] = await Promise.all([
      many(
        `${TRACK_SELECT} WHERE ${PLAYABLE} AND (
           norm_ar(t.title) LIKE $1 OR norm_ar(a.name) LIKE $1 OR norm_ar(w.title) LIKE $1
           OR norm_ar(w.original_title) LIKE $1 OR norm_ar(t.lyrics) LIKE $1)
         ORDER BY (norm_ar(t.title) LIKE $1) DESC, t.play_count DESC LIMIT 50`,
        [pattern],
      ),
      many(
        `${WORKS_WITH_COUNT.replace('GROUP BY w.id', 'WHERE norm_ar(w.title) LIKE $1 OR norm_ar(w.original_title) LIKE $1 GROUP BY w.id')} LIMIT 20`,
        [pattern],
      ),
      many(
        `SELECT a.id, a.name, a.photo_path, count(t.id)::int AS track_count FROM artists a
         JOIN tracks t ON t.artist_id = a.id AND ${PLAYABLE}
         WHERE norm_ar(a.name) LIKE $1 GROUP BY a.id LIMIT 20`,
        [pattern],
      ),
    ]);
    return {
      tracks: shapeTracks(tracks),
      works: works.map(shapeWork),
      artists: artists.map((a) => ({ id: a.id, name: a.name, photo: coverUrl(a.photo_path), trackCount: a.track_count })),
    };
  });

  // "Surprise me": random playable tracks, optionally limited to a category or station.
  app.get('/api/tracks/random', async (request) => {
    const count = Math.min(Math.max(toInt(request.query.count, 1), 1), 50);
    const params = [count];
    let filter = '';
    if (request.query.category) {
      params.push(request.query.category);
      filter = `AND c.slug = $${params.length}`;
    } else if (request.query.station) {
      params.push(request.query.station);
      filter = `AND t.id IN (SELECT st.track_id FROM station_tracks st JOIN stations s ON s.id = st.station_id WHERE s.slug = $${params.length})`;
    } else if (request.query.decade) {
      params.push(toInt(request.query.decade));
      filter = `AND coalesce(t.year, w.year) BETWEEN $${params.length} AND $${params.length} + 9`;
    }
    const rows = await many(`${TRACK_SELECT} WHERE ${PLAYABLE} ${filter} ORDER BY random() LIMIT $1`, params);
    return shapeTracks(rows);
  });

  app.get('/api/tracks/:id', async (request) => {
    const id = toInt(request.params.id);
    const row = await one(
      `${TRACK_SELECT.replace('SELECT t.id,', 'SELECT t.lyrics, t.credits, t.rights_type, t.license_scope, t.created_at, t.id,')}
       WHERE t.id = $1 AND (${PLAYABLE} OR $2)`,
      [id, isStaff(request.currentUser)],
    );
    if (!row) throw httpError(404, 'الأغنية غير موجودة أو غير متاحة');
    const related = await many(
      `${TRACK_SELECT} WHERE ${PLAYABLE} AND t.id <> $1 AND (
         ($2::int IS NOT NULL AND t.work_id = $2) OR ($3::int IS NOT NULL AND t.category_id = $3))
       ORDER BY (t.work_id = $2) DESC NULLS LAST, random() LIMIT 8`,
      [row.id, row.work_id, row.category_id],
    );
    return {
      track: { ...shapeTrack(row), lyrics: row.lyrics, credits: row.credits, rightsType: row.rights_type, createdAt: row.created_at,
        canDownload: (row.license_scope || []).includes('download') },
      related: shapeTracks(related),
    };
  });

  // Download is offered only for tracks whose license includes "download".
  app.get('/api/tracks/:id/download', async (request, reply) => {
    if (!request.currentUser) throw httpError(401, 'سجل دخول عشان تنزّل الأغنية');
    const t = await one(
      `SELECT t.id, t.title, t.audio_path, t.file_size FROM tracks t
       WHERE t.id = $1 AND ${PLAYABLE} AND 'download' = ANY(t.license_scope)`,
      [toInt(request.params.id)],
    );
    if (!t || !t.audio_path) throw httpError(403, 'التنزيل مش متاح للأغنية دي');
    await query(
      "INSERT INTO app_events (kind, user_id, track_id, platform) VALUES ('download', $1, $2, $3)",
      [request.currentUser.id, t.id, platformFrom(request.headers['user-agent'])],
    );
    addBandwidth(t.file_size);
    const safe = t.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || `track-${t.id}`;
    reply.header(
      'Content-Disposition',
      `attachment; filename="track-${t.id}.mp3"; filename*=UTF-8''${encodeURIComponent(`${safe}.mp3`)}`,
    );
    return reply.sendFile(t.audio_path, dirs.audio);
  });

  app.get('/api/tracks/:id/stream', async (request, reply) => {
    const t = await one(
      `SELECT t.id, t.audio_path, t.file_size, ${PLAYABLE} AS playable FROM tracks t WHERE t.id = $1`,
      [toInt(request.params.id)],
    );
    if (!t || !t.audio_path) throw httpError(404, 'الملف غير موجود');
    if (!t.playable && !isStaff(request.currentUser)) throw httpError(403, 'الأغنية دي غير متاحة حاليًا');
    addBandwidth(rangeBytes(request.headers.range, t.file_size));
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.sendFile(t.audio_path, dirs.audio);
  });
}
