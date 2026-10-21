/**
 * Ammos Dunes (docs/WAR.md): the dune sea between Skythia (N) and Kyrene (S), the Ammon salt flats (E) and the Red
 * Canyons (W) off it. Strategic purpose: the Desert Road's caravanserai, a frontier market (season score); a buffer.
 * Layout (W-52 set pieces): the west quarter is a cliff-rimmed red plateau (h4, h6), two great mesas (h4, h7) stand
 * east of the road with the Ammon track between them, broad stepped dune ridges (h1-4, slow sand) fill the sand. Mid-map the oasis, the only water, with the caravanserai
 * beside it: a walled court (the square, the claim point) with tents, camels and a well. The Desert Road runs north to
 * south through it on hard reg; a second track leaves east over the hardpan and salt to Ammon, and a third climbs west
 * through a sheer wadi cut in the west plateau to the Red Canyons. The plateau rim and the mesas flank the road, the
 * raiders' lookouts with lions in their clefts, so it is open ground between them with two ways round the oasis. Scorpions in the east
 * dunes; mesas and rock pillars stand in the sand.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

const def: RegionDef = {
  id: 'ammos',
  style: { dune: -0.45, trees: 0.4, bushes: 0.3 },
  build(k: Kit) {
    const N = k.entry('skythia-s'), S = k.entry('kyrene-n'), E = k.entry('ammon'), W = k.entry('canyons');
    k.fill(1);
    k.zone('kyrene', () => 99);
    k.paint('sand', [128, 128, 200, 200, 0], { rough: 0 });
    // W-52 set pieces (./setpieces.ts): the west is a cliff-rimmed red plateau (h4, h6) a quarter of the map wide,
    // its rim the raiders' lookout over the road; two great mesas (h4, h7) stand east of the road, the Ammon track
    // between them; broad stepped dune ridges fill the sand between
    massif(k, {
      outline: [[-12, -12], [58, -12], [76, 40], [66, 96], [80, 150], [66, 200], [78, 268], [-12, 268]],
      crown: [[-12, -12], [32, -12], [46, 60], [38, 130], [48, 200], [36, 268], [-12, 268]],
      base: 1, tiers: 2, steps: [3, 2], wobble: 0.25,
    });
    massif(k, { outline: [[172, 18], [212, 10], [236, 48], [222, 98], [186, 106], [168, 64]], crown: [[186, 34], [212, 30], [220, 60], [204, 86], [184, 74]], base: 1, tiers: 2, steps: [3, 3], wobble: 0.2 });
    massif(k, { outline: [[174, 162], [214, 152], [238, 196], [222, 244], [184, 240], [168, 200]], crown: [[188, 178], [212, 172], [222, 200], [210, 226], [188, 220]], base: 1, tiers: 2, steps: [3, 3], wobble: 0.2 });
    for (const d of [[[86, 30], [110, 18], [140, 26]], [[140, 60], [160, 46], [186, 130]], [[90, 160], [104, 150], [116, 176]], [[146, 182], [160, 170], [172, 150]], [[84, 214], [104, 206], [118, 236]], [[150, 236], [170, 250], [196, 252]], [[236, 120], [248, 140], [252, 170]]] as Pt[][])
      k.ridge(d, { crest: 3, step: 3, top: 3, reach: 12, base: 1 });
    k.spot('ridge', [70, 118]);
    k.spot('lookoutE', [186, 80]);
    // the wadi through the west ridge toward the canyons
    k.cut([[96, 126], [70, 128], [44, 130], [20, 128], [-6, 128]], { h: 1, half: 4, bank: 0, t: 'sand' });
    k.patch('kyrene', 'hardpan', [30, 128, 40, 140, 0], ['sand'], undefined, 6);
    k.patch('kyrene', 'redrock', [46, 128, 12, 6, 0], ['sand']);
    k.patch('kyrene', 'redrock', [204, 58, 34, 46, 0.2], ['sand'], undefined, 4);
    k.patch('kyrene', 'redrock', [204, 200, 34, 46, -0.2], ['sand'], undefined, 4);
    // the oasis and the caravanserai court beside it
    k.oasis([102, 118], 3.6);
    k.oasis([110, 104], 2.2);
    k.square([130, 134], 7, 1);
    k.spot('oasis', [102, 118]);
    // roads: the Desert Road N-S through the court; the tracks E to Ammon and W up the wadi
    k.road([N, [126, 30], [118, 70], [124, 104], [130, 134]], { w: 1.6, grade: 3 });
    k.road([[130, 134], [138, 170], [128, 214], S], { w: 1.6, grade: 3 });
    k.road([[130, 134], [160, 130], [200, 136], [232, 128], E], { w: 1.3, grade: 3 });
    k.road([[130, 134], [100, 128], [70, 128], [40, 130], W], { w: 1.3, grade: 3 });
    k.road([[112, 112], [120, 120], [126, 128]], { w: 1 });
    k.road([[176, 132], [170, 112], [178, 96], [190, 82]], { w: 1, grade: 1.4, fill: true });
    // the ways up: two ramps onto the west plateau (by the oasis and from the south road), one up the south mesa
    k.road([[110, 110], [96, 100], [82, 94], [66, 96], [50, 100]], { w: 1, grade: 1.5, fill: true });
    k.road([[134, 196], [110, 186], [90, 176], [74, 172], [56, 176]], { w: 1, grade: 1.5, fill: true });
    k.road([[138, 170], [160, 178], [174, 188], [190, 196]], { w: 1, grade: 1.4, fill: true });
    // ground: hardpan round the court and and salt toward Ammon, red rock under the ridges
    k.patch('kyrene', 'hardpan', [134, 134, 16, 13, 0.3], ['sand']);
    k.patch('kyrene', 'hardpan', [214, 128, 26, 14, 0], ['sand']);
    k.patch('kyrene', 'salt', [236, 160, 14, 9, 0.3], ['sand']);
    // the caravanserai: walls round the court, tents, camels, the well; caravan camps on the road
    // the caravanserai town: the agora, the walled market court south-east of it, houses, tents and camels round it
    k.agora([130, 134]);
    k.court(1);
    k.houses([130, 134], 12, 16, 34, ['house-a', 'storehouse', 'house-b', 'cottage', 'workshop']);
    k.outskirts([112, 118], 2, 8, 24, ['olive-press', 'cottage']);
    k.piece('kyrene/nomad-tent', [150, 120], { r: 8, n: 3 });
    k.piece('kyrene/camels', [150, 150], { r: 8, n: 2 });
    k.piece('kyrene/nomad-tent', [118, 60], { r: 10 });
    k.piece('kyrene/camels', [140, 200], { r: 10 });
    // mesas, buttes and pillars standing in the sand (cover), a gazelle herd
    k.piece('kyrene/butte', [100, 70], { r: 14 });
    k.piece('kyrene/mesa', [150, 220], { r: 14 });
    k.piece('kyrene/rock-pillar', [160, 84], { r: 12, n: 2 });
    k.piece('kyrene/rock-pillar', [98, 186], { r: 12, n: 2 });
    k.piece('kyrene/gazelle', [212, 100], { r: 16 });
    // resources (food 2: dates at the oasis; stone 1 on the east ridge)
    k.resource('dates', [104, 118], 4, 9);
    k.resource('stone', [196, 56], 2, 10);
    // fauna: lions in the west ridge's clefts and the east ridge, scorpions in the dunes
    k.lair('jackal', [88, 72], { as: 'lions' });
    k.lair('jackal', [164, 196], { as: 'lions' });
    k.lair('jackal', [244, 150], { as: 'scorpions' });
    k.lair('jackal', [100, 190], { as: 'scorpions' });
    k.claim([130, 134], 160);
  },
};
export default def;
