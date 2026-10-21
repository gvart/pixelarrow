/**
 * Grey Moors (docs/WAR.md): high moorland between the Iron Teeth and the west woods, Dodona's pocket: Teeth Foothills
 * (N) and Ladon Oakwood (W) in, Eagle Saddle (E) and Erymanthos Wood (S) on toward Omphalos. Strategic purpose: a
 * fortress of granite tors and a little iron. Depth 2: the Great Bear of the Moors (tier 1) in his den under the big
 * tor, on the bones of the first Dodonan army to march east; bears and wolves.
 * Layout (Gemini reference shots/war/regions/proto/moors.png): the moor (h5) stands a tier over its low rim (h4). Three
 * granite tors rise on stepped walls: the big one in the north-west (h7 skirt, h10 top) with its ring of standing
 * stones and the bear's cave at its foot; a lower one in the south-west; and the flat-topped east tor (h7, top h9,
 * 30+ tiles across) with one path up its skirt, the fortress over the Saddle road, the iron at its foot. A black peat
 * bog with pools splits the moor from north-east to south-west; the one stone causeway carries the road over it. The
 * roads from Dodona's two entries meet west of the bog at the claim point; beyond the causeway they part for the
 * Saddle and Erymanthos.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { pocketBoss } from './tiers.ts';

/** The bog's centre line: x over y. */
const bx = (y: number) => 176 - 0.42 * y + 8 * Math.sin(y / 19);

const def: RegionDef = {
  id: 'moors',
  style: { meadow: 0.5, trees: 0.25, bushes: 0.6 },
  build(k: Kit) {
    const N = k.entry('dodona-e'), W = k.entry('dodona-s'), E = k.entry('saddle'), S = k.entry('erymanthos');
    k.fill(4);
    k.zone('mountains', () => 99);
    // the moor a tier over its rim
    k.lift((x, y, s) => (Math.min(x, y, 256 - x, 256 - y) + 6 * Math.sin((x + y) / 17 + s) > 18 ? 5 : NaN));
    // the tors: stepped skirts and tops
    k.plateau([58, 54, 24, 19, 0.3], 7, { rough: 3 });
    k.plateau([56, 52, 13, 11, 0.2], 10, { rough: 1.5, terrain: 'dirt' });
    k.spot('bigTor', [56, 52]);
    k.plateau([52, 192, 15, 12, -0.3], 7, { rough: 2.5 });
    k.plateau([52, 192, 8, 6, 0], 8, { rough: 1 });
    k.plateau([196, 150, 24, 21, 0.2], 7, { rough: 3 });
    k.plateau([196, 150, 15, 14, 0.2], 9, { rough: 1.2 });
    k.spot('fortress', [196, 150]);
    // granite stacks on the tors' shoulders (rock)
    for (const b of [[72, 40, 4, 3, 0.4], [40, 66, 4, 4, 0], [214, 136, 4, 3, 0.2], [180, 166, 3, 3, 0], [62, 202, 3, 3, 0]] as const) k.rockMass([...b], { rough: 0.8, foot: 7 });
    k.patch('mountains', 'gravel', [56, 52, 14, 12, 0.2], ['dirt', 'grass'], undefined, 10);
    // the bog: marsh with black pools along its line, a spring stream out of it
    for (let y = -10; y <= 266; y += 22) k.paint('marsh', [bx(y), y, 16, 14, 0.6], { on: ['grass', 'dirt'], rough: 5 });
    for (const y of [10, 46, 92, 160, 196, 238]) k.waterBody([bx(y) + ((y * 7) % 9) - 4, y, 5, 3, 0.5], { deep: true, shore: 1, beach: 0, rough: 1.2 });
    k.river([[bx(150) + 8, 150], [150, 176], [150, 214], [160, 262]], { half: 1, deep: false, bed: 4, bank: 1 });
    // roads: Dodona's two meet at the claim point west of the bog; the causeway; on to the Saddle and Erymanthos;
    // the paths up the tors
    const hub: Pt = [94, 120];
    k.road([N, [124, 30], [112, 70], hub], { w: 1.3, grade: 3 });
    k.road([W, [30, 126], [60, 124], hub], { w: 1.3, grade: 3 });
    k.causeway([[bx(126) - 14, 126], [bx(126) + 14, 126]], 1.6, 5);
    k.road([hub, [bx(126) - 14, 126], [bx(126) + 14, 126], [176, 124], [214, 122], [236, 128], E], { w: 1.3, grade: 3 });
    k.road([[176, 124], [168, 170], [146, 210], [130, 236], S], { w: 1.3, grade: 3 });
    k.spot('causeway', [bx(126), 126]);
    k.road([[176, 124], [180, 132], [184, 136]], { w: 1, grade: 1.2, fill: true });
    k.road([[184, 136], [190, 140], [192, 144]], { w: 1, grade: 1.2, fill: true });
    k.road([hub, [80, 90], [74, 72], [70, 66]], { w: 1, grade: 1.2, fill: true });
    k.road([[70, 66], [64, 60], [60, 58]], { w: 0.9, grade: 1, fill: true });
    // the standing stones on the big tor, cairns, the ruined shepherd's hut by the hub
    k.piece('mountains/cairn', [56, 52], { r: 7, n: 5, gap: 4 });
    k.piece('mountains/cairn', [196, 150], { r: 9, n: 2, gap: 6 });
    k.piece('watchtower', [192, 146], { r: 4 });
    k.village([90, 150], 3);
    // iron at the east tor's foot, stone on the rim
    k.resource('iron', [170, 168], 3, 6);
    k.resource('stone', [40, 220], 3, 10);
    k.resource('stone', [230, 60], 2, 10);
    k.forest([220, 220, 18, 12, 0.3], [30, 30, 10, 8, 0], [140, 40, 12, 8, 0.4]);
    // the Great Bear's den at the big tor's east foot; bears by the iron and on the south tor, wolves on the rim
    pocketBoss(k, 'moor_bear', [84, 46]);
    k.lair('bear', [164, 174], { as: 'bears' });
    k.lair('bear', [62, 214], { as: 'bears' });
    k.lair('wolf', [220, 216], { as: 'wolves' });
    k.lair('wolf', [226, 56], { as: 'wolves' });
    k.lair('bear', [80, 60], { as: 'bears' });
    k.claim(hub, 180);
  },
};
export default def;
