/**
 * Teeth Foothills (docs/WAR.md): rocky foothills under the Iron Teeth between Dodona (W) and Kleisoura (E), the Grey
 * Moors (S) off it, Dodona's two other entries along the west edge. Strategic purpose: the Tin Road's ravine
 * chokepoint and a little iron. Depth 1: bears in the woods, the deserters' bandit camp over the narrows.
 * Layout (Gemini reference shots/war/regions/proto/dodona-e.png): one long ravine crosses the map west to east, its
 * floor climbing in three tiers (h2 by Dodona, h4 in the middle, h6 under the Teeth) joined by ramps, a fast stream
 * beside the road falling over the first step. In the middle it pinches to the narrows, 8 tiles between sheer walls.
 * Wooded shoulders stand six levels (12 m) over the floor on both rims, each with one path up from the road: on the north
 * shoulder the old iron diggings in a side hollow, on the south one the palisade camp over the narrows. The snowy
 * Teeth fill the whole north-east; the south shoulder falls in steps to the Moors road, which climbs out of the ravine by a
 * side cleft; oak lowland and a woodcutters' hamlet by Dodona in the south-west.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

/** The ravine's centre line (unit y over x) and half-width: wide by Dodona, the narrows at x 128. */
const cy = (x: number) => 128 + 8 * Math.sin(x / 41) - 4 * Math.sin(x / 17);
const half = (x: number) => 2.1 + Math.min(13, Math.abs(x - 128) * 0.15);
/** Floor tiers along the ravine. */
const floor = (x: number) => (x < 86 ? 2 : x < 176 ? 4 : 6);
/** The shoulders' tiers: the same steps, their edges wandering across the slopes. */
const tier = (x: number, y: number) => floor(x + 9 * Math.sin(y / 13) + 5 * Math.cos(y / 5.3));

const def: RegionDef = {
  id: 'dodona-e',
  style: { meadow: 0.25, trees: 0.45, bushes: 0.1 },
  build(k: Kit) {
    const W = k.entry('dodona'), WN = k.entry('dodona-n'), WS = k.entry('dodona-s'), E = k.entry('kleisoura'), S = k.entry('moors');
    k.fill(3);
    k.zone('mountains', () => 99);
    k.zone('dodona', [40, 200, 70, 70, 0.3], 10);
    // the land: the shoulders six over the floor along the ravine, the south falling in steps to the moors road,
    // the oak lowland by Dodona low (h2)
    k.lift((x, y) => {
      const d = Math.abs(y - cy(x)) - half(x);
      if (d <= 0) return floor(Math.max(0, Math.min(255, x))) as number;
      if (y < cy(x)) return tier(x, y) + (d < 34 + 6 * Math.sin(x / 19) ? 6 : 8); // north shoulder, a tier more under the Teeth
      return d < 30 + 5 * Math.sin(x / 15) ? tier(x, y) + 6 : d < 56 + 6 * Math.cos(x / 23) ? tier(x, y) + 3 : NaN;
    }, true);
    k.basin([30, 214, 50, 46, 0.3], 2, 6, 4);
    // the Teeth: snowy massifs along the north-east edge, spurs down to the north shoulder
    k.mountains([[60, -24], [150, -4], [220, 10], [256, 44], [276, 96]], { width: 42, spurs: [[176, 58, 18, 12, 0.4], [104, 30, 16, 10, 0.3]] });
    k.rockMass([40, 10, 26, 14, 0.2], { rough: 2 });
    k.rockMass([250, 190, 22, 30, 0.2], { rough: 2 });
    // the side cleft south to the moors: a cut from the ravine floor down the shoulders
    k.cut([[158, cy(158) + 8], [150, 176], [134, 212], [128, 262]], { h: 4, half: 5, bank: 3 });
    // the stream down the ravine (shallow), over the first step as a fall
    const R: Pt[] = [[262, cy(256) - 3], [210, cy(210) - 4], [176, cy(176) - 4], [128, cy(128) - 0.8], [86, cy(86) - 5], [40, cy(40) - 6], [-6, cy(0) - 5]];
    k.river(R, { half: 1.1, deep: false, bed: (s) => (s < 86 ? 6 : s < 180 ? 4 : 2), bank: 0.1 });
    k.fall([86, cy(86) - 5], [82, cy(82) - 5]);
    k.spot('falls', [86, cy(86) - 5]);
    // the narrows and the shoulders over it; the camp and the diggings
    k.spot('narrows', [128, cy(128) + 1.2]);
    k.plateau([150, 154, 12, 8, 0.1], 10, { terrain: 'dirt', rough: 1 });
    k.spot('campShoulder', [150, 154]);
    k.basin([128, 74, 12, 8, 0.3], 9, 0, 1.5);
    k.spot('diggings', [128, 74]);
    // roads: the Tin Road up the ravine floor, ramps at the steps; the paths up both shoulders; the moors cleft; the
    // tracks along the west edge to Dodona's other entries
    k.road([W, [20, cy(20) + 2], [60, cy(60) + 3], [96, cy(96) + 3], [116, cy(116) + 1.6], [128, cy(128) + 1.2], [140, cy(140) + 1.6], [170, cy(170) + 3], [210, cy(210) + 3], E], { w: 1, grade: 3, fill: true });
    k.road([[92, cy(92) + 3], [96, cy(96) - 4], [106, cy(106) - 6], [114, cy(114) - 9], [122, 96], [128, 78]], { w: 1, grade: 1.3, fill: true });
    k.road([[136, cy(136) + 1.4], [146, cy(146) + 4], [152, 140], [150, 150]], { w: 1, grade: 1.3, fill: true });
    k.road([[160, cy(160) + 3], [150, 176], [134, 212], S], { w: 1.3, grade: 4 });
    k.road([WN, [16, 50], [26, 86], [30, cy(30) + 2]], { w: 1.1, grade: 3 });
    k.road([WS, [18, 206], [28, 170], [36, cy(36) + 3]], { w: 1.1, grade: 3 });
    // woods: pines on both shoulders, oaks in the lowland
    k.forest([110, 96, 40, 12, 0.1], [180, 100, 30, 10, 0.2], [60, 90, 30, 14, -0.2], [180, 168, 34, 12, 0.1], [90, 176, 26, 12, -0.1], [40, 220, 22, 16, 0.4], [210, 220, 24, 18, 0]);
    // the hamlet by Dodona; the camp; the diggings' iron; stone in the cleft
    k.village([40, 176], 4);
    k.piece('dodona/charcoal-pile', [60, 196], { r: 8, n: 2 });
    k.piece('dodona/timber-stand', [86, 182], { r: 10, n: 2 });
    k.piece('mountains/watch-post', [152, 150], { r: 4 });
    k.piece('wall-ruin', [146, 160], { r: 5, n: 2, gap: 4 });
    k.resource('iron', [128, 72], 3, 6);
    k.resource('stone', [138, 196], 3, 10);
    k.resource('stone', [200, cy(200) + 12], 2, 8);
    k.piece('mountains/rockfall', [176, 64], { r: 10, onRock: true, n: 2 });
    // fauna: the bandit camp over the narrows, bears on the north shoulder by the diggings and in the south woods
    k.lair('bandit', [154, 147], { as: 'bandits' });
    k.lair('bear', [134, 80], { as: 'bears' });
    k.lair('bear', [186, 172], { as: 'bears' });
    k.lair('bear', [64, 92], { as: 'bears' });
    k.claim([70, cy(70) + 2], 160);
  },
};
export default def;
