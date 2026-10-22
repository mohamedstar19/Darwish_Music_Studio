/*
 * Helpers for external internet-radio streams (Icecast / Shoutcast / HLS):
 * - probeStream(): check a link, read its station info headers, resolve .pls/.m3u
 *   playlists, detect HLS, and read the current song title from ICY metadata.
 * - nowTitle(): cached "what's playing" for a station (refreshed at most every 20s).
 */

import { safeFetch } from './netguard.js';

const UA = 'DarwishMusicStudio/1.0 (+https://dms.darwish-tech.com)';
const PROBE_TIMEOUT_MS = 7000;
const MAX_METAINT = 256 * 1024;

export function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function decodeMeta(buf) {
  const utf8 = buf.toString('utf8');
  return utf8.includes('�') ? buf.toString('latin1') : utf8;
}

function parseStreamTitle(meta) {
  const m = /StreamTitle='([\s\S]*?)';/.exec(meta);
  const title = m ? m[1].trim() : '';
  return title && title !== '-' ? title.slice(0, 300) : null;
}

/** Find the first stream URL inside a .pls or .m3u playlist. */
function firstUrlInPlaylist(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const pls = /^File\d+=(.+)$/i.exec(line);
    const candidate = pls ? pls[1].trim() : line;
    if (!candidate || candidate.startsWith('#') || candidate.startsWith('[')) continue;
    if (isHttpUrl(candidate)) return candidate;
  }
  return null;
}

async function readMetaTitle(body, metaint) {
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  let need = metaint + 1;
  let metaLen = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return null;
      chunks.push(Buffer.from(value));
      total += value.length;
      if (metaLen === null && total >= metaint + 1) {
        const buf = Buffer.concat(chunks);
        metaLen = buf[metaint] * 16;
        if (metaLen === 0) return null;
        need = metaint + 1 + metaLen;
      }
      if (metaLen !== null && total >= need) {
        const buf = Buffer.concat(chunks);
        return parseStreamTitle(decodeMeta(buf.subarray(metaint + 1, metaint + 1 + metaLen)));
      }
      if (total > metaint + 4096 + 1) return null;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * Probe a stream link. Never throws: returns { ok, error?, ... }.
 * `depth` guards against playlists that point at other playlists forever.
 */
export async function probeStream(url, { wantTitle = true, depth = 0 } = {}) {
  if (!isHttpUrl(url)) return { ok: false, error: 'الرابط لازم يبدأ بـ http:// أو https://' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, {
      headers: { 'Icy-MetaData': '1', 'User-Agent': UA, Accept: '*/*' },
      signal: ctrl.signal,
    });
    const h = res.headers;
    const contentType = (h.get('content-type') || '').toLowerCase();
    const info = {
      ok: res.ok,
      status: res.status,
      url,
      finalUrl: res.url || url,
      contentType,
      name: h.get('icy-name') || null,
      description: h.get('icy-description') || null,
      genre: h.get('icy-genre') || null,
      bitrate: h.get('icy-br') ? Number.parseInt(h.get('icy-br'), 10) || null : null,
      homepage: h.get('icy-url') || null,
      isHls: false,
      title: null,
    };
    if (!res.ok) {
      info.error = `السيرفر رد بـ ${res.status}`;
      res.body?.cancel().catch(() => {});
      return info;
    }

    const looksLikePlaylist =
      /mpegurl|scpls|x-scpls|text\/plain|application\/octet-stream/.test(contentType) && /\.(m3u8?|pls)(\?|$)/i.test(url);
    if (/mpegurl|scpls/.test(contentType) || looksLikePlaylist || /\.(m3u8?|pls)(\?|$)/i.test(url)) {
      const text = (await res.text()).slice(0, 64 * 1024);
      if (/#EXT-X-/i.test(text)) {
        info.isHls = true;
        return info;
      }
      const inner = firstUrlInPlaylist(text);
      if (!inner) return { ...info, ok: false, error: 'ملف القائمة مفيهوش رابط بث' };
      if (depth >= 2) return { ...info, ok: false, error: 'القائمة بتشاور على قوائم كتير جوه بعض' };
      const resolved = await probeStream(inner, { wantTitle, depth: depth + 1 });
      return { ...resolved, resolvedFrom: url };
    }

    if (contentType && !/audio|ogg|aac|mpeg|octet-stream|video\/mp2t/.test(contentType)) {
      res.body?.cancel().catch(() => {});
      return { ...info, ok: false, error: `الرابط ده مش بث صوت (${contentType})` };
    }

    const metaint = Number.parseInt(h.get('icy-metaint') || '0', 10);
    if (wantTitle && metaint > 0 && metaint <= MAX_METAINT && res.body) {
      info.title = await readMetaTitle(res.body, metaint).catch(() => null);
    } else {
      res.body?.cancel().catch(() => {});
    }
    return info;
  } catch (err) {
    const msg = err.blocked ? err.message : err.name === 'AbortError' ? 'الرابط مردش في الوقت المحدد' : 'تعذر الاتصال بالرابط';
    return { ok: false, url, error: msg, detail: String(err.cause?.code || err.message).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Cached now-playing titles ----
const titles = new Map(); // stationId -> { at, title, promise }
const TITLE_TTL = 20_000;

export async function nowTitle(station) {
  const hit = titles.get(station.id);
  if (hit && Date.now() - hit.at < TITLE_TTL) return hit.title;
  if (hit?.promise) return hit.promise;
  const promise = probeStream(station.stream_url, { wantTitle: true })
    .then((info) => (info.ok ? info.title : null))
    .catch(() => null)
    .then((title) => {
      titles.set(station.id, { at: Date.now(), title });
      return title;
    });
  titles.set(station.id, { ...(hit || {}), at: hit?.at || 0, promise });
  return promise;
}

export function forgetTitle(stationId) {
  titles.delete(stationId);
}
