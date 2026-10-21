/**
 * Ladon Oakwood (docs/WAR.md): old oak forest on the upper Ladon between Dodona (N) and Lake Stymphalia (S), the Grey
 * Moors (E) off it, Dodona's two other entries in the south-west and south-east. Strategic purpose: the Lake Road's
 * fords, herbs and timber. Depth 1: boars and wolves in the oaks.
 * Layout (Gemini reference shots/war/regions/proto/dodona-s.png; W-52 set pieces, ./setpieces.ts): the Ladon (deep,
 * sunk four levels under the oak plain (h5) between steep banks) comes in from the west and swings in a great loop round the middle of the map, leaving
 * east: inside the loop stands the oak hill, a two-tier mesa on earth cliffs (h8, the bare h11 top with the ruined watch
 * post) a third of the map across. The loop is crossed only at two fords far apart: the Lake Road's in the north-west
 * and the Moors road's in the east, joined on the south bank by a bank road; the hill's ramps climb from both. In the
 * north corner a stepped wooded hill (h7 to h11) looks over the Lake Road; west of the loop the river narrows between
 * rock banks at the old broken bridge (a bridge site). A woodcutters' and herb-gatherers' clearing with fields and
 * hives lies in the south corner by the river; the claim point at the crossroads south of the hill.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

const def: RegionDef = {
  id: 'dodona-s',
  style: { trees: 0.04, bushes: 0.08 },
  build(k: Kit) {
    const N = k.entry('dodona'), S = k.entry('stymphalia'), E = k.entry('moors'), SW = k.entry('dodona-w'), SE = k.entry('dodona-e');
    k.fill(5);
    k.zone('dodona', () => 99);
    // the oak hill in the loop: two tiers on earth cliffs, the bare crown
    massif(k, {
      outline: [[86, 92], [110, 70], [146, 68], [176, 84], [184, 118], [172, 152], [140, 166], [104, 160], [82, 132]],
      crown: [[116, 102], [142, 94], [160, 112], [150, 134], [122, 136]],
      base: 5, tiers: 2, steps: [3, 3], wobble: 0.12,
    });
    k.paint('dirt', [136, 116, 12, 10, 0.3], { on: ['grass'], minH: 11, rough: 2 });
    k.spot('hill', [136, 116]);
    // the stepped hill in the north corner over the Lake Road
    massif(k, {
      outline: [[-12, -12], [96, -12], [92, 18], [70, 40], [36, 56], [-12, 64]],
      crown: [10, 10], base: 5, tiers: 3, steps: [2, 2, 2], wobble: 0.2,
    });
    k.hill([214, 224, 30, 18, -0.3], 6, 4);
    // the Ladon's loop: deep, two fords and the broken bridge's narrows
    const L: Pt[] = [[-6, 128], [28, 110], [52, 80], [84, 56], [120, 46], [164, 50], [202, 70], [222, 106], [222, 146], [206, 180], [222, 204], [262, 214]];
    k.river(L, { half: 8, bed: 1, bank: 0.35, fords: [[84, 56], [222, 140]], fordHalf: 2.2, narrows: [[[36, 100], 2.6]], name: 'ladon' });
    k.spot('narrows', [84, 56]);
    k.spot('brokenBridge', [36, 100]);
    // roads: the Lake Road over the west ford and down the loop's west side, the Moors road over the east ford, the
    // bank road between; the south-west and south-east tracks; the ramps up the hill
    const hub: Pt = [124, 196];
    k.road([N, [116, 20], [96, 32], [80, 44], [84, 56], [90, 68], [84, 92], [72, 112], [70, 130], [92, 174], hub, [126, 226], S], { w: 1.3, grade: 3 });
    k.road([E, [240, 136], [222, 140], [196, 154], [176, 176], hub], { w: 1.2, grade: 3 });
    k.road([[116, 20], [160, 30], [210, 50], [238, 90], [244, 120], E], { w: 1.1, grade: 3 });
    k.road([hub, [80, 200], [40, 210], SW], { w: 1.1, grade: 3 });
    k.road([[176, 176], [196, 196], [230, 214], SE], { w: 1.1, grade: 3 });
    k.road([[70, 130], [88, 126], [104, 120], [124, 118], [136, 116]], { w: 1, grade: 1.4, fill: true });
    k.road([[176, 176], [166, 150], [152, 130], [140, 120]], { w: 1, grade: 1.4, fill: true });
    // the broken bridge's approaches end at its abutments
    k.road([[96, 32], [60, 64], [42, 92]], { w: 1, grade: 3 });
    k.road([[96, 32], [72, 30], [50, 26], [36, 28]], { w: 1, grade: 1.3, fill: true });
    k.road([[70, 130], [44, 120], [32, 108]], { w: 1, grade: 3 });
    k.piece('wall-ruin', [42, 96], { r: 8, n: 2, gap: 3 });
    k.piece('wall-ruin', [30, 108], { r: 8, n: 2, gap: 3 });
    // the oaks: the hill's flanks and the outer banks; the clearings by the roads stay open
    k.paint('forest', [134, 116, 54, 50, 0.2], { on: ['grass'], minH: 8, maxH: 8, rough: 5 });
    k.forest([40, 28, 44, 22, -0.6], [150, 18, 34, 12, 0], [236, 44, 20, 34, 0.2], [246, 170, 12, 26, 0], [26, 168, 24, 28, 0.3], [40, 240, 30, 16, -0.2], [186, 246, 30, 10, 0], [92, 238, 20, 14, 0.3], [192, 112, 10, 30, 0], [70, 170, 14, 12, 0.4]);
    // the clearing in the south corner: fields, hives and herbs, the woodcutters' hamlet
    k.fields([200, 232, 18, 12, -0.6], 0.5);
    k.piece('elaia/beehives', [168, 214], { r: 6, n: 2 });
    k.piece('elaia/herbs', [180, 222], { r: 8, n: 3 });
    k.resource('food', [198, 230], 4, 10);
    k.village([156, 214], 4);
    k.piece('dodona/timber-stand', [40, 34], { r: 12, n: 2 });
    k.piece('dodona/timber-stand', [228, 44], { r: 12, n: 2 });
    k.piece('dodona/charcoal-pile', [98, 214], { r: 6 });
    // the ruined watch post on the hill, the shrine by the Lake Road
    k.piece('watchtower', [138, 114], { r: 4 });
    k.piece('wall-ruin', [132, 122], { r: 5, n: 2, gap: 4 });
    k.piece('dodona/oak-sacred', [104, 24], { r: 8 });
    // fauna: boars in the hill oaks and south woods, wolves in the north woods
    k.lair('boar', [156, 92], { as: 'boars' });
    k.lair('boar', [40, 232], { as: 'boars' });
    k.lair('wolf', [36, 30], { as: 'wolves' });
    k.lair('wolf', [232, 40], { as: 'wolves' });
    k.claim(hub, 160);
  },
};
export default def;
