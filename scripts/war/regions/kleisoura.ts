/**
 * Kleisoura Pass (docs/WAR.md): the one gap through the Iron Teeth, Dodona (W) to Skythia (E), Krios (N) and Eagle
 * Saddle (S) off it; one of the two tin sources. Strategic purpose: the chokepoint of the north and its tin.
 * Layout (Gemini reference shots/war/gemini/art2/kleisoura): tall massifs fill the map; only the pass is open. From the
 * west a valley (h2, the torrent deep below the gorge mouth, a narrows and a ford) narrows into the gorge, 7-8 tiles
 * between archer ledges (h5) that run along both walls two levels over the road: the north one reached from the saddle,
 * the south one by a stair from the valley. Out of the gorge the road climbs a tight switchback in a notch between the
 * massifs to the saddle (h5): the ruined fort and its market court (the claim point), the tin mine in a side cleft cut
 * into the north-east massif beside it, bandits camped at its mouth. East of the saddle a defile between two massifs
 * falls to the wooded valley toward Skythia; an icy col climbs north to Krios (the second tin field on it); a ramp road
 * runs south to Eagle Saddle.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'kleisoura',
  style: { meadow: 0.2, trees: 0.45, bushes: 0.6 },
  build(k: Kit) {
    k.fill(2);
    k.zone('mountains', () => 99);
    const W = k.entry('dodona-e'), E = k.entry('skythia-w'), N = k.entry('krios'), S = k.entry('saddle');
    // the east valley falls toward Skythia (h3 at the edge), the saddle stands at h5
    k.lift((x) => (x > 168 ? 3 : NaN));
    k.hill([150, 104, 26, 20, 0.2], 5, 3, 3);
    k.plateau([150, 102, 17, 12, 0.3], 5, { terrain: 'dirt' });
    k.spot('saddleFort', [150, 102]);
    // the four chains; spurs pinch the gorge
    k.mountains([[-6, 70], [30, 62], [70, 76], [104, 70], [124, 40], [118, -6]], { width: 22, spurs: [[92, 97, 12, 6, 0.1]] });
    k.mountains([[262, 50], [220, 60], [186, 50], [158, 20], [162, -6]], { width: 22 });
    k.mountains([[-6, 170], [34, 168], [74, 150], [110, 160], [118, 200], [110, 262]], { width: 22, spurs: [[92, 133, 12, 6, -0.1]] });
    k.mountains([[262, 196], [224, 178], [190, 172], [176, 210], [172, 262]], { width: 22 });
    for (const b of [[20, 20, 70, 44, 0.3], [236, 20, 60, 40, -0.3], [20, 236, 70, 44, -0.3], [236, 240, 60, 40, 0.3], [92, 28, 18, 30, 0.2], [86, 184, 20, 26, -0.2], [180, 6, 14, 12, 0]] as const) k.rockMass([...b]);
    // the massifs that close the old crossroads: north-east of the saddle (the tin cleft cut into it), south-east of
    // the switchback, the notch walls, the col's shoulders
    k.rockMass([194, 72, 30, 25, 0.3], { rough: 2 });
    k.rockMass([196, 150, 26, 27, -0.2], { rough: 2 });
    k.rockMass([108, 148, 12, 11, 0.2], { rough: 1.5 });
    k.rockMass([126, 64, 9, 12, 0.1], { rough: 1.5 });
    k.rockMass([162, 60, 8, 12, -0.1], { rough: 1.5 });
    k.rockMass([130, 196, 9, 34, 0.05], { rough: 1.5 });
    k.rockMass([128, 82, 9, 8, 0.2], { rough: 1.2 });
    k.rockMass([118, 140, 6, 6, 0], { rough: 1 });
    k.rockMass([178, 186, 8, 26, -0.1], { rough: 1.5 });
    k.rockMass([90, 103, 22, 6, 0.04], { rough: 1.2 });
    k.rockMass([90, 126, 22, 6, -0.04], { rough: 1.2 });
    // archer ledges along the gorge walls, out of the rock, two levels over the road
    k.plateau([86, 110, 22, 2.4, 0.04], 5, { terrain: 'dirt', rough: 0.5 });
    k.plateau([86, 118.6, 22, 2.4, -0.04], 5, { terrain: 'dirt', rough: 0.5 });
    k.spot('ledgeN', [84, 110]);
    k.spot('ledgeS', [84, 118.6]);
    // the tin cleft: a dead-end cut at the saddle's level into the north-east massif
    k.plateau([176, 88, 13, 4.5, -0.5], 5, { terrain: 'dirt', rough: 0.8 });
    k.spot('tinCleft', [180, 84]);
    // the torrent: deep in the lower valley (narrows, ford), shallow up to the gorge mouth
    const T: [number, number][] = [[66, 116], [52, 118], [36, 125], [18, 134], [-6, 142]];
    k.river(T, { half: 1.4, deep: false, bed: 1, bank: 3 });
    k.river(T.slice(1), { half: 3.5, bed: 0, bank: 3, narrows: [[[20, 133], 2.4]], fords: [[32, 121]], name: 'torrent' });
    k.spot('narrows', [88, 114.3]);
    k.square([150, 102], 6.5, 5);
    // roads: W up the gorge, the switchbacks to the saddle; the ledge paths; E down the defile, N col, S ramp
    k.road([W, [20, 113], [44, 112.5], [64, 113.5], [88, 114.3], [110, 114], [122, 118]], { grade: 6, w: 1.3 });
    k.road([[122, 118], [132, 124], [120, 130], [128, 138], [140, 132], [134, 124], [144, 116], [150, 108], [150, 102]], { fill: true, grade: 2, w: 1.3 });
    k.road([[150, 102], [132, 100], [114, 106], [100, 109]], { w: 1.2, grade: 3 });
    k.road([[56, 120], [64, 122], [72, 119.5]], { w: 1.2, fill: true, grade: 2 });
    k.road([[150, 102], [176, 106], [204, 112], [230, 112], E], { grade: 5 });
    k.road([[150, 102], [144, 80], [142, 50], [136, 20], N], { pass: 5, grade: 4 });
    k.road([[150, 102], [158, 136], [152, 170], [142, 210], S], { pass: 5, grade: 4 });
    k.road([[160, 96], [170, 90], [178, 86]], { w: 1.1, grade: 2 });
    k.paint('snow', [140, 22, 14, 26, 0], { on: ['grass', 'dirt'], minH: 4 });
    // the east woods
    k.forest([224, 128, 18, 10, 0.1], [240, 92, 12, 10, 0.4], [44, 136, 16, 6, 0.2]);
    // resources (stone 1, tin 2): the cleft's mine, the col's field; the ruined fort, cairns
    k.resource('tin', [182, 84], 4, 7);
    k.resource('tin', [142, 66], 2, 8);
    k.resource('stone', [214, 116], 2, 10);
    k.piece('wall-ruin', [142, 96], { r: 6, n: 3 });
    k.piece('mountains/watch-post', [160, 110], { r: 5 });
    k.piece('mountains/cairn', [138, 52], { r: 6, n: 2 });
    k.piece('mountains/rockfall', [70, 98], { r: 8, onRock: true, n: 2 });
    // fauna (bandits in the gorge and at the mine, bears in the east woods) and the claim point at the fort
    k.lair('bandit', [66, 116], { as: 'bandits' });
    k.lair('bandit', [172, 92], { as: 'bandits' });
    k.lair('bear', [222, 128], { as: 'bears' });
    k.lair('bear', [238, 92], { as: 'bears' });
    k.claim([150, 102], 140);
  },
};
export default def;
