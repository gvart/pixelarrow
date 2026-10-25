/**
 * Bacchae Hills (docs/WAR.md): vine and cypress hills, Elaia's pocket: the Lakeshore Fens (W) and Westbank Vineyards
 * (S) in, Erymanthos Wood (N) and the Gorge (E) on toward Omphalos. Strategic purpose: a breadbasket (olives, food,
 * herbs) and a small marble quarry. Depth 2: the Maenad Queen (tier 1) and her thiasos, dancing in the cypress grove
 * round the ruined round temple; boars and bandits.
 * Layout (Gemini reference shots/war/regions/proto/bacchae.png; W-52 set pieces, ./setpieces.ts): one great stepped
 * hill fills the north-west half of the map and falls to the south-east in five curving terraces behind retaining walls
 * (a four-level wall off the h2 plain, rolling terraces to the h14-15 crown), vines in rows along every terrace's contour. The crown is the sacred grove,
 * dark cypresses round the ruined round temple. A deep white marble quarry is cut in benches into the hill's east
 * flank; olive rows on its gentle east foot; the ploughed fields fill the plain along the stream that runs down the
 * east edge; the farm village with its well in the south-west. The two roads climb the terraces by cut ramps and cross
 * at the claim point at the hill's foot.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, pit, profile, relief, terraceRows } from './setpieces.ts';
import { pocketBoss } from './tiers.ts';

const def: RegionDef = {
  id: 'bacchae',
  style: { dry: 0.2, trees: 0.05, bushes: 0.08 },
  build(k: Kit) {
    const W = k.entry('elaia-n'), S = k.entry('elaia-e'), N = k.entry('erymanthos'), E = k.entry('gorge');
    k.fill(2);
    k.zone('elaia', () => 99);
    // the hill: its foot sweeps from the north-east edge round to the west edge, the crown in the north-west
    const hill = massif(k, {
      outline: [[-12, -12], [176, -12], [196, 40], [184, 96], [150, 140], [100, 168], [46, 184], [-12, 176]],
      crown: [[20, 18], [58, 14], [64, 40], [40, 56], [16, 48]],
      base: 2, tiers: 5, steps: [3, 2, 2, 2, 3], wobble: 0.22,
    });
    // its relief over the massif's contours (setpieces.ts relief): a four-level wall off the plain, each vine terrace
    // rolling a level behind a 1-2 level retaining wall, a two-level wall under the crown (h14-15)
    relief(k, (x, y, s) => {
      const t = hill.t(x, y);
      if (t < 0) return 2 + 0.5 * fbm(x, y, 24, s);
      return profile([[0, 6], [0.9, 6.8], [1, 8.4], [1.9, 9], [2, 10.4], [2.9, 11], [3, 12.2], [3.9, 12.8], [4, 14.6], [5, 15]], t) + 0.3 * fbm(x, y, 9, s + 1);
    }, { cliffs: [[2.6, 6], [6.8, 8.4], [9, 10.4], [11, 12.2], [12.8, 14.6]] });
    // the quarry cut into the east flank in benches; the stream down the east edge
    pit(k, [150, 64], { r: 20, ry: 15, rot: 0.5, depth: 6, benches: 3, marble: true });
    k.river([[214, -6], [226, 60], [234, 120], [222, 180], [236, 230], [262, 250]], { half: 1.6, deep: false, bed: 1, bank: 2 });
    // roads: both climb the terraces by ramps and cross at the claim point at the foot; the path up to the grove; the quarry road
    const hub: Pt = [150, 176];
    k.road([W, [40, 150], [90, 178], hub, [196, 160], [228, 132], E], { w: 1.3, grade: 2.2 });
    k.road([N, [120, 20], [122, 70], [132, 120], hub, [150, 216], [140, 240], S], { w: 1.3, grade: 2.2 });
    k.road([[122, 70], [100, 56], [78, 46], [52, 40]], { w: 1, grade: 1.6 });
    k.road([[132, 120], [146, 92], [150, 74], [151, 64]], { w: 1.2, grade: 1.4 });
    // vines along the terraces' contours (not on the quarry's rim or the crown), olives on the east foot
    terraceRows(k, hill, { tiers: [1, 2, 3, 4], every: 1.6, margin: 1.4, soil: 'dirt', where: (x, y) => Math.hypot((x - 150) / 26, (y - 64) / 21) > 1 && x + y < 240 });
    k.rows(['elaia/olive-orchard', 'elaia/olive-tall', 'elaia/olive-ancient'], [198, 88, 18, 22, 0.2], { dx: 3, dy: 3 });
    k.spot('olives', [198, 88]);
    // the grove: a ring of cypresses round the temple on the crown; small woods on the field edges
    k.forest([40, 34, 30, 24, 0.3]);
    k.paint('grass', [42, 36, 9, 8, 0], { on: ['forest'] });
    k.forest([246, 20, 10, 12, 0.3], [14, 236, 12, 8, 0], [110, 246, 14, 5, 0]);
    // the fields fill the plain by the stream, herbs and hives by the village
    k.fields([100, 214, 26, 14, 0.5], 0.6);
    k.fields([200, 204, 26, 22, 0.6], 0.6, { plot: 14, wide: 9 });
    k.resource('food', [204, 200], 5, 14);
    k.piece('elaia/herbs', [86, 236], { r: 8, n: 2 });
    k.piece('elaia/beehives', [36, 210], { r: 8, n: 2 });
    // marble in the quarry
    k.resource('marble', [152, 64], 3, 5);
    k.spot('marble', [152, 64]);
    // the ruined round temple on the crown, the village, the olive press
    k.scatterTown(['elaia/town-temple'], [42, 36], { n: 1, r1: 10, gap: 3 });
    k.piece('elaia/shrine', [52, 30], { r: 6 });
    k.village([54, 216], 7);
    k.outskirts([206, 112], 2, 6, 24, ['olive-press', 'farm']);
    // the Maenad Queen in the grove; bandits by the quarry, boars in the vines and woods
    pocketBoss(k, 'maenad_queen', [34, 24], 5);
    k.lair('bandit', [160, 84], { as: 'bandits' });
    k.lair('bandit', [236, 24], { as: 'bandits' });
    k.lair('boar', [80, 120], { as: 'boars' });
    k.lair('boar', [18, 232], { as: 'boars' });
    k.claim(hub, 180);
  },
};
export default def;
