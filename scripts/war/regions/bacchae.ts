/**
 * Bacchae Hills (docs/WAR.md): vine and cypress hills, Elaia's pocket: the Lakeshore Fens (W) and Westbank Vineyards
 * (S) in, Erymanthos Wood (N) and the Gorge (E) on toward Omphalos. Strategic purpose: a breadbasket (olives, food,
 * herbs) and a small marble quarry. Depth 2: the Maenad Queen (tier 1) and her thiasos, dancing in the cypress grove
 * round the ruined round temple; boars and bandits.
 * Layout (Gemini reference shots/war/regions/proto/bacchae.png): one great hill fills the north-west and falls to the
 * south-east in curving terraces behind retaining walls (h14 crown, h11, h8, h5 over the h2 plain: 3-level cliffs drawn as tall crags), vines in rows on them. The crown is the
 * sacred grove, dark cypresses round the ruined round temple. A white marble quarry is cut in steps into the hill's
 * east flank; olive rows and the press on the gentle east slope; flat ploughed fields along the stream that runs down
 * the east edge; the farm village with its well in the south-west. The two roads climb the terraces by ramps and cross
 * at the claim point on the lowest one.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { pocketBoss } from './tiers.ts';

/** The terrace at a unit point: distance from the hill's crown, the steps wandering. */
const tier = (x: number, y: number) => {
  const d = Math.hypot(x - 44, y - 44) + 7 * Math.sin(Math.atan2(y - 44, x - 44) * 5) + 4 * Math.sin(x / 13 + y / 17);
  return d < 34 ? 14 : d < 66 ? 11 : d < 100 ? 8 : d < 140 ? 5 : 2;
};

const def: RegionDef = {
  id: 'bacchae',
  style: { dry: 0.2, trees: 0.15, bushes: 0.3 },
  build(k: Kit) {
    const W = k.entry('elaia-n'), S = k.entry('elaia-e'), N = k.entry('erymanthos'), E = k.entry('gorge');
    k.fill(2);
    k.zone('elaia', () => 99);
    k.lift(tier, true);
    // the quarry stepped into the east flank, the stream down the east edge
    k.quarry([118, 62], 11, 3);
    k.river([[214, -6], [224, 60], [230, 120], [214, 180], [232, 230], [262, 250]], { half: 1.4, deep: false, bed: 1, bank: 2 });
    // roads: both climb the terraces by ramps, crossing at the claim point; the path up to the grove; the quarry road
    const hub: Pt = [146, 158];
    k.road([W, [30, 132], [70, 150], [110, 156], hub, [190, 144], [226, 130], E], { w: 1.3, grade: 2.2, fill: true });
    k.road([N, [130, 30], [134, 80], [140, 120], hub, [136, 200], [130, 236], S], { w: 1.3, grade: 2.2, fill: true });
    k.road([[134, 80], [100, 70], [76, 60], [56, 52]], { w: 1, grade: 1.4, fill: true });
    k.road([[134, 80], [126, 70], [120, 64]], { w: 1, grade: 1.4, fill: true });
    // the vines on the terraces, olives on the east slope, the grove's cypress ring
    k.rows(['elaia/vines'], [70, 110, 30, 12, -0.7], { dx: 2, dy: 3 });
    k.rows(['elaia/vines'], [30, 100, 14, 14, 0], { dx: 2, dy: 3 });
    k.rows(['elaia/vines'], [100, 30, 12, 16, 0.4], { dx: 2, dy: 3 });
    k.rows(['elaia/olive-orchard', 'elaia/olive-tall', 'elaia/olive-ancient'], [186, 86, 22, 18, 0.3], { dx: 3, dy: 3 });
    k.spot('olives', [186, 86]);
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; k.forest([44 + Math.cos(t) * 20, 44 + Math.sin(t) * 18, 6, 4, t]); }
    k.forest([200, 30, 14, 10, 0.3], [30, 236, 16, 10, 0], [236, 70, 6, 14, 0]);
    // the fields by the stream, herbs and hives
    k.fields([110, 214, 18, 12, 0.6], 0.6);
    k.fields([186, 200, 26, 16, 0.6], 0.6);
    k.resource('food', [192, 200], 5, 14);
    k.piece('elaia/herbs', [170, 220], { r: 8, n: 2 });
    k.piece('elaia/beehives', [96, 214], { r: 8, n: 2 });
    // marble in the quarry
    k.resource('marble', [120, 62], 3, 5);
    k.spot('marble', [120, 62]);
    // the ruined round temple on the crown, the village, the olive press
    k.scatterTown(['elaia/town-temple'], [44, 44], { n: 1, r1: 10, gap: 3 });
    k.piece('elaia/shrine', [52, 40], { r: 6 });
    k.village([66, 204], 6);
    k.outskirts([196, 110], 2, 6, 24, ['olive-press', 'farm']);
    // the Maenad Queen in the grove; bandits by the quarry, boars in the vines and woods
    pocketBoss(k, 'maenad_queen', [36, 30], 5);
    k.lair('bandit', [126, 74], { as: 'bandits' });
    k.lair('bandit', [204, 30], { as: 'bandits' });
    k.lair('boar', [70, 110], { as: 'boars' });
    k.lair('boar', [34, 232], { as: 'boars' });
    k.claim(hub, 180);
  },
};
export default def;
