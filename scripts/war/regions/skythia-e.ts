/**
 * Chalk Coast (docs/WAR.md): grass downs ending in white chalk cliffs, Skythia (W) inland, the Ammon Salt Flats (S)
 * down the coast, Skythia's two other entries at the west edge's ends, the sea (E). Strategic purpose: Skythia's salt
 * and silver lifeline to Ammon, long sight lines. Depth 1: wild horses on the downs, boars in the combes; the faces
 * of those who leapt rather than fade cut in the cliffs.
 * Layout (Gemini reference shots/war/regions/proto/skythia-e.png): the downs rise east in two tiers (h3 by Skythia,
 * h6) to the cliff-top (h9) that drops sheer into the sea along the east edge, broken by one cove with a beach and a
 * sea cave under its north wall. One long grassy ridge (h9) crosses the downs north-south; the road from Skythia climbs
 * over it and runs south along the cliff top to Ammon. Chalk figures cut in the turf of the upper tier; hawthorns.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'skythia-e',
  style: { dry: 0.4, dryHigh: false, trees: 0.2, bushes: 0.12, meadow: 0.3 },
  build(k: Kit) {
    const W = k.entry('skythia'), NW = k.entry('skythia-n'), SW = k.entry('skythia-s'), S = k.entry('ammon');
    k.fill(3);
    k.zone('elaia', [214, 128, 50, 170, 0], 10);
    // the sea first, then the downs' tiers set over the land: the cliffs stay sheer
    k.waterBody([274, 128, 52, 210, 0], { shore: 4, beach: 0, rough: 4 });
    k.lift((x, y, s) => (x + 8 * Math.sin(y / 21 + s) > 186 ? 9 : x + 7 * Math.sin(y / 15) > 110 ? 6 : NaN), true);
    // the cove: a cut down to the water, its beach, the cave mouth (dark rock) under its north wall
    k.basin([222, 150, 20, 28, 0.1], 1, 0, 2);
    k.waterBody([240, 150, 16, 12, 0.2], { shore: 2, beach: 5, rough: 2 });
    k.paint('sand', [224, 150, 22, 30, 0.1], { on: ['grass', 'dirt'], maxH: 2 });
    k.rockMass([214, 136, 4, 3, 0], { rough: 0.6, foot: 9 });
    k.spot('cove', [214, 150]);
    // the ridge across the downs
    k.ridge([[150, -6], [146, 60], [154, 128], [146, 190], [150, 262]], { crest: 9, step: 2.5, top: 1.5, reach: 10, base: 6 });
    k.spot('ridge', [150, 100]);
    // roads: Skythia's road over the ridge to the cliff top and south to Ammon; the cove path; Skythia's other entries
    const hub: Pt = [200, 110];
    k.road([W, [40, 128], [100, 124], [150, 120], hub, [190, 150], [192, 184], [184, 214], [150, 236], [130, 250], S], { w: 1.3, grade: 2.4, fill: true });
    k.road([[40, 128], [26, 90], [14, 56], NW], { w: 1.1, grade: 3 });
    k.road([[40, 128], [26, 170], [14, 206], SW], { w: 1.1, grade: 3 });
    k.road([[190, 150], [198, 154], [206, 154], [214, 152]], { w: 1, grade: 1.2 });
    k.road([hub, [210, 60], [216, 30]], { w: 1, grade: 3 });
    // the chalk figures on the upper tier, hawthorns, a herders' hamlet
    k.patch('elaia', 'marble', [186, 50, 8, 3, 0.4], ['grass']);
    k.patch('elaia', 'marble', [176, 196, 7, 4, -0.5], ['grass']);
    k.forest([80, 60, 8, 6, 0.3], [90, 200, 10, 6, 0], [230, 220, 8, 6, 0]);
    k.village([80, 168], 4);
    k.resource('stone', [214, 136], 3, 8);
    k.resource('food', [90, 180], 2, 12);
    k.piece('mountains/cairn', [154, 128], { r: 6, n: 2 });
    // fauna: wild horses on the downs, boars in the combes by the cove and the south
    k.lair('ibex', [110, 70], { as: 'wild horses' });
    k.lair('ibex', [120, 200], { as: 'wild horses' });
    k.lair('boar', [200, 160], { as: 'boars' });
    k.lair('boar', [60, 220], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
