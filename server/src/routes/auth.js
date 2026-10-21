import { config } from '../config.js';
import { one } from '../db.js';
import {
  checkPassword,
  clearAuthCookie,
  hashPassword,
  isAdminPath,
  publicUser,
  requireUser,
  setAuthCookie,
  validatePassword,
} from '../auth.js';
import { cleanText, httpError } from '../util.js';

const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw httpError(400, 'البريد الإلكتروني غير صحيح');
  return e;
}

export default async function authRoutes(app) {
  app.post('/api/auth/register', authLimit, async (request, reply) => {
    if (!config.allowRegistration) throw httpError(403, 'التسجيل مقفول حاليًا');
    const { email, password, displayName } = request.body || {};
    const e = normalizeEmail(email);
    validatePassword(password);
    const name = cleanText(displayName, 60) || e.split('@')[0];
    const exists = await one('SELECT id FROM users WHERE email = $1', [e]);
    if (exists) throw httpError(409, 'البريد ده مسجل قبل كده');
    const user = await one(
      'INSERT INTO users (email, password_hash, display_name, last_login_at) VALUES ($1, $2, $3, now()) RETURNING *',
      [e, await hashPassword(password), name],
    );
    await setAuthCookie(reply, user);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/login', authLimit, async (request, reply) => {
    const { email, password } = request.body || {};
    const user = await one('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]);
    if (!user || !(await checkPassword(String(password || ''), user.password_hash))) {
      throw httpError(401, 'البريد أو كلمة المرور غلط');
    }
    if (user.is_disabled) throw httpError(403, 'الحساب ده موقوف');
    await one('UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING id', [user.id]);
    await setAuthCookie(reply, user);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  // Lets the web app tell "this is the secret admin URL" apart from a random 404,
  // so a signed-out admin can be sent to the login page. Rate limited against guessing.
  app.post('/api/admin-gate', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => ({
    ok: isAdminPath(request.body?.path),
  }));

  app.get('/api/auth/me', async (request) => ({
    user: publicUser(request.currentUser),
    allowRegistration: config.allowRegistration,
  }));

  app.patch('/api/auth/me', { onRequest: requireUser }, async (request) => {
    const u = request.currentUser;
    const { displayName, historyEnabled, currentPassword, newPassword } = request.body || {};
    let passwordHash = u.password_hash;
    if (newPassword) {
      if (!(await checkPassword(String(currentPassword || ''), u.password_hash))) {
        throw httpError(400, 'كلمة المرور الحالية غلط');
      }
      validatePassword(newPassword);
      passwordHash = await hashPassword(newPassword);
    }
    const updated = await one(
      `UPDATE users SET display_name = $2, history_enabled = $3, password_hash = $4 WHERE id = $1 RETURNING *`,
      [
        u.id,
        cleanText(displayName, 60) || u.display_name,
        typeof historyEnabled === 'boolean' ? historyEnabled : u.history_enabled,
        passwordHash,
      ],
    );
    return { user: publicUser(updated) };
  });
}
