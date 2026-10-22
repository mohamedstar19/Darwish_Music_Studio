/*
 * Song lyrics from LRCLIB (lrclib.net): a free, open lyrics library, often with timed
 * (synced) lyrics. search() returns candidates to pick from; the automatic job only
 * takes a result whose title, artist and length clearly match the song.
 */
import { getJson, similarity } from './artwork.js';
import { one, query } from './db.js';

const hasArabic = (s) => /[؀-ۿ]/.test(s || '');

function shape(r, title, artist, duration) {
  const titleScore = similarity(title, r.trackName);
  const artistScore = artist
    ? Math.max(similarity(artist, r.artistName), hasArabic(artist) !== hasArabic(r.artistName) ? 0.7 : 0)
    : 1;
  const durationOk = !duration || !r.duration || Math.abs(duration - r.duration) <= 4;
  return {
    id: r.id,
    title: r.trackName,
    artist: r.artistName,
    album: r.albumName,
    duration: r.duration,
    instrumental: !!r.instrumental,
    synced: !!r.syncedLyrics,
    preview: String(r.plainLyrics || '').split('\n').filter(Boolean).slice(0, 4).join('\n'),
    score: Math.min(titleScore, artistScore) * (durationOk ? 1 : 0.6),
    durationOk,
  };
}

export async function searchLyrics(title, artist, duration) {
  const urls = [];
  if (artist) {
    urls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`);
  }
  urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent([artist, title].filter(Boolean).join(' '))}`);
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    try {
      for (const r of await getJson(url, 10000)) {
        if (seen.has(r.id) || (!r.plainLyrics && !r.syncedLyrics)) continue;
        seen.add(r.id);
        out.push(shape(r, title, artist, duration));
      }
    } catch {
      // try the next query
    }
    if (out.some((c) => c.score >= 0.85)) break;
  }
  return out.sort((a, b) => b.score - a.score || Number(b.synced) - Number(a.synced)).slice(0, 8);
}

/** Save lyrics (plain + timed) from an LRCLIB entry onto a track. */
export async function applyLyrics(trackId, lrclibId) {
  const r = await getJson(`https://lrclib.net/api/get/${encodeURIComponent(lrclibId)}`, 10000);
  if (!r || (!r.plainLyrics && !r.syncedLyrics)) throw Object.assign(new Error('مفيش كلمات في النتيجة دي'), { statusCode: 404 });
  const plain = r.plainLyrics || String(r.syncedLyrics).replace(/^\s*\[[^\]]*\]\s?/gm, '');
  await query(
    `UPDATE tracks SET lyrics = $2, lyrics_synced = $3, lyrics_source = 'LRCLIB', updated_at = now() WHERE id = $1`,
    [trackId, plain.slice(0, 20000), r.syncedLyrics ? String(r.syncedLyrics).slice(0, 40000) : null],
  );
  return one('SELECT lyrics, lyrics_synced FROM tracks WHERE id = $1', [trackId]);
}

/** For the automatic job: the best match, only when it clearly is the same song. */
export async function autoLyrics(track) {
  const list = await searchLyrics(track.title, track.artist, track.duration_sec);
  const pick = list.find((c) => c.score >= 0.85 && c.durationOk && !c.instrumental);
  if (!pick) return null;
  await applyLyrics(track.id, pick.id);
  return pick;
}
