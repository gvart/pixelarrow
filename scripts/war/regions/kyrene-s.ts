/**
 * Southern Dunes (docs/WAR.md): a dune field down to the sea, Kyrene (N) inland, the Achelous Delta (W) along the
 * coast, Kyrene's two other entries at the south ends of the side edges. Strategic purpose: salt, the way to the
 * Delta's iron, and the only well. Depth 1: scorpions and lions; the dunes walk over everyone but the well-digger.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-s.png; W-52 set pieces): broad stepped dune ridges (h2-h4)
 * fill the open sand and slow everything. In the middle the great red mesa, a fifth of the map across, rises on sheer
 * walls (skirt h7, top h11) with the only well on its top, one path up its south face. A long low ridge of red rock (h6)
 * runs south-east across the dunes from it, the defensive line of the Delta way. The whole north is the desert
 * plateau's escarpment, two sandstone cliff tiers (h6, h9) over the dunes wrapping down the west edge, the Kyrene and
 * Delta roads cut down through it. The sea fills the south; a low sand bluff over the beach, and a salt crust in a hollow behind
 * it. The caravan track comes down from Kyrene to the outcrop's foot (the claim point) and on west to the Delta.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

const def: RegionDef = {
  id: 'kyrene-s',
  style: { dry: 0.1, trees: 0.1, bushes: 0.3 },
  build(k: Kit) {
    const N = k.entry('kyrene'), W = k.entry('delta'), SW = k.entry('kyrene-w'), SE = k.entry('kyrene-e');
    k.fill(2);
    k.zone('kyrene', () => 99);
    k.paint('sand', [128, 128, 200, 200, 0], { rough: 8 });
    // W-52 set pieces (./setpieces.ts): the desert plateau's escarpment across the whole north in two sandstone tiers
    massif(k, {
      outline: [[-12, -12], [268, -12], [268, 58], [214, 66], [176, 52], [138, 60], [96, 50], [62, 64], [50, 96], [36, 112], [-12, 110]],
      crown: [[-12, -12], [268, -12], [268, 18], [30, 22], [18, 70], [-12, 76]],
      base: 2, tiers: 2, steps: [4, 3], wobble: 0.3,
    });
    // the dunes: a few broad crescent ridges, stepped (each a level per 3 units), across the open sand
    for (const d of [[[178, 92], [214, 82], [246, 96]], [[18, 160], [50, 150], [74, 170]], [[160, 200], [196, 188], [238, 196]], [[84, 214], [112, 200], [138, 214]], [[186, 132], [222, 124], [252, 140]]] as Pt[][])
      k.ridge(d, { crest: 4, step: 3, top: 3, reach: 14, base: 2 });
    // the great red mesa in the middle: sheer skirt walls (h7), the flat top (h11) with the well
    massif(k, {
      outline: [[96, 80], [130, 70], [164, 84], [172, 116], [156, 146], [122, 150], [92, 136], [84, 108]],
      crown: [[110, 92], [140, 88], [154, 108], [142, 130], [114, 132], [102, 112]],
      base: 2, tiers: 2, steps: [5, 4], wobble: 0.15, top: 'dirt',
    });
    k.patch('kyrene', 'redrock', [128, 112, 46, 42, 0.3], ['sand', 'dirt'], undefined, 7);
    k.spot('outcrop', [126, 110]);
    // the long red ridge south-east from the mesa: the defensive line of the Delta way
    k.ridge([[160, 150], [186, 166], [210, 184], [236, 206]], { crest: 6, step: 1.5, top: 2.5, reach: 12, base: 2 });
    k.patch('kyrene', 'redrock', [198, 178, 46, 8, 0.65], ['sand'], undefined, 4);
    k.spot('ridge', [190, 170]);
    // the sea, the bluff and the salt hollow
    k.waterBody([128, 268, 220, 34, 0], { shore: 5, beach: 4, rough: 5 });
    k.basin([60, 214, 18, 9, 0.2], 1, 0, 2);
    k.patch('kyrene', 'salt', [60, 214, 18, 9, 0.2], ['sand']);
    k.spot('salt', [60, 214]);
    // roads: the caravan track down to the outcrop and west to the Delta, the path up, the side tracks, a haul track
    const hub: Pt = [128, 166];
    k.road([N, [128, 30], [100, 62], [78, 100], [80, 140], hub], { w: 1.3, grade: 2.4 });
    k.road([hub, [90, 160], [50, 136], [16, 128], W], { w: 1.3, grade: 3 });
    k.road([hub, [130, 156], [128, 146], [127, 136], [126, 124]], { w: 1, grade: 1.1, fill: true });
    k.road([hub, [100, 190], [60, 206], [24, 214], SW], { w: 1.1, grade: 3 });
    k.road([hub, [168, 196], [210, 218], [240, 216], SE], { w: 1.1, grade: 3 });
    // the well on the top; stone; dead thorn trees and dry grass
    k.piece('kyrene/well', [126, 112], { r: 4 });
    k.piece('kyrene/ruin-wall', [130, 104], { r: 5, n: 2, gap: 3 });
    k.resource('stone', [196, 186], 3, 8);
    k.piece('boulder-b', [60, 214], { r: 8, n: 2 });
    k.forest([70, 120, 6, 4, 0]);
    k.village([192, 108], 3);
    // fauna: scorpions in the salt hollow and the dunes, lions under the ridge
    k.lair('jackal', [66, 206], { as: 'scorpions' });
    k.lair('jackal', [70, 124], { as: 'scorpions' });
    k.lair('jackal', [214, 204], { as: 'lions' });
    k.lair('jackal', [220, 72], { as: 'lions' });
    k.claim(hub, 160);
  },
};
export default def;
