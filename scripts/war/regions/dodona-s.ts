/**
 * Ladon Oakwood (docs/WAR.md): old oak forest on the upper Ladon between Dodona (N) and Lake Stymphalia (S), the Grey
 * Moors (E) off it, Dodona's two other entries in the south-west and south-east. Strategic purpose: the Lake Road's
 * fords, herbs and timber. Depth 1: boars and wolves in the oaks.
 * Layout (Gemini reference shots/war/regions/proto/dodona-s.png): the Ladon (deep, sunk between low earth banks) comes
 * in from the west and bows north round a big oak hill in its bend, leaving east. It is crossed only at two fords far
 * apart: the Lake Road's in the north-west of the bend and the Moors road's in the east, joined on the south bank by a
 * bank road. The hill (h7, a ruined watch post on its bare top) and its spur (h6) over the Lake Road ford cover both.
 * West of the bend the river narrows between rock banks at the old broken bridge (a bridge site). A woodcutters' and
 * herb-gatherers' clearing with fields and hives lies by the east ford; the claim point at the crossroads south of the
 * hill.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'dodona-s',
  style: { trees: 0.9, bushes: 0.7 },
  build(k: Kit) {
    const N = k.entry('dodona'), S = k.entry('stymphalia'), E = k.entry('moors'), SW = k.entry('dodona-w'), SE = k.entry('dodona-e');
    k.fill(3);
    k.zone('dodona', () => 99);
    // the hill in the bend and its spur toward the west ford; low rises on the outer banks
    k.hill([146, 116, 28, 20, 0.3], 7, 3, 2);
    k.plateau([146, 116, 9, 7, 0.3], 7, { terrain: 'dirt', rough: 1.5 });
    k.hill([124, 96, 10, 8, 0.6], 6, 2, 1.5);
    k.spot('hill', [146, 116]);
    k.hill([60, 40, 30, 16, 0.4], 4, 4);
    k.hill([214, 220, 30, 18, -0.3], 4, 4);
    // the Ladon: deep, two fords and the broken bridge's narrows
    const L: Pt[] = [[-6, 170], [40, 150], [70, 100], [110, 76], [150, 72], [188, 94], [204, 124], [222, 156], [262, 176]];
    k.river(L, { half: 4.2, bed: 1, bank: 0.5, fords: [[110, 76], [204, 124]], fordHalf: 1.7, narrows: [[[55, 124], 2.6]], name: 'ladon' });
    k.spot('narrows', [110, 76]);
    k.spot('brokenBridge', [55, 124]);
    // roads: the Lake Road over the west ford past the hill's spur, the Moors road over the east ford, the bank road
    // between the fords, the north-bank road to the Moors, the south-west and south-east tracks
    const hub: Pt = [118, 168];
    k.road([N, [124, 30], [116, 56], [110, 76], [104, 104], [106, 140], hub, [124, 206], [128, 236], S], { w: 1.3, grade: 3 });
    k.road([E, [226, 120], [204, 124], [184, 140], [150, 154], hub], { w: 1.2, grade: 3 });
    k.road([[124, 30], [160, 40], [200, 60], [232, 96], [244, 124], E], { w: 1.1, grade: 3 });
    k.road([hub, [80, 186], [40, 204], SW], { w: 1.1, grade: 3 });
    k.road([[184, 140], [206, 180], [230, 206], SE], { w: 1.1, grade: 3 });
    k.road([[106, 140], [124, 132], [138, 122], [146, 116]], { w: 0.9, grade: 1.4, fill: true });
    // the broken bridge's approaches end at its abutments
    k.road([[124, 30], [80, 70], [58, 110]], { w: 1, grade: 3 });
    k.road([[80, 186], [70, 150], [60, 134]], { w: 1, grade: 3 });
    k.piece('wall-ruin', [52, 116], { r: 4, n: 2, gap: 3 });
    k.piece('wall-ruin', [60, 132], { r: 4, n: 2, gap: 3 });
    // the oaks: everywhere but the roads' clearings
    k.forest([40, 60, 34, 24, 0.3], [180, 30, 40, 18, -0.2], [236, 60, 18, 26, 0.2], [146, 116, 26, 18, 0.3], [40, 230, 30, 20, -0.4], [80, 160, 20, 14, 0.5], [180, 210, 22, 16, 0.2], [226, 240, 22, 14, 0], [150, 220, 16, 12, 0], [80, 230, 18, 16, 0.3], [30, 120, 18, 26, 0.2], [70, 20, 30, 12, 0], [236, 160, 14, 16, 0], [190, 120, 8, 10, 0.4], [30, 180, 14, 10, 0]);
    // the clearing by the east ford: fields, hives and herbs, the woodcutters' hamlet
    k.fields([196, 164, 13, 8, 0.5], 0.5);
    k.piece('elaia/beehives', [160, 182], { r: 6, n: 2 });
    k.piece('elaia/herbs', [172, 176], { r: 8, n: 3 });
    k.resource('food', [196, 164], 4, 10);
    k.village([150, 178], 4);
    k.piece('dodona/timber-stand', [64, 54], { r: 12, n: 2 });
    k.piece('dodona/timber-stand', [200, 40], { r: 12, n: 2 });
    k.piece('dodona/charcoal-pile', [100, 196], { r: 6 });
    // the ruined watch post on the hill, the shrine by the Lake Road
    k.piece('watchtower', [148, 114], { r: 4 });
    k.piece('wall-ruin', [144, 120], { r: 5, n: 2, gap: 4 });
    k.piece('dodona/oak-sacred', [96, 40], { r: 8 });
    // fauna: boars in the hill oaks and south woods, wolves in the north woods
    k.lair('boar', [160, 104], { as: 'boars' });
    k.lair('boar', [44, 226], { as: 'boars' });
    k.lair('wolf', [46, 58], { as: 'wolves' });
    k.lair('wolf', [190, 28], { as: 'wolves' });
    k.claim(hub, 160);
  },
};
export default def;
