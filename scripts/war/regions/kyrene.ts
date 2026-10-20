/**
 * Kyrene, alliance home SE (docs/WAR.md): an oasis town on a desert-edge river terrace, red cliffs to the east, copper.
 * Layout (Gemini reference shots/war/gemini/art2/kyrene-desert): a river winds north to south west of centre through a
 * green floodplain (h1, fields and palms) between desert terraces (h2); deep in its middle reach, with a narrows a
 * wooden bridge can span by the town and fords at both ends. West of it the dune sea (sand, dunes h3). East of the
 * town the oasis springs and the town (home camp) on the terrace; north-east of it a red butte (h4, one ramp) is the
 * fort site. The red escarpment (h5 mesa) closes the east; the east road climbs it through a narrow wadi canyon (the
 * ambush) whose cliff walls overlook the road. Copper ore under the cliffs.
 */
import { fbm, type Kit, type RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'kyrene',
  style: { dune: 0.15 },
  build(k: Kit) {
    k.fill(2);
    k.zone('kyrene', () => 99);
    // the dune sea west of the river and the sand east of it; the escarpment and its mesa (h5) in the east
    k.paint('sand', [22, 128, 70, 150, 0.1], { rough: 8 });
    k.paint('sand', [210, 130, 70, 150, 0], { rough: 8 });
    k.lift((x, y, s) => (x + 14 * fbm(x, y, 22, s) + 5 * fbm(x, y, 6, s + 1) > 200 ? 5 : NaN), true);
    k.paint('sand', [230, 128, 50, 140, 0], { on: ['grass'], minH: 5 });
    for (const b of [[30, 60, 12, 6, 0.4], [54, 96, 16, 6, 0.2], [24, 150, 14, 7, -0.3], [60, 200, 18, 6, 0.5], [40, 236, 12, 5, 0.1], [76, 30, 10, 5, 0.6]] as const) k.hill([...b], 3, 3, 2);
    // the river: shallow (half 3) from edge to edge, deep in the middle reach, a narrows by the town
    const RIVER: [number, number][] = [[96, -6], [104, 30], [92, 64], [102, 100], [120, 128], [114, 164], [96, 200], [108, 232], [112, 262]];
    k.river(RIVER, { half: 3, deep: false, bed: 0, bank: 7 });
    k.river(RIVER.slice(3, 7), { half: 5, bed: 0, bank: 7, narrows: [[[118, 146], 2.6]], name: 'river' });
    k.spot('fordN', [96, 70]);
    k.spot('fordS', [100, 214]);
    // the oasis springs on the east terrace and the town by them
    k.oasis([152, 146], 3.6);
    k.oasis([166, 122], 2.4);
    k.square([140, 168], 7);
    k.spot('homeCamp', [140, 168]);
    // the red butte (fort site), a lone mesa on the floodplain's west side
    k.plateau([178, 96, 14, 10, 0.5], 4, { terrain: 'sand' });
    k.spot('fortSite', [178, 95]);
    k.plateau([62, 168, 9, 7, 0.2], 4, { terrain: 'sand' });
    // the wadi canyon through the escarpment (east road)
    k.cut([[186, 152], [204, 146], [220, 138], [238, 132]], { h: 2, half: 3.5, t: 'sand' });
    k.spot('wadi', [212, 142]);
    // roads: W over the north ford, N on the east terrace, E up the wadi, S to the coast; the butte ramp
    k.road([[-4, 126], [30, 120], [64, 104], [86, 82], [96, 70], [112, 82], [130, 112], [138, 140], [140, 168]]);
    k.road([[128, -4], [132, 30], [142, 66], [148, 100], [140, 140]]);
    k.road([[140, 168], [166, 160], [186, 152], [204, 146], [220, 138], [238, 132], [260, 128]], { grade: 3 });
    k.road([[140, 168], [136, 196], [130, 226], [128, 260]]);
    k.road([[158, 114], [166, 104], [172, 98]], { fill: true, grade: 2.5 });
    k.road([[100, 214], [118, 206], [134, 196]]);
    k.road([[186, 74], [166, 80], [146, 86]], { grade: 3 });
    // ground: red rock under the cliffs, salt and hardpan pans in the dunes, palms along the floodplain
    k.patch('kyrene', 'redrock', [200, 70, 10, 34, 0.1], ['sand']);
    k.patch('kyrene', 'redrock', [204, 200, 9, 30, -0.1], ['sand']);
    k.patch('kyrene', 'salt', [30, 190, 12, 7, 0.3], ['sand']);
    k.patch('kyrene', 'hardpan', [44, 30, 14, 8, 0.2], ['sand']);
    k.patch('kyrene', 'hardpan', [230, 230, 14, 9, 0.4], ['sand']);
    k.forest([86, 150, 8, 5, 0.6], [124, 42, 7, 4, 0.2], [92, 240, 7, 4, 0.4]);
    // resources (food 2, wood 1, stone 3, copper 3) and set pieces
    k.resource('copper', [192, 70], 3, 10);
    k.resource('copper', [196, 196], 2, 10);
    k.resource('copper', [56, 166], 1, 10);
    k.resource('stone', [186, 230], 3, 12);
    k.resource('dates', [154, 150], 4, 10);
    // the home agora and the town round it; gardens and presses toward the oasis
    k.agora([140, 168]);
    k.houses([140, 168], 18, 16, 40, ['house-a', 'house-b', 'storehouse', 'house-a', 'workshop', 'forge']);
    k.outskirts([140, 168], 4, 32, 54, ['olive-press', 'farm', 'cottage']);
    k.piece('kyrene/mesa', [72, 120], { r: 16 });
    k.piece('kyrene/butte', [36, 84], { r: 16 });
    k.piece('kyrene/rock-pillar', [74, 220], { r: 14, n: 2 });
    k.piece('kyrene/ruin-wall', [176, 92], { r: 6 });
    k.piece('kyrene/ruin-corner', [182, 100], { r: 6 });
    k.piece('kyrene/nomad-tent', [126, 176], { r: 10, n: 2 });
    k.piece('kyrene/well', [146, 176], { r: 8 });
    k.piece('kyrene/camels', [44, 112], { r: 20 });
    k.piece('kyrene/gazelle', [230, 60], { r: 20 });
  },
};
export default def;
