/*
 * Network safety:
 * - clientIp(): the visitor's real address. Behind the Cloudflare tunnel every request
 *   reaches us from the local machine, and Cloudflare puts the visitor in CF-Connecting-IP
 *   (set by Cloudflare itself, so visitors can't fake it). X-Forwarded-For is never used:
 *   anyone can send it, which would let one attacker look like thousands of people.
 * - safeFetch(): fetch for links people type in (radio streams). It refuses addresses
 *   inside the home network (router, n8n, other apps, Tailscale), on every redirect too.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

function v4ToInt(ip) {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const V4_PRIVATE = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // Tailscale / carrier NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12], // Docker networks
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3], // multicast + reserved
].map(([base, bits]) => [v4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

function plain(ip) {
  const s = String(ip || '');
  return s.startsWith('::ffff:') && net.isIPv4(s.slice(7)) ? s.slice(7) : s;
}

export function isPrivateIp(address) {
  const ip = plain(address);
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_PRIVATE.some(([base, mask]) => (n & mask) === (base & mask));
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return low === '::' || low === '::1' || /^f[cd]/.test(low) || /^fe[89ab]/.test(low) || /^ff/.test(low);
  }
  return true;
}

/** Requests from the machine itself or a Docker network (the Cloudflare tunnel, health checks). */
export function isLocalPeer(address) {
  const ip = plain(address);
  if (!net.isIPv4(ip)) return ip === '::1';
  const n = v4ToInt(ip);
  return (n >>> 24) === 127 || (n & 0xfff00000) >>> 0 === v4ToInt('172.16.0.0');
}

/** The visitor's real IP address. */
export function clientIp(request) {
  const peer = plain(request.socket?.remoteAddress || request.raw?.socket?.remoteAddress);
  if (isLocalPeer(peer)) {
    const cf = String(request.headers['cf-connecting-ip'] || '').trim();
    if (net.isIP(cf)) return plain(cf);
  }
  return peer || 'unknown';
}

async function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$|\.lan$|\.home$/i.test(host)) throw new Error('blocked');
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateIp)) throw new Error('blocked');
}

/**
 * fetch() that only talks to public internet addresses. Redirects are followed by hand
 * (up to 5) so each hop is checked as well.
 */
export async function safeFetch(url, options = {}, hops = 5) {
  let current = String(url);
  for (let i = 0; i <= hops; i += 1) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('الرابط لازم يبدأ بـ http:// أو https://');
    try {
      await assertPublicHost(u.hostname);
    } catch {
      throw Object.assign(new Error('الرابط ده بيشاور على عنوان داخلي، ومش مسموح'), { statusCode: 400, blocked: true });
    }
    const res = await fetch(current, { ...options, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      res.body?.cancel().catch(() => {});
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    return res;
  }
  throw new Error('تحويلات كتير');
}
