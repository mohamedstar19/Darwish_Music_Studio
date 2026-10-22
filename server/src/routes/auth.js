import { config } from '../config.js';
import { one } from '../db.js';
import {
  checkPassword,
  checkPasswordOrDummy,
  clearAuthCookie,
  loginFailed,
  loginLocked,
  loginSucceeded,
  hashPassword,
  isAdminPath,
  publicUser,
  requireUser,
  setAuthCookie,
  validatePassword,
} from '../auth.js';
import { cleanText, httpError } from '../util.js';
import {
  beginSetup, confirmSetup, disableTwoFactor, recoveryLeft, regenerateRecovery, twoFactorOn, verifySecondStep,
} from '../twofactor.js';

const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
const registerLimit = { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } };

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw httpError(400, 'البريد الإلكتروني غير صحيح');
  return e;
}

export default async function authRoutes(app) {
  app.post('/api/auth/register', registerLimit, async (request, reply) => {
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
    const e = String(email || '').trim().toLowerCase().slice(0, 200);
    const locked = loginLocked(e);
    if (locked) throw httpError(429, `محاولات غلط كتير على الحساب ده. جرب بعد ${locked} دقيقة.`);
    const user = await one('SELECT * FROM users WHERE email = $1', [e]);
    if (!(await checkPasswordOrDummy(String(password || '').slice(0, 200), user?.password_hash))) {
      loginFailed(e);
      throw httpError(401, 'البريد أو كلمة المرور غلط');
    }
    loginSucceeded(e);
    if (user.is_disabled) throw httpError(403, 'الحساب ده موقوف');
    // 2-step accounts: the password alone only earns a 5-minute ticket for the code step.
    if (twoFactorOn(user)) {
      return { needCode: true, ticket: app.jwt.sign({ tfa: user.id }, { expiresIn: '5m' }) };
    }
    await one('UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING id', [user.id]);
    await setAuthCookie(reply, user);
    return { user: publicUser(user) };
  });

  // Second step of signing in: the 6-digit code from the app, or a recovery code.
  app.post('/api/auth/login/code', authLimit, async (request, reply) => {
    let ticket;
    try {
      ticket = app.jwt.verify(String(request.body?.ticket || ''));
    } catch {
      throw httpError(401, 'الوقت خلص. سجّل دخول تاني.');
    }
    if (!ticket?.tfa) throw httpError(401, 'سجّل دخول تاني');
    const key = `tfa:${ticket.tfa}`;
    const locked = loginLocked(key);
    if (locked) throw httpError(429, `أكواد غلط كتير. جرب بعد ${locked} دقيقة.`);
    const user = await one('SELECT * FROM users WHERE id = $1', [Number(ticket.tfa)]);
    if (!user || user.is_disabled) throw httpError(401, 'سجّل دخول تاني');
    const how = await verifySecondStep(user.id, String(request.body?.code || '').slice(0, 40));
    if (!how) {
      loginFailed(key);
      throw httpError(401, 'الكود غلط أو استخدمته قبل كده. استنى الكود الجاي في التطبيق.');
    }
    loginSucceeded(key);
    loginSucceeded(user.email);
    await one('UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING id', [user.id]);
    await setAuthCookie(reply, user);
    return { user: publicUser(user), recoveryLeft: how === 'recovery' ? await recoveryLeft(user.id) : undefined };
  });

  // ---- 2-step sign-in settings (any signed-in user; required for staff) ----
  const tfaLimit = { onRequest: requireUser, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } };

  app.get('/api/auth/2fa', { onRequest: requireUser }, async (request) => ({
    enabled: twoFactorOn(request.currentUser),
    recoveryLeft: twoFactorOn(request.currentUser) ? await recoveryLeft(request.currentUser.id) : 0,
    required: config.requireStaff2fa && ['editor', 'admin'].includes(request.currentUser.role),
  }));

  app.post('/api/auth/2fa/setup', tfaLimit, async (request) => {
    if (twoFactorOn(request.currentUser)) throw httpError(400, 'التحقق بخطوتين شغال بالفعل');
    return beginSetup(request.currentUser);
  });

  app.post('/api/auth/2fa/confirm', tfaLimit, async (request) => {
    if (twoFactorOn(request.currentUser)) throw httpError(400, 'التحقق بخطوتين شغال بالفعل');
    const codes = await confirmSetup(request.currentUser.id, request.body?.code);
    const user = await one('SELECT * FROM users WHERE id = $1', [request.currentUser.id]);
    return { recoveryCodes: codes, user: publicUser(user) };
  });

  // Turning it off or making new recovery codes needs the password and a current code.
  async function checkBoth(request) {
    const u = request.currentUser;
    if (!(await checkPassword(String(request.body?.password || ''), u.password_hash))) throw httpError(400, 'كلمة المرور غلط');
    if (!(await verifySecondStep(u.id, String(request.body?.code || '')))) throw httpError(400, 'الكود غلط');
  }

  app.post('/api/auth/2fa/disable', tfaLimit, async (request) => {
    await checkBoth(request);
    await disableTwoFactor(request.currentUser.id);
    const user = await one('SELECT * FROM users WHERE id = $1', [request.currentUser.id]);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/2fa/recovery', tfaLimit, async (request) => {
    await checkBoth(request);
    return { recoveryCodes: await regenerateRecovery(request.currentUser.id) };
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

  // Delete my account (required by Google Play). Favorites, playlists and requests go with it;
  // listening history stays only as anonymous totals.
  app.delete('/api/auth/me', { onRequest: requireUser, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const u = request.currentUser;
    if (!(await checkPassword(String(request.body?.password || ''), u.password_hash))) {
      throw httpError(400, 'كلمة المرور غلط');
    }
    if (u.role === 'admin') {
      const others = await one("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND id <> $1 AND NOT is_disabled", [u.id]);
      if (!others.n) throw httpError(400, 'ده آخر حساب مدير. خلي حد تاني مدير الأول قبل ما تمسحه.');
    }
    await one('DELETE FROM users WHERE id = $1 RETURNING id', [u.id]);
    clearAuthCookie(reply);
    return { ok: true };
  });

  app.patch('/api/auth/me', { onRequest: requireUser, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request, reply) => {
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
    // Other devices are signed out by the password change; keep this one signed in.
    if (newPassword) await setAuthCookie(reply, updated);
    return { user: publicUser(updated) };
  });
}
