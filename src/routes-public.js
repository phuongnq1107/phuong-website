'use strict';
const express = require('express');
const crypto = require('crypto');
const { pool } = require('./db');
const { publish } = require('./realtime');
const sheets = require('./sheets');
const { parseCookies, rateLimit } = require('./auth');
const config = require('./config');

const router = express.Router();
const CODE_RE = /^[A-Z]{2}\d{2,3}$/;
const CLICK_TARGETS = new Set(['buy', 'rent', 'furn', 'job']);
const SERVICES = new Set(['buy', 'sell', 'rent', 'job']);

async function activeShop(code) {
  code = String(code || '').toUpperCase();
  if (!CODE_RE.test(code)) return null;
  const [rows] = await pool.query('SELECT code, name, pref FROM shops WHERE code = ? AND active = 1', [code]);
  return rows[0] || null;
}

// one anonymous visitor id per browser, used to count unique scans
function visitorId(req, res) {
  let v = parseCookies(req.headers.cookie).efj_v;
  if (!/^[a-f0-9]{16}$/.test(v || '')) {
    v = crypto.randomBytes(8).toString('hex');
    res.append('Set-Cookie', `efj_v=${v}; Path=/; Max-Age=31536000; SameSite=Lax${config.isProd ? '; Secure' : ''}`);
  }
  return v;
}

// ---------- QR entry point: partner.efj-group.com/q/TK01 ----------
router.get('/q/:code', async (req, res, next) => {
  try {
    const shop = await activeShop(req.params.code);
    if (!shop) return res.redirect(302, '/');
    const v = visitorId(req, res);
    const [r] = await pool.query('INSERT INTO events (shop_code, type, visitor) VALUES (?, "scan", ?)', [shop.code, v]);
    publish('scan', shop.code, { id: r.insertId, at: Date.now() });
    res.set('Cache-Control', 'no-store');
    res.redirect(302, `/?s=${shop.code}`);
  } catch (e) { next(e); }
});

router.get('/api/public/shop/:code', async (req, res, next) => {
  try {
    const shop = await activeShop(req.params.code);
    if (!shop) return res.status(404).json({ error: 'Không tìm thấy quán' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(shop);
  } catch (e) { next(e); }
});

const clickLimit = rateLimit({ windowMs: 60_000, max: 60, message: 'Quá nhiều thao tác' });
router.post('/api/public/click', clickLimit, async (req, res, next) => {
  try {
    const target = String(req.body.target || '');
    if (!CLICK_TARGETS.has(target)) return res.status(400).json({ error: 'target không hợp lệ' });
    const shop = await activeShop(req.body.shop);
    const code = shop ? shop.code : null;
    const v = visitorId(req, res);
    const [r] = await pool.query('INSERT INTO events (shop_code, type, target, visitor) VALUES (?, "click", ?, ?)', [code, target, v]);
    publish('click', code, { id: r.insertId, target, at: Date.now() });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- registration form ----------
const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const leadLimit = rateLimit({ windowMs: 10 * 60_000, max: 8, message: 'Bạn đã gửi nhiều đăng ký liên tiếp. Vui lòng thử lại sau ít phút.' });

router.post('/api/public/leads', leadLimit, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot: bots fill this hidden field
    const service = clean(b.service, 12);
    const name = clean(b.name, 120);
    const phone = clean(b.phone, 40);
    const email = clean(b.email, 160);
    const errors = {};
    if (!SERVICES.has(service)) errors.service = 'Vui lòng chọn dịch vụ.';
    if (name.length < 2) errors.name = 'Vui lòng nhập họ và tên.';
    if (!/^[0-9+\-\s()]{9,20}$/.test(phone) || phone.replace(/\D/g, '').length < 9) errors.phone = 'Số điện thoại chưa đúng. Ví dụ: 090-1234-5678.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email chưa đúng định dạng.';
    if (b.consent !== true && b.consent !== 'on') errors.consent = 'Vui lòng đồng ý với chính sách bảo mật để gửi đăng ký.';
    if (Object.keys(errors).length) return res.status(422).json({ errors });

    const details = {};
    for (const k of ['jobNow', 'jobWant', 'jp', 'area', 'when', 'budget']) if (b[k]) details[k] = clean(b[k], 160);
    const shop = await activeShop(b.shop);
    const lead = {
      shop_code: shop ? shop.code : null,
      service, name, phone, email,
      address: clean(b.address, 255),
      details: JSON.stringify(details),
      note: clean(b.note, 1000),
    };
    const [r] = await pool.query('INSERT INTO leads SET ?', [lead]);
    const createdAt = new Date().toISOString();
    publish('lead', lead.shop_code, { id: r.insertId, service, status: 'new', at: Date.now() });
    sheets.sendLead({ id: r.insertId, createdAt, ...lead, shop_name: shop ? shop.name : 'Truy cập trực tiếp', details, status: 'new' });
    res.status(201).json({ ok: true, id: r.insertId, shop: lead.shop_code });
  } catch (e) { next(e); }
});

module.exports = router;
