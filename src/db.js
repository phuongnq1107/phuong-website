'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');
const { seedShops } = require('./shops-seed');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 8,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: false,
});
// store and compare all timestamps in UTC; Japan time is applied when grouping by day
pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS shops (
    code VARCHAR(12) PRIMARY KEY,
    pref VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    address VARCHAR(255) NOT NULL DEFAULT '',
    contact VARCHAR(120) NOT NULL DEFAULT '',
    phone VARCHAR(40) NOT NULL DEFAULT '',
    staff VARCHAR(120) NOT NULL DEFAULT '',
    code_version INT NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_code VARCHAR(12) NULL,
    type VARCHAR(12) NOT NULL,
    target VARCHAR(12) NULL,
    visitor CHAR(16) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_shop_type (shop_code, type, created_at),
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shop_code VARCHAR(12) NULL,
    service VARCHAR(12) NOT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    email VARCHAR(160) NOT NULL DEFAULT '',
    address VARCHAR(255) NOT NULL DEFAULT '',
    details JSON NULL,
    note TEXT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'new',
    staff_note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_shop (shop_code, created_at),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function migrate() {
  for (const sql of SCHEMA) await pool.query(sql);
  const rows = seedShops().map((s) => [s.code, s.pref, s.name]);
  await pool.query('INSERT IGNORE INTO shops (code, pref, name) VALUES ?', [rows]);
}

module.exports = { pool, migrate };
