/**
 * Chalk Coast (docs/WAR.md): grass downs ending in white chalk cliffs, Skythia (W) inland, the Ammon Salt Flats (S)
 * down the coast, Skythia's two other entries at the west edge's ends, the sea (E). Strategic purpose: Skythia's salt
 * and silver lifeline to Ammon, long sight lines. Depth 1: wild horses on the downs, boars in the combes; the faces
 * of those who leapt rather than fade cut in the cliffs.
 * Layout (Gemini reference shots/war/regions/proto/skythia-e.png; W-52 set pieces, ./setpieces.ts): the coastal
 * upland fills the east half in two great tiers behind cliffs (h6, then the h9 cliff-top) and drops sheer in white
 * chalk into the sea along the east edge, broken by one cove with a beach and a sea cave under its north wall. A
 * stepped chalk mesa (h6, h9) fills the north-west corner; one long cliff-sided ridge (h9) runs from the downs to the
 * upland across the middle; the road from Skythia climbs over it and runs south along the cliff top to Ammon. Chalk
 * figures cut in the turf of the low downs; a few hawthorns.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

const def: RegionDef = {
  id: 'skythia-e',
  style: { dry: 0.4, dryHigh: false, trees: 0.04, bushes: 0.04, meadow: 0.3 },
  build(k: Kit) {
    const W = k.entry('skythia'), NW = k.entry('skythia-n'), SW = k.entry('skythia-s'), S = k.entry('ammon');
    k.fill(3);
    k.zone('elaia', () => 99);
    // the coastal upland: two tiers, the cliff-top along the sea
    massif(k, { outline: [[124, -12], [268, -12], [268, 268], [112, 268], [136, 200], [156, 132], [140, 60]], crown: [[198, -12], [268, -12], [268, 268], [194, 268], [188, 130]], base: 3, tiers: 2, step: 3, wobble: 0.15 });
    // the stepped chalk mesa in the north-west corner
    massif(k, { outline: [[-12, -12], [118, -12], [108, 26], [72, 52], [24, 62], [-12, 70]], crown: [4, 2], base: 3, tiers: 2, step: 3, wobble: 0.15 });
    // the long ridge from the downs up to the upland
    massif(k, { outline: [[60, 86], [92, 88], [132, 100], [176, 136], [168, 150], [128, 118], [90, 106], [58, 100]], crown: [[80, 94], [130, 108], [166, 140], [128, 112]], base: 3, tiers: 2, step: 3, wobble: 0.1, keepHigher: true });
    k.spot('ridge', [126, 108]);
    // the sea under the cliffs, a strip of shingle at their foot
    k.waterBody([274, 128, 52, 210, 0], { shore: 4, beach: 3, rough: 4 });
    // the cove: a cut down to the water, its beach, the cave mouth (dark rock) under its north wall
    k.basin([222, 150, 20, 28, 0.1], 1, 0, 2);
    k.waterBody([240, 150, 16, 12, 0.2], { shore: 2, beach: 5, rough: 2 });
    k.paint('sand', [224, 150, 22, 30, 0.1], { on: ['grass', 'dirt'], maxH: 2 });
    k.rockMass([214, 136, 4, 3, 0], { rough: 0.6, foot: 9 });
    k.spot('cove', [214, 150]);
    // roads: Skythia's road over the ridge to the cliff top and south to Ammon; the cove path; Skythia's other entries
    const hub: Pt = [200, 110];
    k.road([W, [40, 128], [100, 124], [130, 110], [160, 116], hub, [190, 150], [192, 184], [184, 214], [150, 236], [130, 250], S], { w: 1.3, grade: 2.4, fill: true });
    k.road([[40, 128], [26, 90], [14, 56], NW], { w: 1.1, grade: 3 });
    k.road([[40, 128], [26, 170], [14, 206], SW], { w: 1.1, grade: 3 });
    k.road([[190, 150], [198, 154], [206, 154], [214, 152]], { w: 1, grade: 1.2 });
    k.road([hub, [210, 60], [216, 30]], { w: 1, grade: 3 });
    k.road([[26, 90], [40, 70], [50, 50], [40, 30]], { w: 1, grade: 1.6, fill: true });
    // the chalk figures on the low downs and the upland, hawthorns, a herders' hamlet
    k.patch('elaia', 'marble', [70, 176, 9, 3, 0.4], ['grass']);
    k.patch('elaia', 'marble', [96, 70, 7, 3, -0.5], ['grass']);
    k.patch('elaia', 'marble', [200, 40, 8, 3, 0.4], ['grass']);
    k.forest([80, 140, 6, 4, 0.3], [90, 220, 8, 5, 0], [120, 44, 6, 4, 0]);
    k.village([80, 196], 4);
    k.resource('stone', [214, 136], 3, 8);
    k.resource('food', [92, 210], 2, 12);
    k.piece('mountains/cairn', [126, 108], { r: 6, n: 2 });
    // fauna: wild horses on the downs, boars in the combes by the cove and the south
    k.lair('ibex', [110, 160], { as: 'wild horses' });
    k.lair('ibex', [120, 220], { as: 'wild horses' });
    k.lair('boar', [200, 170], { as: 'boars' });
    k.lair('boar', [60, 236], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
