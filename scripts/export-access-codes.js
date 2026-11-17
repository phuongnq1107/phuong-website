'use strict';
// Writes private/ma-truy-cap-quan.csv with every shop's dashboard login code.
// Needs the SAME SHOP_CODE_SECRET as production (put it in .env) and a database connection,
// because codes change when the admin presses "Đổi mã mới".
// The admin dashboard has the same export: "Tải mã truy cập các quán (CSV)".
// The private/ folder is git-ignored: never commit access codes.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { accessCodeFor } = require('../src/auth');
const qr = require('../src/qr');

(async () => {
  const [rows] = await pool.query('SELECT code, name, pref, code_version FROM shops ORDER BY code');
  const dir = path.join(__dirname, '..', 'private');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ma-truy-cap-quan.csv');
  fs.writeFileSync(file, '﻿Mã quán,Tên quán,Tỉnh,Link QR,Mã truy cập dashboard\r\n' +
    rows.map((s) => [s.code, `"${s.name}"`, s.pref, qr.shopUrl(s.code), accessCodeFor(s.code, s.code_version)].join(',')).join('\r\n'));
  console.log(`Đã ghi ${rows.length} mã vào ${file}`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
