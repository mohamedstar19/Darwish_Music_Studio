/*
 * 2-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator,
 * Authy …): standard 6-digit codes that change every 30 seconds (TOTP, RFC 6238).
 *
 * - The secret is stored encrypted (AES-256-GCM, key derived from JWT_SECRET).
 * - A code can be used only once (the last used time step is remembered).
 * - 8 one-time recovery codes for a lost phone, stored hashed.
 */
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from './config.js';
import { one, query } from './db.js';

const ISSUER = 'Darwish Music Studio';
const STEP = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// ---- secret encryption at rest ----
const encKey = () => crypto.createHash('sha256').update(`dms-totp:${config.jwtSecret}`).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(blob) {
  const [iv, tag, data] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normRecovery = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Is this 6-digit code right now? Returns the time step it matched, or null. */
function matchCode(secretB32, code, lastStep) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  const key = base32Decode(secretB32);
  const now = Math.floor(Date.now() / 1000 / STEP);
  // Allow one step either side for a phone clock that is a little off.
  for (const s of [now - 1, now, now + 1]) {
    if (lastStep && s <= Number(lastStep)) continue; // each code works once
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, s)), Buffer.from(c))) return s;
  }
  return null;
}

export function twoFactorOn(user) {
  return !!user?.totp_enabled_at;
}

/** Step 1 of turning it on: a new secret (not active until a code is confirmed). */
export async function beginSetup(user) {
  const secret = base32Encode(crypto.randomBytes(20));
  await query('UPDATE users SET totp_secret = $2, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1', [user.id, encrypt(secret)]);
  const label = encodeURIComponent(`${ISSUER}:${user.email}`);
  const url = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qrSvg: qr };
}

function newRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const s = base32Encode(crypto.randomBytes(7)).toLowerCase().slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Step 2: the first code from the app confirms it works; returns the recovery codes (shown once). */
export async function confirmSetup(userId, code) {
  const u = await one('SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1', [userId]);
  if (!u?.totp_secret) throw Object.assign(new Error('ابدأ التفعيل من الأول'), { statusCode: 400 });
  const step = matchCode(decrypt(u.totp_secret), code, null);
  if (step === null) throw Object.assign(new Error('الكود غلط. اتأكد إن ساعة الموبايل مظبوطة واكتب الكود اللي ظاهر دلوقتي.'), { statusCode: 400 });
  const codes = newRecoveryCodes();
  await query(
    'UPDATE users SET totp_enabled_at = now(), totp_last_step = $2, totp_recovery = $3 WHERE id = $1',
    [userId, step, codes.map((c) => sha(normRecovery(c)))],
  );
  return codes;
}

/**
 * Check a code at sign-in: a 6-digit app code, or one of the recovery codes (used up).
 * Returns 'app' | 'recovery' | null.
 */
export async function verifySecondStep(userId, code) {
  const u = await one('SELECT totp_secret, totp_last_step, totp_recovery FROM users WHERE id = $1 AND totp_enabled_at IS NOT NULL', [userId]);
  if (!u) return null;
  const step = matchCode(decrypt(u.totp_secret), code, u.totp_last_step);
  if (step !== null) {
    // Only one request can claim this step (stops the same code being used twice at once).
    const r = await query('UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)', [userId, step]);
    return r.rowCount ? 'app' : null;
  }
  const h = sha(normRecovery(code));
  if (normRecovery(code).length === 10 && (u.totp_recovery || []).includes(h)) {
    const r = await query('UPDATE users SET totp_recovery = array_remove(totp_recovery, $2) WHERE id = $1 AND $2 = ANY(totp_recovery)', [userId, h]);
    return r.rowCount ? 'recovery' : null;
  }
  return null;
}

export async function recoveryLeft(userId) {
  const u = await one('SELECT coalesce(array_length(totp_recovery, 1), 0)::int AS n FROM users WHERE id = $1', [userId]);
  return u?.n || 0;
}

export async function disableTwoFactor(userId) {
  await query('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL, totp_recovery = NULL WHERE id = $1', [userId]);
}

export async function regenerateRecovery(userId) {
  const codes = newRecoveryCodes();
  await query('UPDATE users SET totp_recovery = $2 WHERE id = $1', [userId, codes.map((c) => sha(normRecovery(c)))]);
  return codes;
}
