'use strict';
const express = require('express');
const { pool } = require('./db');
const { publish, subscribe } = require('./realtime');
const sheets = require('./sheets');
const qr = require('./qr');
const config = require('./config');
const {
  accessCodeFor, normalizeCode, safeEqual, setSession, clearSession, readSession,
  requireAuth, requireAdmin, rateLimit,
} = require('./auth');

const router = express.Router();
const STATUSES = ['new', 'working', 'signed', 'done', 'cancel'];
const SERVICES = ['buy', 'sell', 'rent', 'job'];
const TARGETS = ['buy', 'rent', 'furn', 'job'];
const JST = 'INTERVAL 9 HOUR';

// ---------- login ----------
const loginLimit = rateLimit({ windowMs: 15 * 60_000, max: 12, message: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });

router.post('/api/auth/login', loginLimit, async (req, res, next) => {
  try {
    const { code, password } = req.body || {};
    if (password !== undefined) {
      if (config.adminPassword && safeEqual(password, config.adminPassword)) {
        setSession(res, { role: 'admin' }, 12);
        return res.json({ role: 'admin' });
      }
      return res.status(401).json({ error: 'Mật khẩu quản trị không đúng.' });
    }
    const input = normalizeCode(code);
    if (input.length !== 8) return res.status(401).json({ error: 'Mã truy cập gồm 8 ký tự, ví dụ ABCD-EFGH.' });
    const [shops] = await pool.query('SELECT code, name, code_version FROM shops WHERE active = 1');
    const hit = shops.find((s) => safeEqual(normalizeCode(accessCodeFor(s.code, s.code_version)), input));
    if (!hit) return res.status(401).json({ error: 'Mã truy cập không đúng. Vui lòng kiểm tra lại với EFJ.' });
    setSession(res, { role: 'shop', shop: hit.code, v: hit.code_version }, 24 * 30);
    res.json({ role: 'shop', shop: hit.code, name: hit.name });
  } catch (e) { next(e); }
});

router.post('/api/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

// shop sessions become invalid as soon as the admin resets that shop's code
async function checkShopSession(req, res, next) {
  if (req.session.role !== 'shop') return next();
  const [rows] = await pool.query('SELECT code_version, active FROM shops WHERE code = ?', [req.session.shop]);
  if (!rows[0] || !rows[0].active || rows[0].code_version !== req.session.v) {
    clearSession(res);
    return res.status(401).json({ error: 'Mã truy cập đã được đổi. Vui lòng đăng nhập bằng mã mới.' });
  }
  next();
}
const auth = [requireAuth, (req, res, next) => checkShopSession(req, res, next).catch(next)];

router.get('/api/auth/me', auth, async (req, res, next) => {
  try {
    const s = req.session;
    if (s.role === 'admin') return res.json({ role: 'admin' });
    const [rows] = await pool.query('SELECT code, name, pref FROM shops WHERE code = ?', [s.shop]);
    res.json({ role: 'shop', shop: rows[0] });
  } catch (e) { next(e); }
});

// ---------- overview ----------
function sinceDate(days) {
  const d = Number(days);
  if (!d || d < 1) return new Date(0);
  const t = new Date(Date.now() + 9 * 3600e3); // start of day in Japan
  t.setUTCHours(0, 0, 0, 0);
  return new Date(t.getTime() - (d - 1) * 86400e3 - 9 * 3600e3);
}

function scope(req) {
  return req.session.role === 'shop' ? { sql: ' AND shop_code = ?', args: [req.session.shop] } : { sql: '', args: [] };
}

router.get('/api/dash/overview', auth, async (req, res, next) => {
  try {
    const since = sinceDate(req.query.days ?? 30);
    const sc = scope(req);
    const [ev] = await pool.query(
      `SELECT shop_code, type, target, COUNT(*) n, COUNT(DISTINCT visitor) u FROM events
       WHERE created_at >= ?${sc.sql} GROUP BY shop_code, type, target`, [since, ...sc.args]);
    const [ld] = await pool.query(
      `SELECT shop_code, service, status, COUNT(*) n FROM leads
       WHERE created_at >= ?${sc.sql} GROUP BY shop_code, service, status`, [since, ...sc.args]);
    const [dailyEv] = await pool.query(
      `SELECT DATE_FORMAT(created_at + ${JST}, '%Y-%m-%d') d, COUNT(*) n FROM events
       WHERE type = 'scan' AND created_at >= ?${sc.sql} GROUP BY d`, [since, ...sc.args]);
    const [dailyLd] = await pool.query(
      `SELECT DATE_FORMAT(created_at + ${JST}, '%Y-%m-%d') d, COUNT(*) n FROM leads
       WHERE created_at >= ?${sc.sql} GROUP BY d`, [since, ...sc.args]);
    const shopSql = req.session.role === 'shop' ? 'SELECT code, name, pref, staff, active FROM shops WHERE code = ?' : 'SELECT code, name, pref, staff, active FROM shops ORDER BY code';
    const [shops] = await pool.query(shopSql, sc.args);

    const blank = () => ({
      scans: 0, uniqueScans: 0,
      clicks: Object.fromEntries(TARGETS.map((t) => [t, 0])),
      leads: 0,
      byService: Object.fromEntries(SERVICES.map((s) => [s, 0])),
      byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])),
    });
    const totals = blank();
    const per = new Map(shops.map((s) => [s.code, { ...s, ...blank() }]));
    const direct = { code: null, name: 'Truy cập trực tiếp', pref: '', ...blank() };
    const rowFor = (code) => (code ? per.get(code) : direct);

    for (const e of ev) {
      const r = rowFor(e.shop_code);
      for (const t of [r, totals]) {
        if (!t) continue;
        if (e.type === 'scan') { t.scans += e.n; t.uniqueScans += e.u; }
        if (e.type === 'click' && t.clicks[e.target] !== undefined) t.clicks[e.target] += e.n;
      }
    }
    for (const l of ld) {
      const r = rowFor(l.shop_code);
      for (const t of [r, totals]) {
        if (!t) continue;
        t.leads += l.n;
        if (t.byService[l.service] !== undefined) t.byService[l.service] += l.n;
        if (t.byStatus[l.status] !== undefined) t.byStatus[l.status] += l.n;
      }
    }

    // fill every day in the range so the chart has no gaps
    const daily = [];
    const evMap = Object.fromEntries(dailyEv.map((r) => [r.d, r.n]));
    const ldMap = Object.fromEntries(dailyLd.map((r) => [r.d, r.n]));
    const firstDay = Number(req.query.days) > 0 ? since : new Date(Math.min(Date.now() - 29 * 86400e3, ...[...dailyEv, ...dailyLd].map((r) => Date.parse(r.d))));
    const start = new Date(firstDay.getTime() + 9 * 3600e3);
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    for (let t = new Date(start.toISOString().slice(0, 10)); t.toISOString().slice(0, 10) <= today; t = new Date(t.getTime() + 86400e3)) {
      const d = t.toISOString().slice(0, 10);
      daily.push({ d, scans: evMap[d] || 0, leads: ldMap[d] || 0 });
      if (daily.length > 400) break;
    }

    const rows = [...per.values()];
    if (req.session.role === 'admin') rows.push(direct);
    res.json({ role: req.session.role, since, totals, daily, shops: rows, activeShops: shops.filter((s) => s.active).length });
  } catch (e) { next(e); }
});

// ---------- leads ----------
// shop owners see the customer's progress but not their contact details
function maskName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1) + '***';
  return parts.slice(0, -1).map((p) => p.slice(0, 1) + '.').join(' ') + ' ' + parts[parts.length - 1];
}

router.get('/api/dash/leads', auth, async (req, res, next) => {
  try {
    const where = ['created_at >= ?'];
    const args = [sinceDate(req.query.days ?? 0)];
    if (req.session.role === 'shop') { where.push('shop_code = ?'); args.push(req.session.shop); }
    else if (req.query.shop === 'DIRECT') where.push('shop_code IS NULL');
    else if (req.query.shop) { where.push('shop_code = ?'); args.push(String(req.query.shop)); }
    if (STATUSES.includes(req.query.status)) { where.push('status = ?'); args.push(req.query.status); }
    if (SERVICES.includes(req.query.service)) { where.push('service = ?'); args.push(req.query.service); }
    if (req.query.q && req.session.role === 'admin') {
      const q = `%${String(req.query.q).slice(0, 60)}%`;
      where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR note LIKE ?)');
      args.push(q, q, q, q);
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const w = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM leads WHERE ${w}`, args);
    const [rows] = await pool.query(
      `SELECT l.*, s.name shop_name FROM leads l LEFT JOIN shops s ON s.code = l.shop_code
       WHERE ${w.replace(/\b(created_at|shop_code|status|service|name|phone|email|note)\b/g, 'l.$1')}
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
    const isAdmin = req.session.role === 'admin';
    const items = rows.map((r) => {
      const details = typeof r.details === 'string' ? JSON.parse(r.details || '{}') : (r.details || {});
      const base = { id: r.id, shop: r.shop_code, shopName: r.shop_name || 'Truy cập trực tiếp', service: r.service, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
      if (!isAdmin) return { ...base, name: maskName(r.name) };
      return { ...base, name: r.name, phone: r.phone, email: r.email, address: r.address, details, note: r.note, staffNote: r.staff_note };
    });
    res.json({ total, items });
  } catch (e) { next(e); }
});

router.patch('/api/dash/leads/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const sets = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
      sets.status = req.body.status;
    }
    if (req.body.staffNote !== undefined) sets.staff_note = String(req.body.staffNote).slice(0, 2000);
    if (!Object.keys(sets).length) return res.status(400).json({ error: 'Không có thay đổi' });
    const [r] = await pool.query('UPDATE leads SET ? WHERE id = ?', [sets, id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Không tìm thấy đăng ký' });
    const [[lead]] = await pool.query('SELECT id, shop_code, status, staff_note FROM leads WHERE id = ?', [id]);
    publish('lead-update', lead.shop_code, { id, status: lead.status, at: Date.now() });
    sheets.sendStatus(id, lead.status, lead.staff_note);
    res.json({ ok: true, status: lead.status });
  } catch (e) { next(e); }
});

// ---------- shops (admin) ----------
router.get('/api/dash/shops/:code', auth, async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    if (req.session.role === 'shop' && req.session.shop !== code) return res.status(403).json({ error: 'Không có quyền' });
    const [[s]] = await pool.query('SELECT * FROM shops WHERE code = ?', [code]);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy quán' });
    const out = { code: s.code, name: s.name, pref: s.pref, address: s.address, contact: s.contact, phone: s.phone, staff: s.staff, active: !!s.active, url: qr.shopUrl(s.code) };
    if (req.session.role === 'admin') out.accessCode = accessCodeFor(s.code, s.code_version);
    res.json(out);
  } catch (e) { next(e); }
});

router.patch('/api/dash/shops/:code', requireAdmin, async (req, res, next) => {
  try {
    const sets = {};
    for (const k of ['name', 'address', 'contact', 'phone', 'staff']) if (req.body[k] !== undefined) sets[k] = String(req.body[k]).trim().slice(0, k === 'address' ? 255 : 160);
    if (req.body.active !== undefined) sets.active = req.body.active ? 1 : 0;
    if (sets.name === '') return res.status(400).json({ error: 'Tên quán không được để trống' });
    if (!Object.keys(sets).length) return res.status(400).json({ error: 'Không có thay đổi' });
    const [r] = await pool.query('UPDATE shops SET ? WHERE code = ?', [sets, String(req.params.code).toUpperCase()]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Không tìm thấy quán' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/api/dash/shops/:code/reset-code', requireAdmin, async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const [r] = await pool.query('UPDATE shops SET code_version = code_version + 1 WHERE code = ?', [code]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Không tìm thấy quán' });
    const [[s]] = await pool.query('SELECT code_version FROM shops WHERE code = ?', [code]);
    res.json({ accessCode: accessCodeFor(code, s.code_version) });
  } catch (e) { next(e); }
});

// ---------- QR images (admin, or the shop's own) ----------
router.get('/api/dash/qr/:file', auth, async (req, res, next) => {
  try {
    const m = String(req.params.file).toUpperCase().match(/^([A-Z]{2}\d{2,3})\.(PNG|SVG)$/);
    if (!m) return res.status(404).end();
    const [code, ext] = [m[1], m[2]];
    if (req.session.role === 'shop' && req.session.shop !== code) return res.status(403).end();
    const [[s]] = await pool.query('SELECT code, name FROM shops WHERE code = ?', [code]);
    if (!s) return res.status(404).end();
    res.set('Content-Disposition', `attachment; filename="EFJ-QR-${code}.${ext.toLowerCase()}"`);
    if (ext === 'PNG') return res.type('png').send(await qr.qrPng(code));
    res.type('image/svg+xml').send(await qr.posterSvg(s));
  } catch (e) { next(e); }
});

// ---------- CSV exports (admin) ----------
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const sendCsv = (res, name, header, rows) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send('﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
};

router.get('/api/dash/export/leads.csv', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT l.*, s.name shop_name FROM leads l LEFT JOIN shops s ON s.code = l.shop_code ORDER BY l.id');
    sendCsv(res, 'efj-dang-ky.csv',
      ['ID', 'Thời gian (UTC)', 'Mã quán', 'Tên quán', 'Dịch vụ', 'Họ tên', 'Điện thoại', 'Email', 'Địa chỉ', 'Chi tiết', 'Ghi chú', 'Trạng thái', 'Ghi chú nội bộ'],
      rows.map((r) => [r.id, new Date(r.created_at).toISOString(), r.shop_code || 'DIRECT', r.shop_name || 'Truy cập trực tiếp', r.service, r.name, r.phone, r.email, r.address,
        typeof r.details === 'string' ? r.details : JSON.stringify(r.details || {}), r.note, r.status, r.staff_note]));
  } catch (e) { next(e); }
});

router.get('/api/dash/export/access-codes.csv', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shops ORDER BY code');
    sendCsv(res, 'efj-ma-truy-cap-quan.csv', ['Mã quán', 'Tên quán', 'Tỉnh', 'Link QR', 'Mã truy cập dashboard'],
      rows.map((s) => [s.code, s.name, s.pref, qr.shopUrl(s.code), accessCodeFor(s.code, s.code_version)]));
  } catch (e) { next(e); }
});

// ---------- realtime stream ----------
router.get('/api/dash/stream', auth, (req, res) => subscribe(req, res, req.session));

module.exports = router;
module.exports.readSession = readSession;
