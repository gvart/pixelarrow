/**
 * Ammos Dunes (docs/WAR.md): the dune sea between Skythia (N) and Kyrene (S), the Ammon salt flats (E) and the Red
 * Canyons (W) off it. Strategic purpose: the Desert Road's caravanserai, a frontier market (season score); a buffer.
 * Layout: dunes (h1-3, slow sand) everywhere but on the road. Mid-map the oasis, the only water, with the caravanserai
 * beside it: a walled court (the square, the claim point) with tents, camels and a well. The Desert Road runs north to
 * south through it on hard reg; a second track leaves east over the hardpan and salt to Ammon, and a third climbs west
 * through a wadi in the west ridge to the Red Canyons. Two rocky ridges (h5-6, cliffed outside) flank the road, the raiders' lookouts
 * with lions in their clefts, so it is open ground between them with two ways round the oasis. Scorpions in the east
 * dunes; mesas and rock pillars stand in the sand.
 */
import { fbm, type Kit, type RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'ammos',
  style: { dune: 0.05, bushes: 0.7 },
  build(k: Kit) {
    const N = k.entry('skythia-s'), S = k.entry('kyrene-n'), E = k.entry('ammon'), W = k.entry('canyons');
    k.fill(1);
    k.zone('kyrene', () => 99);
    k.paint('sand', [128, 128, 200, 200, 0], { rough: 0 });
    // the dune swells: long crests running north-east, h2-3, lower toward the road
    k.lift((x, y, s) => {
      const u = x * 0.8 + y * 0.6, d = Math.abs(x - 124 - 8 * Math.sin(y / 30));
      const crest = Math.sin(u / 11 + 2 * fbm(x, y, 18, s)) + 0.6 * fbm(x, y, 9, s + 1);
      return d < 18 ? NaN : 1 + (crest > 0.35 ? 1 : 0) + (crest > 0.95 && d > 40 ? 1 : 0);
    });
    // the two rocky ridges flanking the road, cliffed on their outer side
    k.ridge([[60, 18], [72, 60], [64, 104], [72, 150], [60, 196], [70, 236]], { crest: 6, step: 2.5, top: 2, reach: 18, cliff: -1 });
    k.ridge([[196, 30], [184, 74], [194, 110]], { crest: 6, step: 2.5, top: 2, reach: 16, cliff: 1 });
    k.ridge([[192, 160], [182, 196], [196, 236]], { crest: 5, step: 2.5, top: 2, reach: 14, cliff: 1 });
    k.spot('ridge', [70, 118]);
    k.spot('lookoutE', [186, 80]);
    // the wadi through the west ridge toward the canyons
    k.cut([[96, 126], [70, 128], [44, 130], [20, 128]], { h: 1, half: 4, bank: 2, t: 'sand' });
    k.patch('kyrene', 'redrock', [46, 126, 12, 5, 0], ['sand']);
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
    // ground: hardpan round the court and and salt toward Ammon, red rock under the ridges
    k.patch('kyrene', 'hardpan', [134, 134, 16, 13, 0.3], ['sand']);
    k.patch('kyrene', 'hardpan', [214, 128, 26, 14, 0], ['sand']);
    k.patch('kyrene', 'salt', [236, 160, 14, 9, 0.3], ['sand']);
    k.patch('kyrene', 'redrock', [70, 60, 5, 18, 0.1], ['sand']);
    k.patch('kyrene', 'redrock', [190, 90, 5, 14, -0.2], ['sand']);
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
    k.piece('kyrene/mesa', [36, 46], { r: 16 });
    k.piece('kyrene/butte', [222, 52], { r: 14 });
    k.piece('kyrene/butte', [34, 214], { r: 14 });
    k.piece('kyrene/mesa', [226, 214], { r: 14 });
    k.piece('kyrene/rock-pillar', [160, 84], { r: 12, n: 2 });
    k.piece('kyrene/rock-pillar', [98, 186], { r: 12, n: 2 });
    k.piece('kyrene/gazelle', [212, 100], { r: 16 });
    // resources (food 2: dates at the oasis; stone 1 on the east ridge)
    k.resource('dates', [104, 118], 4, 9);
    k.resource('stone', [190, 70], 2, 10);
    // fauna: lions in the west ridge's clefts and the east ridge, scorpions in the dunes
    k.lair('jackal', [84, 70], { as: 'lions' });
    k.lair('jackal', [176, 190], { as: 'lions' });
    k.lair('jackal', [212, 168], { as: 'scorpions' });
    k.lair('jackal', [40, 176], { as: 'scorpions' });
    k.claim([130, 134], 160);
  },
};
export default def;
