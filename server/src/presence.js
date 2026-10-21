/*
 * Who is online right now and what they are listening to.
 * Every open tab sends a heartbeat every ~20 seconds; a session counts as
 * online for 60 seconds after its last heartbeat. Kept in memory: it is
 * live state, not history (history lives in the plays table).
 */

const sessions = new Map(); // listenerId -> session
const ONLINE_MS = 75_000;

export function platformFrom(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'Android';
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os')) return 'Mac';
  if (ua.includes('linux')) return 'Linux';
  return 'أخرى';
}

export function heartbeat({ listenerId, user, userAgent, body }) {
  if (!listenerId) return;
  const key = String(listenerId).slice(0, 64);
  const prev = sessions.get(key);
  const now = Date.now();
  sessions.set(key, {
    listenerId: key,
    userId: user?.id || null,
    userName: user?.display_name || null,
    userEmail: user?.email || null,
    platform: platformFrom(userAgent),
    installed: !!body.installed,
    page: typeof body.page === 'string' ? body.page.slice(0, 120) : null,
    mode: body.mode === 'radio' ? 'radio' : 'queue',
    playing: !!body.playing,
    trackId: Number.isInteger(body.trackId) ? body.trackId : null,
    stationSlug: typeof body.stationSlug === 'string' ? body.stationSlug.slice(0, 60) : null,
    position: Number.isFinite(body.position) ? Math.round(body.position) : null,
    firstSeen: prev?.firstSeen || now,
    lastSeen: now,
  });
}

export function onlineSessions() {
  const cutoff = Date.now() - ONLINE_MS;
  const list = [];
  for (const [key, s] of sessions) {
    if (s.lastSeen < cutoff) sessions.delete(key);
    else list.push(s);
  }
  return list.sort((a, b) => Number(b.playing) - Number(a.playing) || b.lastSeen - a.lastSeen);
}

let peak = { count: 0, at: null };
export function updatePeak(count) {
  if (count > peak.count) peak = { count, at: new Date().toISOString() };
  return peak;
}
