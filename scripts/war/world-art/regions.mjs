// Builds public/war/world/regions.json from the warped grid and checks it against docs/WAR.md adjacency.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LW, LH, SCALE, readWarRegions } from './layout.mjs';
import { buildRaster, borderStats, trace, distanceField } from './raster.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const OUT = join(ROOT, 'public/war/world');
const MIN_BORDER = 12; // logical px of shared edge for a real adjacency; less is a corner touch (no crossing)

export function buildRegions() {
  const war = readWarRegions(ROOT);
  if (war.length !== 37) throw new Error(`WAR.md lists ${war.length} regions, expected 37`);
  const ids = war.map((r) => r.id);
  const { lab, index } = buildRaster(ids);
  const stats = borderStats(lab);
  const pair = (a, b) => stats.get(index.get(a) < index.get(b) ? `${index.get(a)},${index.get(b)}` : `${index.get(b)},${index.get(a)}`);

  // adjacency check, both ways
  const errors = [];
  const want = new Set();
  for (const r of war) for (const n of r.adjacent) {
    want.add([r.id, n].sort().join('|'));
    const e = pair(r.id, n);
    if (!e || e.n < MIN_BORDER) errors.push(`missing ${r.id} - ${n} (${e ? e.n : 0} px)`);
  }
  for (const [k, e] of stats) {
    const [a, b] = k.split(',').map(Number);
    if (a <= 0 || b <= 0) continue;
    const key = [ids[a - 1], ids[b - 1]].sort().join('|');
    if (!want.has(key) && e.n >= MIN_BORDER) errors.push(`extra ${key} (${e.n} px)`);
  }
  if (errors.length) throw new Error('adjacency does not match docs/WAR.md:\n  ' + errors.join('\n  '));

  const dist = distanceField(lab);
  const regions = {};
  for (const r of war) {
    const k = index.get(r.id);
    let sx = 0, sy = 0, n = 0, best = -1, bx = 0, by = 0, room = 0;
    const needHalf = (r.name.length * 4.75 + 8) / 2; // logical px for a ~19 px (map) label
    for (let i = 0; i < lab.length; i++) {
      if (lab[i] !== k) continue;
      const x = i % LW, y = (i / LW) | 0;
      sx += x + 0.5; sy += y + 0.5; n++;
      // label anchor: where a one-line name fits best (vertical clearance vs horizontal room for its width)
      const hz = horiz(lab, k, x, y);
      const d = Math.min(dist[i] / 9, hz / needHalf) + 0.001 * dist[i];
      if (d > best) { best = d; bx = x + 0.5; by = y + 0.5; room = hz; }
    }
    const coast = (stats.get(`0,${k}`) || { n: 0 }).n > 0;
    regions[r.id] = {
      name: r.name,
      role: r.role.split(' ')[0],
      polygon: trace(lab, k).map(([x, y]) => [x * SCALE, y * SCALE]),
      centroid: [round(sx / n * SCALE), round(sy / n * SCALE)],
      label: [round(bx * SCALE), round(by * SCALE)],
      labelRoom: round(room * 2 * SCALE), // free width (map px) on the label row; shrink or wrap a longer name
      area: n * SCALE * SCALE,
      coast,
      adjacent: r.adjacent,
      crossings: {},
    };
  }
  for (const r of war) for (const nb of r.adjacent) {
    const e = pair(r.id, nb);
    const mx = e.pts.reduce((s, p) => s + p[0], 0) / e.pts.length, my = e.pts.reduce((s, p) => s + p[1], 0) / e.pts.length;
    let bp = e.pts[0], bd = Infinity;
    for (const p of e.pts) { const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2; if (d < bd) { bd = d; bp = p; } }
    regions[r.id].crossings[nb] = [round(bp[0] * SCALE), round(bp[1] * SCALE)];
  }
  return { war, ids, lab, index, regions };
}

function horiz(lab, k, x, y) {
  let l = 0, r = 0;
  while (x - l > 0 && lab[y * LW + x - l - 1] === k && l < 200) l++;
  while (x + r < LW - 1 && lab[y * LW + x + r + 1] === k && r < 200) r++;
  return Math.min(l, r);
}
const round = (v) => Math.round(v);
