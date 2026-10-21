import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

// Return BIGINT/COUNT values as JS numbers (our counts stay far below 2^53).
pg.types.setTypeParser(20, (v) => Number(v));
// Keep DATE columns as 'YYYY-MM-DD' strings instead of shifting them by time zone.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(log) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await many('SELECT name FROM schema_migrations')).map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await tx(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log.info(`Applied migration ${file}`);
  }
}

/** SQL condition: a track any listener may play right now. Expects the tracks table aliased as t. */
export const PLAYABLE = `(t.is_published
  AND t.processing_status = 'ready'
  AND t.rights_type IN ('original', 'licensed')
  AND (t.license_expires_at IS NULL OR t.license_expires_at >= CURRENT_DATE))`;

/** Standard track columns with artist/work/category names joined in. */
export const TRACK_SELECT = `
  SELECT t.id, t.title, t.year, t.duration_sec, t.cover_path, t.play_count,
         t.artist_id, a.name AS artist_name, a.photo_path AS artist_photo_path,
         t.work_id, w.title AS work_title, w.cover_path AS work_cover_path,
         t.category_id, c.name AS category_name, c.slug AS category_slug
  FROM tracks t
  LEFT JOIN artists a ON a.id = t.artist_id
  LEFT JOIN works w ON w.id = t.work_id
  LEFT JOIN categories c ON c.id = t.category_id`;
