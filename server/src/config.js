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
  cookieSecure: env.COOKIE_SECURE === 'true',
  mediaDir: path.resolve(env.MEDIA_DIR || './data/media'),
  webDir: path.resolve(env.WEB_DIR || '../web/dist'),
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 300),
  audioBitrate: env.AUDIO_BITRATE || '192k',
  ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
};
