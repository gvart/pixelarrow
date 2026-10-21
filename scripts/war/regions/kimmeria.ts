/**
 * Kimmerian Hills (docs/WAR.md): rolling chalk hills, Skythia's pocket: the Teeth Eastern Slopes (N) and Kurgan Hills
 * (E) in, Eagle Saddle (W) and the Red Canyons (S) on toward Omphalos. Strategic purpose: a fortress (the hill fort)
 * and horses. Depth 2: the Griffin (tier 1) nesting in the fort's broken heart, keeping the vanished Kimmerians' gold;
 * bandits and wild horses on the slopes.
 * Layout (Gemini reference shots/war/regions/proto/kimmeria.png): one great hill north-west of the crossroads carries
 * the ruined fort: three tiers of ramparts stepping up it (h5, h7, top h9, 60+ tiles across) and one gate path winding
 * round it, a ramp through each rampart on a different side, so the top has one way up. Ruined round houses inside,
 * the griffin's nest in the middle. Two chalk streams wind through the hills either side; a chalk quarry is cut into a
 * south-east hillside; open grass slopes, a few hawthorns. The marble arm of the Sacred Way runs west-east below the
 * fort, the north-south road crosses it at the claim point.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { pocketBoss } from './tiers.ts';

const def: RegionDef = {
  id: 'kimmeria',
  style: { dry: 0.3, dryHigh: false, trees: 0.3, meadow: 0.3 },
  build(k: Kit) {
    const N = k.entry('skythia-w'), E = k.entry('skythia-s'), W = k.entry('saddle'), S = k.entry('canyons');
    k.fill(3);
    k.zone('elaia', () => 99);
    // rolling hills
    for (const b of [[210, 50, 34, 22, 0.3], [40, 210, 30, 24, -0.3], [210, 214, 30, 20, 0.4], [40, 50, 22, 18, 0], [150, 214, 20, 14, 0.2]] as const) k.hill([...b], 5, 6, 3);
    // the fort hill: three rampart tiers
    const F: Pt = [112, 100];
    k.plateau([F[0], F[1], 40, 34, 0.15], 5, { rough: 1.5 });
    k.plateau([F[0], F[1], 29, 24, 0.15], 7, { rough: 1 });
    k.plateau([F[0], F[1], 19, 16, 0.15], 9, { rough: 0.8 });
    k.spot('fortress', [F[0] + 2, F[1] - 2]);
    // the chalk streams, white banks; the quarry
    k.river([[60, -6], [56, 40], [36, 96], [30, 160], [-6, 214]], { half: 1.3, deep: false, bed: 2, bank: 2 });
    k.river([[262, 70], [214, 104], [196, 160], [214, 214], [226, 262]], { half: 1.3, deep: false, bed: 2, bank: 2 });
    k.patch('elaia', 'marble', [44, 90, 10, 50, 0.3], ['grass', 'sand']);
    k.patch('elaia', 'marble', [204, 150, 10, 50, -0.2], ['grass', 'sand']);
    k.basin([172, 222, 12, 8, 0.4], 3, 0, 1.5);
    k.patch('elaia', 'marble', [172, 222, 13, 9, 0.4], ['grass', 'dirt']);
    k.spot('quarry', [172, 222]);
    // roads: the Sacred Way west-east below the fort, the north-south road, the claim point at the crossing; the gate
    // path: a ramp through each rampart, the terraces between
    const hub: Pt = [150, 150];
    k.road([W, [30, 132], [80, 146], hub, [200, 136], [236, 128], E], { w: 1.4, grade: 3 });
    k.road([N, [136, 40], [162, 84], [162, 120], hub, [140, 196], [130, 236], S], { w: 1.3, grade: 3 });
    k.road([[162, 120], [158, 116], [152, 112]], { w: 1, grade: 1.2, fill: true });
    k.road([[152, 112], [148, 124], [130, 132], [102, 129]], { w: 1, grade: 3 });
    k.road([[102, 129], [101.5, 124], [101, 119]], { w: 1, grade: 1.2, fill: true });
    k.road([[101, 119], [92, 115], [88, 108]], { w: 1, grade: 3 });
    k.road([[88, 108], [91, 106], [96, 104]], { w: 1, grade: 1.2, fill: true });
    k.road([hub, [162, 186], [170, 214]], { w: 1, grade: 3 });
    // the fort: ruined round houses and its broken gate inside the top, the griffin in the nest at its heart
    k.piece('dodona/hut-ruin', [118, 92], { r: 10, n: 5, gap: 6 });
    k.piece('wall-ruin', [98, 104], { r: 4, n: 3, gap: 3 });
    k.piece('watchtower', [100, 98], { r: 4 });
    pocketBoss(k, 'griffin', [118, 98], 5);
    // the slopes: hawthorns, horse pasture, a herders' hamlet; stone from the quarry
    k.forest([60, 180, 8, 6, 0.3], [220, 80, 8, 6, 0], [170, 30, 6, 5, 0]);
    k.village([186, 104], 4);
    k.resource('stone', [172, 222], 3, 8);
    k.resource('food', [60, 200], 3, 12);
    // fauna: bandits on the road below the fort, wild horses on the open slopes
    k.lair('bandit', [92, 156], { as: 'bandits' });
    k.lair('bandit', [176, 60], { as: 'bandits' });
    k.lair('ibex', [46, 214], { as: 'wild horses' });
    k.lair('ibex', [214, 52], { as: 'wild horses' });
    k.lair('ibex', [206, 226], { as: 'wild horses' });
    k.claim(hub, 180);
  },
};
export default def;
