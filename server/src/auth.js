import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one } from './db.js';
import { httpError } from './util.js';

export const COOKIE_NAME = 'dms_token';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function hashPassword(password) {
  return bcrypt.hash(password, 11);
}

export function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Compared against when the email doesn't exist, so both cases take the same time
// (otherwise response time would tell an attacker which emails are registered).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);
export function checkPasswordOrDummy(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH).then((ok) => ok && !!hash);
}

/*
 * Per-account lock after repeated wrong passwords. The per-IP limit alone isn't enough:
 * an attacker with many addresses could keep guessing one account.
 */
const failures = new Map(); // email -> { n, first, lockedUntil }
const MAX_FAILS = 8;
const FAIL_WINDOW = 15 * 60 * 1000;

export function loginLocked(email) {
  const f = failures.get(email);
  return !!f && f.lockedUntil > Date.now() ? Math.ceil((f.lockedUntil - Date.now()) / 60000) : 0;
}

export function loginFailed(email) {
  const now = Date.now();
  let f = failures.get(email);
  if (!f || now - f.first > FAIL_WINDOW) f = { n: 0, first: now, lockedUntil: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) f.lockedUntil = now + FAIL_WINDOW;
  failures.set(email, f);
  if (failures.size > 10000) {
    for (const [k, v] of failures) if (now - v.first > FAIL_WINDOW && v.lockedUntil < now) failures.delete(k);
  }
}

export function loginSucceeded(email) {
  failures.delete(email);
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw httpError(400, 'كلمة المرور لازم تكون 8 حروف على الأقل');
  }
  if (password.length > 200) throw httpError(400, 'كلمة المرور طويلة جدًا');
}

export async function setAuthCookie(reply, user) {
  const token = await reply.jwtSign({ sub: String(user.id) }, { expiresIn: '30d' });
  const secure = config.cookieSecure === 'auto' ? reply.request.protocol === 'https' : config.cookieSecure;
  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: THIRTY_DAYS,
  });
}

export function clearAuthCookie(reply) {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    historyEnabled: u.history_enabled,
    createdAt: u.created_at,
    twoFactor: !!u.totp_enabled_at,
    // Only staff learn where the admin panel lives.
    ...(['editor', 'admin'].includes(u.role) ? { adminPath: config.adminPath } : {}),
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest();
}

/** Constant-time check of a guessed admin path. */
export function isAdminPath(value) {
  return crypto.timingSafeEqual(digest(value), digest(config.adminPath));
}

/** onRequest hook for /api/admin/*: unknown unless the secret path is sent along. */
export async function requireAdminGate(request) {
  if (!isAdminPath(request.headers['x-admin-gate'])) throw httpError(404, 'غير موجود');
}

/** onRequest hook: sets request.currentUser to the signed-in user or null. */
export async function attachUser(request) {
  request.currentUser = null;
  if (!request.cookies?.[COOKIE_NAME]) return;
  try {
    const payload = await request.jwtVerify();
    if (!/^\d+$/.test(String(payload.sub || ''))) return;
    const user = await one('SELECT * FROM users WHERE id = $1', [Number(payload.sub)]);
    if (!user || user.is_disabled) return;
    // Signed in before the password was changed: no longer valid.
    if (user.password_changed_at && (payload.iat || 0) < Math.floor(new Date(user.password_changed_at).getTime() / 1000)) return;
    request.currentUser = user;
  } catch {
    // Invalid or expired token: treat as signed out.
  }
}

export async function requireUser(request) {
  if (!request.currentUser) throw httpError(401, 'لازم تسجل الدخول الأول');
}

function requireTwoFactor(user) {
  if (config.requireStaff2fa && !user.totp_enabled_at) {
    throw Object.assign(httpError(403, 'لازم تفعّل التحقق بخطوتين الأول عشان تستخدم لوحة الإدارة'), { needTwoFactor: true });
  }
}

export async function requireEditor(request) {
  await requireUser(request);
  if (!['editor', 'admin'].includes(request.currentUser.role)) throw httpError(403, 'غير مسموح');
  requireTwoFactor(request.currentUser);
}

export async function requireAdmin(request) {
  await requireUser(request);
  if (request.currentUser.role !== 'admin') throw httpError(403, 'غير مسموح');
  requireTwoFactor(request.currentUser);
}

export function isStaff(user) {
  return !!user && ['editor', 'admin'].includes(user.role);
}

/** Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no admin exists yet. */
export async function ensureAdmin(log) {
  const existing = await one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing) return;
  if (!config.adminEmail || !config.adminPassword) {
    log.warn('No admin user exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create one.');
    return;
  }
  const email = config.adminEmail.trim().toLowerCase();
  const hash = await hashPassword(config.adminPassword);
  await one(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, 'Admin', 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, hash],
  );
  log.info(`Created admin user ${email}`);
}
