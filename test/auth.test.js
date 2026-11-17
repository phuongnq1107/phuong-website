'use strict';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.SESSION_SECRET = 'a'.repeat(32);
process.env.SHOP_CODE_SECRET = 'b'.repeat(32);
const test = require('node:test');
const assert = require('node:assert');
const { accessCodeFor, normalizeCode } = require('../src/auth');
const { seedShops } = require('../src/shops-seed');

test('75 shops with unique codes across 4 prefectures', () => {
  const shops = seedShops();
  assert.strictEqual(shops.length, 75);
  assert.strictEqual(new Set(shops.map((s) => s.code)).size, 75);
  assert.deepStrictEqual([...new Set(shops.map((s) => s.pref))], ['Tokyo', 'Kanagawa', 'Saitama', 'Chiba']);
});

test('access codes are stable, unique per shop, and change with version', () => {
  const codes = seedShops().map((s) => accessCodeFor(s.code, 1));
  assert.strictEqual(new Set(codes).size, 75);
  assert.match(codes[0], /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual(accessCodeFor('TK01', 1), accessCodeFor('TK01', 1));
  assert.notStrictEqual(accessCodeFor('TK01', 1), accessCodeFor('TK01', 2));
});

test('login input is normalised', () => {
  assert.strictEqual(normalizeCode(' abcd-efgh '), 'ABCDEFGH');
});
