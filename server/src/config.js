import path from 'node:path';

const env = process.env;

function required(name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(env.PORT || 8080),
  host: env.HOST || '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  // 'auto' (default): secure cookie when the request came over HTTPS (e.g. via Cloudflare),
  // plain cookie on the LAN address over HTTP. 'true'/'false' force it.
  cookieSecure: ['true', 'false'].includes(env.COOKIE_SECURE) ? env.COOKIE_SECURE === 'true' : 'auto',
  mediaDir: path.resolve(env.MEDIA_DIR || './data/media'),
  webDir: path.resolve(env.WEB_DIR || '../web/dist'),
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 300),
  audioBitrate: env.AUDIO_BITRATE || '192k',
  ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
  // Chromaprint's fingerprint tool, used to recognise songs by their sound (AcoustID).
  fpcalcPath: env.FPCALC_PATH || 'fpcalc',
  // How many songs are converted at the same time (each uses one CPU core).
  processConcurrency: Math.max(1, Number(env.PROCESS_CONCURRENCY || 2)),
  // Folder scanned by "import from server folder" (bulk import of many songs).
  importDir: path.resolve(env.IMPORT_DIR || path.join(env.MEDIA_DIR || './data/media', '..', 'import')),
  // Secret URL segment for the admin panel (https://site/<adminPath>). Only staff are told it,
  // and every /api/admin call must carry it too. Falls back to "admin" when unset.
  adminPath: (env.ADMIN_PATH || 'admin').replace(/[^A-Za-z0-9_-]/g, '') || 'admin',
  // Android app (Trusted Web Activity) verification: /.well-known/assetlinks.json.
  // ANDROID_SHA256 = comma-separated SHA-256 fingerprints (upload key + Google Play app signing key).
  androidPackage: env.ANDROID_PACKAGE || 'com.darwishtech.dms',
  androidSha256: (env.ANDROID_SHA256 || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s)),
};
