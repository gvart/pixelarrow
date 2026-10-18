// I5a: the levelled-spear first frame ("guard", 128 x 112) of a spear class, made without hand-measuring: the upright
// spear of the rotation is found (groups.mjs findSpear), its fist is the skin on the line, the old spear is erased
// along its line (wider at the head), and spear.mjs draws the levelled spear from the fist in the class's own
// spear colours (sampled from the old shaft and head).
// Usage: node scripts/art/pixellab/i5a/guard.mjs <rotation.png> <out.png> --facing south-west [--pad 128,112,52,30]
//          [--vec dx,dy] [--ahead 38] [--behind 20] [--grip x,y] [--count 1]
//   --count 2   two javelins held together: every thin line through the fist is erased, two are drawn 2 px apart
// Prints the grip and the spear.mjs call.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { findSpear } from '../groups.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAD = { 'south-east': [16, 30], 'north-east': [8, 30], 'south-west': [52, 30], 'north-west': [40, 30] };

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [src, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const facing = opt('facing');
const img = readImage(src);
const { w, h, data } = img;
const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
const lum = (p) => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];
const isSkin = (p) => p && p[3] > 127 && (p[0] > 150 || (p[0] > 120 && p[0] - p[2] > 50));
const hex = (p) => [...p.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');

const count = Number(opt('count', 1));
const lines = [];
{
  // find the spear(s): after the first is erased, look again for a second parallel line
  const work = { w, h, data: new Uint8Array(data) };
  for (let k = 0; k < count; k++) {
    const sp = findSpear(work, { candidate: () => true, headDir: [0, -1], minLen: 30 });
    if (!sp) break;
    lines.push(sp);
    erase(work, sp, 1.6, 2.8, null);
  }
}
if (!lines.length) throw new Error('no spear found');
const sp = lines[0];
const { head, butt, len } = sp;
const P = (t) => [butt[0] + (head[0] - butt[0]) * t, butt[1] + (head[1] - butt[1]) * t];

// the fist: skin pixels within 3 px of the line, in the middle of it
let grip = opt('grip') ? opt('grip').split(',').map(Number) : null;
if (!grip) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isSkin(at(x, y))) continue;
    const vx = head[0] - butt[0], vy = head[1] - butt[1];
    const t = ((x - butt[0]) * vx + (y - butt[1]) * vy) / (vx * vx + vy * vy);
    if (t < 0.2 || t > 0.8) continue;
    const [px, py] = P(t);
    if (Math.hypot(x - px, y - py) > 3) continue;
    sx += x; sy += y; n++;
  }
  if (!n) throw new Error('no fist on the spear');
  grip = [Math.round(sx / n), Math.round(sy / n)];
}

// colours: the shaft (median of the line's non-outline pixels in the lower half), the head (its end), the outline
const shaftCols = [], headCols = [];
for (let t = 0.05; t <= 1; t += 1 / len) {
  const [x, y] = P(t).map(Math.round);
  const p = at(x, y);
  // the cloak behind the shaft (crimson, purple) is not the shaft
  if (!p || p[3] < 128 || lum(p) < 22 || isSkin(p) || p[0] > p[1] * 1.6 || p[2] > p[1] * 1.15) continue;
  if (t > 1 - 8 / len) headCols.push([...p.slice(0, 3)]);
  else if (Math.hypot(x - grip[0], y - grip[1]) > 4) shaftCols.push([...p.slice(0, 3)]);
}
const byL = (a) => [...a].sort((p, q) => lum(p) - lum(q));
const mid = (a) => byL(a)[Math.floor(a.length / 2)];
const shaft = mid(shaftCols), dark = byL(shaftCols)[0];
const hd = byL(headCols.length ? headCols : shaftCols);
const headL = hd[hd.length - 1], headD = hd[Math.floor(hd.length / 2)];
let outline = [18, 12, 10];
{
  let best = 999;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 127) { const p = data.subarray(i * 4, i * 4 + 3); const L = lum(p); if (L < best) { best = L; outline = [...p]; } }
}

// erase the old spear(s): 1.6 px either side of the shaft, 2.8 at the head; the fist box is kept
const keep = [grip[0] - 3, grip[1] - 2, grip[0] + 3, grip[1] + 2];
const clean = { w, h, data: new Uint8Array(data) };
for (const l of lines) erase(clean, l, 1.6, 2.8, keep);
// pixels of the old spear left as a speck by the erase (under 4 px, 8-connected) go too
dropSpecks(clean);

const tmp = mkdtempSync(join(tmpdir(), 'i5a-guard-'));
const cleanPath = join(tmp, 'clean.png');
writeImage(cleanPath, clean);
const [pdx, pdy] = PAD[facing];
const pad = opt('pad', `128,112,${pdx},${pdy}`);
const colors = [shaft, dark, shaft, outline, headL, headD].map(hex).join(',');
const call = (g, k, p) => ['--facing', facing, '--grip', g.join(','), '--keep', k.join(','), '--pad', p, '--colors', colors,
  '--ahead', opt('ahead', '38'), '--behind', opt('behind', '20'), ...(opt('vec') ? ['--vec', opt('vec')] : [])];
const spearJs = join(HERE, '..', 'spear.mjs');
if (count === 2) {
  // the second javelin first, 2 px further from the camera, then the first over it, both from the one fist
  const [W, H, ox, oy] = pad.split(',').map(Number);
  const g2 = [grip[0] + (facing.endsWith('west') ? 2 : -2), grip[1] - 1];
  const mid = join(tmp, 'second.png');
  execFileSync('node', [spearJs, cleanPath, mid, ...call(g2, keep, pad)], { stdio: 'inherit' });
  execFileSync('node', [spearJs, mid, out, ...call([grip[0] + ox, grip[1] + oy], keep.map((v, j) => v + (j % 2 ? oy : ox)), `${W},${H},0,0`)], { stdio: 'inherit' });
} else execFileSync('node', [spearJs, cleanPath, out, ...call(grip, keep, pad)], { stdio: 'inherit' });
console.log(JSON.stringify({ facing, grip, head: head.map(Math.round), butt: butt.map(Math.round), lines: lines.length, colors, pad }));

function erase(im, l, lw, hw, keepBox) {
  const vx = l.head[0] - l.butt[0], vy = l.head[1] - l.butt[1], L2 = vx * vx + vy * vy, L = Math.sqrt(L2);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (keepBox && x >= keepBox[0] && x <= keepBox[2] && y >= keepBox[1] && y <= keepBox[3]) continue;
    const t = ((x - l.butt[0]) * vx + (y - l.butt[1]) * vy) / L2;
    if (t < -2 / L || t > 1 + 2 / L) continue;
    const d = Math.abs((x - l.butt[0]) * vy - (y - l.butt[1]) * vx) / L;
    if (d <= (t > 1 - 9 / L ? hw : lw)) im.data[(y * im.w + x) * 4 + 3] = 0;
  }
}
function dropSpecks(im) {
  const seen = new Int32Array(im.w * im.h).fill(-1);
  for (let i = 0; i < im.w * im.h; i++) {
    if (im.data[i * 4 + 3] < 128 || seen[i] >= 0) continue;
    const st = [i], comp = [];
    seen[i] = i;
    while (st.length) {
      const j = st.pop(); comp.push(j);
      const x = j % im.w, y = (j / im.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= im.w || Y >= im.h) continue;
        const k = Y * im.w + X; if (im.data[k * 4 + 3] >= 128 && seen[k] < 0) { seen[k] = i; st.push(k); }
      }
    }
    if (comp.length < 12) for (const j of comp) im.data[j * 4 + 3] = 0;
  }
}
