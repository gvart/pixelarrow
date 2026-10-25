/**
 * Westbank Vineyards (docs/WAR.md): vine terraces on the Great River's west bank, Elaia (W) above, Achelous Ford (E)
 * over the river, the Bacchae Hills (N) off it, Elaia's two other entries at the west edge's ends. Strategic purpose:
 * the River Road's west bridgehead and a breadbasket (olives, food). Depth 1: boars and wolves in the cypress.
 * Layout (Gemini reference shots/war/regions/proto/elaia-e.png; W-52 set pieces, ./setpieces.ts): the deep river fills
 * the east edge. The west two thirds are one great hillside rising toward the north-west corner in three curving
 * terraces behind stone retaining walls (each rolling up from h4, h9 and h13), vines in rows along their contours, olives on the top one with
 * the press and a farmhouse looking down on the river. At the water the walled bridgehead town (h2)
 * spreads either side of its paved square (W-03 keeps the road's band clear: the houses stand in two quarters north
 * and south of it), its jetty and a ruined old span beside the stone bridge that carries the River Road over the
 * narrows to the far bank. Two shallow side channels cut into the low ground either side of the town, fordable
 * on their sandbars. The road climbs the terraces west by ramps through the walls; a road north to the Bacchae.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { contourRows, massif, relief } from './setpieces.ts';

const def: RegionDef = {
  id: 'elaia-e',
  style: { dry: 0.35, trees: 0.06, bushes: 0.1 },
  build(k: Kit) {
    const W = k.entry('elaia'), E = k.entry('achelous'), N = k.entry('bacchae'), NW = k.entry('elaia-n'), SW = k.entry('elaia-s');
    k.fill(2);
    k.zone('elaia', () => 99);
    // the hillside: its foot curves from the north edge round past the town to the south-west corner, the crown in the north-west
    const hill = massif(k, {
      outline: [[-12, -12], [190, -12], [178, 50], [156, 104], [150, 150], [128, 200], [92, 236], [40, 268], [-12, 268]],
      crown: [[-12, -12], [50, -12], [58, 40], [40, 110], [16, 170], [-12, 190]],
      base: 2, tiers: 3, step: 3, wobble: 0.2,
    });
    // the hillside's relief over the massif's contours (setpieces.ts relief): each terrace rolls up four levels one level
    // at a time, its retaining wall 2-3 levels at the next terrace's edge (h4-6, h9-10, h13-15), the foot a wall off the
    // low ground; a bluff over the river north of the town
    relief(k, (x, y, s) => {
      const t = hill.t(x, y);
      if (t < 0) {
        return x > 150 && y + 6 * fbm(x, y, 8, s) < 70 ? 6 + 0.6 * fbm(x, y, 9, s + 3) : 2;
      }
      return 3 + 4 * t + 0.5 * fbm(x, y, 12, s + 1) + (t > 2 ? 0.8 * fbm(x, y, 5, s + 2) : 0);
    }, { cliffs: [[2.4, 4], [6.4, 8.6], [10.4, 12.6]] });
    k.lift((x) => (x > 244 ? 1 : NaN), true);
    k.lift((x, y) => (x > 164 && x < 212 && y > 78 && y < 182 ? 2 : NaN), true);
    // the Great River along the east edge, narrowing at the bridge; the side channels round the town
    k.river([[226, -6], [222, 40], [226, 90], [228, 128], [226, 170], [230, 220], [234, 262]], { half: 11, bed: 0, bank: 1, narrows: [[[228, 128], 2.8]], name: 'river' });
    k.river([[212, 70], [196, 92], [178, 100], [170, 110]], { half: 1.5, deep: false, bed: 1, bank: 1.5, name: 'channelN' });
    k.river([[214, 182], [196, 166], [178, 160], [168, 150]], { half: 1.5, deep: false, bed: 1, bank: 1.5, name: 'channelS' });
    // the bridgehead town: the square at h2 and its wall, gates west and east
    const hub: Pt = [186, 128];
    k.square(hub, 7, 2);
    // roads: the River Road over the bridge, up the terraces west; north to the Bacchae; the west edge's tracks
    k.road([hub, [206, 128], [228, 128], [250, 128], E], { w: 1.4, grade: 3, bridges: [[228, 128]], span: 8 });
    k.road([W, [30, 132], [62, 126], [96, 134], [128, 124], [150, 130], hub], { w: 1.4, grade: 2.4, fill: true });
    k.road([[150, 130], [146, 96], [140, 50], [132, 20], N], { w: 1.2, grade: 2.4, fill: true });
    k.road([[30, 132], [22, 90], [12, 56], NW], { w: 1.1, grade: 2.4 });
    k.road([[30, 132], [22, 176], [12, 206], SW], { w: 1.1, grade: 2.4 });
    k.spot('narrows', [228, 128]);
    k.spot('bridge', [228, 128]);
    // the terraces: vines on the two lower ones, olives on the top one, cypress and a shrine
    // (both along the walls as built, ./setpieces.ts contourRows, like Elaia's olive terraces)
    contourRows(k, (x, y) => { const n = hill.tier(x, y); return n >= 1 && n <= 2; }, { every: 1.6, margin: 1.2, soil: 'dirt' });
    contourRows(k, (x, y) => hill.tier(x, y) === 3 && Math.hypot(x - 44, y - 128) > 10, { every: 3, margin: 1.5, ids: ['elaia/olive-orchard', 'elaia/olive-tall'], gap: 3 });
    k.spot('olives', [34, 90]);
    k.forest([60, 20, 18, 8, 0.4], [70, 236, 18, 8, -0.3], [118, 128, 4, 10, 0]);
    k.resource('food', [92, 186], 3, 12);
    // the town: the agora on the square, houses inside the wall, the wall and its gates, the jetty; the press and the
    // farmhouse on the top terrace, the shrine on the middle one, a ruined span by the bridge
    k.agora(hub, 6.5, { temple: [196, 104] }); // the temple in the north quarter (the square lies in the road band)
    k.scatterTown(['house-a', 'house-b', 'workshop', 'house-a', 'cottage', 'storehouse'].map((id) => `elaia/town-${id}`), [190, 96], { n: 8, r1: 26, gap: 5 });
    k.scatterTown(['house-b', 'cottage', 'house-a', 'farm'].map((id) => `elaia/town-${id}`), [192, 162], { n: 6, r1: 24, gap: 5 });
    k.jetty([214, 150], 14);
    k.outskirts([44, 128], 3, 10, 30, ['olive-press', 'farm', 'cottage']);
    k.piece('elaia/shrine', [118, 100], { r: 6 });
    k.piece('wall-ruin', [214, 112], { r: 4, n: 2, gap: 3 });
    // fauna: boars in the vines, wolves in the cypress groves
    k.lair('boar', [96, 200], { as: 'boars' });
    k.lair('boar', [146, 60], { as: 'boars' });
    k.lair('wolf', [62, 22], { as: 'wolves' });
    k.lair('wolf', [70, 236], { as: 'wolves' });
    k.claim(hub, 140);
  },
};
export default def;
