/**
 * Kurgan Hills (docs/WAR.md): rolling grass hills with burial mounds between Skythia (N) and the Ammos Dunes (S), the
 * Kimmerian Hills (W) off it, Skythia's two other entries at the south ends of the side edges. Strategic purpose: the
 * Desert Road's buffer and a breadbasket. Depth 1: wild horses on the grass, wolves in the gullies.
 * Layout (Gemini reference shots/war/regions/proto/skythia-s.png; W-52 set pieces, ./setpieces.ts): five chieftains'
 * kurgans dominate the map, each a great round grass mound (h10) on a broad cliff-rimmed bench (h6) some 60 units
 * across, ringed with stones; two of them stand right over the road. One long grassy ridge (h7) crosses the middle; the
 * Desert Road climbs over it through a cut saddle. Dry gullies with stony beds wind beside the road on both flanks
 * (ways for a flank march). In the south-east a brook runs down a valley with ploughed fields and the farm village;
 * the claim point at the saddle.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

/** A round loop of n points about c, radius r, wobbled. */
const round = (c: Pt, r: number, n = 9, wob = 0.12, ph = 0): Pt[] =>
  Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 + ph, f = 1 + wob * Math.sin(3 * a + ph * 5); return [c[0] + r * f * Math.cos(a), c[1] + r * f * Math.sin(a)] as Pt; });

const def: RegionDef = {
  id: 'skythia-s',
  style: { dry: 0.3, dryHigh: false, trees: 0.04, bushes: 0.06 },
  build(k: Kit) {
    const N = k.entry('skythia'), S = k.entry('ammos'), W = k.entry('kimmeria'), SW = k.entry('skythia-w'), SE = k.entry('skythia-e');
    k.fill(3);
    k.zone('elaia', [128, 128, 150, 150, 0], 12);
    // the ridge across the middle (the road cuts its saddle)
    k.ridge([[-6, 112], [50, 126], [100, 140], [160, 134], [210, 146], [262, 156]], { crest: 7, step: 3, top: 3, reach: 18, base: 3 });
    k.spot('ridge', [180, 138]);
    // the kurgans: a broad cliff-rimmed bench (h6), the round mound (h10) on it, stone rings round them
    const mounds: [Pt, number][] = [[[46, 44], 32], [[214, 52], 30], [[36, 206], 30], [[96, 100], 24], [[170, 184], 26]];
    mounds.forEach(([p, r], n) => {
      massif(k, { outline: round(p, r, 9, 0.14, n), crown: p, base: 3, tiers: 1, step: 3, wobble: 0.1 });
      massif(k, { outline: round(p, r * 0.55, 9, 0.06, n + 1), crown: p, base: 6, tiers: 4, step: 1, wobble: 0.08 });
      k.spot(`kurgan${n}`, p);
      k.piece('mountains/cairn', p, { r: r * 0.7, n: 4, gap: 6 });
    });
    // the gullies on both flanks of the road
    k.cut([[84, -6], [92, 30], [76, 64], [70, 130], [84, 170], [100, 230], [96, 262]], { h: 1, half: 2.4, bank: 0, t: 'dirt' });
    k.cut([[176, -6], [168, 30], [150, 80], [140, 120], [190, 150], [210, 150]], { h: 1, half: 2.2, bank: 0, t: 'dirt' });
    // the brook down the south-east valley
    k.basin([214, 214, 42, 26, 0.6], 2, 5, 4);
    k.river([[150, 222], [184, 218], [212, 220], [236, 232], [262, 240]], { half: 1.4, deep: false, bed: 1, bank: 3 });
    // roads: the Desert Road over the saddle, Kimmeria west, the side tracks; ramps up to the mounds
    const hub: Pt = [130, 136];
    k.road([N, [126, 30], [124, 70], [128, 104], hub, [128, 170], [120, 210], [126, 236], S], { w: 1.5, grade: 3 });
    k.road([hub, [90, 134], [40, 150], [14, 140], W], { w: 1.3, grade: 3 });
    k.road([[120, 210], [80, 238], [30, 244], SW], { w: 1.1, grade: 3 });
    k.road([[128, 170], [150, 214], [210, 236], [240, 226], SE], { w: 1.1, grade: 3 });
    k.road([[124, 70], [108, 92], [98, 100]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[126, 30], [90, 30], [64, 40], [48, 44]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[126, 30], [170, 34], [198, 46], [212, 52]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[128, 170], [154, 178], [168, 184]], { w: 0.9, grade: 1.4, fill: true });
    k.road([[80, 238], [56, 226], [38, 208]], { w: 0.9, grade: 1.4, fill: true });
    // the valley farms: fields by the brook, the village
    k.fields([214, 208, 22, 10, 0.25], 0.25);
    k.resource('food', [214, 208], 5, 14);
    k.village([206, 196], 5);
    k.resource('stone', [64, 76], 2, 10);
    k.piece('mountains/cairn', [130, 128], { r: 6 });
    k.forest([246, 120, 8, 6, 0.3], [12, 100, 7, 5, 0]);
    // fauna: wild horses on the open grass, wolves in the gullies
    k.lair('ibex', [76, 168], { as: 'wild horses' });
    k.lair('ibex', [236, 120], { as: 'wild horses' });
    k.lair('wolf', [80, 54], { as: 'wolves' });
    k.lair('wolf', [150, 90], { as: 'wolves' });
    k.claim(hub, 160);
  },
};
export default def;
