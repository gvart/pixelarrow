/**
 * Krios Glacier (docs/WAR.md): the snow peaks at the north end of the Iron Teeth, between Dodona's Boreas Fjords (W)
 * and Skythia's Frost Steppe (E), Kleisoura (S) below. Strategic purpose: iron 2 and the Teeth coast crossing.
 * Layout: the peaks (impassable) wall the cold sea in the north and fill the corners. From the west a glacier tongue
 * (snow, slow) climbs from the coast heath to the icy col (h4), 4-6 tiles wide between two spurs, with a snow ledge (h6)
 * cut into the north wall over it for archers, reached from the col's east end. East of the col the road forks: down a
 * broad defile east to the steppe, and south into the valley that falls to Kleisoura. The richest ore field lies on a
 * shelf on the valley's west side, open to the valley (the ore stays in sight, no peak in front of it) with the cyclops
 * on it; a second field on the shoulder east of the col. Wolves on the heath and in the defile.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'krios',
  style: { meadow: 0.35, trees: 0.4, bushes: 0.6 },
  build(k: Kit) {
    const W = k.entry('dodona-n'), E = k.entry('skythia-n'), S = k.entry('kleisoura');
    k.fill(3);
    k.zone('mountains', () => 99);
    // the cold sea along the north edge
    k.waterBody([128, -36, 210, 52, 0], { shore: 4, beach: 2, rough: 7 });
    // the land rises from the heaths (h3) to the col (h4)
    k.hill([128, 112, 60, 30, 0], 4, 6, 3);
    // the peaks: the north wall over the sea, the central block, the south-west and south-east massifs, the corners
    k.rockMass([128, 50, 112, 36, 0], { rough: 4 });
    k.rockMass([50, 202, 66, 60, 0.1], { rough: 4 });
    k.rockMass([208, 202, 62, 58, -0.1], { rough: 4 });
    k.rockMass([244, 60, 30, 40, 0.3], { rough: 3 });
    k.rockMass([10, 60, 22, 34, -0.3], { rough: 3 });
    // the col's spurs: a 4-6 tile gap between them
    k.rockMass([98, 83, 8, 18.5, 0], { rough: 1, foot: 4 });
    k.rockMass([96, 134, 9, 30.5, 0], { rough: 1, foot: 4 });
    k.spot('narrows', [98, 102.5]);
    // the archer ledge (h6) on the north wall over the col, a stair up from the col's east end
    k.plateau([113, 89, 8, 2.6, 0.15], 6, { terrain: 'dirt', rough: 0.5 });
    k.spot('ledge', [111, 89]);
    k.road([[130, 104], [127, 96], [119, 90]], { w: 1.1, fill: true, grade: 1.6 });
    // the glacier tongue and the snowfields round the col
    k.paint('snow', [64, 104, 44, 18, -0.1], { on: ['grass', 'dirt'], minH: 3 });
    k.paint('snow', [112, 104, 16, 10, 0], { on: ['grass'], minH: 4 });
    k.paint('snow', [170, 92, 18, 10, 0.2], { on: ['grass'], minH: 4 });
    // roads: W up the glacier to the col; the fork E down the defile and S down the valley to Kleisoura
    k.road([W, [24, 128], [52, 112], [80, 104], [98, 102.5], [124, 104], [146, 110]], { w: 1.1, grade: 4 });
    k.road([[146, 110], [176, 112], [206, 120], [236, 128], E], { w: 1.4, grade: 4 });
    k.road([[146, 110], [140, 140], [132, 180], [130, 220], S], { w: 1.4, grade: 4 });
    // the ore shelves: the valley's west shelf (cyclops) and the shoulder east of the col
    k.hill([122, 178, 9, 7, 0.3], 4, 3, 1);
    k.paint('dirt', [122, 178, 7, 5, 0.3], { rough: 1 });
    k.road([[134, 186], [126, 180]], { w: 1, grade: 2 });
    k.spot('iron', [122, 178]);
    k.resource('iron', [122, 178], 6, 6);
    k.resource('iron', [170, 96], 3, 7);
    k.resource('stone', [150, 160], 2, 10);
    // pieces: cairns on the col, a ruined watch post at the fork, rockfall under the north wall
    k.piece('mountains/cairn', [88, 104], { r: 6, n: 2 });
    k.piece('mountains/watch-post', [152, 118], { r: 6 });
    k.piece('mountains/rockfall', [150, 84], { r: 8, onRock: true, n: 2 });
    k.piece('mountains/eagle-nest', [130, 76], { r: 10, onRock: true });
    k.forest([30, 132, 12, 8, 0.3], [226, 140, 12, 7, -0.2], [136, 236, 6, 10, 0.1]);
    // fauna: the cyclops on the ore shelf, wolves on the west heath and in the east defile
    k.lair('bear', [120, 184], { count: 10, as: 'cyclops' });
    k.lair('wolf', [36, 120], { as: 'wolves' });
    k.lair('wolf', [206, 132], { as: 'wolves' });
    k.claim([140, 146], 140);
  },
};
export default def;
