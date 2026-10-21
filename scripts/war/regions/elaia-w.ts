/**
 * Pirate Coves (docs/WAR.md): rocky coves and pine headlands, Elaia (E) inland, the Siren Estuary (N) up the coast,
 * Elaia's two other entries at the east edge's ends, the sea (W). Strategic purpose: a coast with landing beaches and
 * pitch from the pines. Depth 1: pirates hanged in life, woken still hungry, in the sea caves; boars in the woods.
 * Layout (Gemini reference shots/war/regions/proto/elaia-w.png): three coves bite into the west coast, each with a
 * small sand beach under limestone walls; between them pine headlands rise in tiers (h6, h10) on cliffs, a dark sea
 * cave in the southern one's face where the pirates lair. Behind the coast a long rocky ridge (h10, a cliff on its sea side) runs north-south;
 * the coast track climbs over the headlands from Elaia to the Siren road, paths dropping to each cove. The claim point
 * at the track's fork above the middle cove; resin tappers' huts in the pines.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'elaia-w',
  style: { dry: 0.3, trees: 0.4, bushes: 0.4 },
  build(k: Kit) {
    const E = k.entry('elaia'), NE = k.entry('elaia-n'), SE = k.entry('elaia-s'), N = k.entry('siren');
    k.fill(3);
    k.zone('elaia', () => 99);
    // the sea first, then the headland tiers set over the land (sheer limestone walls)
    k.waterBody([-26, 128, 48, 210, 0], { shore: 4, beach: 0, rough: 5 });
    k.lift((x, y, s) => {
      const w = x + 10 * Math.sin(y / 19 + s);
      return w < 70 ? 10 : w < 110 ? 6 : NaN;
    }, true);
    // the three coves: cut down to the water, beaches, the cave in the southern headland
    const coves: Pt[] = [[34, 46], [34, 128], [34, 206]];
    coves.forEach((c, n) => {
      k.basin([c[0], c[1], 22, 14, 0.2], 1, 0, 2);
      k.waterBody([c[0] - 18, c[1], 16, 11, 0.2], { shore: 2, beach: 4, rough: 2 });
      k.paint('sand', [c[0] + 2, c[1], 22, 15, 0.2], { on: ['grass', 'dirt'], maxH: 2 });
      k.spot(`cove${n}`, c);
    });
    k.rockMass([22, 168, 6, 4, 0.3], { rough: 0.8, foot: 7 });
    k.spot('seaCave', [30, 166]);
    // the ridge behind the coast
    k.ridge([[150, -6], [140, 60], [150, 128], [140, 196], [150, 262]], { crest: 10, step: 2, top: 2, reach: 14, base: 3, cliff: -1 });
    k.spot('ridge', [146, 100]);
    // roads: the coast track from Elaia over the headlands to the Siren road; paths down to the coves; the side tracks
    const hub: Pt = [90, 128];
    k.road([E, [226, 128], [180, 124], [146, 128], [116, 128], hub, [84, 90], [96, 50], [116, 20], N], { w: 1.2, grade: 2.4, fill: true });
    k.road([[226, 128], [236, 90], [246, 56], NE], { w: 1.1, grade: 3 });
    k.road([[226, 128], [236, 170], [246, 204], SE], { w: 1.1, grade: 3 });
    for (const c of coves) k.road([hub, [(hub[0] + c[0]) / 2 + 10, (hub[1] + c[1]) / 2], [c[0] + 6, c[1]]], { w: 1, grade: 1.4 });
    // pines on the headlands, olives inland, the tappers' huts and pitch, boulders
    k.forest([66, 80, 22, 20, 0.3], [70, 170, 22, 18, -0.2], [60, 236, 18, 12, 0], [190, 60, 20, 14, 0.2], [196, 200, 20, 14, 0], [60, 14, 18, 10, 0]);
    k.rows(['elaia/olive-orchard'], [196, 128, 16, 14, 0.1], { dx: 3, dy: 3 });
    k.piece('dodona/charcoal-pile', [70, 100], { r: 8, n: 2 });
    k.piece('dodona/timber-stand', [70, 176], { r: 10, n: 2 });
    k.village([200, 90], 4);
    k.resource('stone', [146, 150], 3, 10);
    k.resource('food', [196, 150], 2, 12);
    // fauna: pirates in the sea cave and on the north cove, boars in the pines
    k.lair('bandit', [34, 172], { as: 'pirates', count: 8 });
    k.lair('bandit', [38, 50], { as: 'pirates' });
    k.lair('boar', [70, 176], { as: 'boars' });
    k.lair('boar', [196, 200], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
