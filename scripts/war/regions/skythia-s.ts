/**
 * Kurgan Hills (docs/WAR.md): rolling grass hills with burial mounds between Skythia (N) and the Ammos Dunes (S), the
 * Kimmerian Hills (W) off it, Skythia's two other entries at the south ends of the side edges. Strategic purpose: the
 * Desert Road's buffer and a breadbasket. Depth 1: wild horses on the grass, wolves in the gullies.
 * Layout (Gemini reference shots/war/regions/proto/skythia-s.png): the land rolls in tiers (h3, h7 benches under cliffs); five
 * chieftains' kurgans crown the benches, round grass mounds (h11) ringed with stones, two of them right over the
 * road. One long grassy ridge (h7) crosses the middle; the Desert Road climbs over it through a cut saddle. Dry
 * gullies with stony beds wind beside the road on both flanks (ways for a flank march). In the south-east a brook
 * runs down a valley with ploughed fields and the farm village; the claim point at the saddle.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'skythia-s',
  style: { dry: 0.3, dryHigh: false, trees: 0.2, bushes: 0.15 },
  build(k: Kit) {
    const N = k.entry('skythia'), S = k.entry('ammos'), W = k.entry('kimmeria'), SW = k.entry('skythia-w'), SE = k.entry('skythia-e');
    k.fill(3);
    k.zone('elaia', [128, 128, 150, 150, 0], 12);
    // benches a tier up under the kurgans, rolling hills between
    const benches: [number, number, number, number, number][] = [[46, 44, 30, 22, 0.4], [214, 52, 28, 20, -0.3], [36, 206, 26, 22, 0.2], [96, 100, 20, 14, 0.5], [164, 178, 22, 16, -0.4]];
    for (const b of benches) k.plateau(b, 7, { rough: 4 });
    for (const b of [[180, 100, 30, 20, 0.3], [70, 150, 26, 18, -0.2], [220, 130, 20, 26, 0]] as const) k.hill([...b], 4, 5, 3);
    // the ridge across the middle (the road cuts its saddle)
    k.ridge([[-6, 112], [50, 126], [100, 140], [160, 134], [210, 146], [262, 156]], { crest: 7, step: 3, top: 3, reach: 18, base: 3 });
    k.spot('ridge', [180, 138]);
    // the kurgans: stepped grass mounds on the benches, stone rings round them
    const mounds: Pt[] = [[46, 44], [214, 52], [36, 206], [96, 100], [164, 178]];
    mounds.forEach((p, n) => {
      k.hill([p[0], p[1], 9, 8, 0.2], 10, 1.6, 1);
      k.plateau([p[0], p[1], 3.5, 3, 0], 11, { rough: 0.5 });
      k.spot(`kurgan${n}`, p);
      k.piece('mountains/cairn', p, { r: 9, n: 3, gap: 5 });
    });
    // the gullies on both flanks of the road
    k.cut([[84, -6], [92, 40], [80, 80], [84, 170], [100, 230], [96, 262]], { h: 0, half: 2.4, bank: 0, t: 'dirt' });
    k.cut([[176, -6], [168, 40], [160, 96], [184, 150], [190, 200]], { h: 0, half: 2.2, bank: 0, t: 'dirt' });
    // the brook down the south-east valley
    k.basin([206, 208, 40, 26, 0.6], 2, 5, 4);
    k.river([[150, 196], [180, 204], [208, 210], [236, 226], [262, 238]], { half: 1.4, deep: false, bed: 1, bank: 3 });
    // roads: the Desert Road over the saddle, Kimmeria west, the side tracks; ramps up the gully walls where they cross
    const hub: Pt = [130, 136];
    k.road([N, [126, 30], [124, 70], [128, 104], hub, [128, 170], [120, 210], [126, 236], S], { w: 1.5, grade: 3 });
    k.road([hub, [90, 134], [40, 126], [14, 128], W], { w: 1.3, grade: 3 });
    k.road([[120, 210], [70, 216], [30, 214], SW], { w: 1.1, grade: 3 });
    k.road([[128, 170], [170, 194], [210, 214], [240, 216], SE], { w: 1.1, grade: 3 });
    k.road([[124, 70], [104, 96], [98, 100]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[126, 30], [90, 34], [64, 42], [52, 44]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[126, 30], [170, 38], [198, 48], [208, 52]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[128, 170], [154, 176], [162, 178]], { w: 0.9, grade: 1.4, fill: true });
    // the valley farms: fields by the brook, the village
    k.fields([210, 196, 22, 10, 0.25], 0.25);
    k.resource('food', [210, 196], 5, 14);
    k.village([176, 214], 5);
    k.resource('stone', [60, 30], 2, 10);
    k.piece('mountains/cairn', [130, 128], { r: 6 });
    k.forest([240, 100, 10, 8, 0.3], [20, 80, 8, 6, 0]);
    // fauna: wild horses on the open grass, wolves in the gullies
    k.lair('ibex', [60, 170], { as: 'wild horses' });
    k.lair('ibex', [220, 110], { as: 'wild horses' });
    k.lair('wolf', [84, 60], { as: 'wolves' });
    k.lair('wolf', [182, 150], { as: 'wolves' });
    k.claim(hub, 160);
  },
};
export default def;
