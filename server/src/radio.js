import { many, PLAYABLE, TRACK_SELECT, tx } from './db.js';

/*
 * "Virtual live" radio: no Icecast needed. Each station keeps one shared clock
 * (current track + the moment it started). Every listener asks "what is playing
 * now and how far in?" and plays the normal audio file from that offset, so
 * everyone hears the same thing at the same time. Requests jump the queue.
 */

function hash(n) {
  // Small deterministic integer hash used for per-cycle shuffling.
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function rotationOrder(rotation, cycle, shuffle) {
  if (!shuffle) return rotation;
  return [...rotation].sort((a, b) => hash(a.id * 7919 + cycle) - hash(b.id * 7919 + cycle) || a.id - b.id);
}

async function loadRotation(client, stationId) {
  const { rows } = await client.query(
    `SELECT t.id, t.duration_sec FROM station_tracks st
     JOIN tracks t ON t.id = st.track_id
     WHERE st.station_id = $1 AND ${PLAYABLE} AND t.duration_sec > 0
     ORDER BY st.position, t.id`,
    [stationId],
  );
  return rows;
}

async function nextApprovedRequest(client, stationId) {
  const { rows } = await client.query(
    `SELECT r.id, t.id AS track_id, t.duration_sec FROM song_requests r
     JOIN tracks t ON t.id = r.track_id
     WHERE r.station_id = $1 AND r.status = 'approved' AND ${PLAYABLE} AND t.duration_sec > 0
     ORDER BY r.decided_at NULLS LAST, r.created_at
     LIMIT 1`,
    [stationId],
  );
  return rows[0] || null;
}

function rotationPick(rotation, index, shuffle) {
  const len = rotation.length;
  const cycle = Math.floor(index / len);
  return rotationOrder(rotation, cycle, shuffle)[index % len];
}

/** Advance the station clock to "now" and return its live state. */
export async function nowPlaying(station) {
  const state = await tx(async (client) => {
    const st = (await client.query('SELECT * FROM stations WHERE id = $1 FOR UPDATE', [station.id])).rows[0];
    const rotation = await loadRotation(client, st.id);
    if (!rotation.length) return null;

    const durations = new Map(rotation.map((r) => [r.id, r.duration_sec]));
    const cycleSec = rotation.reduce((sum, r) => sum + r.duration_sec, 0);
    const now = Date.now();

    let trackId = st.current_track_id;
    let startedAt = st.current_started_at ? new Date(st.current_started_at).getTime() : null;
    let index = st.rotation_index;

    let currentDuration = durations.get(trackId);
    if (trackId && currentDuration === undefined) {
      // Current track may be a request outside the rotation; it must still be playable.
      const { rows } = await client.query(
        `SELECT t.duration_sec FROM tracks t WHERE t.id = $1 AND ${PLAYABLE} AND t.duration_sec > 0`,
        [trackId],
      );
      currentDuration = rows[0]?.duration_sec;
    }

    const advance = async (startMs) => {
      const request = await nextApprovedRequest(client, st.id);
      if (request) {
        await client.query("UPDATE song_requests SET status = 'played' WHERE id = $1", [request.id]);
        trackId = request.track_id;
        currentDuration = request.duration_sec;
      } else {
        const pick = rotationPick(rotation, index, st.shuffle);
        index += 1;
        trackId = pick.id;
        currentDuration = pick.duration_sec;
      }
      startedAt = startMs;
      await client.query(
        'INSERT INTO station_history (station_id, track_id, started_at, request_id) VALUES ($1, $2, $3, $4)',
        [st.id, trackId, new Date(startMs), request?.id || null],
      );
    };

    if (!trackId || !startedAt || currentDuration === undefined) {
      await advance(now);
    } else {
      let endMs = startedAt + currentDuration * 1000;
      if (now - endMs > cycleSec * 1000) {
        // Station sat idle for longer than a full cycle: keep the phase, skip the replay.
        endMs = now - ((now - endMs) % (cycleSec * 1000));
      }
      let guard = 0;
      while (endMs <= now && guard < rotation.length + 50) {
        await advance(endMs);
        endMs = startedAt + currentDuration * 1000;
        guard += 1;
      }
      if (endMs <= now) await advance(now);
    }

    await client.query(
      'UPDATE stations SET current_track_id = $2, current_started_at = $3, rotation_index = $4 WHERE id = $1',
      [st.id, trackId, new Date(startedAt), index],
    );

    // Predict what comes next (a waiting request, else the rotation).
    const request = await nextApprovedRequest(client, st.id);
    const upNextId = request ? request.track_id : rotationPick(rotation, index, st.shuffle).id;
    return { trackId, startedAt, duration: currentDuration, upNextId, now };
  });

  if (!state) return { empty: true };

  const recentRows = await many(
    `SELECT track_id FROM station_history WHERE station_id = $1 AND started_at < $2
     ORDER BY started_at DESC LIMIT 6`,
    [station.id, new Date(state.startedAt)],
  );
  const ids = [state.trackId, state.upNextId, ...recentRows.map((r) => r.track_id)].filter(Boolean);
  const tracks = await many(`${TRACK_SELECT} WHERE t.id = ANY($1::int[])`, [ids]);
  const byId = new Map(tracks.map((t) => [t.id, t]));

  return {
    empty: false,
    track: byId.get(state.trackId) || null,
    startedAt: new Date(state.startedAt).toISOString(),
    offsetSec: Math.max(0, (state.now - state.startedAt) / 1000),
    endsAt: new Date(state.startedAt + state.duration * 1000).toISOString(),
    serverTime: new Date(state.now).toISOString(),
    upNext: byId.get(state.upNextId) || null,
    recent: recentRows.map((r) => byId.get(r.track_id)).filter(Boolean),
  };
}

// ---- Live listener counts (in memory, good enough for one server) ----

const listeners = new Map(); // stationId -> Map(listenerId -> lastSeen)
const LISTENER_TTL = 75_000;

export function touchListener(stationId, listenerId) {
  if (!listenerId) return;
  if (!listeners.has(stationId)) listeners.set(stationId, new Map());
  listeners.get(stationId).set(String(listenerId).slice(0, 64), Date.now());
}

export function listenerCount(stationId) {
  const map = listeners.get(stationId);
  if (!map) return 0;
  const cutoff = Date.now() - LISTENER_TTL;
  for (const [key, seen] of map) if (seen < cutoff) map.delete(key);
  return map.size;
}
