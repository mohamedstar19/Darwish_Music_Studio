import { Readable } from 'node:stream';
import { requireUser } from '../auth.js';
import { many, one, PLAYABLE, query, TRACK_SELECT } from '../db.js';
import { listenerCount, nowPlaying, touchListener } from '../radio.js';
import { nowTitle } from '../streams.js';
import { clientIp, safeFetch } from '../netguard.js';
import { addBandwidth } from './catalog.js';
import { normAr, shapeStation, shapeTracks } from '../shape.js';
import { cleanText, httpError, likePattern, toInt } from '../util.js';

async function activeStation(slug) {
  const s = await one('SELECT * FROM stations WHERE slug = $1 AND is_active', [slug]);
  if (!s) throw httpError(404, 'المحطة غير موجودة');
  return s;
}

export default async function radioRoutes(app) {
  app.get('/api/stations', async () => {
    const rows = await many(
      `SELECT s.*, count(t.id)::int AS track_count FROM stations s
       LEFT JOIN station_tracks st ON st.station_id = s.id
       LEFT JOIN tracks t ON t.id = st.track_id AND ${PLAYABLE}
       WHERE s.is_active GROUP BY s.id ORDER BY s.sort_order, s.name`,
    );
    return rows.map((s) => ({ ...shapeStation(s), listeners: listenerCount(s.id) }));
  });

  app.get('/api/stations/:slug', async (request) => {
    const s = await activeStation(request.params.slug);
    return { ...shapeStation(s), listeners: listenerCount(s.id) };
  });

  app.get('/api/stations/:slug/now', async (request) => {
    const s = await activeStation(request.params.slug);
    touchListener(s.id, request.query.listener);
    if (s.kind === 'external') {
      if (!s.stream_url) return { station: shapeStation(s), listeners: listenerCount(s.id), empty: true };
      return {
        station: shapeStation(s),
        listeners: listenerCount(s.id),
        external: true,
        empty: false,
        streamUrl: s.stream_url,
        isHls: /\.m3u8(\?|$)/i.test(s.stream_url),
        nowTitle: await nowTitle(s),
        serverTime: new Date().toISOString(),
      };
    }
    const live = await nowPlaying(s);
    return { station: shapeStation(s), listeners: listenerCount(s.id), ...live };
  });

  // Relay for external http:// streams so they also play on the https:// site
  // (browsers block plain-http audio on secure pages). Uses the server's bandwidth.
  // Each relayed listener holds a connection and uses upload bandwidth: cap them.
  const relayByIp = new Map();
  let relayTotal = 0;
  const MAX_RELAYS = 80;
  const MAX_RELAYS_PER_IP = 3;

  app.get('/api/stations/:slug/stream', async (request, reply) => {
    const s = await activeStation(request.params.slug);
    if (s.kind !== 'external' || !s.stream_url || /\.m3u8(\?|$)/i.test(s.stream_url)) {
      throw httpError(404, 'المحطة دي مش بث خارجي');
    }
    const ip = clientIp(request);
    if (relayTotal >= MAX_RELAYS || (relayByIp.get(ip) || 0) >= MAX_RELAYS_PER_IP) {
      throw httpError(429, 'في ضغط على البث دلوقتي، جرب كمان شوية');
    }
    relayTotal += 1;
    relayByIp.set(ip, (relayByIp.get(ip) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      relayTotal -= 1;
      const n = (relayByIp.get(ip) || 1) - 1;
      if (n > 0) relayByIp.set(ip, n);
      else relayByIp.delete(ip);
    };
    const ctrl = new AbortController();
    request.raw.on('close', () => {
      ctrl.abort();
      release();
    });
    let upstream;
    try {
      upstream = await safeFetch(s.stream_url, {
        headers: { 'User-Agent': 'DarwishMusicStudio/1.0', 'Icy-MetaData': '0' },
        signal: ctrl.signal,
      });
    } catch {
      release();
      throw httpError(502, 'المحطة مش متاحة دلوقتي');
    }
    if (!upstream.ok || !upstream.body) {
      release();
      throw httpError(502, 'المحطة مش متاحة دلوقتي');
    }
    const body = Readable.fromWeb(upstream.body);
    let bytes = 0;
    body.on('data', (chunk) => {
      bytes += chunk.length;
    });
    body.on('close', () => addBandwidth(bytes));
    body.on('error', () => {});
    reply.header('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    reply.header('Cache-Control', 'no-store');
    return reply.send(body);
  });

  // Tracks a listener may request on this station.
  app.get('/api/stations/:slug/requestable', async (request) => {
    const s = await activeStation(request.params.slug);
    const q = normAr(request.query.q);
    const rows = await many(
      `${TRACK_SELECT} JOIN station_tracks st ON st.track_id = t.id AND st.station_id = $1
       WHERE ${PLAYABLE} ${q ? 'AND (norm_ar(t.title) LIKE $2 OR norm_ar(w.title) LIKE $2 OR norm_ar(a.name) LIKE $2)' : ''}
       ORDER BY t.title LIMIT 30`,
      q ? [s.id, likePattern(q)] : [s.id],
    );
    return shapeTracks(rows);
  });

  app.get('/api/stations/:slug/requests', async (request) => {
    const s = await activeStation(request.params.slug);
    const rows = await many(
      `SELECT r.id, r.status, r.message, r.created_at, u.display_name, x.* FROM song_requests r
       JOIN (${TRACK_SELECT}) x ON x.id = r.track_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.station_id = $1 AND r.status IN ('pending', 'approved') ORDER BY r.created_at LIMIT 20`,
      [s.id],
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message,
      by: r.display_name,
      createdAt: r.created_at,
      track: shapeTracks([r])[0],
    }));
  });

  app.post(
    '/api/stations/:slug/requests',
    { onRequest: requireUser, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request) => {
      const s = await activeStation(request.params.slug);
      if (s.requests_mode === 'off' || s.kind === 'external') throw httpError(400, 'الطلبات مقفولة في المحطة دي');
      const trackId = toInt(request.body?.trackId);
      const ok = await one(
        `SELECT t.id FROM tracks t JOIN station_tracks st ON st.track_id = t.id AND st.station_id = $1
         WHERE t.id = $2 AND ${PLAYABLE}`,
        [s.id, trackId],
      );
      if (!ok) throw httpError(400, 'الأغنية دي مش متاحة في المحطة');
      const open = await one(
        `SELECT count(*)::int AS n FROM song_requests
         WHERE station_id = $1 AND user_id = $2 AND status IN ('pending', 'approved')`,
        [s.id, request.currentUser.id],
      );
      if (open.n >= 2) throw httpError(429, 'عندك طلبات لسه مستنية، استنى لما تتذاع');
      const dup = await one(
        "SELECT id FROM song_requests WHERE station_id = $1 AND track_id = $2 AND status IN ('pending', 'approved')",
        [s.id, trackId],
      );
      if (dup) throw httpError(409, 'الأغنية دي مطلوبة بالفعل ومستنية دورها');
      const status = s.requests_mode === 'auto' ? 'approved' : 'pending';
      await query(
        `INSERT INTO song_requests (station_id, user_id, track_id, message, status, decided_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'approved' THEN now() END)`,
        [s.id, request.currentUser.id, trackId, cleanText(request.body?.message, 200), status],
      );
      return { ok: true, status };
    },
  );
}
