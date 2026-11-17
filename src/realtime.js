'use strict';
// Server-Sent Events hub. Hostinger closes any request after 120 s and has no
// WebSockets, so each stream ends after 90 s and the browser reconnects on its own.
// The dashboard also falls back to polling if streams are blocked by a proxy.
const clients = new Set();
const STREAM_MS = 90 * 1000;

function subscribe(req, res, session) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  const client = { res, session };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  const end = setTimeout(() => res.end(), STREAM_MS);
  req.on('close', () => {
    clearInterval(ping);
    clearTimeout(end);
    clients.delete(client);
  });
}

// shopCode null = direct visit (admin only)
function publish(type, shopCode, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify({ shop: shopCode, ...data })}\n\n`;
  for (const c of clients) {
    if (c.session.role === 'admin' || (c.session.role === 'shop' && c.session.shop === shopCode)) {
      try { c.res.write(msg); } catch { /* client gone */ }
    }
  }
}

module.exports = { subscribe, publish };
