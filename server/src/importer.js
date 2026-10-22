/*
 * Bulk import: turn a pile of audio files into organised tracks.
 *
 * For every file it works out, in this order:
 *   - category: chosen in the form → a folder named like a category → keywords in folder
 *     names or the genre tag (أفلام / film / soundtrack → أغاني الأفلام, أنمي → أنمي, …)
 *     → a new category from the top folder (if allowed)
 *   - work (the film / cartoon / series): chosen in the form → the song's own folder →
 *     the album tag; found by name or created
 *   - artist, title and year: from the file's tags, else the file/folder names
 *   - picture: a cover image next to the songs (cover.jpg, folder.jpg, poster…) becomes the
 *     work's cover; otherwise the picture inside the file is used during processing
 * Files already in the library (same content) are skipped, so an import can be re-run.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { many, one, query } from './db.js';
import {
  AUDIO_EXT,
  dirs,
  enqueueTrack,
  hashFile,
  IMAGE_EXT,
  importImage,
  randomName,
  readTags,
  removeMedia,
} from './media.js';
import { config } from './config.js';
import { normAr } from './shape.js';
import { cleanText, slugify } from './util.js';

const RULES = [
  { slug: 'film-songs', kind: 'film', words: ['فيلم', 'افلام', 'سينما', 'سينمائي', 'film', 'films', 'movie', 'movies', 'soundtrack', 'soundtracks', 'ost', 'cinema'] },
  { slug: 'anime-arabic', kind: 'anime', words: ['انمي', 'انيمي', 'انمى', 'anime'] },
  { slug: 'spacetoon', kind: 'cartoon', words: ['سبيستون', 'سبيس تون', 'spacetoon', 'space toon'] },
  { slug: 'cartoon-arabic', kind: 'cartoon', words: ['كرتون', 'كارتون', 'رسوم متحركه', 'cartoon', 'cartoons', 'animation'] },
  { slug: 'kids-classics', kind: 'other', words: ['اطفال', 'طفل', 'kids', 'children', 'nursery'] },
  { slug: 'drama-memories', kind: 'series', words: ['مسلسل', 'مسلسلات', 'تتر', 'تترات', 'series', 'drama', 'tv'] },
];
const KIND_BY_SLUG = Object.fromEntries(RULES.map((r) => [r.slug, r.kind]));

const COVER_NAMES = ['cover', 'folder', 'front', 'albumart', 'album', 'poster', 'artwork', 'غلاف', 'صوره', 'بوستر'];

// ---------- text helpers ----------
function tokens(text) {
  return normAr(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => (t.startsWith('ال') && t.length > 4 ? t.slice(2) : t));
}

function matchRule(text) {
  if (!text) return null;
  const norm = normAr(text);
  const toks = new Set(tokens(text));
  for (const rule of RULES) {
    for (const w of rule.words) {
      const nw = normAr(w);
      if (nw.includes(' ') ? norm.includes(nw) : toks.has(nw)) return rule;
    }
  }
  return null;
}

/** Tags from downloaded files often hold site names; treat those as empty. */
function junk(value) {
  if (!value) return true;
  const v = String(value).trim();
  if (v.length < 2) return true;
  return /(www\.|https?:|\.com|\.net|\.org|unknown|غير معروف|track\s*\d+|^\d+$)/i.test(v);
}

function stripJunk(text) {
  return String(text || '')
    .replace(/[([{][^)\]}]*(www\.|\.com|\.net|https?:)[^)\]}]*[)\]}]/gi, ' ')
    .replace(/(www\.\S+|https?:\/\/\S+|\S+\.(com|net|org)\b)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleFromFilename(file) {
  let base = path.basename(file).replace(/\.[^.]+$/, '');
  base = base.replace(/^\s*(\d{1,3}|cd\s*\d+)[\s._\-–)]+/i, '');
  base = base.replace(/[_]+/g, ' ');
  return stripJunk(base) || path.basename(file);
}

function yearFrom(...texts) {
  for (const t of texts) {
    const m = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(String(t || ''));
    if (m) return Number(m[1]);
  }
  return null;
}

// ---------- find-or-create (serialised so parallel uploads don't create duplicates) ----------
let lock = Promise.resolve();
function serial(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

async function findCategory(text) {
  if (!text) return null;
  const n = normAr(text);
  const rows = await many('SELECT id, name, slug FROM categories');
  return rows.find((c) => normAr(c.name) === n || normAr(c.slug) === n || normAr(c.slug.replace(/-/g, ' ')) === n) || null;
}

async function categoryBySlug(slug) {
  return one('SELECT id, name, slug FROM categories WHERE slug = $1', [slug]);
}

function ensureCategory(name) {
  return serial(async () => {
    const found = await findCategory(name);
    if (found) return found;
    let slug = slugify(name);
    if (await one('SELECT id FROM categories WHERE slug = $1', [slug])) slug = `${slug}-${Date.now().toString(36)}`;
    const max = await one('SELECT coalesce(max(sort_order), 0) + 1 AS n FROM categories');
    return one('INSERT INTO categories (name, slug, sort_order) VALUES ($1, $2, $3) RETURNING id, name, slug', [
      cleanText(name, 80),
      slug,
      max.n,
    ]);
  });
}

function ensureWork(title, kind, year) {
  return serial(async () => {
    const clean = cleanText(stripJunk(title), 200);
    if (!clean) return null;
    const found = await one('SELECT id, title, cover_path, year FROM works WHERE norm_ar(title) = norm_ar($1) LIMIT 1', [clean]);
    if (found) {
      if (!found.year && year) await query('UPDATE works SET year = $2 WHERE id = $1', [found.id, year]);
      return found;
    }
    return one('INSERT INTO works (title, kind, year) VALUES ($1, $2, $3) RETURNING id, title, cover_path, year', [
      clean,
      kind || 'other',
      year,
    ]);
  });
}

function ensureArtist(name) {
  const clean = cleanText(stripJunk(name), 120);
  if (!clean) return null;
  return serial(async () => {
    const found = await one('SELECT id, name FROM artists WHERE norm_ar(name) = norm_ar($1) LIMIT 1', [clean]);
    if (found) return found;
    return one(
      'INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name',
      [clean],
    );
  });
}

/**
 * Decide category / work / artist / title / year for one file.
 * relPath: path inside the chosen folder, e.g. "أفلام/اللمبي/01 - اغنية.mp3" (may be just a file name).
 */
export async function classify({ tags = {}, relPath = '', opts = {} }) {
  const dirsIn = path
    .dirname(relPath.replace(/\\/g, '/'))
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.');
  const fileName = path.basename(relPath) || 'track';
  const genre = tags.genre || '';

  // Category
  let category = null;
  let categoryFolderIdx = -1;
  if (opts.categoryId) {
    category = await one('SELECT id, name, slug FROM categories WHERE id = $1', [opts.categoryId]);
  }
  if (!category && opts.auto) {
    for (let i = 0; i < dirsIn.length && !category; i += 1) {
      const c = await findCategory(dirsIn[i]);
      if (c) {
        category = c;
        categoryFolderIdx = i;
      }
    }
    if (!category) {
      for (let i = 0; i < dirsIn.length && !category; i += 1) {
        const rule = matchRule(dirsIn[i]);
        if (rule) {
          category = await categoryBySlug(rule.slug);
          if (category) categoryFolderIdx = i;
        }
      }
    }
    if (!category) {
      const rule = matchRule(genre) || matchRule(tags.album);
      if (rule) category = await categoryBySlug(rule.slug);
    }
    // Several folder levels and nothing matched: the top folder names a new category.
    if (!category && opts.createMissing && dirsIn.length >= 2) {
      category = await ensureCategory(dirsIn[0]);
      categoryFolderIdx = 0;
    }
  }

  // Work (film / show): explicit → the song's own folder (if it isn't the category folder) → album tag
  const year = (tags.year >= 1900 && tags.year <= 2100 ? tags.year : null) || yearFrom(...dirsIn, fileName);
  const kind = (category && KIND_BY_SLUG[category.slug]) || matchRule(dirsIn.join(' '))?.kind || 'other';
  let work = null;
  if (opts.workId) {
    work = await one('SELECT id, title, cover_path FROM works WHERE id = $1', [opts.workId]);
  } else if (opts.auto) {
    const lastIdx = dirsIn.length - 1;
    const folderWork = lastIdx >= 0 && lastIdx !== categoryFolderIdx ? dirsIn[lastIdx] : null;
    const name = folderWork || (!junk(tags.album) ? tags.album : null);
    if (name && !(await findCategory(name))) {
      work = await ensureWork(name.replace(/\(?\b(19|20)\d{2}\b\)?/g, '').trim() || name, kind, year);
    }
  }

  // Artist, title
  const artistName = !junk(tags.artist) ? tags.artist : opts.artistName || null;
  const artist = artistName ? await ensureArtist(artistName) : null;
  const title = cleanText(opts.title, 200) || (!junk(tags.title) ? stripJunk(tags.title) : null) || titleFromFilename(fileName);

  return { category, work, artist, title: cleanText(title, 200) || 'بدون اسم', year };
}

/** Pick the best cover image among image files in one folder. */
export function pickFolderCover(imageNames) {
  if (!imageNames.length) return null;
  for (const want of COVER_NAMES) {
    const hit = imageNames.find((f) => normAr(path.basename(f, path.extname(f))).includes(normAr(want)));
    if (hit) return hit;
  }
  return imageNames.length === 1 ? imageNames[0] : null;
}

/**
 * Create a track from an audio file already stored in originals/.
 * Returns { status: 'imported' | 'duplicate', trackId, ... }.
 */
export async function importStoredFile({ originalName, hash, relPath, folderCover, opts }) {
  if (hash) {
    const dup = await one('SELECT id, title FROM tracks WHERE source_hash = $1 LIMIT 1', [hash]);
    if (dup) {
      await removeMedia('originals', originalName);
      return { status: 'duplicate', trackId: dup.id, title: dup.title };
    }
  }
  const tags = await readTags(originalName);
  const c = await classify({ tags, relPath, opts });

  // A folder picture becomes the work's cover; with no work, the song gets its own copy.
  let ownCover = null;
  if (folderCover) {
    if (c.work && !c.work.cover_path) {
      await query('UPDATE works SET cover_path = $2 WHERE id = $1 AND cover_path IS NULL', [c.work.id, folderCover]);
      c.work.cover_path = folderCover;
    } else if (!c.work) {
      ownCover = randomName('.jpg');
      await fsp.copyFile(path.join(dirs.covers, folderCover), path.join(dirs.covers, ownCover)).catch(() => {
        ownCover = null;
      });
    }
  }

  const rights = ['original', 'licensed', 'pending'].includes(opts.rightsType) ? opts.rightsType : 'pending';
  const row = await one(
    `INSERT INTO tracks (title, artist_id, work_id, category_id, year, original_path, cover_path,
                         rights_type, rights_source, source_hash, auto_publish)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      c.title,
      c.artist?.id || null,
      c.work?.id || null,
      c.category?.id || null,
      c.year,
      originalName,
      ownCover,
      rights,
      cleanText(opts.rightsSource, 300),
      hash || null,
      !!opts.publish && rights !== 'pending',
    ],
  );
  if (opts.stationId) {
    await query(
      `INSERT INTO station_tracks (station_id, track_id, position)
       VALUES ($1, $2, (SELECT coalesce(max(position), 0) + 1 FROM station_tracks WHERE station_id = $1))
       ON CONFLICT DO NOTHING`,
      [opts.stationId, row.id],
    );
  }
  enqueueTrack(row.id);
  return {
    status: 'imported',
    trackId: row.id,
    title: c.title,
    category: c.category?.name || null,
    work: c.work?.title || null,
    artist: c.artist?.name || null,
  };
}

// ---------- Import from a folder on the server ----------
const job = {
  running: false,
  stopRequested: false,
  total: 0,
  done: 0,
  imported: 0,
  duplicates: 0,
  failed: 0,
  current: null,
  errors: [],
  recent: [],
  startedAt: null,
  finishedAt: null,
};

export function importStatus() {
  return { ...job, errors: job.errors.slice(-30), recent: job.recent.slice(-15), importDir: config.importDir };
}

async function walk(dir, base = dir, out = { audio: [], images: new Map() }) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('@')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (AUDIO_EXT.has(ext)) out.audio.push(path.relative(base, full));
      else if (IMAGE_EXT.has(ext)) {
        const key = path.relative(base, dir);
        if (!out.images.has(key)) out.images.set(key, []);
        out.images.get(key).push(e.name);
      }
    }
  }
  return out;
}

export async function scanImportDir() {
  await fsp.mkdir(config.importDir, { recursive: true });
  const { audio, images } = await walk(config.importDir);
  let bytes = 0;
  const folders = new Map();
  for (const rel of audio) {
    try {
      bytes += (await fsp.stat(path.join(config.importDir, rel))).size;
    } catch {
      // vanished
    }
    const top = rel.split(path.sep).length > 1 ? rel.split(path.sep)[0] : '(بدون فولدر)';
    folders.set(top, (folders.get(top) || 0) + 1);
  }
  let withCover = 0;
  for (const list of images.values()) if (pickFolderCover(list)) withCover += 1;
  return {
    importDir: config.importDir,
    files: audio.length,
    bytes,
    foldersWithCover: withCover,
    topFolders: [...folders.entries()].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files).slice(0, 50),
  };
}

export async function startImport(opts) {
  if (job.running) {
    const err = new Error('فيه استيراد شغال بالفعل');
    err.statusCode = 409;
    throw err;
  }
  const { audio, images } = await walk(config.importDir);
  Object.assign(job, {
    running: true,
    stopRequested: false,
    total: audio.length,
    done: 0,
    imported: 0,
    duplicates: 0,
    failed: 0,
    current: null,
    errors: [],
    recent: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });
  void runImport(audio, images, opts);
  return importStatus();
}

export function stopImport() {
  if (job.running) job.stopRequested = true;
  return importStatus();
}

async function runImport(files, images, opts) {
  const coverCache = new Map(); // folder → saved cover name (or null)
  for (const rel of files) {
    if (job.stopRequested) break;
    job.current = rel;
    const full = path.join(config.importDir, rel);
    try {
      const hash = await hashFile(full);
      const dup = await one('SELECT id, title FROM tracks WHERE source_hash = $1 LIMIT 1', [hash]);
      if (dup) {
        job.duplicates += 1;
        if (opts.moveFiles) await fsp.rm(full, { force: true });
      } else {
        const ext = path.extname(rel).toLowerCase();
        const originalName = randomName(ext);
        const dest = path.join(dirs.originals, originalName);
        if (opts.moveFiles) {
          await fsp.rename(full, dest).catch(async () => {
            await fsp.copyFile(full, dest);
            await fsp.rm(full, { force: true });
          });
        } else {
          await fsp.copyFile(full, dest);
        }
        const folder = path.dirname(rel) === '.' ? '' : path.dirname(rel);
        if (!coverCache.has(folder)) {
          const pick = pickFolderCover(images.get(folder) || []);
          let saved = null;
          if (pick) saved = await importImage(path.join(config.importDir, folder, pick)).catch(() => null);
          coverCache.set(folder, saved);
        }
        const r = await importStoredFile({
          originalName,
          hash,
          relPath: rel.split(path.sep).join('/'),
          folderCover: coverCache.get(folder),
          opts,
        });
        if (r.status === 'duplicate') job.duplicates += 1;
        else {
          job.imported += 1;
          job.recent.push({ file: rel, ...r });
          if (job.recent.length > 50) job.recent.shift();
        }
      }
    } catch (err) {
      job.failed += 1;
      job.errors.push({ file: rel, error: String(err.message).slice(0, 200) });
      if (job.errors.length > 200) job.errors.shift();
    }
    job.done += 1;
  }
  job.running = false;
  job.current = null;
  job.finishedAt = new Date().toISOString();
  if (opts.moveFiles) await removeEmptyDirs(config.importDir).catch(() => {});
}

async function removeEmptyDirs(dir, root = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) if (e.isDirectory()) await removeEmptyDirs(path.join(dir, e.name), root);
  if (dir !== root) {
    const left = (await fsp.readdir(dir)).filter((n) => !IMAGE_EXT.has(path.extname(n).toLowerCase()) && !n.startsWith('.'));
    if (!left.length) await fsp.rm(dir, { recursive: true, force: true });
  }
}

