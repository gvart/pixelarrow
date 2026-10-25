/**
 * Red Canyons (docs/WAR.md): a dry red-rock canyon maze below the central plateau, the chimera's rock-cut Obsidian Hold
 * on its basalt mesa over the junction (W-48 landmark obsidianHold, ./landmarks.ts). Strategic purpose: the slot canyon
 * chokepoint toward Omphalos, copper.
 * The land is the raid-tuned draft (./drafts.ts template: the four canyons meeting at the junction, the slot toward
 * Omphalos, the blind side canyons, the hold and its ramps, roads, nodes) with the W-52 set pieces of the reference
 * (shots/war/regions/proto/canyons.png) laid round it (./draftCompose.ts keeps what the raid and the purpose use as
 * drafted; ./setpieces.ts relief):
 *   the tableland   red sandstone (h6-7) cut by the canyons' sheer walls five and six levels deep, along half their
 *                   rims stacked over a ledge (h3); the hold's quarter between the north canyon and the slot stays the
 *                   drafted bench (h4);
 *   the hold        its black basalt mesa drawn a tall tier over the bench and the tableland (visual only: the sim keeps
 *                   the drafted levels), its ramps from the junction drawn as steep embankments up to the gates;
 *   the floors      pale gravel washes, talus and boulders at the cliff feet, scrub and dead thorn trees on the top.
 */
import type { Kit, Pt } from './kit.ts';
import { fbm } from './kit.ts';
import { composeOnDraft } from './draftCompose.ts';
import { relief } from './setpieces.ts';

export default composeOnDraft('canyons', { staging: [163, 196] }, (k: Kit) => {
  const { W, H, K } = k, h0 = k.height.slice();
  // the hold's quarter: the high ground (h2+) joined to the hold, between the north canyon and the slot
  const bench = new Uint8Array(W * H), hold: Pt = [80, 73], st = [k.at(hold)];
  bench[st[0]] = 1;
  while (st.length) {
    const i = st.pop()!, x = i % W, y = (i - x) / W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !bench[j] && h0[j] >= 2) { bench[j] = 1; st.push(j); }
  }
  // units from the nearest canyon floor (h1 and under), two-pass chamfer over the cells
  const dist = new Float32Array(W * H).fill(1e9);
  for (let i = 0; i < W * H; i++) if (h0[i] <= 1) dist[i] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
    if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1, x > 0 ? dist[i - W - 1] + 1.414 : 1e9, x < W - 1 ? dist[i - W + 1] + 1.414 : 1e9);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
    if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1, x < W - 1 ? dist[i + W + 1] + 1.414 : 1e9, x > 0 ? dist[i + W - 1] + 1.414 : 1e9);
  }
  // the tableland: raised over the drafted h4 but in the hold's quarter; a ledge along half the rims
  relief(k, (x, y, s) => {
    const i = k.at([x, y]);
    if (i < 0 || h0[i] < 4 || bench[i]) return NaN;
    const d = dist[i] / K;
    if (d < 2.6 + 2 * fbm(x, y, 6, s) && fbm(x, y, 26, s + 1) > -0.05) return 3;
    return 6.4 + 0.7 * fbm(x, y, 22, s + 2) + 0.3 * fbm(x, y, 6, s + 3);
  });
  k.patchWhere('kyrene', 'redrock', (x, y) => { const i = k.at([x, y]); return i >= 0 && k.height[i] >= 3; }, ['sand']);
  // the hold's black basalt mesa (the mountains' dark stone), drawn a tall tier over the bench; its ramps as
  // embankments climbing to the gates (W-51 Site levels, visual only)
  const s = k.sites[0];
  if (s) {
    s.levels = [[3, 3], [4, 32]];
    s.roadLevels = [[1, 1], [2, 11], [3, 21], [4, 32]];
    const ring = (tx: number, ty: number) => tx >= 6 && tx < 114 && ty >= 6 && ty < 86;
    s.liftOnly = (tx, ty) => { if (ring(tx, ty)) return true; const i = k.at(s.u(tx, ty)); return i >= 0 && k.terrain[i] === 'road'; };
    // the ways out of the gates drawn sloping down the mesa's face across the site's margin
    for (let ty = 0; ty < 92; ty++) for (let tx = 0; tx < 120; tx++) {
      const t = Math.max(0, 6 - tx, tx - 113, 6 - ty, ty - 85), i = k.at(s.u(tx, ty));
      if (t > 0 && i >= 0 && k.terrain[i] === 'road' && k.height[i] === 4) s.vz.set(ty * 4096 + tx, 4 - (t / 6) * 1.6);
    }
    if (s.look) s.look = { ...s.look, ground: 'rock' };
    const a = s.u(4, 4), b = s.u(116, 88);
    k.zone('mountains', (_i, x, y) => (x >= a[0] && y >= a[1] && x <= b[0] && y <= b[1] ? 99 : 0));
  }
  // talus and fallen blocks at the cliff feet, copper-stained boulders, scrub and dead thorn trees on the top
  for (const p of [[124, 40], [146, 70], [110, 122], [60, 124], [160, 124], [200, 136], [150, 160], [120, 200], [146, 230], [86, 182], [176, 92]] as Pt[]) k.piece('kyrene/talus-red', p, { r: 7, n: 3, gap: 3 });
  for (const p of [[30, 160], [40, 220], [200, 200], [220, 40], [180, 30], [230, 170], [100, 240], [24, 40]] as Pt[]) k.piece('kyrene/boulder-red', p, { r: 10, n: 2, gap: 4 });
  for (const b of [[40, 170, 16, 12, 0.3], [70, 230, 14, 10, 0], [200, 190, 18, 12, -0.2], [220, 60, 14, 12, 0.2], [180, 40, 12, 8, 0], [30, 30, 10, 8, 0]] as const)
    k.rows(['kyrene/thorn-tree', 'kyrene/camelthorn', 'kyrene/dry-grass', 'kyrene/acacia-old'], [...b], { dx: 6, dy: 5, on: ['redrock', 'sand'] });
}, { bushes: 0.5 });
