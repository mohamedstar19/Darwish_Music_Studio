import { isStaff, requireUser } from '../auth.js';
import { many, one, PLAYABLE, query, TRACK_SELECT, tx } from '../db.js';
import { coverUrl, shapeTracks } from '../shape.js';
import { cleanText, httpError, toInt } from '../util.js';
import { heartbeat, platformFrom } from '../presence.js';

async function loadPlaylist(id, user) {
  const p = await one('SELECT p.*, u.display_name AS owner_name FROM playlists p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = $1', [id]);
  if (!p) throw httpError(404, 'القائمة غير موجودة');
  const isOwner = user && p.user_id === user.id;
  const canEdit = isOwner || (p.is_official && isStaff(user));
  if (!p.is_public && !p.is_official && !isOwner) throw httpError(404, 'القائمة غير موجودة');
  return { p, canEdit };
}

function shapePlaylist(p, extra = {}) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    isPublic: p.is_public,
    isOfficial: p.is_official,
    mood: p.mood,
    ownerName: p.owner_name,
    updatedAt: p.updated_at,
    ...extra,
  };
}

export default async function libraryRoutes(app) {
  // ---- Favorites ----
  app.get('/api/me/favorite-ids', async (request) => {
    if (!request.currentUser) return [];
    const rows = await many('SELECT track_id FROM favorites WHERE user_id = $1', [request.currentUser.id]);
    return rows.map((r) => r.track_id);
  });

  app.get('/api/me/favorites', { onRequest: requireUser }, async (request) => {
    const rows = await many(
      `${TRACK_SELECT} JOIN favorites f ON f.track_id = t.id
       WHERE f.user_id = $1 AND ${PLAYABLE} ORDER BY f.created_at DESC`,
      [request.currentUser.id],
    );
    return shapeTracks(rows);
  });

  app.put('/api/me/favorites/:trackId', { onRequest: requireUser }, async (request) => {
    await query('INSERT INTO favorites (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      request.currentUser.id,
      toInt(request.params.trackId),
    ]);
    return { ok: true };
  });

  app.delete('/api/me/favorites/:trackId', { onRequest: requireUser }, async (request) => {
    await query('DELETE FROM favorites WHERE user_id = $1 AND track_id = $2', [request.currentUser.id, toInt(request.params.trackId)]);
    return { ok: true };
  });

  // ---- Playlists ----
  app.get('/api/me/playlists', { onRequest: requireUser }, async (request) => {
    const rows = await many(
      `SELECT p.*, count(pt.track_id)::int AS track_count FROM playlists p
       LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       WHERE p.user_id = $1 AND NOT p.is_official GROUP BY p.id ORDER BY p.updated_at DESC`,
      [request.currentUser.id],
    );
    return rows.map((p) => shapePlaylist(p, { trackCount: p.track_count }));
  });

  app.post('/api/playlists', { onRequest: requireUser }, async (request) => {
    const { title, description, isPublic, isOfficial, mood } = request.body || {};
    const name = cleanText(title, 100);
    if (!name) throw httpError(400, 'اكتب اسم القائمة');
    const official = !!isOfficial && isStaff(request.currentUser);
    const p = await one(
      `INSERT INTO playlists (user_id, title, description, is_public, is_official, mood)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [request.currentUser.id, name, cleanText(description, 500), !!isPublic || official, official, cleanText(mood, 40)],
    );
    return shapePlaylist(p, { trackCount: 0, canEdit: true });
  });

  app.get('/api/playlists/:id', async (request) => {
    const { p, canEdit } = await loadPlaylist(toInt(request.params.id), request.currentUser);
    const rows = await many(
      `${TRACK_SELECT} JOIN playlist_tracks pt ON pt.track_id = t.id
       WHERE pt.playlist_id = $1 AND ${PLAYABLE} ORDER BY pt.position`,
      [p.id],
    );
    const tracks = shapeTracks(rows);
    return shapePlaylist(p, { canEdit, tracks, covers: tracks.map((t) => t.cover).filter(Boolean).slice(0, 4) });
  });

  app.patch('/api/playlists/:id', { onRequest: requireUser }, async (request) => {
    const { p, canEdit } = await loadPlaylist(toInt(request.params.id), request.currentUser);
    if (!canEdit) throw httpError(403, 'غير مسموح');
    const b = request.body || {};
    const updated = await one(
      `UPDATE playlists SET title = $2, description = $3, is_public = $4, mood = $5, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        p.id,
        cleanText(b.title, 100) || p.title,
        b.description !== undefined ? cleanText(b.description, 500) : p.description,
        typeof b.isPublic === 'boolean' ? b.isPublic || p.is_official : p.is_public,
        b.mood !== undefined ? cleanText(b.mood, 40) : p.mood,
      ],
    );
    return shapePlaylist(updated, { canEdit: true });
  });

  app.delete('/api/playlists/:id', { onRequest: requireUser }, async (request) => {
    const { p, canEdit } = await loadPlaylist(toInt(request.params.id), request.currentUser);
    if (!canEdit) throw httpError(403, 'غير مسموح');
    await query('DELETE FROM playlists WHERE id = $1', [p.id]);
    return { ok: true };
  });

  app.post('/api/playlists/:id/tracks', { onRequest: requireUser }, async (request) => {
    const { p, canEdit } = await loadPlaylist(toInt(request.params.id), request.currentUser);
    if (!canEdit) throw httpError(403, 'غير مسموح');
    const trackIds = [].concat(request.body?.trackIds || request.body?.trackId || []).map((x) => toInt(x)).filter(Boolean);
    if (!trackIds.length) throw httpError(400, 'مفيش أغاني');
    await tx(async (c) => {
      const { rows } = await c.query('SELECT coalesce(max(position), 0) AS pos FROM playlist_tracks WHERE playlist_id = $1', [p.id]);
      let pos = rows[0].pos;
      for (const id of trackIds) {
        pos += 1;
        await c.query(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [p.id, id, pos],
        );
      }
      await c.query('UPDATE playlists SET updated_at = now() WHERE id = $1', [p.id]);
    });
    return { ok: true };
  });

  app.delete('/api/playlists/:id/tracks/:trackId', { onRequest: requireUser }, async (request) => {
    const { p, canEdit } = await loadPlaylist(toInt(request.params.id), request.currentUser);
    if (!canEdit) throw httpError(403, 'غير مسموح');
    await query('DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2', [p.id, toInt(request.params.trackId)]);
    return { ok: true };
  });

  // Reorder: body.trackIds is the full new order.
  app.put('/api/playlists/:id/order', { onRequest: requireUser }, async (request) => {
    const { p, canEdit } = await loadPlaylist(toInt(request.params.id), request.currentUser);
    if (!canEdit) throw httpError(403, 'غير مسموح');
    const ids = (request.body?.trackIds || []).map((x) => toInt(x)).filter(Boolean);
    await tx(async (c) => {
      for (let i = 0; i < ids.length; i += 1) {
        await c.query('UPDATE playlist_tracks SET position = $3 WHERE playlist_id = $1 AND track_id = $2', [p.id, ids[i], i + 1]);
      }
      await c.query('UPDATE playlists SET updated_at = now() WHERE id = $1', [p.id]);
    });
    return { ok: true };
  });

  // ---- Listening history & plays ----
  app.post('/api/plays', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request) => {
    const b = request.body || {};
    const trackId = toInt(b.trackId);
    const seconds = Math.min(Math.max(toInt(b.seconds, 0), 0), 6 * 3600);
    if (!trackId || seconds < 5) return { ok: true };
    const user = request.currentUser;
    const source = ['ondemand', 'radio', 'quiz', 'surprise'].includes(b.source) ? b.source : 'ondemand';
    const stationId = toInt(b.stationId);
    // Anonymous or history-off listens still count toward totals, but without a user link.
    const userId = user && user.history_enabled ? user.id : null;
    await query(
      'INSERT INTO plays (user_id, track_id, station_id, source, seconds_listened) VALUES ($1, $2, $3, $4, $5)',
      [userId, trackId, stationId, source, seconds],
    );
    if (seconds >= 15) await query('UPDATE tracks SET play_count = play_count + 1 WHERE id = $1', [trackId]);
    return { ok: true };
  });

  app.get('/api/me/history', { onRequest: requireUser }, async (request) => {
    const rows = await many(
      `SELECT p.played_at, p.source, p.seconds_listened, x.* FROM plays p
       JOIN (${TRACK_SELECT} WHERE ${PLAYABLE}) x ON x.id = p.track_id
       WHERE p.user_id = $1 ORDER BY p.played_at DESC LIMIT 200`,
      [request.currentUser.id],
    );
    return rows.map((r) => ({ playedAt: r.played_at, source: r.source, seconds: r.seconds_listened, track: shapeTracks([r])[0] }));
  });

  app.delete('/api/me/history', { onRequest: requireUser }, async (request) => {
    await query('DELETE FROM plays WHERE user_id = $1', [request.currentUser.id]);
    return { ok: true };
  });

  // "My Music Memories": a personal listening summary.
  app.get('/api/me/memories', { onRequest: requireUser }, async (request) => {
    const uid = request.currentUser.id;
    const days = Math.min(Math.max(toInt(request.query.days, 365), 1), 3650);
    const since = `now() - ($2 || ' days')::interval`;
    const [totals, topTracks, topCategories, topWorks, topStations, byHour, byMonth] = await Promise.all([
      one(
        `SELECT count(*)::int AS plays, count(DISTINCT track_id)::int AS songs,
                coalesce(sum(seconds_listened), 0)::int AS seconds,
                min(played_at) AS first_play
         FROM plays WHERE user_id = $1 AND played_at > ${since}`,
        [uid, days],
      ),
      many(
        `${TRACK_SELECT} JOIN (SELECT track_id, count(*)::int AS n FROM plays
           WHERE user_id = $1 AND played_at > ${since} GROUP BY track_id) p ON p.track_id = t.id
         ORDER BY p.n DESC LIMIT 10`,
        [uid, days],
      ),
      many(
        `SELECT c.name, c.color, count(*)::int AS n FROM plays p JOIN tracks t ON t.id = p.track_id
         JOIN categories c ON c.id = t.category_id
         WHERE p.user_id = $1 AND p.played_at > ${since} GROUP BY c.id ORDER BY n DESC LIMIT 6`,
        [uid, days],
      ),
      many(
        `SELECT w.id, w.title, w.cover_path, count(*)::int AS n FROM plays p JOIN tracks t ON t.id = p.track_id
         JOIN works w ON w.id = t.work_id
         WHERE p.user_id = $1 AND p.played_at > ${since} GROUP BY w.id ORDER BY n DESC LIMIT 6`,
        [uid, days],
      ),
      many(
        `SELECT s.slug, s.name, s.color, coalesce(sum(p.seconds_listened), 0)::int AS seconds FROM plays p
         JOIN stations s ON s.id = p.station_id
         WHERE p.user_id = $1 AND p.played_at > ${since} GROUP BY s.id ORDER BY seconds DESC LIMIT 5`,
        [uid, days],
      ),
      many(
        `SELECT extract(hour FROM played_at)::int AS hour, count(*)::int AS n FROM plays
         WHERE user_id = $1 AND played_at > ${since} GROUP BY 1 ORDER BY 1`,
        [uid, days],
      ),
      many(
        `SELECT to_char(date_trunc('month', played_at), 'YYYY-MM') AS month, count(*)::int AS n FROM plays
         WHERE user_id = $1 AND played_at > ${since} GROUP BY 1 ORDER BY 1`,
        [uid, days],
      ),
    ]);
    const topTrackCounts = new Map(
      (await many(
        `SELECT track_id, count(*)::int AS n FROM plays WHERE user_id = $1 AND played_at > ${since} GROUP BY track_id`,
        [uid, days],
      )).map((r) => [r.track_id, r.n]),
    );
    return {
      historyEnabled: request.currentUser.history_enabled,
      days,
      totals,
      topTracks: shapeTracks(topTracks).map((t) => ({ ...t, myPlays: topTrackCounts.get(t.id) || 0 })),
      topCategories,
      topWorks: topWorks.map((w) => ({ id: w.id, title: w.title, cover: coverUrl(w.cover_path), plays: w.n })),
      topStations,
      byHour,
      byMonth,
    };
  });

  // ---- Reports & telemetry ----
  app.post('/api/reports', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request) => {
    const b = request.body || {};
    const kind = ['rights', 'broken', 'metadata', 'other'].includes(b.kind) ? b.kind : 'other';
    const message = cleanText(b.message, 3000);
    if (!message) throw httpError(400, 'اكتب تفاصيل البلاغ');
    await query('INSERT INTO reports (user_id, track_id, kind, message, contact) VALUES ($1, $2, $3, $4, $5)', [
      request.currentUser?.id || null,
      toInt(b.trackId),
      kind,
      message,
      cleanText(b.contact, 200),
    ]);
    return { ok: true };
  });

  // ---- Live presence (who is online and what they are playing) ----
  app.post('/api/presence', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const b = request.body || {};
    heartbeat({
      listenerId: b.listenerId,
      user: request.currentUser,
      userAgent: request.headers['user-agent'],
      body: b,
    });
    return { ok: true };
  });

  // App installs (PWA), launches from the installed app, and site visits.
  app.post('/api/telemetry/app-event', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const b = request.body || {};
    if (!['install', 'app_open', 'visit'].includes(b.kind)) throw httpError(400, 'نوع غير معروف');
    const listener = cleanText(b.listenerId, 64);
    if (b.kind === 'install' && listener) {
      // One install per device.
      const seen = await one("SELECT id FROM app_events WHERE kind = 'install' AND listener_id = $1", [listener]);
      if (seen) return { ok: true };
    }
    await query('INSERT INTO app_events (kind, listener_id, user_id, platform) VALUES ($1, $2, $3, $4)', [
      b.kind,
      listener,
      request.currentUser?.id || null,
      platformFrom(request.headers['user-agent']),
    ]);
    return { ok: true };
  });

  app.post('/api/telemetry/playback-error', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const b = request.body || {};
    await query('INSERT INTO playback_errors (track_id, user_id, message) VALUES ($1, $2, $3)', [
      toInt(b.trackId),
      request.currentUser?.id || null,
      cleanText(b.message, 500),
    ]);
    return { ok: true };
  });
}
