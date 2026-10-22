/*
 * Find pictures on the internet: artist photos, song covers, film/anime/cartoon posters.
 *
 * Sources (no API keys needed): Deezer (artists + album covers, good Arabic coverage),
 * iTunes (album covers, Egyptian store), Jikan/MyAnimeList (anime posters) and
 * Wikipedia ar/en (film, series and cartoon posters).
 *
 * search*() return candidates for a person to pick from. The automatic job only takes a
 * result whose name clearly matches ours, and only downloads from known image hosts.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { many, one, query } from './db.js';
import { dirs, importImage, randomName, removeMedia } from './media.js';
import { normAr } from './shape.js';
import { autoLyrics } from './lyrics.js';

const UA = 'DarwishMusicStudio/1.0 (+https://dms.darwish-tech.com)';
const ALLOWED_HOSTS = [/(^|\.)dzcdn\.net$/, /(^|\.)deezer\.com$/, /(^|\.)mzstatic\.com$/, /(^|\.)wikimedia\.org$/, /(^|\.)myanimelist\.net$/];
const MAX_BYTES = 8 * 1024 * 1024;

export async function getJson(url, timeout = 9000) {
  // One retry: a dropped connection or a hiccup in name lookup shouldn't lose the result.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { http: res.status });
      return await res.json();
    } catch (err) {
      if (attempt >= 1 || (err.http && err.http < 500)) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

const hasArabic = (s) => /[؀-ۿ]/.test(s || '');

/** 0..1 similarity of two names (character bigrams, Arabic-normalised). */
export function similarity(a, b) {
  const clean = (s) => normAr(s).replace(/[^\p{L}\p{N}]+/gu, '');
  const x = clean(a);
  const y = clean(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i += 1) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) || 0);
  return (2 * inter) / Math.max(1, x.length - 1 + y.length - 1);
}

// ---------------- Sources ----------------

async function deezerArtists(name) {
  const j = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=6`);
  return (j.data || [])
    .filter((a) => a.picture_xl && !/\/artist\/\/|images\/artist\/\//.test(a.picture_xl))
    .map((a) => ({ url: a.picture_xl, thumb: a.picture_medium, label: a.name, source: 'Deezer', fans: a.nb_fan || 0, score: similarity(name, a.name) }));
}

async function deezerTracks(title, artist) {
  const q = [artist, title].filter(Boolean).join(' ');
  const j = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=6`);
  return (j.data || [])
    .filter((t) => t.album?.cover_xl)
    .map((t) => ({
      url: t.album.cover_xl,
      thumb: t.album.cover_medium,
      label: `${t.title} — ${t.artist?.name || ''}`,
      source: 'Deezer',
      score: Math.min(similarity(title, t.title), artist ? Math.max(similarity(artist, t.artist?.name), hasArabic(artist) !== hasArabic(t.artist?.name) ? 0.7 : 0) : 1),
    }));
}

async function itunesTracks(title, artist) {
  const term = [artist, title].filter(Boolean).join(' ');
  const j = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=6&country=eg`);
  return (j.results || [])
    .filter((r) => r.artworkUrl100)
    .map((r) => ({
      url: r.artworkUrl100.replace(/100x100bb/, '1000x1000bb'),
      thumb: r.artworkUrl100,
      label: `${r.trackName} — ${r.artistName}`,
      source: 'iTunes',
      year: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : null,
      score: Math.min(similarity(title, r.trackName), artist ? Math.max(similarity(artist, r.artistName), hasArabic(artist) !== hasArabic(r.artistName) ? 0.7 : 0) : 1),
    }));
}

async function jikanAnime(title) {
  const j = await getJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=5&sfw=true`, 6000);
  return (j.data || [])
    .filter((a) => a.images?.jpg?.large_image_url)
    .map((a) => ({
      url: a.images.jpg.large_image_url,
      thumb: a.images.jpg.image_url,
      label: `${a.title}${a.year ? ` (${a.year})` : ''}`,
      source: 'MyAnimeList',
      score: Math.max(similarity(title, a.title), ...(a.titles || []).map((t) => similarity(title, t.title))),
    }));
}

async function wikipedia(title, lang, hint) {
  const q = hint ? `${title} ${hint}` : title;
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=800&origin=*`;
  const j = await getJson(url);
  return Object.values(j.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source))
    .map((p) => ({ url: p.thumbnail.source, thumb: p.thumbnail.source, label: p.title, source: `Wikipedia ${lang}`, score: similarity(title, p.title) }));
}

async function settle(promises) {
  const results = await Promise.allSettled(promises);
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

function rank(list) {
  const seen = new Set();
  return list
    .sort((a, b) => b.score - a.score)
    .filter((c) => (seen.has(c.url) ? false : seen.add(c.url)))
    .slice(0, 9);
}

// ---------------- Public search ----------------

export async function searchArtist(name) {
  return rank(await settle([deezerArtists(name), wikipedia(name, hasArabic(name) ? 'ar' : 'en')]));
}

export async function searchTrack(title, artist) {
  return rank(await settle([deezerTracks(title, artist), itunesTracks(title, artist)]));
}

export async function searchWork(title, kind) {
  const hint = { film: 'فيلم', anime: 'أنمي', cartoon: 'كرتون', series: 'مسلسل' }[kind] || '';
  // Exact name first; the type word (فيلم / أنمي …) only as an extra search.
  const tasks = [wikipedia(title, 'ar', ''), wikipedia(title, 'en', '')];
  if (hint) tasks.push(wikipedia(title, 'ar', hint));
  if (kind === 'anime' || kind === 'cartoon') tasks.unshift(jikanAnime(title));
  return rank(await settle(tasks));
}

// ---------------- Safe download ----------------

function allowed(u) {
  try {
    const { protocol, hostname } = new URL(u);
    return protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}

/** Download an image from a known image host into covers/. Returns the cover file name. */
export async function downloadImage(url) {
  if (!allowed(url)) throw Object.assign(new Error('مصدر الصورة غير مسموح'), { statusCode: 400 });
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok || !allowed(res.url)) throw Object.assign(new Error('تعذر تحميل الصورة'), { statusCode: 502 });
  if (!/^image\//.test(res.headers.get('content-type') || '')) throw Object.assign(new Error('الرابط مش صورة'), { statusCode: 400 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('الصورة كبيرة جدًا'), { statusCode: 400 });
  const tmp = path.join(dirs.tmp, randomName('.img'));
  await fsp.writeFile(tmp, buf);
  try {
    return await importImage(tmp);
  } finally {
    await fsp.rm(tmp, { force: true });
  }
}

/** Save a downloaded image onto an artist / work / track (replacing the old one). */
export async function applyImage(type, id, url) {
  const name = await downloadImage(url);
  const table = { artist: ['artists', 'photo_path'], work: ['works', 'cover_path'], track: ['tracks', 'cover_path'] }[type];
  if (!table) throw Object.assign(new Error('نوع غير معروف'), { statusCode: 400 });
  const [tbl, col] = table;
  const old = await one(`SELECT ${col} AS p FROM ${tbl} WHERE id = $1`, [id]);
  if (!old) {
    await removeMedia('covers', name);
    throw Object.assign(new Error('غير موجود'), { statusCode: 404 });
  }
  await query(`UPDATE ${tbl} SET ${col} = $2 WHERE id = $1`, [id, name]);
  await removeMedia('covers', old.p);
  return name;
}

// ---------------- Automatic fill of missing pictures ----------------

const AUTO_MIN = { artist: 0.82, work: 0.8, track: 0.62 };
const job = { running: false, stopRequested: false, total: 0, done: 0, found: 0, skipped: 0, current: null, recent: [], startedAt: null, finishedAt: null };

export function artworkStatus() {
  return { ...job, recent: job.recent.slice(-20) };
}

export function stopArtworkJob() {
  if (job.running) job.stopRequested = true;
  return artworkStatus();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decide automatically for an artist: same name, or a well-known artist when the scripts differ (عمرو دياب ↔ Amr Diab). */
function pickArtist(name, list) {
  const best = list.find((c) => c.source === 'Deezer' && c.score >= AUTO_MIN.artist);
  if (best) return best;
  const first = list.filter((c) => c.source === 'Deezer').sort((a, b) => b.fans - a.fans)[0];
  if (first && hasArabic(name) !== hasArabic(first.label) && first.fans >= 20000) return first;
  return null;
}

export async function startArtworkJob({ artists = true, works = true, tracks = true, lyrics = true } = {}) {
  if (job.running) throw Object.assign(new Error('البحث عن الصور شغال بالفعل'), { statusCode: 409 });
  const todo = [];
  if (artists) {
    for (const a of await many(
      `SELECT a.id, a.name FROM artists a WHERE a.photo_path IS NULL
       AND EXISTS (SELECT 1 FROM tracks t WHERE t.artist_id = a.id) ORDER BY a.id`,
    )) todo.push({ type: 'artist', id: a.id, name: a.name });
  }
  if (works) {
    for (const w of await many(
      `SELECT w.id, w.title, w.kind FROM works w WHERE w.cover_path IS NULL
       AND EXISTS (SELECT 1 FROM tracks t WHERE t.work_id = w.id) ORDER BY w.id`,
    )) todo.push({ type: 'work', id: w.id, name: w.title, kind: w.kind });
  }
  Object.assign(job, { running: true, stopRequested: false, total: todo.length, done: 0, found: 0, skipped: 0, current: null, recent: [], startedAt: new Date().toISOString(), finishedAt: null });
  void (async () => {
    for (const item of todo) {
      if (job.stopRequested) break;
      job.current = item.name;
      try {
        let pick = null;
        if (item.type === 'artist') pick = pickArtist(item.name, await searchArtist(item.name));
        else pick = (await searchWork(item.name, item.kind)).find((c) => c.score >= AUTO_MIN.work) || null;
        if (pick) {
          await applyImage(item.type, item.id, pick.url);
          job.found += 1;
          job.recent.push({ type: item.type, name: item.name, match: pick.label, source: pick.source });
        } else job.skipped += 1;
      } catch {
        job.skipped += 1;
      }
      job.done += 1;
      await sleep(400);
    }
    // Songs still with no picture at all (no own cover, artist photo or work cover).
    if (tracks && !job.stopRequested) {
      const rows = await many(
        `SELECT t.id, t.title, a.name AS artist FROM tracks t
         LEFT JOIN artists a ON a.id = t.artist_id LEFT JOIN works w ON w.id = t.work_id
         WHERE t.cover_path IS NULL AND a.photo_path IS NULL AND w.cover_path IS NULL ORDER BY t.id`,
      );
      job.total += rows.length;
      for (const t of rows) {
        if (job.stopRequested) break;
        job.current = t.title;
        try {
          const pick = (await searchTrack(t.title, t.artist)).find((c) => c.score >= AUTO_MIN.track);
          if (pick) {
            await applyImage('track', t.id, pick.url);
            job.found += 1;
            job.recent.push({ type: 'track', name: t.title, match: pick.label, source: pick.source });
          } else job.skipped += 1;
        } catch {
          job.skipped += 1;
        }
        job.done += 1;
        await sleep(1500); // iTunes allows roughly 20 searches a minute
      }
    }
    // Lyrics for songs that have none (only clear matches: same title, artist and length).
    if (lyrics && !job.stopRequested) {
      const rows = await many(
        `SELECT t.id, t.title, t.duration_sec, a.name AS artist FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id
         WHERE t.lyrics IS NULL AND t.processing_status = 'ready' ORDER BY t.id`,
      );
      job.total += rows.length;
      for (const t of rows) {
        if (job.stopRequested) break;
        job.current = `كلمات: ${t.title}`;
        try {
          const pick = await autoLyrics(t);
          if (pick) {
            job.found += 1;
            job.recent.push({ type: 'lyrics', name: t.title, match: `${pick.title} — ${pick.artist}${pick.synced ? ' (متزامنة)' : ''}`, source: 'LRCLIB' });
          } else job.skipped += 1;
        } catch {
          job.skipped += 1;
        }
        job.done += 1;
        await sleep(600);
      }
    }
    if (job.recent.length > 200) job.recent = job.recent.slice(-200);
    job.running = false;
    job.current = null;
    job.finishedAt = new Date().toISOString();
  })();
  return artworkStatus();
}
