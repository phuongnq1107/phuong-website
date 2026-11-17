'use strict';
const QRCode = require('qrcode');
const config = require('./config');

const NAVY = '#1B2050';
const RED = '#D2121A';

const shopUrl = (code) => `${config.publicUrl}/q/${code}`;

const qrPng = (code, width = 1024) =>
  QRCode.toBuffer(shopUrl(code), { errorCorrectionLevel: 'Q', margin: 2, width, color: { dark: NAVY, light: '#FFFFFF' } });

const qrSvg = (code) =>
  QRCode.toString(shopUrl(code), { type: 'svg', errorCorrectionLevel: 'Q', margin: 0, color: { dark: NAVY, light: '#FFFFFF00' } });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Printable counter card (A6 portrait ratio, 105 x 148 mm) as a standalone SVG.
async function posterSvg(shop) {
  const inner = (await qrSvg(shop.code)).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const vb = (await qrSvg(shop.code)).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const size = 270;
  const scale = size / vb[2];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 592" width="420" height="592" font-family="'Be Vietnam Pro','Noto Sans',Arial,sans-serif">
  <rect width="420" height="592" rx="22" fill="#FFFFFF"/>
  <rect x="0" y="0" width="420" height="132" rx="22" fill="${RED}"/>
  <rect x="0" y="100" width="420" height="32" fill="${RED}"/>
  <text x="32" y="58" fill="#FFFFFF" font-size="28" font-weight="700">EFJ - Kết nối cộng đồng</text>
  <text x="32" y="94" fill="#FFFFFF" font-size="16">Quét mã để nhận ưu đãi nhà ở, nội thất, việc làm</text>
  <g transform="translate(${(420 - size) / 2} 160) scale(${scale})">${inner}</g>
  <text x="210" y="470" text-anchor="middle" fill="${NAVY}" font-size="40" font-weight="800" letter-spacing="4">${esc(shop.code)}</text>
  <text x="210" y="502" text-anchor="middle" fill="${NAVY}" font-size="16">${esc(shop.name)}</text>
  <line x1="32" y1="528" x2="388" y2="528" stroke="#DADDE8"/>
  <text x="210" y="560" text-anchor="middle" fill="#5A5F7E" font-size="14">Giảm từ 20% phí môi giới nhà, từ 3% nội thất</text>
</svg>`;
}

module.exports = { shopUrl, qrPng, qrSvg, posterSvg };
