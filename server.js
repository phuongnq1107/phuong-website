'use strict';
// EFJ - Kết nối cộng đồng
// Entry file for Hostinger Node.js web app (set "Entry file" to server.js).
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const config = require('./src/config');
const { migrate } = require('./src/db');

if (config.missing.length) {
  console.error('\n[EFJ] Thiếu biến môi trường bắt buộc:\n  - ' + config.missing.join('\n  - ') + '\nXem .env.example và docs/DEPLOY-HOSTINGER.md\n');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://www.googletagmanager.com'],
      'connect-src': ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'],
      'img-src': ["'self'", 'data:', 'https://*.google-analytics.com', 'https://www.googletagmanager.com'],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '32kb' }));

// HTML pages get the GA4 id injected at serve time (empty id = analytics off)
const htmlCache = new Map();
function sendPage(res, file) {
  let html = htmlCache.get(file);
  if (!html || !config.isProd) {
    html = fs.readFileSync(file, 'utf8');
    const ga = config.gaId && /^G-[A-Z0-9]+$/.test(config.gaId)
      ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${config.gaId}"></script><script src="/js/ga.js" data-ga="${config.gaId}"></script>`
      : '';
    html = html.replace('<!--GA4-->', ga).replace(/%%ECOLIFE_URL%%/g, config.ecolifeUrl);
    htmlCache.set(file, html);
  }
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
}

const pub = path.join(__dirname, 'public');
const dash = path.join(__dirname, 'dashboard');

app.get('/', (req, res) => sendPage(res, path.join(pub, 'index.html')));
app.get('/chinh-sach-bao-mat', (req, res) => sendPage(res, path.join(pub, 'privacy.html')));
app.get(['/dashboard', '/dashboard/'], (req, res) => sendPage(res, path.join(dash, 'index.html')));

app.use(require('./src/routes-public'));
app.use(require('./src/routes-dashboard'));

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/dashboard', express.static(dash, { maxAge: config.isProd ? '1h' : 0, index: false }));
app.use(express.static(pub, { maxAge: config.isProd ? '7d' : 0, index: false, setHeaders: (res, p) => { if (/\.(css|js)$/.test(p)) res.set('Cache-Control', 'public, max-age=3600'); } }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Không tìm thấy' });
  res.status(404);
  sendPage(res, path.join(pub, '404.html'));
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[EFJ] lỗi:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Máy chủ đang bận. Vui lòng thử lại sau ít phút.' });
});

migrate()
  .then(() => app.listen(config.port, () => console.log(`[EFJ] đang chạy tại cổng ${config.port}`)))
  .catch((e) => {
    console.error('[EFJ] không kết nối được cơ sở dữ liệu:', e.message);
    process.exit(1);
  });
