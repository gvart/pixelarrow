/**
 * Lion Savanna (docs/WAR.md): dry grass and acacia with rock kopjes, Kyrene's pocket: Thornscrub Rise (E) and the
 * Eastbank Floodplain (S) in, the Red Canyons (N) and the Gorge (W) on toward Omphalos. Strategic purpose: copper and
 * hides, and the kopjes as fortresses. Depth 2: the Lion of the Savanna (Nemean, tier 1), whose hide turns blades, in
 * his den under the great kopje; the lions' lair on the copper beside it.
 * Layout (Gemini reference shots/war/regions/proto/savanna.png): a flat golden plain (h2). Three kopjes of piled
 * red-brown boulders stand over it on stepped walls: the great one in the west (skirt h5, flat top h7, 50+ tiles
 * across, one way up from the south), the den at its foot and the copper crop beside it; a lower one in the north-west
 * and one in the east. A dry wash, a sunken sandy bed (h1) between low banks, winds north to south across the plain,
 * a hidden way past both roads; a muddy waterhole lies by it. The two roads cross at the claim point mid-plain.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { pocketBoss } from './tiers.ts';

const def: RegionDef = {
  id: 'savanna',
  style: { dry: -0.4, dryHigh: true, trees: 0.25, bushes: 0.4 },
  build(k: Kit) {
    const E = k.entry('kyrene-n'), S = k.entry('kyrene-w'), N = k.entry('canyons'), W = k.entry('gorge');
    k.fill(2);
    k.zone('elaia', () => 99);
    k.zone('kyrene', [128, 128, 60, 150, 0.6], 8);
    // the kopjes: stepped skirts, flat tops, boulder piles on their rims
    const K: [Pt, number, number][] = [[[62, 82], 22, 18], [[56, 30], 14, 11], [[212, 176], 16, 13]];
    K.forEach(([p, rx, ry], n) => {
      k.plateau([p[0], p[1], rx, ry, 0.3], 5, { rough: 2.5 });
      k.plateau([p[0], p[1], rx * 0.72, ry * 0.75, 0.3], n === 0 ? 7 : 6, { rough: 1.2, terrain: 'dirt' });
      for (let a = 0; a < 5; a++) {
        const t = Math.PI * (0.8 + a * 0.32) + n * 0.9; // the boulder piles round the rim, the way up left open
        k.rockMass([p[0] + Math.cos(t) * rx * 0.86, p[1] + Math.sin(t) * ry * 0.86, 3.2, 2.6, t], { rough: 0.7, foot: 5 });
      }
      k.spot(`kopje${n}`, p);
    });
    k.spot('fortress', [62, 80]);
    k.patch('kyrene', 'redrock', [62, 82, 24, 20, 0.3], ['dirt', 'grass', 'sand'], undefined, 5);
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
    k.road([[80, 132], [76, 116], [70, 104], [64, 92], [62, 86]], { w: 1, grade: 1.3, fill: true });
    k.road([[124, 40], [94, 36], [74, 32], [60, 30]], { w: 1, grade: 1.3, fill: true });
    k.road([[180, 126], [196, 146], [206, 164], [211, 174]], { w: 1, grade: 1.3, fill: true });
    // copper beside the great kopje, stone on the east one
    k.resource('copper', [44, 116], 3, 5);
    k.spot('copper', [44, 116]);
    k.resource('stone', [212, 196], 2, 8);
    k.resource('food', [180, 220], 3, 14);
    // acacias and baobabs, the hunters' camp by the waterhole
    k.forest([180, 60, 8, 5, 0.3], [100, 210, 7, 5, 0], [200, 120, 6, 4, 0], [40, 180, 8, 6, 0.4], [230, 70, 6, 5, 0], [150, 230, 6, 4, 0]);
    k.village([160, 196], 3);
    // the Lion's den at the great kopje's south-east foot; the lions' lair on the copper; lions on the plain
    pocketBoss(k, 'savanna_lion', [86, 100], 5);
    k.lair('jackal', [42, 112], { as: 'Nemean lion', count: 10 });
    k.lair('jackal', [196, 76], { as: 'lions' });
    k.lair('jackal', [190, 200], { as: 'lions' });
    k.lair('jackal', [60, 200], { as: 'lions' });
    k.claim(hub, 180);
  },
};
export default def;
