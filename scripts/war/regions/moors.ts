/**
 * Grey Moors (docs/WAR.md): high moorland between the Iron Teeth and the west woods, Dodona's pocket: Teeth Foothills
 * (N) and Ladon Oakwood (W) in, Eagle Saddle (E) and Erymanthos Wood (S) on toward Omphalos. Strategic purpose: a
 * fortress of granite tors and a little iron. Depth 2: the Great Bear of the Moors (tier 1) in his den under the big
 * tor, on the bones of the first Dodonan army to march east; bears and wolves.
 * Layout (Gemini reference shots/war/regions/proto/moors.png; W-52 set pieces, ./setpieces.ts): the brown moor (h6-7)
 * stands on a three-level wall over its low rim (h3-4). Three great granite tors rise over it in stepped walls: the big one fills the
 * north-west (h8-9, h11-12, h14-15 tiers to a crown of granite stacks) with its ring of standing stones on top and the bear's
 * cave at its foot; a lower one in the south-west (h8-9, h12-13); and the broad flat-topped east tor (h8-9, top h12-13, 30+ tiles
 * across) with one path up its walls, the fortress over the Saddle road, the iron at its foot. A black peat bog with
 * pools splits the moor from north-east to south-west; the one stone causeway carries the road over it. The roads from
 * Dodona's two entries meet west of the bog at the claim point; beyond the causeway they part for the Saddle and
 * Erymanthos.
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
  style: { meadow: 0.3, dry: -0.2, trees: 0.06, bushes: 0.5 },
  build(k: Kit) {
    const N = k.entry('dodona-e'), W = k.entry('dodona-s'), E = k.entry('saddle'), S = k.entry('erymanthos');
    k.fill(4);
    k.zone('elaia', () => 99); // the moor's dry brown grass
    k.zone('mountains', [60, 56, 50, 46, 0], 6);
    k.zone('mountains', [50, 196, 30, 24, 0], 6);
    k.zone('mountains', [198, 150, 36, 32, 0], 6);
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
    // the granite stacks of the crowns
    k.rockMass([50, 46, 10, 8, 0.4], { rough: 1.2, foot: 7 });
    k.rockMass([48, 192, 7, 5, 0.2], { rough: 1, foot: 7 });
    const sw = massif(k, { outline: blob([50, 196], 30, 24, [1, 0.9, 1.1, 0.95, 1, 1.05, 0.9, 1]), crown: blob([52, 194], 10, 8, [1, 1.1, 0.9, 1, 1]), base: 5, tiers: 2, steps: [2, 2], wobble: 0.25 });
    const east = massif(k, { outline: blob([198, 150], 36, 32, [1, 0.95, 1.05, 0.9, 1, 1.1, 0.95, 1]), crown: blob([196, 150], 18, 16, [1, 1.05, 0.95, 1, 1.05, 1]), base: 5, tiers: 2, steps: [2, 2], wobble: 0.2 });
    k.spot('fortress', [196, 150]);
    // the lower tors: a two-level wall off the moor, a three-level granite wall to the rolling top (h12-13)
    for (const m of [sw, east] as Massif[]) relief(k, (x, y, s) => {
      const t = m.t(x, y);
      return t < 0 ? NaN : profile([[0, 8.4], [0.9, 9], [1, 12], [2, 12.8]], t) + 0.4 * fbm(x, y, 9, s);
    }, { cliffs: [[9, 12]] });
    // granite stacks on the tors (rock): the big tor's crown ringed with them, others on the shoulders
    for (const b of [[72, 42, 6, 4, 0.4], [40, 64, 5, 5, 0], [44, 40, 5, 4, 0], [30, 84, 4, 3, 0.2], [92, 40, 4, 3, 0], [24, 40, 3, 4, 0], [222, 134, 4, 3, 0.2], [176, 172, 4, 3, 0], [222, 168, 4, 3, 0], [64, 204, 5, 4, 0], [40, 184, 4, 3, 0], [36, 210, 3, 3, 0]] as const) k.rockMass([...b], { rough: 0.8, foot: 7 });
    k.patch('mountains', 'gravel', [56, 52, 14, 12, 0.2], ['dirt', 'grass'], undefined, 10);
    // the bog: marsh with black pools along its line, a spring stream out of it
    for (let y = -10; y <= 266; y += 22) k.paint('marsh', [bx(y), y, 16, 14, 0.6], { on: ['grass', 'dirt'], rough: 5 });
    for (const y of [10, 46, 92, 160, 196, 238]) k.waterBody([bx(y) + ((y * 7) % 9) - 4, y, 5, 3, 0.5], { deep: true, shore: 1, beach: 0, rough: 1.2 });
    k.river([[bx(150) + 8, 150], [150, 176], [150, 214], [160, 262]], { half: 1, deep: false, bed: 5, bank: 1 });
    // roads: Dodona's two meet at the claim point west of the bog; the causeway; on to the Saddle and Erymanthos;
    // the paths up the tors
    const hub: Pt = [94, 120];
    k.road([N, [124, 30], [112, 70], hub], { w: 1.3, grade: 3 });
    k.road([W, [30, 126], [60, 124], hub], { w: 1.3, grade: 3 });
    k.causeway([[bx(126) - 14, 126], [bx(126) + 14, 126]], 1.6, 5);
    k.road([hub, [bx(126) - 14, 126], [bx(126) + 14, 126], [176, 124], [214, 122], [236, 128], E], { w: 1.3, grade: 3 });
    k.road([[176, 124], [168, 170], [146, 210], [130, 236], S], { w: 1.3, grade: 3 });
    k.spot('causeway', [bx(126), 126]);
    k.road([[176, 124], [168, 136], [170, 150], [180, 154], [190, 152], [196, 150]], { w: 1, grade: 1.3 });
    k.road([hub, [96, 96], [86, 78], [74, 70], [68, 62]], { w: 1, grade: 1.3 });
    // the standing stones on the big tor, cairns, the ruined shepherd's hut by the hub
    k.piece('mountains/cairn', [66, 60], { r: 7, n: 5, gap: 4 });
    k.piece('mountains/cairn', [196, 150], { r: 9, n: 2, gap: 6 });
    k.piece('watchtower', [192, 146], { r: 4 });
    k.village([90, 150], 3);
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
