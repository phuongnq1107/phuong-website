'use strict';
// Reads configuration from environment variables. A local .env file is loaded
// for development; on Hostinger, set the same keys in hPanel → Environment variables.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const isProd = env('NODE_ENV', 'development') === 'production';

const config = {
  isProd,
  port: Number(env('PORT', 3000)),
  publicUrl: env('PUBLIC_URL', 'https://partner.efj-group.com').replace(/\/$/, ''),
  db: {
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', 3306)),
    user: env('DB_USER', 'efj'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME', 'efj_partner'),
  },
  adminPassword: env('ADMIN_PASSWORD', ''),
  sessionSecret: env('SESSION_SECRET', ''),
  shopCodeSecret: env('SHOP_CODE_SECRET', ''),
  sheetsWebhookUrl: env('SHEETS_WEBHOOK_URL', ''),
  sheetsWebhookToken: env('SHEETS_WEBHOOK_TOKEN', ''),
  gaId: env('GA_MEASUREMENT_ID', ''),
  ecolifeUrl: env('ECOLIFE_URL', 'https://ecolife123.com/'),
};

const missing = [];
if (!config.adminPassword || config.adminPassword.length < 10) missing.push('ADMIN_PASSWORD (ít nhất 10 ký tự)');
if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push('SESSION_SECRET (ít nhất 32 ký tự)');
if (!config.shopCodeSecret || config.shopCodeSecret.length < 32) missing.push('SHOP_CODE_SECRET (ít nhất 32 ký tự)');
config.missing = missing;

module.exports = config;
