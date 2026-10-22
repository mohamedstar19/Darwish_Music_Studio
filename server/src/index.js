import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { attachUser, COOKIE_NAME, ensureAdmin } from './auth.js';
import { clientIp, isLocalPeer } from './netguard.js';
import { dirs, ensureMediaDirs, resumePendingJobs } from './media.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import libraryRoutes from './routes/library.js';
import radioRoutes from './routes/radio.js';
import quizRoutes from './routes/quiz.js';
import adminRoutes from './routes/admin.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  // Only the Cloudflare tunnel / local machine may say "this came over https".
  trustProxy: (address) => isLocalPeer(address),
  bodyLimit: 2 * 1024 * 1024,
});

await app.register(cookie);
await app.register(jwt, { secret: config.jwtSecret, cookie: { cookieName: COOKIE_NAME, signed: false } });
await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 2 } });
// Every API call is limited per visitor (real IP, see netguard.js); some routes set tighter limits.
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  keyGenerator: clientIp,
  // Admin calls already need a staff sign-in and the secret path; bulk uploads send many requests.
  allowList: (request) => !request.url.startsWith('/api/') || request.url === '/api/health' || request.url.startsWith('/api/admin/'),
  errorResponseBuilder: (request, ctx) =>
    Object.assign(new Error(`طلبات كتير ورا بعض. استنى ${Math.ceil(ctx.ttl / 1000)} ثانية وجرب تاني.`), { statusCode: 429, expose: true }),
});

// Browser protection headers.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.addHook('onSend', async (request, reply, payload) => {
  reply.header('Content-Security-Policy', CSP);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  reply.header('Cross-Origin-Opener-Policy', 'same-origin');
  if (request.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000');
  return payload;
});

// Accept empty JSON bodies (e.g. POST actions with no payload) as {}.
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
  if (!body || !body.trim()) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch {
    const err = new Error('JSON غير صالح');
    err.statusCode = 400;
    done(err);
  }
});

app.addHook('onRequest', attachUser);

app.setErrorHandler((err, request, reply) => {
  const status = err.statusCode || 500;
  if (status >= 500) request.log.error(err);
  const message = status >= 500 && !err.expose ? 'حصل خطأ في السيرفر' : err.message;
  reply.status(status).send(err.needTwoFactor ? { error: message, needTwoFactor: true } : { error: message });
});

// Lets the Android app open this site full screen (no browser bar).
app.get('/.well-known/assetlinks.json', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=3600');
  return config.androidSha256.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: config.androidPackage,
            sha256_cert_fingerprints: config.androidSha256,
          },
        },
      ]
    : [];
});

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: true, time: new Date().toISOString() };
});

await app.register(authRoutes);
await app.register(catalogRoutes);
await app.register(libraryRoutes);
await app.register(radioRoutes);
await app.register(quizRoutes);
await app.register(adminRoutes);

await ensureMediaDirs();

// reply.sendFile() (with Range support) for the rights-checked audio stream route.
await app.register(fastifyStatic, { root: dirs.audio, serve: false });

// Cover images are public; audio is only served through the rights-checked stream route.
await app.register(fastifyStatic, {
  root: dirs.covers,
  prefix: '/media/covers/',
  decorateReply: false,
  maxAge: '30d',
  immutable: true,
});

// Serve the built web app with SPA fallback.
const hasWeb = fs.existsSync(path.join(config.webDir, 'index.html'));
if (hasWeb) {
  await app.register(fastifyStatic, {
    root: config.webDir,
    prefix: '/',
    wildcard: false,
    decorateReply: false,
    index: ['index.html'],
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/media/')) {
      return reply.status(404).send({ error: 'غير موجود' });
    }
    return reply.type('text/html').sendFile('index.html', config.webDir, { maxAge: 0 });
  });
} else {
  app.log.warn(`Web build not found at ${config.webDir}; serving API only.`);
}

await migrate(app.log);
await ensureAdmin(app.log);

await app.listen({ port: config.port, host: config.host });
await resumePendingJobs();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
