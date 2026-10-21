/**
 * Teeth Eastern Slopes (docs/WAR.md): scree and pine falling east from the Iron Teeth, Kleisoura (W) above, Skythia
 * (E) below, the Kimmerian Hills (S) off it, Skythia's two other entries along the east edge. Strategic purpose: the
 * Tin Road's scree chokepoint and Skythia's only timber and pitch. Depth 1: bears in the pines, a robber tribe's camp.
 * Layout (Gemini reference shots/war/regions/proto/skythia-w.png): the slope climbs west in clear tiers, steppe (h3)
 * by Skythia, pine terraces (h5, h7), grey scree (h9) and the snowy Teeth along the west edge, where the Tin Road
 * leaves through one rock gap (h11) under an archer ledge (h13). From the gap the road zigzags down the scree in
 * hairpins, a ramp at every cliff step, past a flat rock spur over the second hairpin; two streams run down the tiers
 * and fall over the steps, the road fording them. The robbers' camp hides in the south pine stand; the side road to
 * Kimmeria leaves the slope's foot south; a woodcutters' hamlet and timber yard on the steppe edge.
 */
import type { Kit, RegionDef } from './kit.ts';
import { tierStream } from './tiers.ts';

/** The tier of the slope at a unit point (west is high). */
const tier = (x: number, y: number) => {
  const w = x + 10 * Math.sin(y / 21) + 5 * Math.cos(y / 7.7);
  return w < 34 ? 11 : w < 58 ? 9 : w < 84 ? 7 : w < 130 ? 5 : 3;
};

const def: RegionDef = {
  id: 'skythia-w',
  style: { dry: 0.3, meadow: 0.3, trees: 0.6, bushes: 0.5 },
  build(k: Kit) {
    const W = k.entry('kleisoura'), E = k.entry('skythia'), EN = k.entry('skythia-n'), ES = k.entry('skythia-s'), S = k.entry('kimmeria');
    k.fill(3);
    k.zone('mountains', [60, 128, 110, 170, 0], 14);
    k.lift(tier, true);
    // the Teeth along the west edge, open only at the gap; snow on the high scree
    k.mountains([[6, -8], [10, 40], [12, 84], [10, 112]], { width: 16, foot: 9, spurs: [[40, 20, 22, 16, 0.4]] });
    k.mountains([[10, 144], [12, 176], [10, 220], [6, 264]], { width: 16, foot: 9, spurs: [[38, 236, 20, 16, -0.4]] });
    k.rockMass([16, 120.5, 24, 4.5, 0.05], { rough: 0.6, foot: 9 });
    k.rockMass([16, 136.5, 24, 4.5, -0.05], { rough: 0.6, foot: 9 });
    k.paint('snow', [20, 128, 30, 150, 0], { on: ['grass', 'dirt'], minH: 11, rough: 6 });
    k.patch('mountains', 'scree', [50, 128, 40, 150, 0], ['grass', 'dirt'], undefined, 8);
    // the archer ledge over the gap, carved out of its north wall; the flat spur over the second hairpin
    k.plateau([30, 116, 7, 2.2, 0.05], 13, { terrain: 'dirt', rough: 0.4 });
    k.spot('ledge', [30, 116]);
    k.plateau([60, 104, 8, 6, 0.3], 9, { terrain: 'dirt', rough: 1 });
    k.spot('spur', [60, 104]);
    // the streams down the tiers (falls at the steps)
    tierStream(k, [[66, -6], [80, 40], [108, 80], [140, 112], [168, 150], [186, 200], [184, 262]], tier, { half: 1.4, name: 'north' });
    tierStream(k, [[30, 166], [62, 170], [100, 178], [140, 190], [176, 196]], tier, { half: 1.2, name: 'south' });
    // the Tin Road: the gap, the hairpins down the scree, the steppe road to Skythia
    k.spot('narrows', [24, 128.5]);
    k.road([W, [12, 128.5], [24, 128.5], [36, 122], [50, 140], [60, 116], [72, 140], [84, 120], [100, 134], [124, 128], [160, 126], [200, 128], [232, 128], E], { w: 1.2, grade: 2.2, fill: true, pass: 11 });
    k.road([[40, 124], [38, 118], [32, 116]], { w: 0.9, grade: 1, fill: true });
    k.road([[58, 116], [60, 110], [60, 106]], { w: 0.9, grade: 1.2, fill: true });
    // side roads: Kimmeria from the slope's foot, Skythia's other entries along the steppe
    k.road([[124, 128], [126, 160], [130, 200], [128, 230], S], { w: 1.2, grade: 3 });
    k.road([[200, 128], [224, 96], [240, 60], EN], { w: 1.1, grade: 3 });
    k.road([[200, 128], [226, 168], [244, 204], ES], { w: 1.1, grade: 3 });
    // pine stands on the terraces, the robbers' stand to the south
    k.forest([96, 92, 26, 14, 0.4], [150, 84, 22, 12, 0.2], [104, 164, 26, 14, -0.3], [76, 196, 22, 12, 0.2], [170, 230, 24, 12, 0.1], [88, 54, 18, 10, 0.5]);
    // the hamlet and timber yard on the steppe edge; the camp; stone on the scree
    k.village([206, 150], 4);
    k.piece('dodona/timber-stand', [150, 96], { r: 10, n: 2 });
    k.piece('dodona/timber-stand', [100, 178], { r: 10, n: 2 });
    k.piece('dodona/charcoal-pile', [182, 160], { r: 6 });
    k.piece('mountains/watch-post', [110, 160], { r: 5 });
    k.resource('stone', [52, 152], 3, 10);
    k.resource('stone', [70, 74], 2, 10);
    k.piece('mountains/rockfall', [40, 60], { r: 12, onRock: true, n: 2 });
    k.piece('mountains/cairn', [44, 128], { r: 6 });
    // fauna: the robbers in the south pines and at the gap, bears in the north pines
    k.lair('bandit', [104, 166], { as: 'bandits' });
    k.lair('bandit', [44, 132], { as: 'bandits' });
    k.lair('bear', [96, 90], { as: 'bears' });
    k.lair('bear', [154, 80], { as: 'bears' });
    k.claim([196, 128], 160);
  },
};
export default def;
