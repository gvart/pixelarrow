// The bandit mob, no generations: the militia's shipped sheet (peasant levy, felt cap, no armour, one spear) with its
// crimson cloak swapped for a ragged, mud-dark olive-brown one, so a bandit never reads as a player's soldier.
// Writes src/assets/sheets/mob_bandit/{mob_bandit.png, manifest.json}. Usage: node scripts/art/pixellab/mobs/bandit.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { hexToRgb } from '../../lib/ops.mjs';

const SHEETS = new URL('../../../../src/assets/sheets/', import.meta.url).pathname;
const CLOAK = ['#16130d', '#231e14', '#322a1c', '#423725', '#53452e', '#655538'];
const m = JSON.parse(readFileSync(`${SHEETS}militia/manifest.json`, 'utf8'));
const img = readImage(`${SHEETS}militia/${m.image}`);
const swap = new Map(m.colorGroups.cloak.map((h, i) => [h, hexToRgb(CLOAK[i])]));
const d = img.data;
for (let i = 0; i < d.length; i += 4) {
  if (!d[i + 3]) continue;
  const h = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  const t = swap.get(h);
  if (t) d.set(t, i);
}
const out = `${SHEETS}mob_bandit/`;
mkdirSync(out, { recursive: true });
writeImage(`${out}mob_bandit.png`, img);
m.class = 'mob_bandit';
m.image = 'mob_bandit.png';
m.colorGroups.cloak = CLOAK;
m.tiers = { basic: {} };
writeFileSync(`${out}manifest.json`, JSON.stringify(m, null, 1) + '\n');
console.log(`${out}: militia with a ragged olive-brown cloak`);
