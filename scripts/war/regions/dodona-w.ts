/**
 * Western Heath (docs/WAR.md): windswept heath over sea cliffs, Dodona (E) inland, the Siren Estuary (S) down the
 * coast, Dodona's two other entries at the east edge's ends, the sea (W). Strategic purpose: Dodona's salt and silver
 * lifeline to Siren and room for a field battle. Depth 1: wolves and boars; the oath-breakers' lanterns on the bogs.
 * Layout (Gemini reference shots/war/regions/proto/dodona-w.png; W-52 set pieces, ./setpieces.ts): the high heath, a
 * broad L-shaped tableland, fills the west coast and the north edge in two tiers (h7-8, h10-11) and ends in one long grey
 * cliff over the sunken heath, the open brown lowland (h2-4) of the centre and south-east, room for a field battle.
 * Grey sea cliffs drop from the tableland straight into the sea along the west edge, broken once by a small cove beach;
 * the coast track runs along their tops, dark peat bogs with black pools beside it. Down in the sunken heath one long
 * spine of grey rock (h6, h8) runs north-south, the Dodona road cutting through it at a saddle; black pools and
 * standing stones on the heath. The roads climb the tableland's cliff by cut ramps; the claim point where Dodona's
 * road meets the coast track.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief } from './setpieces.ts';

const def: RegionDef = {
  id: 'dodona-w',
  style: { meadow: 0.3, trees: 0.08, bushes: 0.3, dry: -0.2 },
  build(k: Kit) {
    const E = k.entry('dodona'), NE = k.entry('dodona-n'), SE = k.entry('dodona-s'), S = k.entry('siren');
    k.fill(3);
    k.zone('elaia', () => 99); // the heath's dry brown grass (Elaia's dry kind)
    k.zone('mountains', [30, 128, 34, 170, 0], 8);
    k.zone('dodona', [244, 128, 22, 150, 0], 8);
    // the high heath: an L along the west coast and the north edge, two tiers over the sunken heath
    const high = massif(k, {
      outline: [[-12, -12], [268, -12], [268, 44], [206, 58], [146, 54], [112, 84], [94, 140], [84, 200], [70, 268], [-12, 268]],
      crown: [[-12, -12], [212, -12], [190, 22], [128, 28], [74, 70], [54, 150], [44, 268], [-12, 268]],
      base: 3, tiers: 2, steps: [2, 2], wobble: 0.3,
    });
    // the relief over its contours (setpieces.ts relief): the sunken heath barely rolling, the tableland's long grey
    // wall four levels over it, its lower tier rolling up to a two-level wall and the upper heath at h10-11
    relief(k, (x, y, s) => {
      const t = high.t(x, y);
      if (t < 0) return 2.9 + 0.8 * fbm(x, y, 26, s);
      return profile([[0, 7], [0.9, 8.2], [1, 10], [2, 11.4]], t) + 0.5 * fbm(x, y, 12, s + 1);
    }, { cliffs: [[3.8, 7], [8.2, 10]] });
    // the sea under the cliffs, the cove cut into them
    k.waterBody([-22, 128, 44, 200, 0], { shore: 3, beach: 0, rough: 4 });
    k.basin([28, 64, 22, 16, 0.3], 1, 0, 2);
    k.waterBody([14, 64, 16, 12, 0.3], { shore: 2, beach: 6, rough: 2 });
    k.spot('cove', [28, 64]);
    // the bogs: black pools in peat on the tableland by the coast track and the north tier, a few down on the heath
    for (const [x, y, rx, ry] of [[70, 34, 14, 8], [116, 26, 12, 7], [36, 112, 9, 12], [30, 176, 8, 12], [150, 236, 14, 9], [216, 200, 12, 8], [190, 112, 9, 6], [104, 228, 8, 6]] as const) {
      k.paint('marsh', [x, y, rx + 4, ry + 4, 0.4], { rough: 3, on: ['grass'] });
      k.waterBody([x, y, rx * 0.6, ry * 0.6, 0.4], { deep: true, shore: 1, beach: 0, rough: 1.5 });
    }
    // the grey ridge across the heath
    // a long grey wall of rock: a crest on two cliff steps (4 -> 6 -> 8), not a soft slope
    const R: Pt[] = [[172, 70], [164, 110], [154, 150], [140, 196]];
    const dR = (x: number, y: number) => {
      let d = Infinity;
      for (let n = 1; n < R.length; n++) {
        const [ax, ay] = R[n - 1], [bx, by] = R[n], ux = bx - ax, uy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy) / (ux * ux + uy * uy)));
        d = Math.min(d, Math.hypot(x - ax - t * ux, y - ay - t * uy));
      }
      return d;
    };
    k.lift((x, y, s) => { const d = dR(x, y) + 1.2 * Math.sin(x / 7 + s) + Math.sin(y / 5); return d < 4.5 ? 8 : d < 9 ? 6 : NaN; });
    for (const [x, y] of [[170, 82], [162, 120], [150, 170], [143, 190]] as const) k.rockMass([x, y, 3, 7, 0.2], { rough: 0.8, foot: 2 });
    k.spot('ridge', [158, 134]);
    // roads: the coast track along the cliff tops to Siren; Dodona's road over the ridge's saddle to it; the side
    // tracks from Dodona's other entries
    const hub: Pt = [52, 128];
    k.road([[44, 10], [44, 64], [52, 100], hub, [52, 170], [64, 214], [100, 244], [124, 250], S], { w: 1.2, grade: 3 });
    k.road([E, [228, 128], [196, 132], [158, 134], [120, 134], [84, 128], hub], { w: 1.3, grade: 2.4 });
    k.road([NE, [232, 40], [190, 36], [150, 40], [100, 52], [60, 64], [44, 64]], { w: 1.1, grade: 2.4 });
    k.road([SE, [230, 212], [190, 226], [150, 244], [124, 250]], { w: 1.1, grade: 3 });
    k.road([[44, 64], [34, 64], [28, 64]], { w: 1, grade: 1.5 });
    // standing stones, cairns, a shepherds' hamlet, wind-bent trees
    k.piece('mountains/cairn', [120, 180], { r: 10, n: 3, gap: 5 });
    k.piece('mountains/cairn', [200, 90], { r: 8, n: 3, gap: 5 });
    k.piece('mountains/cairn', [80, 40], { r: 6, n: 2, gap: 4 });
    k.village([200, 170], 4);
    k.forest([236, 96, 10, 10, 0.4], [236, 244, 10, 8, 0]);
    k.resource('stone', [176, 110], 3, 10);
    k.resource('stone', [80, 200], 2, 10);
    k.resource('food', [200, 190], 2, 12);
    // fauna: wolves on the heath and by the bogs, boars in the east woods
    k.lair('wolf', [96, 100], { as: 'wolves' });
    k.lair('wolf', [84, 220], { as: 'wolves' });
    k.lair('boar', [218, 92], { as: 'boars' });
    k.lair('boar', [210, 236], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
