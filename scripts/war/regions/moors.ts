/**
 * Grey Moors (docs/WAR.md): high moorland between the Iron Teeth and the west woods, Dodona's pocket: Teeth Foothills
 * (N) and Ladon Oakwood (W) in, Eagle Saddle (E) and Erymanthos Wood (S) on toward Omphalos. Strategic purpose: a
 * fortress of granite tors and a little iron. Depth 2: the Great Bear of the Moors (tier 1) in his den under the big
 * tor, on the bones of the first Dodonan army to march east; bears and wolves.
 * Layout (Gemini reference shots/war/regions/proto/moors.png; W-52 set pieces, ./setpieces.ts): the brown moor (h6-7)
 * stands on a three-level wall over its low rim (h3-4). Three great granite tors rise over it in stepped walls: the big one fills the
 * north-west (h8-9, h11-12, h14-15 tiers to a crown of granite stacks, moors/tor-a sprites) with its ring of standing stones on top and the bear's
 * cave at its foot; a lower one in the south-west (h8-9, h12-13); and the broad flat-topped east tor (h8-9, top h12-13, 30+ tiles
 * across) with one path up its walls, the fortress over the Saddle road, the iron at its foot. A black peat bog with
 * pools splits the moor from north-east to south-west; the one stone causeway carries the road over it. The roads from
 * Dodona's two entries meet west of the bog at the claim point; beyond the causeway they part for the Saddle and
 * Erymanthos.
 * Look (regions-look, PROMPTS_ART §49): the moors library (public/war/biomes/moors) over the whole region: heather over
 * peat, black bog, granite walls, granite tor stacks, standing stones, bog cotton, wind-bent hawthorns; no pine woods.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { pocketBoss } from './tiers.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief, type Massif } from './setpieces.ts';

/** An organic loop of n points round c, radii rx/ry, wobbled by w. */
const blob = (c: Pt, rx: number, ry: number, w: number[]): Pt[] => w.map((f, n) => { const a = (n / w.length) * 2 * Math.PI; return [c[0] + Math.cos(a) * rx * f, c[1] + Math.sin(a) * ry * f]; });

/** The bog's centre line: x over y. */
const bx = (y: number) => 176 - 0.42 * y + 8 * Math.sin(y / 19);

const def: RegionDef = {
  id: 'moors',
  style: { meadow: 0.3, dry: -0.2, trees: 0.06, bushes: 0.6, tufts: 0 },
  build(k: Kit) {
    const N = k.entry('dodona-e'), W = k.entry('dodona-s'), E = k.entry('saddle'), S = k.entry('erymanthos');
    k.fill(4);
    // the moors library (public/war/biomes/moors): heather over peat, black bog, granite walls, tors and standing stones
    k.zone('moors', () => 99);
    // the moor a tier over its rim
    relief(k, (x, y, s) => (Math.min(x, y, 256 - x, 256 - y) + 6 * Math.sin((x + y) / 17 + s) + 4 * fbm(x, y, 8, s) > 18 ? 6.3 : 3.2) + 0.7 * fbm(x, y, 22, s + 1)); // three-level walls over the rim
    // the brown heather over the moor
    // the tors (W-52 set pieces): stepped granite walls, the big one filling the north-west
    const big = massif(k, { outline: blob([60, 56], 52, 46, [1, 0.9, 1.05, 0.85, 1, 1.1, 0.95, 1, 0.9, 1.05]), crown: blob([56, 52], 13, 11, [1, 1.1, 0.9, 1, 1.05, 0.95]), base: 5, tiers: 3, steps: [2, 3, 3], wobble: 0.3 });
    k.spot('bigTor', [68, 62]);
    // the big tor's relief over its contours (setpieces.ts relief): a two-level wall off the moor, then three-level
    // granite walls between rolling tiers to the h14-15 crown
    relief(k, (x, y, s) => {
      const t = big.t(x, y);
      return t < 0 ? NaN : profile([[0, 8.4], [0.9, 9], [1, 11.4], [1.9, 12], [2, 14.2], [3, 15]], t) + 0.35 * fbm(x, y, 8, s);
    }, { cliffs: [[9, 11.4], [12, 14.2]] });
    const sw = massif(k, { outline: blob([50, 196], 30, 24, [1, 0.9, 1.1, 0.95, 1, 1.05, 0.9, 1]), crown: blob([52, 194], 10, 8, [1, 1.1, 0.9, 1, 1]), base: 5, tiers: 2, steps: [2, 2], wobble: 0.25 });
    const east = massif(k, { outline: blob([198, 150], 36, 32, [1, 0.95, 1.05, 0.9, 1, 1.1, 0.95, 1]), crown: blob([196, 150], 18, 16, [1, 1.05, 0.95, 1, 1.05, 1]), base: 5, tiers: 2, steps: [2, 2], wobble: 0.2 });
    k.spot('fortress', [196, 150]);
    // the lower tors: a two-level wall off the moor, a three-level granite wall to the rolling top (h12-13)
    for (const m of [sw, east] as Massif[]) relief(k, (x, y, s) => {
      const t = m.t(x, y);
      return t < 0 ? NaN : profile([[0, 8.4], [0.9, 9], [1, 12], [2, 12.8]], t) + 0.4 * fbm(x, y, 9, s);
    }, { cliffs: [[9, 12]] });
    // the granite tors' own stacks (moors/tor-a, tor-b) on the crowns and shoulders, the big tor's ring of standing stones
    // (granite sprites, not rock terrain: rock masses drew as smooth grey mountain cones): the big tor's crown a heap of
    // great stacks, the south-west tor's crown three, smaller stacks on the shoulders and the east tor's rim
    for (const [x, y] of [[46, 42], [54, 40], [50, 48], [42, 50], [58, 47], [47, 56], [38, 44], [52, 192], [46, 196], [56, 198]] as const) k.piece('moors/tor-a', [x, y], { r: 2 });
    for (const [x, y] of [[72, 42], [40, 64], [44, 34], [30, 84], [92, 40], [24, 40], [222, 134], [176, 172], [222, 168], [64, 204], [40, 184], [36, 210], [184, 160], [214, 140], [180, 140]] as const) k.piece('moors/tor-b', [x, y], { r: 3, n: 2, gap: 3 });
    for (let n = 0; n < 9; n++) { const a = (n / 9) * 2 * Math.PI; k.piece('moors/standing-stone', [68 + 6 * Math.cos(a), 60 + 4 * Math.sin(a)], { r: 1 }); }
    // the bog: a broad black peat bog with pools all along its line, a spring stream out of it
    for (let y = -10; y <= 266; y += 16) k.paint('marsh', [bx(y), y, 22, 16, 0.6], { on: ['grass', 'dirt', 'forest'], rough: 6 });
    k.each((i) => { if (k.terrain[i] === 'marsh' && k.height[i] > 5) k.height[i] = 5; }); // the bog a level under the moor
    for (let y = 2; y <= 250; y += 11) {
      if (Math.abs(y - 126) < 9) continue; // the causeway's line stays dry
      const off = 9 * Math.sin(y * 1.7), big = (y * 13) % 3 === 0, c: [number, number] = [bx(y) + off, y];
      // black pools lying in the bog at its own level (no pits down to the sea's level)
      k.waterBody([c[0], c[1], big ? 6 : 3.5, big ? 4 : 2.5, (y % 7) / 7], { deep: false, rough: 1.2, bed: Math.min(5, k.height[k.at(c)]) });
    }
    // peat cuttings by the drovers' track: stacks of drying turves on the bare peat
    for (const [x, y] of [[118, 100], [134, 142], [204, 104], [112, 176]] as const) { k.patch('moors', 'peat', [x, y, 7, 5, 0.3], ['grass']); k.piece('moors/peat-stack', [x, y], { r: 4, n: 3, gap: 2 }); }
    k.river([[bx(150) + 8, 150], [150, 176], [150, 214], [160, 262]], { half: 1, deep: false, bed: 5, bank: 1 });
    // roads: Dodona's two meet at the claim point west of the bog; the causeway; on to the Saddle and Erymanthos;
    // the paths up the tors
    const hub: Pt = [94, 120];
    k.road([N, [124, 30], [112, 70], hub], { w: 1.3, grade: 3 });
    k.road([W, [30, 126], [60, 124], hub], { w: 1.3, grade: 3 });
    k.causeway([[bx(126) - 14, 126], [bx(126) + 14, 126]], 1.6, 6);
    k.road([hub, [bx(126) - 14, 126], [bx(126) + 14, 126], [176, 124], [214, 122], [236, 128], E], { w: 1.3, grade: 3 });
    k.road([[176, 124], [168, 170], [146, 210], [130, 236], S], { w: 1.3, grade: 3 });
    k.spot('causeway', [bx(126), 126]);
    k.road([[176, 124], [168, 136], [170, 150], [180, 154], [190, 152], [196, 150]], { w: 1, grade: 1.3 });
    k.road([hub, [96, 96], [86, 78], [74, 70], [68, 62]], { w: 1, grade: 1.3 });
    // the standing stones on the big tor, cairns, the ruined shepherd's hut by the hub
    k.piece('mountains/cairn', [196, 150], { r: 9, n: 2, gap: 6 });
    k.piece('watchtower', [192, 146], { r: 4 });
    k.village([90, 150], 3);
    // the east tor's flat top round the watchtower: a fallen fort (stones, wall courses), heather and junipers, boulders
    for (const [n, [dx, dy]] of ([[-8, -6], [7, -8], [-10, 4], [9, 6], [0, 10], [-3, -11], [12, -1], [-13, -3]] as const).entries()) k.piece(['elaia/wall-fallen-stone', 'mountains/boulder-field', 'mountains/juniper', 'elaia/debris-stone'][n % 4], [196 + dx, 150 + dy], { r: 3, n: 2, gap: 2 });
    // the drovers' halt at the hub where Dodona's roads meet: goats, a cart, a fallen fold wall, junipers
    for (const [n, [dx, dy]] of ([[-6, -5], [6, -6], [-6, 6], [7, 5], [-9, 0]] as const).entries()) k.piece(['elaia/goats', 'elaia/handcart', 'elaia/wall-fallen-stone', 'mountains/juniper', 'elaia/goats'][n], [hub[0] + dx, hub[1] + dy], { r: 3, n: 2, gap: 2 });
    // iron at the east tor's foot, stone on the rim
    k.resource('iron', [160, 180], 3, 6);
    k.resource('stone', [40, 220], 3, 10);
    k.resource('stone', [230, 60], 2, 10);
    k.forest([220, 220, 18, 12, 0.3], [30, 30, 10, 8, 0], [140, 40, 12, 8, 0.4]);
    // the Great Bear's den at the big tor's east foot; bears by the iron and on the south tor, wolves on the rim
    pocketBoss(k, 'moor_bear', [84, 46]);
    k.lair('bear', [154, 186], { as: 'bears' });
    k.lair('bear', [82, 224], { as: 'bears' });
    k.lair('wolf', [220, 216], { as: 'wolves' });
    k.lair('wolf', [226, 56], { as: 'wolves' });
    k.lair('bear', [80, 60], { as: 'bears' });
    k.claim(hub, 180);
  },
};
export default def;
