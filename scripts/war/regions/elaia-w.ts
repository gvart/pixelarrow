/**
 * Pirate Coves (docs/WAR.md): rocky coves and pine headlands, Elaia (E) inland, the Siren Estuary (N) up the coast,
 * Elaia's two other entries at the east edge's ends, the sea (W). Strategic purpose: a coast with landing beaches and
 * pitch from the pines. Depth 1: pirates hanged in life, woken still hungry, in the sea caves; boars in the woods.
 * Layout (Gemini reference shots/war/regions/proto/elaia-w.png; W-52 set pieces, ./setpieces.ts):
 *   the headland   one great grey limestone massif fills the west half along the coast (setpieces.ts relief): a
 *                  six-level sea cliff, a narrow bench, a three-level upper wall and a rolling crown at h13-15 (lower
 *                  toward the south-west), walls again on its east face over the ravine; three coves bite into it down
 *                  to sand beaches under the stacked walls, a dark sea cave in the southern face where the pirates lair;
 *   the ravine     a narrow winding defile runs north-south behind it, its floor (h2) seven levels under the headland's
 *                  east rim and six under the pine tableland (h5-8, rolling, lower to the south) that fills the east,
 *                  where Elaia's roads come in; the track drops into the ravine, crosses it at the claim point and
 *                  climbs switchbacks up the headland's walls to the spine and the Siren road.
 * Resin tappers' huts in the pines; paths drop from the spine to each cove.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { profile, relief, valley } from './setpieces.ts';

const def: RegionDef = {
  id: 'elaia-w',
  style: { dry: 0.35, dryHigh: false, meadow: 0.2, trees: 0.6, bushes: 0.5 },
  build(k: Kit) {
    const E = k.entry('elaia'), NE = k.entry('elaia-n'), SE = k.entry('elaia-s'), N = k.entry('siren');
    k.fill(3);
    k.zone('elaia', () => 99);
    k.zone('mountains', [86, 128, 62, 150, 0], 8); // the headland's grey limestone
    // the sea cave's rock in the southern face (before the sea: rock keeps it out)
    k.rockMass([24, 166, 6, 4, 0.3], { rough: 0.8 });
    // the sea along the west edge, wider in the north and round the south-west corner; the coves' water
    k.waterBody([-18, 128, 50, 230, 0], { shore: 4, beach: 0, rough: 6 });
    const coves: Pt[] = [[40, 46], [40, 132], [36, 204]], cave: Pt = [32, 176];
    for (const c of coves) k.waterBody([c[0] - 8, c[1], 14, 10, 0.2], { shore: 0, beach: 4, rough: 2 });
    // the land: a cross-section from the sea to the east edge, bent by noise (sea cliffs straight off the water, a
    // narrow bench, the upper wall, a rugged crown, walls down to the ravine, the tableland rolling over 8-10 between the
    // cliff bands); the coves bitten in as bowls whose walls the bands turn into stacked cliffs
    const bowls: [Pt, number][] = [...coves.map((c) => [[c[0] + 4, c[1]], 15] as [Pt, number]), [cave, 6]];
    relief(k, (x, y, s) => {
      const u = x + 9 * fbm(x, y, 28, s) + 3 * fbm(x, y, 7, s + 1);
      const south = Math.max(0, Math.min(1, (y - 150) / 90));
      const head = profile([[24, 1], [28, 2], [37, 9], [48, 10], [57, 13.5], [90, 15], [112, 15], [124, 13.5], [134, 11], [148, 9.5], [176, 9], [196, 9.6], [256, 9.4]], u);
      const east = Math.max(0, Math.min(1, (x - 150) / 40)); // the tableland tilts down to the south instead
      let v = 2 + (head - 2) * (1 - 0.2 * south * (1 - east)) - 1.2 * (y / 256) * east;
      v += (v > 12 ? 1.4 * fbm(x, y, 14, s + 2) + 1.2 * fbm(x, y, 5, s + 4) : 0.7 * fbm(x, y, 14, s + 2)); // a broken, rocky crown
      for (const [c, r] of bowls) {
        const d = Math.hypot(x - c[0], (y - c[1]) * 1.1) + 3 * fbm(x, y, 6, s + 3);
        v = Math.min(v, 1 + Math.max(0, d - r) * 0.9);
      }
      return v;
    }, { cliffs: [[2, 8], [10, 13]] });
    // the ravine: a narrow winding defile under sheer walls
    const rav: Pt[] = [[176, -8], [166, 36], [186, 80], [182, 120], [168, 164], [184, 210], [174, 264]];
    valley(k, rav, { floor: 2, rim: 9, half: 4.5, wall: 0, reach: 2 });
    // limestone crags standing over the headland's crown and its walls (after the relief: rock rises over the ground)
    for (const b of [[84, 22, 7, 5, 0.3], [70, 62, 5, 4, 0], [96, 94, 6, 4, -0.3], [76, 104, 5, 4, 0], [134, 48, 5, 8, 0], [140, 200, 5, 8, 0.2], [90, 236, 8, 5, 0], [62, 224, 6, 4, 0]] as [number, number, number, number, number][]) k.rockMass(b, { rough: 1.2, foot: 0 });
    k.patch('mountains', 'scree', [94, 120, 20, 112, 0], ['grass', 'dirt', 'meadow'], undefined, 11);
    k.forest([84, 60, 6, 12, 0.2], [100, 150, 6, 14, 0], [86, 200, 6, 10, 0]);
    k.spot('ridge', [100, 128]);
    // beaches under the walls; the cave in the southern headland's face
    coves.forEach((c, n) => {
      k.paint('sand', [c[0] + 2, c[1], 24, 16, 0.2], { on: ['grass', 'dirt'], maxH: 2 });
      k.spot(`cove${n}`, c);
    });
    k.paint('sand', [cave[0], cave[1], 8, 6, 0], { on: ['grass', 'dirt'], maxH: 2 });
    k.spot('seaCave', [34, 176]);
    // roads: Elaia's track over the tableland, down into the ravine to the claim point, switchbacks up the headland's
    // walls to the spine and the Siren road; the side tracks along the tableland; paths from the spine down to the coves
    const hub: Pt = [182, 120];
    k.road([E, [226, 128], [200, 124], hub, [178, 100], [164, 90], [152, 106], [138, 96], [124, 100], [110, 60], [118, 24], N], { w: 1.2, grade: 2.4 });
    k.road([[226, 128], [236, 90], [246, 56], NE], { w: 1.1, grade: 3 });
    k.road([[226, 128], [236, 170], [246, 204], SE], { w: 1.1, grade: 3 });
    for (const c of coves) k.road([[112, c[1] < 100 ? 70 : c[1] > 160 ? 176 : 118], [(112 + c[0]) / 2 + 6, c[1] + 4], [c[0] + 8, c[1]]], { w: 1, grade: 1.4 });
    k.road([[124, 100], [116, 140], [108, 176]], { w: 1, grade: 1.4 });
    k.road([[108, 176], [72, 172], [40, 176]], { w: 1, grade: 1.4 });
    // pines on the headland and the tableland, olives on the tableland, the tappers' huts and pitch
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
