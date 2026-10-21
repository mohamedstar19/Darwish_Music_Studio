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
};
