/**
 * Achelous Ford (docs/WAR.md): the Great River at its widest between Elaia (W) and Kyrene (E), the Gorge (N) and the
 * Delta (S) off it; one of the two tin sources. Strategic purpose: the River Road's ford and bridge, a frontier market
 * (season score), tin.
 * Layout: the river comes down from the gorge in the north and splits round a long island, both arms deep. The bridge
 * town stands on the island (h2) round its square (the claim point). The east arm is spanned by the old stone bridge,
 * held by a toll post on the Kyrene bank; the west arm's span is broken (a bridge site at its narrows, rebuildable), so
 * from Elaia the River Road swings north to the one ford, 6 tiles wide, onto the island's head, where the tin is dug and
 * the river serpents lair. Bandits camp at the broken bridge. Below the island the arms join and leave south for the
 * Delta. The banks are reed marsh; the west bank is Elaia's (vines, cypress), the east bank Kyrene's (sand, palms).
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'achelous',
  style: { dry: 0.3, trees: 0.8 },
  build(k: Kit) {
    const N = k.entry('gorge'), S = k.entry('delta'), E = k.entry('kyrene-w'), W = k.entry('elaia-e');
    k.fill(1);
    k.zone('elaia', [10, 128, 70, 160, 0], 10);
    k.zone('kyrene', [250, 128, 76, 160, 0], 10);
    // terraces back from the river: the west bank's vineyard rise, the east bank's sandy bluffs
    k.lift((x, y, s) => (x + 10 * Math.sin(y / 31 + s) < 44 ? 2 : NaN));
    k.lift((x, y, s) => (x + 10 * Math.sin(y / 27 + s) > 206 ? 2 : NaN));
    k.paint('sand', [236, 128, 40, 150, 0], { rough: 8 });
    k.paint('marsh', [120, 128, 44, 140, 0.05], { rough: 12 });
    // the river: the trunk from the gorge, the two arms round the island, the trunk south to the delta
    k.river([[98, -6], [102, 22], [108, 44]], { half: 6, bed: 0, bank: 3 });
    k.river([[106, 40], [96, 62], [90, 92], [92, 122], [98, 156], [110, 190], [124, 214]], { half: 4.6, bed: 0, bank: 3, fords: [[95, 66]], fordHalf: 1.5, narrows: [[[91, 120], 2.6]], name: 'west' });
    k.river([[110, 40], [132, 66], [146, 98], [150, 130], [146, 166], [136, 196], [124, 214]], { half: 4.2, bed: 0, bank: 3 });
    k.river([[124, 210], [116, 236], [110, 262]], { half: 6, bed: 0, bank: 3 });
    // the long island: the town's rise, the head with the tin
    k.hill([120, 128, 16, 48, 0], 2, 4, 2);
    k.paint('grass', [120, 120, 17, 62, 0], { on: ['marsh'], rough: 3 });
    k.forest([114, 176, 7, 12, 0.2]);
    k.paint('dirt', [120, 128, 15, 22, 0], { rough: 3 });
    k.square([120, 130], 6.5, 2);
    k.spot('island', [118, 70]);
    k.spot('narrows', [95, 66]);
    k.spot('brokenBridge', [91, 120]);
    // roads: from Elaia to the broken bridge's abutment and round by the ford to the island head and the town; the old
    // bridge east to Kyrene; the east-bank roads north to the gorge and south to the delta
    k.road([W, [30, 124], [62, 120], [82, 120]], { w: 1.4 });
    k.road([[100, 121], [110, 126], [120, 130]], { w: 1.2 });
    k.road([[50, 122], [60, 96], [70, 74], [84, 67], [95, 66], [110, 66], [118, 86], [120, 110], [120, 130]], { w: 1.4 });
    k.road([[120, 130], [136, 130], [150, 130], [170, 128], [210, 128], E], { w: 1.5, bridges: [[150, 130]], span: 7 });
    k.road([[176, 128], [176, 92], [160, 56], [140, 24], N], { w: 1.3 });
    k.road([[180, 128], [172, 170], [150, 210], [134, 236], S], { w: 1.3 });
    k.spot('oldBridge', [150, 130]);
    // the banks: vines and cypress on the west rise, palms and tamarisk on the east, reed beds
    k.rows(['elaia/vines'], [26, 178, 16, 12, 0.3], { dx: 2, dy: 3 });
    k.rows(['elaia/vines'], [30, 72, 14, 10, -0.3], { dx: 2, dy: 3 });
    k.forest([40, 30, 18, 12, 0.3], [24, 232, 18, 10, -0.2], [214, 40, 14, 8, 0.2], [230, 214, 16, 10, 0.4]);
    k.patch('kyrene', 'hardpan', [226, 84, 12, 8, 0.2], ['sand']);
    k.oasis([214, 176], 2.2);
    // the town: houses and stalls round the square, the toll post and a watchtower at the old bridge
    k.piece('wall-ruin', [120, 130], { r: 14, n: 8, gap: 4 });
    k.piece('dodona/hut-ruin', [120, 130], { r: 16, n: 6, gap: 4 });
    k.piece('elaia/wall-a', [110, 144], { r: 6, n: 2 });
    k.piece('elaia/shrine', [126, 112], { r: 6 });
    k.piece('kyrene/nomad-tent', [130, 146], { r: 6 });
    k.piece('mountains/watch-post', [162, 122], { r: 6 });
    k.piece('watchtower', [104, 112], { r: 6 });
    // resources (food 1, tin 2): the tin diggings on the island head
    k.resource('tin', [116, 60], 5, 9);
    k.resource('food', [32, 176], 3, 12);
    // fauna: river serpents at the diggings, bandits at the broken bridge, serpents in the south reeds
    k.lair('boar', [124, 52], { as: 'river serpents' });
    k.lair('bandit', [70, 138], { as: 'bandits' });
    k.lair('boar', [150, 216], { as: 'river serpents' });
    k.claim([120, 130], 140);
  },
};
export default def;
