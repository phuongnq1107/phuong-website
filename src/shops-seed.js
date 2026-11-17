'use strict';
// 75 partner shops used as the starting list. Names and addresses are placeholders:
// edit each shop from the admin dashboard once the real shop details are known.
const PREFS = [
  { prefix: 'TK', name: 'Tokyo', count: 30 },
  { prefix: 'KN', name: 'Kanagawa', count: 20 },
  { prefix: 'SA', name: 'Saitama', count: 13 },
  { prefix: 'CH', name: 'Chiba', count: 12 },
];

function seedShops() {
  const shops = [];
  for (const p of PREFS) {
    for (let i = 1; i <= p.count; i++) {
      const code = p.prefix + String(i).padStart(2, '0');
      shops.push({ code, pref: p.name, name: `Quán đối tác ${p.name} ${String(i).padStart(2, '0')}` });
    }
  }
  return shops;
}

module.exports = { PREFS, seedShops };
