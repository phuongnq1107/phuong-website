'use strict';
const crypto = require('crypto');
const config = require('./config');

// ---------- shop access codes ----------
// Each shop's login code is derived from SHOP_CODE_SECRET + shop code + version,
// so no plain code is stored in the database. "Reset code" bumps the version.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

function accessCodeFor(shopCode, version) {
  const mac = crypto.createHmac('sha256', config.shopCodeSecret).update(`${shopCode}:${version}`).digest();
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- signed session cookie ----------
const COOKIE = 'efj_session';

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  if (!safeEqual(mac, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSession(res, payload, hours) {
  const exp = Date.now() + hours * 3600 * 1000;
  const token = sign({ ...payload, exp });
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${hours * 3600}${config.isProd ? '; Secure' : ''}`,
  ]);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', [`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.isProd ? '; Secure' : ''}`]);
}

function readSession(req) {
  return verify(parseCookies(req.headers.cookie)[COOKIE]);
}

// session.role is 'admin' or 'shop'; session.shop is the shop code for shop users
function requireAuth(req, res, next) {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  req.session = s;
  next();
}

function requireAdmin(req, res, next) {
  const s = readSession(req);
  if (!s || s.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên được thực hiện thao tác này.' });
  req.session = s;
  next();
}

// ---------- simple in-memory rate limiter ----------
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) {
      h = { n: 0, reset: now + windowMs };
      hits.set(key, h);
    }
    h.n++;
    if (h.n > max) return res.status(429).json({ error: message });
    next();
  };
}

module.exports = {
  accessCodeFor, normalizeCode, safeEqual,
  setSession, clearSession, readSession, parseCookies,
  requireAuth, requireAdmin, rateLimit,
};
