/**
 * Lion Savanna (docs/WAR.md): dry grass and acacia with rock kopjes, Kyrene's pocket: Thornscrub Rise (E) and the
 * Eastbank Floodplain (S) in, the Red Canyons (N) and the Gorge (W) on toward Omphalos. Strategic purpose: copper and
 * hides, and the kopjes as fortresses. Depth 2: the Lion of the Savanna (Nemean, tier 1), whose hide turns blades, in
 * his den under the great kopje; the lions' lair on the copper beside it.
 * Layout (Gemini reference shots/war/regions/proto/savanna.png; W-52 set pieces): a golden plain (h2) in the south
 * and east; the high veld fills the north and west, stepping down to it on two three-level walls (h5-6, h8-10). Three kopjes of
 * piled red-brown boulders stand over it on stepped walls: the great one in the west (skirt h11, flat top h14, 100+
 * tiles across, one way up from the south-east), the den at its foot and the copper crop beside it; a lower one in the north-west
 * and one in the east. A dry wash, a sunken sandy bed (h1) between low banks, winds north to south across the plain,
 * a hidden way past both roads; a muddy waterhole lies by it. The two roads cross at the claim point mid-plain.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief } from './setpieces.ts';
import { pocketBoss } from './tiers.ts';

const def: RegionDef = {
  id: 'savanna',
  style: { dry: -0.4, dryHigh: true, trees: 0.15, bushes: 0.2 },
  build(k: Kit) {
    const E = k.entry('kyrene-n'), S = k.entry('kyrene-w'), N = k.entry('canyons'), W = k.entry('gorge');
    k.fill(2);
    k.zone('kyrene', () => 99);
    // W-52 set pieces (./setpieces.ts): the high veld fills the north and west, stepping down to the plain in two
    // broad tiers; the kopjes stand on it and on the plain
    const veld = massif(k, {
      outline: [[-12, -12], [268, -12], [268, 34], [214, 56], [160, 46], [118, 66], [104, 112], [86, 150], [40, 168], [-12, 172]],
      crown: [[-12, -12], [150, -12], [116, 22], [70, 50], [36, 96], [-12, 110]],
      base: 2, tiers: 2, steps: [3, 3], wobble: 0.3,
    });
    // its relief over the massif's contours (setpieces.ts relief): the plain rolling a level, a three-level wall up to
    // the veld's rolling lower tier, a three-level wall to the upper one (h8-10)
    relief(k, (x, y, s) => {
      const t = veld.t(x, y);
      if (t < 0) return 2 + 0.7 * fbm(x, y, 24, s);
      return profile([[0, 5.2], [0.9, 6], [1, 8.4], [2, 9.8]], t) + 0.45 * fbm(x, y, 12, s + 1);
    }, { cliffs: [[2.8, 5.2], [6, 8.4]] });
    // the kopjes: stepped skirts, flat tops, boulder piles on their rims
    const K: [Pt, number, number, number, number][] = [[[62, 82], 30, 24, 11, 14], [[56, 30], 16, 12, 11, 13], [[212, 176], 22, 17, 6, 10]];
    K.forEach(([p, rx, ry, skirt, top], n) => {
      k.plateau([p[0], p[1], rx, ry, 0.3], skirt, { rough: 2.5 });
      k.plateau([p[0], p[1], rx * 0.72, ry * 0.75, 0.3], top, { rough: 1.2, terrain: 'dirt' });
      for (let a = 0; a < 6; a++) {
        const t = Math.PI * (0.8 + a * 0.27) + n * 0.9; // the boulder piles round the rim, the way up left open
        k.rockMass([p[0] + Math.cos(t) * rx * 0.86, p[1] + Math.sin(t) * ry * 0.86, 3.6, 3, t], { rough: 0.7, foot: skirt });
      }
      k.spot(`kopje${n}`, p);
    });
    k.spot('fortress', [62, 80]);
    k.patch('kyrene', 'redrock', [62, 82, 32, 26, 0.3], ['dirt', 'grass', 'sand'], undefined, 11);
    k.patch('kyrene', 'redrock', [56, 30, 18, 14, 0.3], ['dirt', 'grass', 'sand'], undefined, 11);
    k.patch('kyrene', 'redrock', [212, 176, 24, 19, 0.3], ['dirt', 'grass', 'sand'], undefined, 6);
    // the dry wash, north to south, and the waterhole by it
    const wash: Pt[] = [[176, -6], [168, 40], [140, 80], [150, 120], [124, 160], [96, 200], [80, 262]];
    k.cut(wash, { h: 1, half: 3.2, bank: 1.2, t: 'sand' });
    k.waterBody([138, 176, 7, 5, 0.3], { deep: false, beach: 1.5, rough: 1.5 });
    k.spot('wash', [150, 120]);
    k.spot('waterhole', [138, 176]);
    // roads: the two crossing at the claim point; the path up the great kopje from its south foot
    const hub: Pt = [126, 130];
    k.road([W, [30, 128], [80, 132], hub, [180, 126], [230, 128], E], { w: 1.3, grade: 3 });
    k.road([N, [124, 40], [118, 90], hub, [132, 180], [128, 236], S], { w: 1.3, grade: 3 });
    k.road([[92, 134], [88, 116], [78, 106], [66, 98], [62, 86]], { w: 1, grade: 1.3, fill: true });
    k.road([[124, 40], [94, 36], [74, 32], [60, 30]], { w: 1, grade: 1.3, fill: true });
    k.road([[180, 126], [184, 148], [188, 166], [198, 176], [208, 176]], { w: 1, grade: 1.3, fill: true });
    // copper beside the great kopje, stone on the east one
    k.resource('copper', [36, 120], 3, 5);
    k.spot('copper', [36, 120]);
    k.resource('stone', [212, 202], 2, 8);
    k.resource('food', [180, 220], 3, 14);
    // acacias and baobabs, the hunters' camp by the waterhole
    k.forest([180, 60, 8, 5, 0.3], [100, 210, 7, 5, 0], [200, 120, 6, 4, 0], [40, 180, 8, 6, 0.4], [230, 70, 6, 5, 0], [150, 230, 6, 4, 0]);
    k.village([160, 196], 3);
    // the Lion's den at the great kopje's south-east foot; the lions' lair on the copper; lions on the plain
    pocketBoss(k, 'savanna_lion', [94, 104], 5);
    k.lair('jackal', [34, 124], { as: 'Nemean lion', count: 10 });
    k.lair('jackal', [196, 76], { as: 'lions' });
    k.lair('jackal', [190, 200], { as: 'lions' });
    k.lair('jackal', [60, 200], { as: 'lions' });
    k.claim(hub, 180);
  },
};
export default def;
