/**
 * Boreas Fjords (docs/WAR.md): a cold fjord coast of pine and rock, Dodona (S) inland, the Krios Glacier (E) on the way
 * to its iron, Dodona's two other entries at the north ends of the side edges, the sea (N). Strategic purpose: a buffer
 * on the way to Krios and a coast. Depth 1: wolves denning in the drowned longships' hulls, bears in the pines.
 * Layout (Gemini reference shots/war/regions/proto/dodona-n.png; W-52 set pieces): the sea fills the north; two wide
 * deep fjord arms cut south from it between
 * six-level (12 m) sheer cliffs. The west one ends at a pebble beach with a rotting longship; the east one runs far inland, its head
 * against the rock spur of the Teeth foothills, and the one land bridge between them, 10 tiles wide with cliffs on
 * both sides, carries the road to Krios and the Teeth. Pine headlands rise in tiers on 2-3 level walls (h8, h11, h14; the east one to h15) over the fjords; the
 * western headland's top looks down on the bridge. The road from Dodona climbs to the claim point on the moor west of
 * the bridge, the coast track runs west to the Heath.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief } from './setpieces.ts';

const def: RegionDef = {
  id: 'dodona-n',
  style: { meadow: 0.3, trees: 0.4, bushes: 0.12 },
  build(k: Kit) {
    const S = k.entry('dodona'), E = k.entry('krios'), NE = k.entry('dodona-e'), NW = k.entry('dodona-w');
    k.fill(6);
    k.zone('dodona', [100, 170, 150, 110, 0], 10);
    k.zone('mountains', [226, 90, 50, 120, 0], 10);
    // the headlands: tiered cliffs over the fjords (h8, h11, the east one up to h15 under snow)
    const hw = massif(k, { outline: [[-12, -12], [66, -12], [72, 40], [62, 90], [30, 120], [-12, 124]], crown: [[4, 10], [40, 6], [44, 40], [10, 60]], base: 6, tiers: 2, steps: [2, 2], wobble: 0.2 });
    const hm = massif(k, { outline: [[108, -12], [160, -12], [166, 60], [168, 120], [158, 160], [138, 166], [118, 120], [112, 60]], crown: [[124, 20], [150, 20], [154, 120], [130, 110]], base: 6, tiers: 2, steps: [2, 2], wobble: 0.15 });
    const he = massif(k, { outline: [[214, -12], [270, -12], [270, 116], [232, 110], [214, 60]], crown: [252, 20], base: 6, tiers: 3, steps: [2, 2, 2], wobble: 0.2 });
    // their relief over the massifs' contours (setpieces.ts relief): each headland stands on a wall over the rolling moor
    // and climbs in tiers behind 2-3 level walls, each tier rolling a level (h7-8, h10-11, h13-15)
    relief(k, (x, y, s) => {
      const t = Math.max(hw.t(x, y), hm.t(x, y), he.t(x, y)), gap = Math.hypot(x - NW[0], y - NW[1]);
      if (gap < 16) return 2 + gap * 0.28; // the coast track's way in from the Heath: a gentle hollow
      if (t < 0) return 6 + 0.9 * fbm(x, y, 24, s);
      return profile([[0, 8.2], [0.06, 9], [0.85, 9.4], [1, 11], [1.85, 11.6], [2, 14], [3, 15]], t) + 0.4 * fbm(x, y, 9, s + 1) + (t > 2 ? 0.6 * fbm(x, y, 4, s + 2) : 0);
    }, { cliffs: [[6.8, 8.2], [9.4, 11], [11.6, 14]] });
    k.spot('headland', [150, 150]);
    k.spot('ridge', [150, 150]);
    // the sea, the two fjords (deep, six levels of sheer cliff), the beach at the west one's head
    k.waterBody([136, -12, 150, 60, 0], { shore: 3, beach: 2.5, rough: 6 });
    k.river([[86, -10], [88, 40], [92, 84], [94, 116]], { half: 11, bed: 0, bank: 0.1 });
    k.waterBody([94, 124, 12, 8, 0], { shore: 2, beach: 4, rough: 2 });
    k.river([[190, -10], [184, 60], [192, 120], [188, 182]], { half: 12, bed: 0, bank: 0.1 });
    // the Teeth spur south of the east fjord's head: the bridge's other wall
    k.rockMass([190, 236, 12, 36, 0.05], { rough: 1, foot: 4 });
    // the knoll over the bridge's west end
    k.plateau([170, 190, 8, 6, 0.3], 8, { rough: 1, terrain: 'dirt' });
    k.spot('knoll', [170, 190]);
    k.spot('narrows', [189, 196.5]);
    // roads: Dodona up to the claim point, east over the bridge to Krios and the Teeth; the coast track west; the path
    // up the headland
    const hub: Pt = [130, 200];
    k.road([S, [128, 236], hub, [166, 200], [189, 199], [212, 196], [236, 150], [250, 130], E], { w: 1.2, grade: 3 });
    k.road([[236, 150], [244, 100], [248, 60], NE], { w: 1.1, grade: 3 });
    k.road([hub, [90, 180], [60, 130], [40, 80], [20, 50], NW], { w: 1.1, grade: 3 });
    k.road([[166, 200], [160, 176], [154, 162], [152, 156]], { w: 1, grade: 1.2, fill: true });
    k.road([[60, 130], [80, 124], [92, 122]], { w: 1, grade: 2 });
    k.road([hub, [128, 160], [134, 124], [138, 108]], { w: 1, grade: 1.3, fill: true });
    k.road([[166, 200], [168, 196], [170, 192]], { w: 0.9, grade: 1, fill: true });
    // pines on the headlands, the wreck on the beach, a hamlet by the hub
    k.forest([30, 40, 30, 26, 0.3], [138, 70, 16, 40, 0.05], [236, 50, 16, 26, 0], [60, 220, 30, 20, 0.2], [214, 232, 14, 16, 0], [30, 170, 22, 24, 0.3], [228, 160, 16, 20, 0]);
    k.piece('dodona/hut-ruin', [108, 126], { r: 8, n: 2, gap: 4 }); // on the beach's dry east side (the bay's head is all shallows)
    k.piece('dodona/timber-stand', [140, 90], { r: 10, n: 2 });
    k.piece('dodona/charcoal-pile', [70, 214], { r: 6 });
    k.piece('watchtower', [150, 150], { r: 4 });
    k.village([90, 226], 4);
    k.resource('stone', [226, 60], 2, 10);
    k.resource('food', [100, 236], 2, 12);
    // fauna: wolves in the wreck and on the west headland, bears in the pines
    k.lair('wolf', [98, 118], { as: 'wolves' });
    k.lair('wolf', [34, 100], { as: 'wolves' });
    k.lair('bear', [140, 64], { as: 'bears' });
    k.lair('bear', [222, 56], { as: 'bears' });
    k.claim(hub, 160);
  },
};
export default def;
