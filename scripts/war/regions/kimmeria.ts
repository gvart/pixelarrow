/**
 * Kimmerian Hills (docs/WAR.md): rolling chalk hills, Skythia's pocket: the Teeth Eastern Slopes (N) and Kurgan Hills
 * (E) in, Eagle Saddle (W) and the Red Canyons (S) on toward Omphalos. Strategic purpose: a fortress (the hill fort)
 * and horses. Depth 2: the Griffin (tier 1) nesting in the fort's broken heart, keeping the vanished Kimmerians' gold;
 * bandits and wild horses on the slopes.
 * Layout (Gemini reference shots/war/regions/proto/kimmeria.png; W-52 set pieces, ./setpieces.ts): one great hill
 * north-west of the crossroads (some 110 units across) carries the ruined fort: three rampart tiers stepping up it (a four-level
 * foot wall to h7, h10, the top at h12-13) and one gate path spiralling round it, a cut ramp through each rampart on a different side, so the top
 * has one way up. Ruined round houses inside, the griffin's nest in the middle. Rounded chalk downs fill the north and
 * south-west corners (a chalk scarp under the north one) and the south-east; two chalk streams wind through the hills
 * either side; a benched chalk quarry is cut into the south-east slope; open grass, a few hawthorns. The marble arm of
 * the Sacred Way runs west-east below the fort, the north-south road crosses it at the claim point.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, pit, profile, relief } from './setpieces.ts';
import { pocketBoss } from './tiers.ts';

const def: RegionDef = {
  id: 'kimmeria',
  style: { dry: 0.3, dryHigh: false, trees: 0.05, bushes: 0.08, meadow: 0.3 },
  build(k: Kit) {
    const N = k.entry('skythia-w'), E = k.entry('skythia-s'), W = k.entry('saddle'), S = k.entry('canyons');
    k.fill(3);
    k.zone('elaia', () => 99);
    // the downs: rounded hills in the north and south-west corners and the south-east (soft slopes), a chalk scarp
    // under the north one
    relief(k, (x, y, s) => 3.2 + 1.1 * fbm(x, y, 28, s)); // the open grass rolls a level or two
    const north = massif(k, { outline: [[-12, -12], [96, -12], [80, 14], [44, 30], [10, 52], [-12, 60]], crown: [6, 4], base: 3, tiers: 2, steps: [2, 1], wobble: 0.3 });
    massif(k, { outline: [[-12, 150], [24, 140], [62, 166], [70, 214], [44, 268], [-12, 268]], crown: [6, 222], base: 3, tiers: 6, step: 1, wobble: 0.3 });
    massif(k, { outline: [[200, 196], [240, 186], [268, 200], [268, 268], [214, 268], [196, 236]], crown: [250, 240], base: 3, tiers: 5, step: 1, wobble: 0.3 });
    // the fort hill: three rampart tiers round the crown
    const F: Pt = [110, 96];
    const fort = massif(k, { outline: [[110, 38], [150, 50], [168, 92], [156, 136], [112, 154], [66, 140], [50, 98], [66, 54]], crown: [[110, 82], [124, 96], [110, 110], [96, 96]], base: 3, tiers: 3, steps: [2, 2, 3], wobble: 0.12 });
    k.spot('fortress', [F[0] + 2, F[1] - 2]);
    // the relief over the fort hill's and the north down's contours (setpieces.ts relief): the fort's foot a four-level
    // earth wall, two-level ramparts between rolling tiers to the h12-13 top; the north down's chalk scarp three levels
    relief(k, (x, y, s) => {
      const t = fort.t(x, y);
      return t < 0 ? NaN : profile([[0, 6.8], [0.9, 7.4], [1, 9.6], [1.9, 10.2], [2, 13], [3, 13]], t) + (t < 2 ? 0.3 * fbm(x, y, 7, s) : 0);
    }, { cliffs: [[4.2, 6.8], [7.4, 9.6], [10.2, 13]] });
    relief(k, (x, y, s) => {
      const t = north.t(x, y);
      return t < 0 ? NaN : profile([[0, 6.6], [1, 7.4], [2, 9]], t) + 0.5 * fbm(x, y, 12, s);
    }, { cliffs: [[4.2, 6.6]] });
    // the chalk streams, white banks; the quarry
    const streams = [
      k.river([[60, -6], [52, 40], [34, 96], [28, 140], [-6, 200]], { half: 1.3, deep: false, bed: 2, bank: 2 }),
      k.river([[262, 70], [214, 104], [196, 160], [214, 214], [226, 262]], { half: 1.3, deep: false, bed: 2, bank: 2 }),
    ];
    // white chalk banks along both streams (a half-unit mask a few units each side of the bed)
    const chalk = new Uint8Array(512 * 512);
    for (const c of streams) for (const p of c) {
      const r = 4.5 + 2 * Math.sin(p.s / 9);
      for (let dy = -r; dy <= r; dy += 0.5) for (let dx = -r; dx <= r; dx += 0.5) {
        const x = Math.round(2 * (p.x + dx)), y = Math.round(2 * (p.y + dy));
        if (dx * dx + dy * dy <= r * r && x >= 0 && y >= 0 && x < 512 && y < 512) chalk[y * 512 + x] = 1;
      }
    }
    k.patchWhere('elaia', 'marble', (x, y) => chalk[Math.max(0, Math.min(511, Math.round(2 * y))) * 512 + Math.max(0, Math.min(511, Math.round(2 * x)))] === 1, ['grass', 'sand', 'dirt']);
    pit(k, [170, 212], { r: 18, ry: 13, rot: 0.4, depth: 4, benches: 2, marble: true, spot: null });
    // roads: the Sacred Way west-east below the fort, the north-south road, the claim point at the crossing; the gate
    // path spirals up from the crossing, a cut ramp through each rampart (east, north, west)
    const hub: Pt = [150, 162];
    k.road([W, [30, 150], [86, 166], hub, [200, 146], [236, 128], E], { w: 1.4, grade: 3 });
    k.road([N, [150, 20], [178, 70], [176, 124], hub, [140, 200], [130, 236], S], { w: 1.3, grade: 3 });
    const ring = (r: number, a0: number, a1: number): Pt[] => {
      const out: Pt[] = [];
      for (let n = 0; n <= 6; n++) { const a = ((a0 + ((a1 - a0) * n) / 6) * Math.PI) / 180; out.push([F[0] + r * Math.cos(a), F[1] + r * Math.sin(a)]); }
      return out;
    };
    k.road([hub, [146, 146], ...ring(48, 50, -40), ...ring(35, -62, -168), ...ring(20, 172, 120), [F[0] + 2, F[1] - 2]], { w: 1, grade: 1.6 });
    k.road([hub, [162, 186], [168, 206]], { w: 1, grade: 2 });
    // the fort: ruined round houses and its broken gate inside the top, the griffin in the nest at its heart
    k.piece('dodona/hut-ruin', [118, 92], { r: 12, n: 6, gap: 6 });
    k.piece('wall-ruin', [96, 104], { r: 5, n: 3, gap: 3 });
    k.piece('watchtower', [98, 96], { r: 4 });
    pocketBoss(k, 'griffin', [118, 98], 5);
    // the slopes: hawthorns, horse pasture, a herders' hamlet; stone from the quarry
    k.forest([66, 196, 7, 5, 0.3], [222, 70, 7, 5, 0], [186, 30, 6, 5, 0]);
    k.village([206, 112], 4);
    k.resource('stone', [170, 212], 3, 8);
    k.resource('food', [60, 220], 3, 12);
    // fauna: bandits on the road below the fort, wild horses on the open slopes
    k.lair('bandit', [92, 170], { as: 'bandits' });
    k.lair('bandit', [196, 50], { as: 'bandits' });
    k.lair('ibex', [30, 214], { as: 'wild horses' });
    k.lair('ibex', [226, 40], { as: 'wild horses' });
    k.lair('ibex', [228, 230], { as: 'wild horses' });
    k.claim(hub, 180);
  },
};
export default def;
