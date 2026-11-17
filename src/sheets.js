'use strict';
// Sends each new lead (and later status changes) to a Google Apps Script web app
// that writes rows into a Google Sheet. See google-apps-script/Code.gs.
const config = require('./config');

async function post(body, attempt = 1) {
  if (!config.sheetsWebhookUrl) return;
  try {
    const res = await fetch(config.sheetsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: config.sheetsWebhookToken, ...body }),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt < 3) return setTimeout(() => post(body, attempt + 1), attempt * 5000);
    console.error('[sheets] gửi thất bại:', err.message);
  }
}

const sendLead = (lead) => post({ action: 'create', lead });
const sendStatus = (id, status, staffNote) => post({ action: 'update', id, status, staffNote });

module.exports = { sendLead, sendStatus };
