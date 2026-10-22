/*
 * Fix wrong song names.
 *
 * 1. By sound: Chromaprint's fpcalc makes a fingerprint of the audio, and AcoustID
 *    (the open MusicBrainz database) says which recording it is. Needs a free
 *    *application* key from https://acoustid.org/new-application (saved in the admin panel).
 * 2. By name: junk is removed from the current name ("Sm3na.com", "Track 01", "mp3", …)
 *    and the rest is searched on Deezer and iTunes; the song's length must match too.
 *
 * The automatic job only applies a result it is sure of, and only to songs whose
 * names look wrong; everything else is kept as a suggestion for a person to accept.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { many, one, query } from './db.js';
import { dirs } from './media.js';
import { getJson, similarity } from './artwork.js';
import { cleanText } from './util.js';

const UA = 'DarwishMusicStudio/1.0 (+https://dms.darwish-tech.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasArabic = (s) => /[؀-ۿ]/.test(s || '');
const hasLatin = (s) => /[A-Za-z]/.test(s || '');

/**
 * A name that looks wrong (site names, "Track 01", bare numbers, file leftovers).
 * Written without \b or \s so the same pattern works in JavaScript and PostgreSQL.
 */
export const SUSPICIOUS_PATTERN =
  '(www\\.|https?:|\\.(com|net|org|info)|track ?[0-9]+|^ *[0-9]+ *$|untitled|unknown|mp3|بدون اسم|غير معروف|official|lyric|_)';
const SUSPICIOUS_RE = new RegExp(SUSPICIOUS_PATTERN, 'i');

/** SQL condition (tracks as t, artists as a): the name looks wrong or the artist is missing. */
export const SUSPICIOUS_SQL = `(t.title ~* '${SUSPICIOUS_PATTERN}' OR t.artist_id IS NULL OR a.name ~* '${SUSPICIOUS_PATTERN}')`;

export function looksWrong(text) {
  return !text || SUSPICIOUS_RE.test(String(text));
}

// ---------------- Settings (the AcoustID key) ----------------

export async function getSetting(key) {
  return (await one('SELECT value FROM app_settings WHERE key = $1', [key]))?.value || null;
}

export async function setSetting(key, value) {
  if (!value) await query('DELETE FROM app_settings WHERE key = $1', [key]);
  else {
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    );
  }
}

async function acoustidKey() {
  return (await getSetting('acoustid_key')) || process.env.ACOUSTID_KEY || null;
}

// ---------------- Fingerprint ----------------

let fpcalcOk = null;
export async function fpcalcAvailable() {
  if (fpcalcOk !== null) return fpcalcOk;
  fpcalcOk = await new Promise((resolve) => {
    const p = spawn(config.fpcalcPath, ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
  return fpcalcOk;
}

function fingerprint(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.fpcalcPath, ['-json', '-length', '120', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 60000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        if (j.fingerprint) return resolve({ duration: Math.round(j.duration), fingerprint: j.fingerprint });
      } catch {
        // fall through
      }
      reject(new Error(err.trim().split('\n').pop() || `fpcalc exit ${code}`));
    });
  });
}

function audioFileOf(track) {
  for (const [dir, name] of [[dirs.originals, track.original_path], [dirs.audio, track.audio_path]]) {
    if (!name) continue;
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

let lastAcoustid = 0;
async function acoustidLookup(key, fp) {
  // AcoustID allows 3 requests a second.
  const wait = lastAcoustid + 400 - Date.now();
  if (wait > 0) await sleep(wait);
  lastAcoustid = Date.now();
  const body = new URLSearchParams({
    client: key,
    format: 'json',
    meta: 'recordings releasegroups compress',
    duration: String(fp.duration),
    fingerprint: fp.fingerprint,
  });
  const res = await fetch('https://api.acoustid.org/v2/lookup', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({}));
  if (j.status !== 'ok') {
    const code = j.error?.code;
    const e = new Error(code === 4 ? 'مفتاح AcoustID غلط' : `AcoustID: ${j.error?.message || res.status}`);
    e.keyInvalid = code === 4;
    throw e;
  }
  return j.results || [];
}

/** Check a key: an invalid key gets error 4, a valid one gets "ok" or a fingerprint error. */
export async function testAcoustidKey(key) {
  const body = new URLSearchParams({ client: key, format: 'json', duration: '200', fingerprint: 'AQAAAA' });
  const res = await fetch('https://api.acoustid.org/v2/lookup', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({}));
  return !(j.status === 'error' && j.error?.code === 4);
}

function durationFactor(ours, theirs, tight = 3) {
  if (!ours || !theirs) return 0.8;
  const d = Math.abs(ours - theirs);
  if (d <= tight) return 1;
  if (d <= 8) return 0.85;
  return 0.5;
}

function bySound(results, duration) {
  const map = new Map();
  for (const r of results) {
    if (!(r.score >= 0.5)) continue;
    for (const rec of r.recordings || []) {
      if (!rec.title) continue;
      const artist = (rec.artists || []).map((a) => a.name + (a.joinphrase || '')).join('').trim() || null;
      const key = `${rec.title}|${artist}`.toLowerCase();
      const conf = r.score * durationFactor(duration, rec.duration, 5);
      const prev = map.get(key);
      if (prev) {
        prev.votes += 1;
        prev.confidence = Math.max(prev.confidence, conf);
        continue;
      }
      map.set(key, {
        source: 'AcoustID',
        title: rec.title,
        artist,
        album: rec.releasegroups?.find((g) => g.type === 'Album')?.title || rec.releasegroups?.[0]?.title || null,
        year: null,
        duration: rec.duration || null,
        confidence: conf,
        votes: 1,
        acoustid: r.id,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence || b.votes - a.votes).slice(0, 6);
}

// ---------------- By name ----------------

/** Remove site names, track numbers, "mp3", "(Official Video)" … from a name. */
export function cleanName(text) {
  return String(text || '')
    .replace(/\.(mp3|m4a|wav|wma|ogg|flac|aac)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\b(unknown( artist)?|untitled|various artists)\b|بدون اسم|غير معروف/gi, ' ')
    .replace(/[([{][^)\]}]*(www\.|\.com|\.net|https?:|official|lyric|video|audio|\bhd\b|كليب|حصري)[^)\]}]*[)\]}]/gi, ' ')
    .replace(/(www\.\S+|https?:\/\/\S+|\S+\.(com|net|org|info)\b)/gi, ' ')
    .replace(/\b(official( music)? video|lyrics?( video)?|hd|hq|mp3|audio)\b/gi, ' ')
    .replace(/\b(track|cd)\s*\d+\b/gi, ' ')
    .replace(/^\s*\d{1,3}[\s._\-–)]+/, '')
    .replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Our best guess at "artist" and "title" from the current names (handles "Artist - Title"). */
function nameGuess(track) {
  const title = cleanName(track.title);
  const artist = track.artist && !looksWrong(track.artist) ? track.artist : cleanName(track.artist);
  const parts = title.split(/\s+[-–|]\s+/).filter(Boolean);
  if (parts.length === 2 && !artist) return { title: parts[1], artist: parts[0], alt: { title: parts[0], artist: parts[1] } };
  return { title, artist: artist || null };
}

let lastItunes = 0;
async function itunes(term) {
  // iTunes allows about 20 searches a minute.
  const wait = lastItunes + 3100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastItunes = Date.now();
  const j = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=8&country=eg`);
  return (j.results || []).map((r) => ({
    source: 'iTunes',
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName || null,
    year: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : null,
    duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
  }));
}

async function deezer(term) {
  const j = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=8`);
  return (j.data || []).map((t) => ({
    source: 'Deezer',
    title: t.title,
    artist: t.artist?.name || null,
    album: t.album?.title || null,
    year: null,
    duration: t.duration || null,
  }));
}

function scoreByName(c, guess, duration) {
  const match = (g) => {
    const t = similarity(g.title, c.title);
    if (!g.artist) return t * 0.9;
    const crossScript = hasArabic(g.artist) !== hasArabic(c.artist);
    const a = Math.max(similarity(g.artist, c.artist), crossScript ? 0.7 : 0);
    return Math.min(t, a);
  };
  const s = Math.max(match(guess), guess.alt ? match(guess.alt) : 0);
  return s * durationFactor(duration, c.duration);
}

async function byName(track) {
  const guess = nameGuess(track);
  if (!guess.title || looksWrong(guess.title) || guess.title.length < 2) return [];
  const term = [guess.artist, guess.title].filter(Boolean).join(' ');
  let list = [];
  try {
    list = await deezer(term);
  } catch {
    // try iTunes
  }
  let scored = list.map((c) => ({ ...c, confidence: scoreByName(c, guess, track.duration_sec) }));
  if (!scored.some((c) => c.confidence >= 0.85)) {
    try {
      scored = scored.concat((await itunes(term)).map((c) => ({ ...c, confidence: scoreByName(c, guess, track.duration_sec) })));
    } catch {
      // no result from iTunes either
    }
  }
  const seen = new Set();
  return scored
    .filter((c) => c.title && c.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .filter((c) => {
      const k = `${c.title}|${c.artist}`.toLowerCase();
      return seen.has(k) ? false : seen.add(k);
    })
    .slice(0, 6);
}

// ---------------- Identify one song ----------------

const TRACK_ROW = `SELECT t.id, t.title, t.year, t.duration_sec, t.original_path, t.audio_path, t.artist_id, a.name AS artist
  FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id`;

/**
 * All suggestions for one song: by sound first (when a key is set), then by name, plus
 * the current name with the junk removed. Each has a confidence 0..1.
 */
export async function identifyTrack(trackId, { useName = true } = {}) {
  const t = await one(`${TRACK_ROW} WHERE t.id = $1`, [trackId]);
  if (!t) throw Object.assign(new Error('الأغنية غير موجودة'), { statusCode: 404 });
  const key = await acoustidKey();
  const info = { keySet: !!key, fpcalc: await fpcalcAvailable(), soundError: null, acoustidId: null };
  let candidates = [];

  if (key && info.fpcalc) {
    const file = audioFileOf(t);
    if (!file) info.soundError = 'ملف الأغنية مش موجود';
    else {
      try {
        const fp = await fingerprint(file);
        const results = await acoustidLookup(key, fp);
        info.acoustidId = results.sort((a, b) => b.score - a.score)[0]?.id || null;
        candidates = bySound(results, t.duration_sec || fp.duration);
        if (info.acoustidId) await query('UPDATE tracks SET acoustid_id = $2 WHERE id = $1', [t.id, info.acoustidId]);
      } catch (err) {
        info.soundError = err.message;
        if (err.keyInvalid) info.keyInvalid = true;
      }
    }
  }

  if (useName && !candidates.some((c) => c.confidence >= 0.9)) candidates = candidates.concat(await byName(t));

  // The current name with the junk taken out (never applied automatically).
  const guess = nameGuess(t);
  if (guess.title && guess.title !== t.title && !looksWrong(guess.title)) {
    candidates.push({ source: 'تنظيف الاسم', title: guess.title, artist: guess.artist || t.artist, album: null, year: null, duration: null, confidence: 0.5 });
  }

  return { track: { id: t.id, title: t.title, artist: t.artist, year: t.year, duration: t.duration_sec }, ...info, candidates };
}

// ---------------- Apply ----------------

async function artistByName(name) {
  const clean = cleanText(name, 120);
  if (!clean) return null;
  const found = await one('SELECT id FROM artists WHERE norm_ar(name) = norm_ar($1) LIMIT 1', [clean]);
  if (found) return found.id;
  return (
    await one(
      'INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [clean],
    )
  ).id;
}

/** Save a chosen name. Only the fields given are changed. */
export async function applyName(trackId, { title, artist, year } = {}) {
  const t = await one('SELECT id, title, artist_id, year FROM tracks WHERE id = $1', [trackId]);
  if (!t) throw Object.assign(new Error('الأغنية غير موجودة'), { statusCode: 404 });
  const newTitle = cleanText(title, 200) || t.title;
  const artistId = artist ? await artistByName(artist) : t.artist_id;
  const y = Number(year);
  const newYear = y >= 1900 && y <= 2100 ? y : t.year;
  await query(
    `UPDATE tracks SET title = $2, artist_id = $3, year = $4, identify_status = 'applied',
       identified_at = now(), updated_at = now() WHERE id = $1`,
    [trackId, newTitle, artistId, newYear],
  );
}

export async function dismissSuggestion(trackId) {
  await query(`UPDATE tracks SET identify_status = 'dismissed', identified_at = now() WHERE id = $1`, [trackId]);
}

/**
 * Should the job change this song by itself? Only when the result is clearly the same
 * song, the current name looks wrong, and an Arabic name wouldn't be swapped for a
 * Latin spelling.
 */
function autoPlan(t, best) {
  if (!best) return null;
  const sure = best.source === 'AcoustID' ? best.confidence >= 0.9 : best.source !== 'تنظيف الاسم' && best.confidence >= 0.92;
  if (!sure) return null;
  const titleWrong = looksWrong(t.title);
  const artistWrong = !t.artist || looksWrong(t.artist);
  if (!titleWrong && !artistWrong) return null;
  const plan = {};
  if (titleWrong && !(hasArabic(cleanName(t.title)) && hasLatin(best.title) && !hasArabic(best.title))) plan.title = best.title;
  if (artistWrong && best.artist) plan.artist = best.artist;
  if (!t.year && best.year) plan.year = best.year;
  return plan.title || plan.artist ? plan : null;
}

// ---------------- Background job ----------------

const job = { running: false, stopRequested: false, total: 0, done: 0, applied: 0, suggested: 0, none: 0, current: null, recent: [], startedAt: null, finishedAt: null, error: null };

export function identifyStatus() {
  return { ...job, recent: job.recent.slice(-20) };
}

export function stopIdentifyJob() {
  if (job.running) job.stopRequested = true;
  return identifyStatus();
}

/** scope: 'suspicious' (names that look wrong) or 'all' (every song not checked yet). */
export async function startIdentifyJob({ scope = 'suspicious' } = {}) {
  if (job.running) throw Object.assign(new Error('التعرف على الأغاني شغال بالفعل'), { statusCode: 409 });
  const where = scope === 'all' ? 'TRUE' : SUSPICIOUS_SQL;
  const rows = await many(
    `${TRACK_ROW} WHERE t.identify_status IS NULL AND t.processing_status = 'ready' AND ${where} ORDER BY t.id`,
  );
  Object.assign(job, { running: true, stopRequested: false, total: rows.length, done: 0, applied: 0, suggested: 0, none: 0, current: null, recent: [], startedAt: new Date().toISOString(), finishedAt: null, error: null });
  void (async () => {
    for (const t of rows) {
      if (job.stopRequested) break;
      job.current = t.title;
      try {
        const r = await identifyTrack(t.id);
        if (r.keyInvalid) {
          job.error = 'مفتاح AcoustID غلط. صلّحه وشغّل تاني.';
          break;
        }
        const best = r.candidates[0] || null;
        const plan = autoPlan(t, best);
        if (plan) {
          await applyName(t.id, plan);
          job.applied += 1;
          job.recent.push({ id: t.id, from: [t.title, t.artist].filter(Boolean).join(' — '), to: [plan.title || t.title, plan.artist || t.artist].filter(Boolean).join(' — '), source: best.source });
        } else {
          const useful = r.candidates.filter((c) => c.confidence >= 0.5);
          const unchanged = best && similarity(best.title, t.title) >= 0.9 && (!best.artist || !t.artist || similarity(best.artist, t.artist) >= 0.8);
          const status = useful.length && !unchanged ? 'suggested' : 'none';
          await query(
            `UPDATE tracks SET identify_status = $2, identify_suggestion = $3, identified_at = now() WHERE id = $1`,
            [t.id, status, status === 'suggested' ? JSON.stringify(useful.slice(0, 4)) : null],
          );
          job[status] += 1;
        }
      } catch {
        job.none += 1;
      }
      job.done += 1;
    }
    if (job.recent.length > 200) job.recent = job.recent.slice(-200);
    job.running = false;
    job.current = null;
    job.finishedAt = new Date().toISOString();
  })();
  return identifyStatus();
}

/** Songs with a suggestion waiting for a person. */
export async function reviewList(limit = 100) {
  const rows = await many(
    `SELECT t.id, t.title, t.year, t.duration_sec, a.name AS artist, t.identify_suggestion
     FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id
     WHERE t.identify_status = 'suggested' ORDER BY t.identified_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, artist: r.artist, year: r.year, duration: r.duration_sec, candidates: r.identify_suggestion || [] }));
}
