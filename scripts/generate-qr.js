'use strict';
// Generates the QR folder for all 75 partner shops:
//   qr-codes/png/TK01.png          plain QR (1024 px) for designers
//   qr-codes/poster-svg/TK01.svg   ready-to-print counter card
//   qr-codes/in-tat-ca.html        one printable sheet with every card (A4, 4 per page)
//   qr-codes/danh-sach-qr.csv      shop code, name, QR link
// QR images only contain the public link /q/<code>, so they are safe to commit.
// Usage: PUBLIC_URL=https://partner.efj-group.com npm run qr
process.env.ADMIN_PASSWORD ||= 'x'.repeat(10);
process.env.SESSION_SECRET ||= 'x'.repeat(32);
process.env.SHOP_CODE_SECRET ||= 'x'.repeat(32);
const fs = require('fs');
const path = require('path');
const { seedShops } = require('../src/shops-seed');
const qr = require('../src/qr');

(async () => {
  const out = path.join(__dirname, '..', 'qr-codes');
  for (const d of ['png', 'poster-svg']) fs.mkdirSync(path.join(out, d), { recursive: true });
  const shops = seedShops();
  const cards = [];
  for (const s of shops) {
    fs.writeFileSync(path.join(out, 'png', `${s.code}.png`), await qr.qrPng(s.code));
    const svg = await qr.posterSvg(s);
    fs.writeFileSync(path.join(out, 'poster-svg', `${s.code}.svg`), svg);
    cards.push(`<div class="card">${svg}</div>`);
  }
  fs.writeFileSync(path.join(out, 'danh-sach-qr.csv'), '﻿Mã quán,Tên quán,Tỉnh,Link QR\r\n' +
    shops.map((s) => [s.code, s.name, s.pref, qr.shopUrl(s.code)].join(',')).join('\r\n'));
  fs.writeFileSync(path.join(out, 'in-tat-ca.html'), `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>In mã QR 75 quán đối tác EFJ</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;700;800&display=swap">
<style>
  @page { size: A4; margin: 10mm; }
  body { margin: 0; font-family: "Be Vietnam Pro", sans-serif; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .card { break-inside: avoid; border: 0.3mm dashed #b8bfd3; border-radius: 4mm; padding: 2mm; }
  .card svg { width: 100%; height: auto; display: block; }
  .card:nth-child(4n) { break-after: page; }
  .tip { font-size: 12px; color: #555; margin-bottom: 8px; }
  @media print { .tip { display: none; } }
</style></head><body>
<p class="tip">Nhấn Ctrl+P (Cmd+P) để in. Mỗi trang A4 có 4 thẻ, cắt theo đường nét đứt.</p>
<div class="sheet">${cards.join('\n')}</div></body></html>`);
  console.log(`Đã tạo ${shops.length} mã QR trong ${out} (link gốc: ${qr.shopUrl('XX00').replace('/q/XX00', '')})`);
})();
