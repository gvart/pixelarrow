/**
 * Lagoon Coast (docs/WAR.md): salt lagoons behind a sand bar, Kyrene (W) inland, the Ammon Salt Flats (N) up the
 * coast, Kyrene's two other entries at the west edge's ends, the sea (E). Strategic purpose: salt and the coast track to
 * Ammon. Depth 1: the bandits who emptied the salt-cutters' huts and sell the salt back to Kyrene, scorpions.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-e.png): the sea fills the east; a long sand bar runs up the
 * coast, 5 tiles wide at its waist between the deep lagoon and the surf, curving north-west at its head to the Ammon
 * road; behind it the wide lagoon, deep in the middle, shallow along its west shore where the salt pans are cut (low
 * mud walls, white heaps) with the bandits' palisade camp beside them. The ochre dune plateau fills the west and
 * north-west (W-52 set piece), stepping down to the lagoon in three curving sandstone walls of three levels, each tier rolling (h5-6, h9-10, h13-15). The road comes down from Kyrene to the pans, rounds the lagoon's south end onto the bar's
 * root, where the ruined salt-cutters' huts stand, and runs up the bar to Ammon.
 * Look (regions-look, PROMPTS_ART §49): the lagoon has two shallow lobes under the cliffs, the coastal flat is a green
 * scrub belt (the ochre sand only on the tiers), the pans a 3 x 2 grid of square ponds on a salt crust, the bar broader
 * north and south of its waist with huts, tents, palms and carts.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief } from './setpieces.ts';

/** The sand bar's line: x over y. */
const barX = (y: number) => (y > 40 ? 190 + 4 * Math.sin(y / 23) : 190 - (40 - y) * 1.3);

const def: RegionDef = {
  id: 'kyrene-e',
  style: { wayside: true, dry: 0.2, trees: 0.12, bushes: 0.4 },
  build(k: Kit) {
    const W = k.entry('kyrene'), NW = k.entry('kyrene-n'), SW = k.entry('kyrene-s'), N = k.entry('ammon');
    k.fill(2);
    k.zone('kyrene', () => 99);
    // W-52 set piece (./setpieces.ts): the ochre dune plateau fills the west and north-west, stepping down toward the
    // lagoon in three sandstone cliff tiers that follow its curving edge (h5, h8, h11)
    const dunes = massif(k, {
      outline: [[-12, -12], [136, -12], [126, 30], [110, 64], [104, 104], [94, 136], [62, 148], [72, 196], [64, 236], [38, 268], [-12, 268]],
      crown: [[-12, -12], [60, -12], [42, 60], [30, 130], [18, 200], [-12, 230]],
      base: 2, tiers: 3, step: 3, wobble: 0.25,
    });
    // its relief over the massif's contours (setpieces.ts relief): a three-level sandstone wall off the coastal flat, each
    // tier rolling a level or two to the next 3-level wall, rolling dunes over the top tier
    relief(k, (x, y, s) => {
      const t = dunes.t(x, y);
      if (t < 0) return NaN;
      return profile([[0, 5], [0.8, 6.4], [1, 9], [1.8, 10.4], [2, 13], [3, 14.4]], t) + 0.45 * fbm(x, y, 10, s) + (t > 2 ? 0.9 * fbm(x, y, 16, s + 1) : 0);
    }, { cliffs: [[2, 5], [6.4, 9], [10.4, 13]] });
    for (const b of [[22, 80, 12, 10, 0.4], [26, 180, 14, 10, -0.3]] as const) k.hill([...b], 15, 3, 2);
    // the ochre sand of the tiers (the coastal flat under them stays a green scrub belt, as the reference)
    k.paint('sand', [40, 128, 80, 170, 0], { rough: 8, minH: 4 });
    // the sea, the lagoon (deep core, shallow west shore), the bar between
    k.waterBody([246, 128, 60, 210, 0], { shore: 5, beach: 0, rough: 2 });
    k.waterBody([156, 112, 40, 92, 0.05], { shore: 6, beach: 1.5, rough: 3 });
    k.waterBody([126, 60, 20, 26, -0.4], { deep: false, beach: 1.5, rough: 3 }); // the lagoon's shallow north-west lobe under the cliffs
    k.waterBody([130, 188, 24, 18, 0.5], { deep: false, beach: 1.5, rough: 3 }); // and its south-west lobe over the flat
    const bar: Pt[] = [[128, -6], [140, 12], [164, 28], [barX(48), 48], [barX(90), 90], [barX(130), 130], [barX(170), 170], [barX(200), 200], [184, 226], [172, 262]];
    k.causeway(bar, 2, 1);
    // broader stretches of the bar north and south of its waist (the narrows), room for the huts
    for (const ys of [[34, 46, 58, 72], [128, 142, 156, 170, 186]]) k.causeway(ys.map((y): Pt => [barX(y), y]), 3.4, 1);
    k.paint('sand', [190, 128, 14, 140, 0], { on: ['grass'], rough: 1 });
    k.island([178, 222, 22, 18, 0.3], 1);
    k.paint('sand', [178, 222, 24, 20, 0.3], { on: ['grass'], rough: 2 });
    k.spot('narrows', [barX(100), 100]);
    // the salt pans on the lagoon's west shore: a grid of square pans (3 x 2, 6 tiles a side) between low earth banks on a
    // white salt crust, the cutters' heaps and baskets round them
    k.paint('dirt', [104, 148, 18, 12, 0], { rough: 1.5 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) k.waterRect(190 + c * 11, 282 + r * 11, 199 + c * 11, 291 + r * 11, 1, 2);
    k.patch('kyrene', 'salt', [104, 148, 20, 14, 0], ['sand', 'grass', 'dirt']);
    k.spot('salt', [104, 162]);
    // roads: Kyrene down to the pans, round the lagoon's south end, up the bar to Ammon; the west edge's tracks
    const hub: Pt = [84, 160];
    k.road([W, [30, 128], [62, 140], hub, [96, 198], [118, 228], [148, 236], [168, 226], [barX(200), 200], [barX(170), 170], [barX(130), 130], [barX(90), 90], [barX(48), 48], [164, 28], [140, 12], N], { w: 1.2, grade: 3 });
    k.road([hub, [92, 158], [98, 155]], { w: 1, grade: 3 }); // the salt haul track to the pans' bank
    k.road([[30, 128], [24, 90], [14, 56], NW], { w: 1.1, grade: 3 });
    k.road([[30, 128], [24, 170], [14, 206], SW], { w: 1.1, grade: 3 });
    // the bandits' camp by the pans, the salt-cutters' ruined huts on the bar's root, a well
    k.piece('mountains/watch-post', [92, 172], { r: 4 });
    k.piece('kyrene/ruin-wall', [96, 176], { r: 6, n: 3, gap: 3 });
    k.piece('kyrene/nomad-tent', [176, 230], { r: 8, n: 3, gap: 4 });
    k.piece('kyrene/ruin-wall', [184, 216], { r: 6, n: 2, gap: 3 });
    k.piece('kyrene/rubble-heap-mud', [112, 160], { r: 4, n: 3, gap: 2 });
    k.piece('kyrene/amphora-stack', [100, 158], { r: 3, n: 2, gap: 2 });
    k.piece('kyrene/handcart', [98, 152], { r: 3 });
    // the sand bar: salt-cutters' and fishers' huts and tents, carts and jars, palms and scrub along it, camels at rest
    for (const [n, y] of [40, 54, 66, 134, 148, 162, 178].entries()) {
      const x = barX(y);
      k.piece(['kyrene/date-palm-clump', 'kyrene/saltbush', 'kyrene/date-palm-young', 'kyrene/tamarisk'][n % 4], [x - 2, y + 3], { r: 3, n: 2, gap: 2 });
      k.piece(['kyrene/debris-mud', 'kyrene/amphora-stack', 'kyrene/handcart', 'kyrene/wall-fallen-mud'][n % 4], [x + 2, y - 4], { r: 3 });
    }
    k.piece('kyrene/nomad-tent', [barX(60), 60], { r: 4, n: 2, gap: 4 });
    k.piece('kyrene/nomad-tent', [barX(150), 150], { r: 4 });
    k.piece('kyrene/camels', [barX(170) - 1, 170], { r: 4 });
    // the green scrub belt at the cliffs' foot: tamarisk, broom and reeds by the lagoon, red boulders fallen off the tiers
    k.piece('kyrene/tamarisk', [110, 120], { r: 10, n: 5, gap: 4 });
    k.piece('kyrene/broom', [74, 200], { r: 12, n: 6, gap: 3 });
    k.piece('kyrene/boulder-red', [100, 98], { r: 8, n: 4, gap: 3 });
    k.piece('kyrene/boulder-red', [74, 156], { r: 6, n: 3, gap: 3 });
    k.piece('kyrene/acacia-old', [88, 214], { r: 10, n: 2, gap: 6 });
    k.village([54, 186], 3);
    k.resource('food', [180, 236], 2, 10);
    k.forest([40, 40, 6, 5, 0]);
    // fauna: the bandit camp on the salt, scorpions in the dunes and on the bar's head
    k.lair('bandit', [96, 164], { as: 'bandits' });
    k.lair('scorpion', [32, 82], { as: 'scorpions' });
    k.lair('scorpion', [44, 220], { as: 'scorpions' });
    k.lair('bandit', [160, 30], { as: 'bandits' });
    k.claim(hub, 160);
  },
};
export default def;
