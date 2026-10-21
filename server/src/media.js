import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseFile } from 'music-metadata';
import { config } from './config.js';
import { many, one, query } from './db.js';

export const dirs = {
  originals: path.join(config.mediaDir, 'originals'),
  audio: path.join(config.mediaDir, 'audio'),
  covers: path.join(config.mediaDir, 'covers'),
  tmp: path.join(config.mediaDir, 'tmp'),
};

export async function ensureMediaDirs() {
  for (const dir of Object.values(dirs)) await fsp.mkdir(dir, { recursive: true });
}

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma', '.webm', '.mp4']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function randomName(ext) {
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

/** Stream an uploaded multipart file to disk. Returns the stored file name. */
export async function saveUpload(part, kind) {
  const ext = path.extname(part.filename || '').toLowerCase();
  const allowed = kind === 'audio' ? AUDIO_EXT : IMAGE_EXT;
  if (!allowed.has(ext)) {
    part.file.resume();
    const err = new Error(kind === 'audio' ? 'نوع ملف الصوت غير مدعوم' : 'نوع الصورة غير مدعوم');
    err.statusCode = 400;
    throw err;
  }
  const name = randomName(ext);
  const target = path.join(kind === 'audio' ? dirs.originals : dirs.tmp, name);
  await pipeline(part.file, fs.createWriteStream(target));
  if (part.file.truncated) {
    await fsp.rm(target, { force: true });
    const err = new Error('الملف أكبر من الحد المسموح');
    err.statusCode = 413;
    throw err;
  }
  if (kind === 'image') return finalizeCover(target);
  return name;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))));
  });
}

/** Resize any uploaded/embedded image to an 800px JPEG in covers/. Returns the file name. */
async function finalizeCover(sourcePath) {
  const name = randomName('.jpg');
  const target = path.join(dirs.covers, name);
  try {
    await runFfmpeg(['-i', sourcePath, '-vf', "scale='min(800,iw)':-2", '-q:v', '3', '-frames:v', '1', target]);
    await fsp.rm(sourcePath, { force: true });
    return name;
  } catch {
    // ffmpeg could not read it; keep the original image as-is.
    const fallback = randomName(path.extname(sourcePath));
    await fsp.rename(sourcePath, path.join(dirs.covers, fallback));
    return fallback;
  }
}

export async function removeMedia(kind, name) {
  if (!name) return;
  await fsp.rm(path.join(dirs[kind], path.basename(name)), { force: true });
}

/** Read tags from an uploaded file to prefill title/artist/year. */
export async function readTags(originalName) {
  try {
    const meta = await parseFile(path.join(dirs.originals, originalName), { duration: false, skipCovers: true });
    const c = meta.common;
    return {
      title: c.title || null,
      artist: c.artist || c.albumartist || null,
      album: c.album || null,
      year: c.year || null,
    };
  } catch {
    return {};
  }
}

// ---- Background processing queue (one job at a time) ----

const queue = [];
let running = false;

export function enqueueTrack(trackId) {
  if (!queue.includes(trackId)) queue.push(trackId);
  void drain();
}

export function queueLength() {
  return queue.length + (running ? 1 : 0);
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      await processTrack(id).catch(() => {});
    }
  } finally {
    running = false;
  }
}

/**
 * Convert the original upload to a loudness-normalized MP3 so every song plays
 * at the same volume, read its duration and pull an embedded cover if there is one.
 */
async function processTrack(id) {
  const track = await one(
    `SELECT t.id, t.original_path, t.audio_path, t.cover_path, a.photo_path AS artist_photo, w.cover_path AS work_cover
     FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id LEFT JOIN works w ON w.id = t.work_id
     WHERE t.id = $1`,
    [id],
  );
  if (!track || !track.original_path) return;
  await query("UPDATE tracks SET processing_status = 'processing', processing_error = NULL WHERE id = $1", [id]);

  const source = path.join(dirs.originals, track.original_path);
  const outName = randomName('.mp3');
  const out = path.join(dirs.audio, outName);
  try {
    await runFfmpeg([
      '-i', source,
      '-map', '0:a:0',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '44100',
      '-ac', '2',
      '-c:a', 'libmp3lame',
      '-b:a', config.audioBitrate,
      '-map_metadata', '-1',
      out,
    ]);
    const meta = await parseFile(out, { duration: true, skipCovers: true });
    const duration = meta.format.duration || null;
    const size = (await fsp.stat(out)).size;

    let coverName = track.cover_path;
    // Use the picture inside the file only when the artist (or show) has no picture of its own,
    // so every song of an artist shows the artist photo by default.
    if (!coverName && !track.artist_photo && !track.work_cover) {
      const tmpCover = path.join(dirs.tmp, randomName('.jpg'));
      try {
        await runFfmpeg(['-i', source, '-an', '-map', '0:v:0', '-frames:v', '1', tmpCover]);
        coverName = await finalizeCover(tmpCover);
      } catch {
        await fsp.rm(tmpCover, { force: true });
      }
    }

    await query(
      `UPDATE tracks SET processing_status = 'ready', audio_path = $2, duration_sec = $3,
              file_size = $4, cover_path = $5, updated_at = now()
       WHERE id = $1`,
      [id, outName, duration, size, coverName],
    );
    if (track.audio_path && track.audio_path !== outName) await removeMedia('audio', track.audio_path);
  } catch (err) {
    await fsp.rm(out, { force: true });
    await query("UPDATE tracks SET processing_status = 'failed', processing_error = $2 WHERE id = $1", [
      id,
      String(err.message).slice(0, 1000),
    ]);
  }
}

/** Requeue anything left unfinished when the server last stopped. */
export async function resumePendingJobs() {
  const rows = await many("SELECT id FROM tracks WHERE processing_status IN ('pending', 'processing') ORDER BY id");
  for (const r of rows) enqueueTrack(r.id);
}
