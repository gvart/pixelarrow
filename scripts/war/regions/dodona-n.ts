/**
 * Boreas Fjords (docs/WAR.md): a cold fjord coast of pine and rock, Dodona (S) inland, the Krios Glacier (E) on the way
 * to its iron, Dodona's two other entries at the north ends of the side edges, the sea (N). Strategic purpose: a buffer
 * on the way to Krios and a coast. Depth 1: wolves denning in the drowned longships' hulls, bears in the pines.
 * Layout (Gemini reference shots/war/regions/proto/dodona-n.png): two deep fjord arms cut south from the sea between
 * tall cliffs. The west one ends at a pebble beach with a rotting longship; the east one runs far inland, its head
 * against the rock spur of the Teeth foothills, and the one land bridge between them, 10 tiles wide with cliffs on
 * both sides, carries the road to Krios and the Teeth. Pine headlands rise in tiers (h6, h8) over the fjords; the
 * western headland's top looks down on the bridge. The road from Dodona climbs to the claim point on the moor west of
 * the bridge, the coast track runs west to the Heath.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'dodona-n',
  style: { meadow: 0.3, trees: 0.5, bushes: 0.4 },
  build(k: Kit) {
    const S = k.entry('dodona'), E = k.entry('krios'), NE = k.entry('dodona-e'), NW = k.entry('dodona-w');
    k.fill(4);
    k.zone('dodona', [100, 160, 140, 120, 0], 10);
    k.zone('mountains', [220, 100, 60, 140, 0], 10);
    // headland tiers over the fjords
    k.plateau([44, 40, 34, 24, 0.3], 7, { rough: 4 });
    k.plateau([140, 76, 34, 40, 0.1], 7, { rough: 4 });
    k.plateau([150, 150, 18, 16, 0.2], 9, { rough: 2 });
    k.plateau([226, 46, 26, 30, -0.2], 7, { rough: 3 });
    k.spot('headland', [150, 150]);
    k.spot('ridge', [150, 150]);
    // the sea, the two fjords (deep, cliff walls), the beach at the west one's head
    k.waterBody([128, -18, 210, 34, 0], { shore: 3, beach: 2.5, rough: 6 });
    k.river([[80, -10], [84, 40], [90, 80], [92, 112]], { half: 6, bed: 0, bank: 0.1 });
    k.waterBody([92, 116, 9, 6, 0], { shore: 2, beach: 3, rough: 2 });
    k.river([[188, -10], [182, 60], [190, 120], [188, 189]], { half: 6.5, bed: 0, bank: 0.1 });
    // the Teeth spur south of the east fjord's head: the bridge's other wall
    k.rockMass([190, 236, 12, 36, 0.05], { rough: 1, foot: 4 });
    // the knoll over the bridge's west end
    k.plateau([170, 190, 8, 6, 0.3], 7, { rough: 1, terrain: 'dirt' });
    k.spot('knoll', [170, 190]);
    k.spot('narrows', [189, 196.5]);
    k.paint('snow', [226, 46, 24, 28, 0], { on: ['grass', 'dirt'], minH: 6, rough: 5 });
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
    k.forest([44, 40, 30, 18, 0.3], [140, 70, 26, 30, 0.1], [226, 50, 18, 20, 0], [60, 220, 26, 18, 0.2], [210, 230, 14, 16, 0], [150, 150, 10, 8, 0.2]);
    k.piece('dodona/hut-ruin', [96, 124], { r: 6, n: 2, gap: 4 });
    k.piece('dodona/timber-stand', [140, 90], { r: 10, n: 2 });
    k.piece('dodona/charcoal-pile', [70, 214], { r: 6 });
    k.piece('watchtower', [150, 150], { r: 4 });
    k.village([90, 226], 4);
    k.resource('stone', [226, 60], 2, 10);
    k.resource('food', [100, 236], 2, 12);
    // fauna: wolves in the wreck and on the west headland, bears in the pines
    k.lair('wolf', [98, 118], { as: 'wolves' });
    k.lair('wolf', [44, 44], { as: 'wolves' });
    k.lair('bear', [140, 64], { as: 'bears' });
    k.lair('bear', [222, 56], { as: 'bears' });
    k.claim(hub, 160);
  },
};
export default def;
