/**
 * Pirate Coves (docs/WAR.md): rocky coves and pine headlands, Elaia (E) inland, the Siren Estuary (N) up the coast,
 * Elaia's two other entries at the east edge's ends, the sea (W). Strategic purpose: a coast with landing beaches and
 * pitch from the pines. Depth 1: pirates hanged in life, woken still hungry, in the sea caves; boars in the woods.
 * Layout (Gemini reference shots/war/regions/proto/elaia-w.png; W-52 set pieces, ./setpieces.ts):
 *   the headland   one great grey limestone massif fills the west half along the coast, rising in three cliff tiers
 *                  (h6, h9, h12) to a long rocky spine; three coves bite into its sea face down to small sand beaches
 *                  under sheer walls, a dark sea cave in the southern face where the pirates lair;
 *   the ravine     a winding cliff-walled defile runs north-south behind it, its floor (h3) under the pine tableland
 *                  (h8) that fills the east, where Elaia's roads come in; the track drops into the ravine by ramps,
 *                  crosses it at the claim point and climbs the headland's tiers to the Siren road.
 * Resin tappers' huts in the pines; paths drop from the spine to each cove.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif, valley } from './setpieces.ts';

const def: RegionDef = {
  id: 'elaia-w',
  style: { dry: 0.35, dryHigh: false, meadow: 0.2, trees: 0.6, bushes: 0.5 },
  build(k: Kit) {
    const E = k.entry('elaia'), NE = k.entry('elaia-n'), SE = k.entry('elaia-s'), N = k.entry('siren');
    k.fill(3);
    k.zone('elaia', () => 99);
    k.zone('mountains', [86, 128, 62, 150, 0], 8); // the headland's grey limestone
    // the sea along the west edge, wider in the north and round the south-west corner
    k.waterBody([-18, 128, 50, 230, 0], { shore: 4, beach: 0, rough: 6 });
    // the ravine and the pine tableland east of it (the tableland's rim raised over the whole east)
    const rav: Pt[] = [[178, -8], [168, 50], [186, 112], [170, 176], [182, 264]];
    valley(k, rav, { floor: 3, rim: 8, half: 7, wall: 0, reach: 100 });
    // the headland: three cliff tiers to a long rocky spine
    massif(k, {
      outline: [[30, -12], [146, -12], [150, 40], [138, 92], [146, 144], [134, 204], [140, 268], [22, 268], [40, 226], [46, 170], [50, 100], [44, 40]],
      crown: [[70, 10], [108, 8], [114, 60], [102, 118], [108, 170], [94, 226], [76, 230], [78, 170], [70, 112], [74, 52]],
      base: 3, tiers: 3, steps: [3, 3, 3], wobble: 0.3, skew: 0.2, keepHigher: true,
    });
    k.patch('mountains', 'scree', [94, 120, 20, 112, 0], ['grass', 'dirt', 'meadow'], undefined, 11);
    k.forest([84, 60, 6, 12, 0.2], [100, 150, 6, 14, 0], [86, 200, 6, 10, 0]);
    k.spot('ridge', [100, 128]);
    // the three coves: cut down to the water, beaches under the walls; the cave in the southern headland's face
    const coves: Pt[] = [[40, 46], [40, 132], [36, 204]];
    coves.forEach((c, n) => {
      k.basin([c[0], c[1], 24, 15, 0.2], 1, 0, 2);
      k.waterBody([c[0] - 16, c[1], 16, 11, 0.2], { shore: 2, beach: 4, rough: 2 });
      k.paint('sand', [c[0] + 2, c[1], 24, 16, 0.2], { on: ['grass', 'dirt'], maxH: 2 });
      k.spot(`cove${n}`, c);
    });
    k.rockMass([24, 166, 6, 4, 0.3], { rough: 0.8, foot: 7 });
    k.spot('seaCave', [34, 176]);
    // roads: Elaia's track over the tableland, down into the ravine to the claim point, up the headland to the Siren
    // road; the side tracks along the tableland; paths from the spine down to the coves
    const hub: Pt = [182, 120];
    k.road([E, [226, 128], [200, 124], hub, [150, 116], [124, 96], [110, 60], [118, 24], N], { w: 1.2, grade: 2.4 });
    k.road([[226, 128], [236, 90], [246, 56], NE], { w: 1.1, grade: 3 });
    k.road([[226, 128], [236, 170], [246, 204], SE], { w: 1.1, grade: 3 });
    for (const c of coves) k.road([[112, c[1] < 100 ? 70 : c[1] > 160 ? 176 : 118], [(112 + c[0]) / 2 + 6, c[1] + 4], [c[0] + 8, c[1]]], { w: 1, grade: 1.4 });
    k.road([[124, 96], [116, 140], [108, 176]], { w: 1, grade: 1.4 });
    // pines on the headland's tiers and the tableland, olives on the tableland, the tappers' huts and pitch
    k.forest([66, 86, 14, 20, 0.3], [62, 166, 12, 16, -0.2], [70, 244, 18, 10, 0], [130, 70, 10, 24, 0], [128, 180, 10, 24, 0], [210, 50, 26, 18, 0.2], [214, 206, 26, 20, 0], [132, 20, 12, 10, 0], [138, 236, 10, 14, 0], [234, 128, 10, 30, 0]);
    k.rows(['elaia/olive-orchard'], [214, 150, 14, 10, 0.1], { dx: 3, dy: 3 });
    k.piece('dodona/charcoal-pile', [204, 70], { r: 8, n: 2 });
    k.piece('dodona/timber-stand', [70, 176], { r: 10, n: 2 });
    k.village([214, 96], 4);
    k.resource('stone', [150, 160], 3, 10);
    k.resource('food', [216, 160], 2, 12);
    // fauna: pirates in the sea cave and on the north cove, boars in the pines
    k.lair('bandit', [38, 174], { as: 'pirates', count: 8 });
    k.lair('bandit', [44, 50], { as: 'pirates' });
    k.lair('boar', [70, 170], { as: 'boars' });
    k.lair('boar', [214, 210], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
