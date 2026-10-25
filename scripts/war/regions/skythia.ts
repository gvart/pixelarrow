/**
 * Skythia, alliance home NE (docs/WAR.md): open grass steppe on a high chalk plateau, burial mounds, horses.
 * Layout (Gemini reference shots/war/regions/proto/skythia.png; W-52 set pieces, ./setpieces.ts relief): the plateau
 * (h8-10, long low swells) is wide open horse country over the upper three quarters; along its south side it ends in
 * one long chalk-white wall, two tiers (a four-level wall to a narrow ledge, a three-level wall to the valley), running
 * the whole way from the west edge to the east edge above the river. Below it a shallow river winds west to east in its
 * broad valley (h2), deep in its eastern reach with a narrows a bridge can span, one ford in the west. The wagon town
 * (home camp, market) stands packed on beaten earth on the plateau right above the wall; the great kurgan beside it (two stepped tiers on
 * earth walls to h15, a broad top ringed with cairns) is the fort site, and broad burial mounds (lookouts, four levels,
 * a cairn on each) stud the plain. A
 * deep dry gully with sheer chalk walls runs from the north edge down past the west of the town to the valley: the west
 * road drops into it and climbs out (the ambush spot), so riders from the west must pass it.
 * Art: no steppe library: global grass with Elaia dry-grass zones (golden steppe); the chalk wall and the gully in the
 * Elaia zone, so their faces are its pale limestone; the kurgan's walls the global earth; very sparse scatter, so the
 * town, the mounds and the kurgan stand out on open grass; cairns.
 */
import { fbm, type Kit, type RegionDef } from './kit.ts';
import { profile, relief } from './setpieces.ts';
import { curveField, spline } from '../shapes.ts';

const MOUNDS: [number, number, number][] = [[60, 60, 6], [92, 40, 5], [176, 64, 7], [206, 92, 5], [222, 40, 6], [40, 212, 6], [110, 226, 5], [186, 226, 7], [228, 214, 5], [150, 96, 5], [22, 96, 5]];

const def: RegionDef = {
  id: 'skythia',
  style: { dry: 0.3, dryHigh: false, meadow: -0.2, trees: 0.04, bushes: 0.01 },
  build(k: Kit) {
    k.fill(9);
    const RIVER: [number, number][] = [[-6, 176], [30, 166], [62, 184], [98, 170], [128, 186], [160, 172], [194, 190], [228, 178], [262, 188]];
    const GULLY: [number, number][] = [[70, -6], [78, 28], [64, 62], [82, 98], [72, 134], [80, 168]];
    // the chalk wall's line: about ten units above the river, straightened (the valley side of the town kept clear)
    const WALL: [number, number][] = [[-6, 158], [40, 158], [80, 162], [104, 160], [130, 168], [170, 164], [210, 172], [262, 174]];
    const wallY = (x: number) => profile(WALL, x);
    // the land: the plateau rolling in long swells (h9-10), the wall in two tiers down to the valley
    relief(k, (x, y, s) => {
      const t = y - wallY(x) + 3 * fbm(x, y, 9, s);
      let v = profile([[-8, 9], [0, 8.6], [1, 6], [5, 5.6], [6, 2.4], [80, 2]], t) + (t < 0 ? 1.2 * fbm(x, y, 40, s + 1) + 0.3 * fbm(x, y, 9, s + 2) : 0.4 * fbm(x, y, 20, s + 3));
      return v;
    }, { cliffs: [[2, 5], [5, 9]], jitter: 0.2 });
    // the kurgan by the town (fort site): two stepped tiers on steep walls, and the lookouts
    k.plateau([156, 120, 25, 21, 0.3], 12, { rough: 1.5 });
    k.plateau([156, 120, 14, 12, 0.3], 15, { rough: 1 });
    k.spot('fortSite', [150, 127]);
    MOUNDS.forEach(([x, y, r], n) => { k.hill([x, y, r + 5, (r + 5) * 0.85, 0], k.height[k.at([x, y])] + 4, 2, 0.6); k.spot(`lookout${n}`, [x, y]); });
    // the river in its valley: shallow, deep in the east reach (narrows), a ford in the west
    k.river(RIVER, { half: 3, deep: false, bed: 1, bank: 0.5 });
    k.river(RIVER.slice(4), { half: 4.5, bed: 1, bank: 0.5, narrows: [[[176, 180], 2.6]], name: 'river' });
    k.spot('ford', [98, 170]);
    // the gully from the north edge to the valley: sheer chalk walls six levels deep
    k.cut(GULLY, { h: 3, half: 4, t: 'dirt' });
    k.spot('gully', [74, 124]);
    // the chalk faces: the wall and the gully in the Elaia zone (pale limestone walls, its dry grass on the lips)
    const gf = curveField(spline(GULLY), k.W, k.H, 12, k.K);
    k.zone('elaia', (i, x, y) => Math.max(8 - Math.abs(y - wallY(x) - 2), 9 - gf.d[i]));
    k.zone('elaia', [80, 70, 70, 46, 0.3], 10);
    // wagon town and market on the north bank
    k.square([124, 150], 7);
    k.spot('homeCamp', [124, 150]);
    // roads: W across the gully, N over the plain, E along the plateau, S over the ford
    k.road([[-4, 128], [30, 124], [56, 126], [74, 124], [92, 132], [110, 142], [124, 150]], { grade: 3 });
    k.road([[128, -4], [124, 40], [130, 90], [126, 150]]);
    k.road([[124, 150], [160, 148], [196, 136], [228, 130], [260, 128]]);
    k.road([[124, 150], [108, 162], [98, 170], [104, 200], [118, 230], [128, 260]], { grade: 2.5 }); // down a ramp in the chalk wall
    k.road([[134, 146], [142, 136], [150, 127], [156, 120]], { w: 1, grade: 2 }); // the way up the kurgan
    // a few willows and poplar copses by the water, scrub in the gully
    k.forest([140, 196, 10, 4, 0.2], [44, 184, 9, 4, -0.2], [214, 196, 8, 4, 0.1], [236, 24, 10, 6, 0.4]);
    // resources (food 3, wood 1, stone 2, horses 3: no node art for horses) and set pieces
    k.resource('stone', [82, 80], 3, 10);
    k.resource('stone', [206, 92], 2, 12);
    k.resource('food', [150, 160], 2, 12);
    // the home agora and the town round it; farmsteads out on the steppe
    k.agora([124, 150]);
    // the wagon town packed close round its square on beaten earth, so it reads from afar
    k.paint('dirt', [124, 150, 17, 15, 0.2], { rough: 3 });
    k.houses([124, 150], 20, 14, 30, ['house-a', 'cottage', 'house-b', 'storehouse', 'workshop', 'cottage']);
    k.outskirts([124, 150], 6, 32, 60);
    for (const [x, y] of MOUNDS) k.piece('mountains/cairn', [x, y], { r: 3 });
    k.piece('mountains/cairn', [158, 118], { r: 3 });
    for (let a = 0; a < 12; a++) k.piece('mountains/cairn', [156 + 11 * Math.cos(a * 0.524), 120 + 9 * Math.sin(a * 0.524)], { r: 1.5 }); // the ring of stones
    k.piece('mountains/watch-post', [176, 64], { r: 5 });
    k.piece('mountains/ibex', [214, 60], { r: 20 });
  },
};
export default def;
