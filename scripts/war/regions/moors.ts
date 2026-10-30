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

type Blob5 = [number, number, number, number, number];
import { pocketBoss } from './tiers.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief, type Massif } from './setpieces.ts';

/** An organic loop of n points round c, radii rx/ry, wobbled by w. */
const blob = (c: Pt, rx: number, ry: number, w: number[]): Pt[] => w.map((f, n) => { const a = (n / w.length) * 2 * Math.PI; return [c[0] + Math.cos(a) * rx * f, c[1] + Math.sin(a) * ry * f]; });

/** The bog's centre line: x over y. */
const bx = (y: number) => 176 - 0.42 * y + 8 * Math.sin(y / 19);

const def: RegionDef = {
  id: 'moors',
  style: { meadow: 0.3, dry: -0.2, trees: 0.06, bushes: 0.35, tufts: 0 },
  build(k: Kit) {
    const N = k.entry('dodona-e'), W = k.entry('dodona-s'), E = k.entry('saddle'), S = k.entry('erymanthos');
    k.fill(3);
    // the moors library (public/war/biomes/moors): heather over peat, black bog, granite walls, tors and standing stones
    k.zone('moors', () => 99);
    // the moor a tier over its rim, broken into hummocks and hags (one-level steps eased into slopes)
    relief(k, (x, y, s) => (Math.min(x, y, 256 - x, 256 - y) + 6 * Math.sin((x + y) / 17 + s) + 4 * fbm(x, y, 8, s) > 18 ? 4.7 : 2.2) + 0.7 * fbm(x, y, 22, s + 1) + 0.6 * fbm(x, y, 4.5, s + 2));
    // the tors (W-52 set pieces): an earth plinth off the moor, then sheer granite blocks (visual rock, PROMPTS_ART §50)
    // stacked to the crown, the big one filling the north-west; impassable granite stacks (Kit.tor) tower over the crowns
    const big = massif(k, { outline: blob([60, 56], 46, 40, [1, 0.9, 1.05, 0.85, 1, 1.1, 0.95, 1, 0.9, 1.05]), crown: blob([56, 52], 15, 12, [1, 1.1, 0.9, 1, 1.05, 0.95]), base: 5, tiers: 3, steps: [2, 3, 3], wobble: 0.3, skew: -0.6 });
    k.spot('bigTor', [62, 58]);
    // the big tor's relief over its contours (setpieces.ts relief): a three-level earth wall off the moor, then granite
    // walls of three and four levels between narrow ledges to the h15 crown
    relief(k, (x, y, s) => {
      const t = big.t(x, y);
      return t < 0 ? NaN : profile([[0, 7.4], [0.9, 8], [1, 11.4], [1.9, 12], [2, 14.4], [3, 15]], t) + 0.35 * fbm(x, y, 8, s);
    }, { cliffs: [[8, 11.4], [12, 14.4]] });
    const sw = massif(k, { outline: blob([50, 196], 28, 22, [1, 0.9, 1.1, 0.95, 1, 1.05, 0.9, 1]), crown: blob([52, 194], 9, 8, [1, 1.1, 0.9, 1, 1]), base: 5, tiers: 2, steps: [2, 2], wobble: 0.25, skew: -0.4 });
    const east = massif(k, { outline: blob([198, 150], 36, 32, [1, 0.95, 1.05, 0.9, 1, 1.1, 0.95, 1]), crown: blob([196, 150], 18, 16, [1, 1.05, 0.95, 1, 1.05, 1]), base: 5, tiers: 2, steps: [2, 2], wobble: 0.2 });
    k.spot('fortress', [196, 150]);
    // the lower tors: a three-level earth wall off the moor, a four-level granite wall to the rolling top (h12-13)
    // (the east tor's top flat at h12 for the fort, one way up)
    for (const [m, top, n] of [[sw, 12.8, 0.4], [east, 12.2, 0.15]] as [Massif, number, number][]) relief(k, (x, y, s) => {
      const t = m.t(x, y);
      return t < 0 ? NaN : profile([[0, 7.4], [0.9, 8], [1, 12], [2, top]], t) + n * fbm(x, y, 9, s);
    }, { cliffs: [[8, 12]] });
    // granite: the big and the south-west tors' upper blocks whole, the east tor's rim (its top heather round the fort)
    const ground = ['grass', 'forest', 'dirt'];
    // (granite on the cells at the lip of a wall of 3+ levels, so the walls are granite faces and the tops stay heather;
    // the south-west tor's small top and patches of the big tor's crown bare granite)
    const lip = (x: number, y: number) => {
      const h = k.height[k.at([x, y])];
      for (const d of [0.6, 1.2]) for (let a = 0; a < 8; a++) { const j = k.at([x + d * Math.cos(a * Math.PI / 4), y + d * Math.sin(a * Math.PI / 4)]); if (j >= 0 && k.height[j] <= h - 3) return true; }
      return false;
    };
    k.patchWhere('moors', 'rock', (x, y) => sw.t(x, y) >= 0.97 || ((big.t(x, y) >= 0.97 || east.t(x, y) >= 0.97) && lip(x, y)) || (big.t(x, y) >= 2.3 && fbm(x, y, 3, 91) > 0.4), ground);
    // the granite stacks: blocks of 5-6 m each, two or three high, the big tor's round its stone ring
    const stacks: [Blob5, [number, number][]][] = [
      [[44, 44, 4.2, 3.6, 0.4], [[0, 6], [1.2, 11], [2.4, 17]]],
      [[65, 42, 3.6, 3, 0.2], [[0, 6], [1.2, 12]]],
      [[45, 61, 3.2, 3, 0], [[0, 5], [1.2, 10]]],
      [[30, 42, 3, 2.6, 0.3], [[0, 5], [1.1, 10]]],
      [[52, 194, 6.5, 5.5, 0.3], [[0, 6], [1.6, 12], [3.2, 18]]],
      [[214, 138, 5, 4, 0.5], [[0, 6], [1.3, 12], [2.6, 17]]],
      [[182, 164, 3.5, 3, 0], [[0, 5], [1.2, 10]]],
      // outcrops on the open moor
      [[136, 64, 2.6, 2.2, 0], [[0, 4], [1.1, 8]]],
      [[26, 150, 3, 2.4, 0.6], [[0, 4], [1.1, 9]]],
      [[146, 238, 2.8, 2.2, 0.2], [[0, 4], [1.1, 8]]],
      [[236, 190, 3, 2.5, 0.4], [[0, 4], [1.1, 9]]],
      [[212, 36, 2.6, 2.2, 0], [[0, 4], [1.1, 8]]],
      [[108, 204, 2.6, 2, 0.8], [[0, 4], [1.1, 8]]],
    ];
    for (const [b, blocks] of stacks) k.tor(b, blocks, { rough: 1.6, joint: 0.8 });
    // the granite tors' own stacks (moors/tor-a, tor-b) on the crowns and shoulders, the big tor's ring of standing stones
    // (granite sprites at the feet of the rock stacks): clitter and talus round every stack
    for (const [x, y] of [[54, 40], [42, 52], [38, 44], [60, 62], [46, 196], [58, 200]] as const) k.piece('moors/tor-a', [x, y], { r: 2 });
    for (const [x, y] of [[72, 42], [40, 64], [44, 34], [30, 84], [92, 40], [24, 40], [222, 134], [176, 172], [222, 168], [64, 204], [40, 184], [36, 210], [184, 160], [214, 140], [180, 140]] as const) k.piece('moors/tor-b', [x, y], { r: 3, n: 2, gap: 3 });
    for (const [[x, y, rx]] of stacks) for (let n = 0; n < 4; n++) { const a = n * 1.7 + x; k.piece(n % 2 ? 'mountains/talus-granite' : 'mountains/boulder-field', [x + (rx + 1.8) * Math.cos(a), y + (rx + 1.6) * Math.sin(a)], { r: 1 }); }
    for (let n = 0; n < 9; n++) { const a = (n / 9) * 2 * Math.PI; k.piece('moors/standing-stone', [56 + 6 * Math.cos(a), 52 + 4 * Math.sin(a)], { r: 1 }); }
    // the bog: a broad black peat bog with pools all along its line, a spring stream out of it
    for (let y = -10; y <= 266; y += 16) k.paint('marsh', [bx(y), y, 22, 16, 0.6], { on: ['grass', 'dirt', 'forest'], rough: 6 });
    k.each((i) => { if (k.terrain[i] === 'marsh' && k.height[i] > 3) k.height[i] = 3; }); // the bog a level under the moor
    for (let y = 2; y <= 250; y += 11) {
      if (Math.abs(y - 126) < 9) continue; // the causeway's line stays dry
      const off = 9 * Math.sin(y * 1.7), big = (y * 13) % 3 === 0, c: [number, number] = [bx(y) + off, y];
      // black pools lying in the bog at its own level (no pits down to the sea's level)
      k.waterBody([c[0], c[1], big ? 6 : 3.5, big ? 4 : 2.5, (y % 7) / 7], { deep: false, rough: 1.2, bed: Math.min(3, k.height[k.at(c)]) });
    }
    // peat cuttings by the drovers' track: stacks of drying turves on the bare peat
    // peat cuttings by the drovers' track: rows of straight trenches a level into the moor, cut to the black peat, with
    // stacks of drying turves on the banks between them
    for (const [x, y, a] of [[62, 156, 0.4], [196, 70, -0.3], [204, 104, 0.2], [196, 198, 1.1]] as const) {
      const c = Math.cos(a), sn = Math.sin(a);
      k.each((i, ux, uy) => {
        const dx = ux - x, dy = uy - y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
        if (Math.abs(u) > 5.5 + 0.8 * Math.sin(v * 3) || Math.abs(v) > 5.2 || k.water[i] || k.terrain[i] === 'road' || k.terrain[i] === 'rock') return;
        if (Math.abs(((v + 5.2) % 2.6) - 1.3) < 0.62) { k.terrain[i] = 'dirt'; k.height[i] = Math.max(1, k.height[i] - 1); }
      });
      k.piece('moors/peat-stack', [x, y], { r: 5, n: 4, gap: 2 });
    }
    k.river([[bx(150) + 8, 150], [150, 176], [150, 214], [160, 262]], { half: 1, deep: false, bed: 3, bank: 0 });
    k.each((i) => { if (k.terrain[i] === 'sand') k.terrain[i] = 'grass'; }); // the stream's banks heather, not river sand
    // roads: Dodona's two meet at the claim point west of the bog; the causeway; on to the Saddle and Erymanthos;
    // the paths up the tors
    const hub: Pt = [94, 120];
    k.road([N, [124, 30], [112, 70], hub], { w: 1.3, grade: 3 });
    k.road([W, [30, 126], [60, 124], hub], { w: 1.3, grade: 3 });
    k.causeway([[bx(126) - 14, 126], [bx(126) + 14, 126]], 1.6, 4);
    k.road([hub, [bx(126) - 14, 126], [bx(126) + 14, 126], [176, 124], [214, 122], [236, 128], E], { w: 1.3, grade: 3 });
    k.road([[176, 124], [168, 170], [146, 210], [130, 236], S], { w: 1.3, grade: 3 });
    k.spot('causeway', [bx(126), 126]);
    k.road([[176, 124], [168, 136], [170, 150], [180, 154], [190, 152], [196, 150]], { w: 1, grade: 1.3 });
    k.road([hub, [96, 96], [86, 78], [74, 70], [62, 58]], { w: 1, grade: 1.3 });
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
