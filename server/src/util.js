export function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

export function toInt(value, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLength);
}

export function slugify(text) {
  return (
    String(text)
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `item-${Date.now()}`
  );
}

/** Escape LIKE wildcards in user search text. */
export function likePattern(q) {
  return `%${String(q).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
