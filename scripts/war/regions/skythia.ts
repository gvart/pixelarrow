/**
 * Skythia, alliance home NE (docs/WAR.md): open grass steppe on a low plateau, burial mounds, horses.
 * Layout: the plateau (h3) is wide open horse country; a shallow river winds west to east across its south in a
 * shallow valley (h2), deep in its eastern reach with a narrows a bridge can span, one ford in the west. The wagon town
 * (home camp, market) stands on the north bank; the great kurgan beside it (h4, broad top) is the fort site, and smaller
 * mounds (h4 lookouts) stud the plain. A dry gully with cliff walls (h1) runs from the north edge down to the river west
 * of the town: the west road drops into it and climbs out (the ambush spot), so riders from the west must pass it.
 * Art: no steppe library yet: global grass with Elaia dry-grass zones (golden steppe) and a mountains meadow zone; sparse
 * scatter; cairns on the mounds.
 */
import { fbm, type Kit, type RegionDef } from './kit.ts';

const MOUNDS: [number, number, number][] = [[60, 60, 6], [92, 40, 5], [176, 64, 7], [206, 92, 5], [222, 40, 6], [40, 212, 6], [110, 226, 5], [186, 226, 7], [228, 214, 5], [150, 96, 5], [22, 96, 5]];

const def: RegionDef = {
  id: 'skythia',
  style: { dry: 0.3, dryHigh: false, meadow: -0.2, trees: 0.25, bushes: 0.5 },
  build(k: Kit) {
    k.fill(3);
    // long swells (h4) and hollows (h2) on the plateau
    k.lift((x, y, s) => { const n = fbm(x, y, 40, s) + 0.3 * fbm(x, y, 9, s + 1); return n > 0.32 ? 4 : n < -0.38 ? 2 : 3; }, true);
    k.zone('elaia', [80, 70, 70, 46, 0.3], 10);
    k.zone('elaia', [190, 222, 60, 30, -0.2], 10);
    k.zone('mountains', [214, 70, 40, 34, 0.5], 8);
    // kurgans: the great one by the town (fort site) and the lookouts
    k.hill([150, 128, 13, 10, 0.3], 5, 5, 1.5);
    k.spot('fortSite', [150, 127]);
    MOUNDS.forEach(([x, y, r], n) => { k.hill([x, y, r, r * 0.8, 0], 5, 3, 1); k.spot(`lookout${n}`, [x, y]); });
    // the river in its valley: shallow, deep in the east reach (narrows), a ford in the west
    const RIVER: [number, number][] = [[-6, 176], [30, 166], [62, 184], [98, 170], [128, 186], [160, 172], [194, 190], [228, 178], [262, 188]];
    k.river(RIVER, { half: 3, deep: false, bed: 1, bank: 9 });
    k.river(RIVER.slice(4), { half: 4.5, bed: 1, bank: 9, narrows: [[[176, 180], 2.6]], name: 'river' });
    k.spot('ford', [98, 170]);
    // the gully from the north edge to the river
    k.cut([[70, -6], [78, 28], [64, 62], [82, 98], [72, 134], [80, 168]], { h: 1, half: 4, t: 'dirt' });
    k.spot('gully', [74, 124]);
    // wagon town and market on the north bank
    k.square([124, 150], 7);
    k.spot('homeCamp', [124, 150]);
    // roads: W across the gully, N over the plain, E along the plateau, S over the ford
    k.road([[-4, 128], [30, 124], [56, 126], [74, 124], [92, 132], [110, 142], [124, 150]], { grade: 3 });
    k.road([[128, -4], [124, 40], [130, 90], [126, 150]]);
    k.road([[124, 150], [160, 148], [196, 136], [228, 130], [260, 128]]);
    k.road([[124, 150], [108, 162], [98, 170], [104, 200], [118, 230], [128, 260]]);
    // a few willows and poplar copses by the water, scrub in the gully
    k.forest([140, 196, 10, 4, 0.2], [44, 184, 9, 4, -0.2], [214, 196, 8, 4, 0.1], [236, 24, 10, 6, 0.4]);
    // resources (food 3, wood 1, stone 2, horses 3: no node art for horses) and set pieces
    k.resource('stone', [82, 80], 3, 10);
    k.resource('stone', [206, 92], 2, 12);
    k.resource('food', [150, 160], 2, 12);
    for (const [x, y] of MOUNDS) k.piece('mountains/cairn', [x, y], { r: 3 });
    k.piece('mountains/cairn', [150, 128], { r: 4, n: 2 });
    k.piece('mountains/watch-post', [176, 64], { r: 5 });
    k.piece('mountains/ibex', [214, 60], { r: 20 });
  },
};
export default def;
