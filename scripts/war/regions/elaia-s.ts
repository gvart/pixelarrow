/**
 * Cape of Winds (docs/WAR.md): a rocky goat cape, Elaia (N) inland, the Achelous Delta (E) along the coast, Elaia's
 * two other entries at the south ends of the side edges, the sea (S). Strategic purpose: a fortress over the Delta
 * approach, room on its slopes. Depth 1: boars in the scrub, brigands watching the Delta road from the steps.
 * Layout (Gemini reference shots/war/regions/proto/elaia-s.png): the cape climbs from the sea in four tiers on pale
 * limestone walls (h2 by the water, h4, h6, h8) to a wide flat summit (h10) with the ruined fort. Only two paths reach
 * the top: the road up from Elaia and the road down toward the Delta, each by ramps through every wall. A small sand
 * beach lies at the cape's foot in the south; goat terraces and scrub on the steps; the coast track joins Elaia's other
 * entries along the lowest tier, the claim point where it meets the Delta road.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

/** The tier at a unit point: distance from the summit, the steps wandering. */
const tier = (x: number, y: number) => {
  const d = Math.hypot(x - 100, (y - 84) * 1.15) + 8 * Math.sin(Math.atan2(y - 84, x - 100) * 4 + 1) + 4 * Math.sin(x / 11 + y / 19);
  return d < 34 ? 10 : d < 52 ? 8 : d < 82 ? 6 : d < 120 ? 4 : 2;
};

const def: RegionDef = {
  id: 'elaia-s',
  style: { dry: 0.1, trees: 0.4, bushes: 0.8 },
  build(k: Kit) {
    const N = k.entry('elaia'), E = k.entry('delta'), SW = k.entry('elaia-w'), SE = k.entry('elaia-e');
    k.fill(2);
    k.zone('elaia', () => 99);
    k.lift(tier, true);
    k.spot('fortress', [100, 84]);
    // the sea along the south, the beach at the cape's foot
    k.waterBody([128, 272, 240, 36, 0], { shore: 4, beach: 3.5, rough: 5 });
    k.waterBody([150, 238, 18, 6, 0.1], { shore: 2, beach: 3, rough: 2 });
    k.spot('beach', [150, 230]);
    k.patch('elaia', 'rossa', [120, 120, 60, 50, 0.3], ['grass'], undefined, 6);
    // roads: up from Elaia to the summit, down toward the Delta, ramps through the walls; the coast track
    const hub: Pt = [196, 170];
    k.road([N, [128, 20], [124, 36], [114, 52], [106, 70], [100, 84]], { w: 1.2, grade: 2, fill: true });
    k.road([[100, 84], [124, 98], [146, 116], [170, 142], hub, [222, 150], [244, 132], E], { w: 1.2, grade: 2, fill: true });
    k.road([SW, [30, 214], [70, 206], [110, 200], [150, 192], hub, [222, 200], [244, 212], SE], { w: 1.1, grade: 2, fill: true });
    k.road([[150, 192], [152, 210], [150, 226]], { w: 1, grade: 2 });
    // the ruined fort on the summit, the goats' terraces, scrub and pines
    k.piece('wall-ruin', [100, 84], { r: 12, n: 6, gap: 5 });
    k.piece('watchtower', [94, 78], { r: 4 });
    k.piece('watchtower', [108, 90], { r: 4 });
    k.piece('elaia/goats', [60, 140], { r: 10, n: 2 });
    k.piece('elaia/goats', [170, 80], { r: 10 });
    k.piece('elaia/shrine', [120, 60], { r: 6 });
    k.forest([40, 100, 14, 10, 0.4], [180, 60, 14, 10, -0.3], [60, 180, 16, 8, 0.2], [226, 100, 12, 10, 0]);
    k.resource('stone', [60, 60], 3, 10);
    k.resource('stone', [200, 100], 2, 10);
    k.resource('food', [60, 150], 2, 12);
    k.village([206, 130], 3);
    // fauna: brigands on the steps over the Delta road, boars in the scrub
    k.lair('bandit', [156, 104], { as: 'bandits' });
    k.lair('boar', [40, 104], { as: 'boars' });
    k.lair('boar', [60, 186], { as: 'boars' });
    k.lair('boar', [214, 96], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
