/**
 * Kleisoura Pass (docs/WAR.md): the one gap through the Iron Teeth, Dodona (W) to Skythia (E), Krios (N) and Eagle
 * Saddle (S) off it; one of the two tin sources. Strategic purpose: the chokepoint of the north and its tin.
 * Layout (Gemini reference shots/war/gemini/art2/kleisoura): four rock massifs leave a cross of passages. From the west
 * a valley (h2) narrows into the gorge, 10 tiles between rock walls, a torrent beside the road; deep below the gorge
 * mouth with a narrows and a ford. Archer ledges (h4) run along both gorge walls, 2 levels over the road: the north one
 * reached from the saddle, the south one by a stair from the valley. Out of the gorge the road climbs a switchback ramp to the saddle (h5) with the ruined fort (the claim
 * point) and the tin workings. East of the saddle a wooded valley falls to Skythia; an icy col climbs north to Krios;
 * a ramp road runs south to Eagle Saddle. Bandits hold the gorge, bears the east woods.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'kleisoura',
  style: { meadow: 0.2 },
  build(k: Kit) {
    k.fill(2);
    k.zone('mountains', () => 99);
    const W = k.entry('dodona-e'), E = k.entry('skythia-w'), N = k.entry('krios'), S = k.entry('saddle');
    // the east valley falls toward Skythia (h3 at the edge), the saddle stands at h5
    k.lift((x) => (x > 168 ? 3 : NaN));
    k.hill([150, 108, 30, 22, 0.2], 5, 3, 3);
    k.plateau([150, 104, 18, 12, 0.3], 5, { terrain: 'dirt' });
    k.spot('saddleFort', [150, 104]);
    // the four massifs; spurs pinch the gorge
    k.mountains([[-6, 70], [30, 62], [70, 76], [104, 70], [124, 40], [118, -6]], { width: 22, spurs: [[92, 97, 12, 6, 0.1]] });
    k.mountains([[262, 50], [220, 60], [186, 50], [158, 20], [162, -6]], { width: 22 });
    k.mountains([[-6, 170], [34, 168], [74, 150], [110, 160], [118, 200], [110, 262]], { width: 22, spurs: [[92, 133, 12, 6, -0.1]] });
    k.mountains([[262, 196], [224, 178], [190, 172], [176, 210], [172, 262]], { width: 22 });
    for (const b of [[20, 20, 70, 44, 0.3], [236, 20, 60, 40, -0.3], [20, 236, 70, 44, -0.3], [236, 240, 60, 40, 0.3], [92, 28, 18, 30, 0.2], [86, 184, 20, 26, -0.2], [180, 6, 14, 12, 0]] as const) k.rockMass([...b]);
    k.rockMass([90, 99, 22, 9, 0.05], { rough: 1.5 });
    k.rockMass([90, 130, 22, 9, -0.05], { rough: 1.5 });
    // archer ledges along the gorge walls, out of the rock
    k.plateau([86, 106, 22, 2.4, 0.04], 4, { terrain: 'dirt', rough: 0.6 });
    k.plateau([86, 123.5, 22, 2.4, -0.04], 4, { terrain: 'dirt', rough: 0.6 });
    k.spot('ledgeN', [84, 106]);
    k.spot('ledgeS', [84, 123.5]);
    // the torrent: shallow through the gorge, deep in the lower valley (narrows, ford)
    const T: [number, number][] = [[130, 128], [110, 120], [86, 116], [60, 118], [36, 110], [12, 118], [-6, 112]];
    k.river(T, { half: 1.4, deep: false, bed: 1, bank: 3 });
    k.river(T.slice(3), { half: 3.5, bed: 0, bank: 3, narrows: [[[40, 112], 2.4]], fords: [[18, 117]], name: 'torrent' });
    k.spot('gorge', [86, 114]);
    // roads: W up the gorge, the switchbacks to the saddle; the ledge paths from the saddle; E, N col, S ramp
    k.road([W, [16, 122], [40, 124], [64, 112], [88, 112], [112, 112], [126, 116]], { grade: 6 });
    k.road([[126, 116], [134, 126], [122, 132], [128, 140], [140, 136], [146, 124], [150, 112], [150, 104]], { fill: true, grade: 2 });
    k.road([[150, 104], [132, 100], [114, 104], [100, 106]], { w: 1.2, grade: 3 });
    k.road([[56, 120], [62, 122], [70, 123.5]], { w: 1.2, fill: true, grade: 2.5 });
    k.road([[150, 104], [176, 108], [204, 116], [230, 112], E], { grade: 5 });
    k.road([[150, 104], [144, 80], [138, 50], [136, 20], N], { pass: 5, grade: 4 });
    k.road([[150, 104], [156, 136], [146, 170], [142, 210], S], { pass: 5, grade: 4 });
    k.paint('snow', [138, 22, 14, 26, 0], { on: ['grass', 'dirt'], minH: 4 });
    // the east woods
    k.forest([208, 132, 28, 14, 0.1], [236, 92, 14, 10, 0.4], [44, 136, 16, 6, 0.2]);
    // resources (stone 1, tin 2), the ruined fort, cairns
    k.resource('tin', [160, 94], 3, 10);
    k.resource('tin', [140, 70], 2, 10);
    k.resource('stone', [190, 124], 2, 10);
    k.piece('wall-ruin', [144, 98], { r: 6, n: 3 });
    k.piece('mountains/watch-post', [158, 110], { r: 6 });
    k.piece('mountains/cairn', [136, 52], { r: 6, n: 2 });
    k.piece('mountains/rockfall', [70, 96], { r: 8, onRock: true, n: 2 });
    // fauna (bandits, bears) and the claim point at the fort
    k.lair('bandit', [66, 116], { as: 'bandits' });
    k.lair('bandit', [134, 136], { as: 'bandits' });
    k.lair('bear', [212, 132], { as: 'bears' });
    k.lair('bear', [234, 92], { as: 'bears' });
    k.claim([150, 104], 140);
  },
};
export default def;
