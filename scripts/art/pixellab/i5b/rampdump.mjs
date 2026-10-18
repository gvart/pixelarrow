// I5b: which raw colours of a sprite fall in which PA-WORLD-DARK ramp and step, with counts and row range, and an
// ASCII map of one ramp (to tell e.g. leather from skin when both land in the skin ramp).
// Usage: node scripts/art/pixellab/i5b/rampdump.mjs <sprite.png> [--ramps a,b,c] [--map skin]
import { readImage } from '../../lib/png.mjs';
import { rampMapper } from '../groups.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const img = readImage(args[0]);
const ramps = opt('ramps', 'outline,crimson,umber,darkBronze,skin,metal,plaidGreen,purpleBlack,linen,bronze,enemySlate').split(',');
const map = rampMapper(ramps);
const cols = new Map();
const show = opt('map');
const rows = [];
for (let y = 0; y < img.h; y++) {
  let line = '';
  for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (img.data[i + 3] < 128) { line += ' '; continue; }
    const rgb = [img.data[i], img.data[i + 1], img.data[i + 2]];
    const m = map(...rgb);
    const k = rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
    const c = cols.get(k) ?? { m, n: 0, y0: y, y1: y };
    c.n++; c.y1 = y;
    cols.set(k, c);
    line += m.ramp === show ? String(m.step) : '.';
  }
  rows.push(line);
}
for (const [k, c] of [...cols].sort((a, b) => a[1].m.ramp.localeCompare(b[1].m.ramp) || a[1].m.step - b[1].m.step)) console.log(`#${k} ${c.m.ramp}[${c.m.step}] n=${c.n} rows ${c.y0}-${c.y1}`);
if (show) console.log(rows.join('\n'));
