/**
 * Lagoon Coast (docs/WAR.md): salt lagoons behind a sand bar, Kyrene (W) inland, the Ammon Salt Flats (N) up the
 * coast, Kyrene's two other entries at the west edge's ends, the sea (E). Strategic purpose: salt and the coast track to
 * Ammon. Depth 1: the bandits who emptied the salt-cutters' huts and sell the salt back to Kyrene, scorpions.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-e.png): the sea fills the east; a long sand bar runs up the
 * coast, 5 tiles wide at its waist between the deep lagoon and the surf, curving north-west at its head to the Ammon
 * road; behind it the wide lagoon, deep in the middle, shallow along its west shore where the salt pans are cut (low
 * mud walls, white heaps) with the bandits' palisade camp beside them. The ochre dune plateau fills the west and
 * north-west (W-52 set piece), stepping down to the lagoon in three curving sandstone cliff tiers (h5, h8, h11). The road comes down from Kyrene to the pans, rounds the lagoon's south end onto the bar's
 * root, where the ruined salt-cutters' huts stand, and runs up the bar to Ammon.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

/** The sand bar's line: x over y. */
const barX = (y: number) => (y > 40 ? 190 + 4 * Math.sin(y / 23) : 190 - (40 - y) * 1.3);

const def: RegionDef = {
  id: 'kyrene-e',
  style: { dry: 0.2, trees: 0.12, bushes: 0.4 },
  build(k: Kit) {
    const W = k.entry('kyrene'), NW = k.entry('kyrene-n'), SW = k.entry('kyrene-s'), N = k.entry('ammon');
    k.fill(2);
    k.zone('kyrene', () => 99);
    k.paint('sand', [50, 110, 86, 190, 0], { rough: 8 }); // the cliff tiers' sand; the coastal flat stays green
    // W-52 set piece (./setpieces.ts): the ochre dune plateau fills the west and north-west, stepping down toward the
    // lagoon in three sandstone cliff tiers that follow its curving edge (h5, h8, h11)
    massif(k, {
      outline: [[-12, -12], [136, -12], [124, 30], [104, 66], [96, 108], [88, 138], [58, 150], [70, 196], [62, 236], [36, 268], [-12, 268]],
      crown: [[-12, -12], [60, -12], [42, 60], [30, 130], [18, 200], [-12, 230]],
      base: 2, tiers: 3, step: 3, wobble: 0.25,
    });
    for (const b of [[22, 80, 12, 10, 0.4], [26, 180, 14, 10, -0.3]] as const) k.hill([...b], 13, 3, 2);
    // the sea, the lagoon (deep core, shallow west shore), the bar between
    k.waterBody([246, 128, 60, 210, 0], { shore: 5, beach: 0, rough: 2 });
    k.waterBody([156, 112, 40, 92, 0.05], { shore: 6, beach: 1.5, rough: 3 });
    const bar: Pt[] = [[128, -6], [140, 12], [164, 28], [barX(48), 48], [barX(90), 90], [barX(130), 130], [barX(170), 170], [barX(200), 200], [184, 226], [172, 262]];
    k.causeway(bar, 2, 1);
    k.paint('sand', [190, 128, 14, 140, 0], { on: ['grass'], rough: 1 });
    k.island([178, 222, 22, 18, 0.3], 1);
    k.paint('sand', [178, 222, 24, 20, 0.3], { on: ['grass'], rough: 2 });
    k.spot('narrows', [barX(100), 100]);
    // the salt pans on the lagoon's west shore: small walled ponds in rows, white heaps
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) k.waterBody([100 + c * 7, 140 + r * 6, 2.6, 2.2, 0], { deep: false, beach: 0, rough: 0.3 });
    k.patch('kyrene', 'salt', [104, 146, 12, 12, 0], ['sand', 'grass']);
    k.spot('salt', [104, 162]);
    // roads: Kyrene down to the pans, round the lagoon's south end, up the bar to Ammon; the west edge's tracks
    const hub: Pt = [84, 160];
    k.road([W, [30, 128], [62, 140], hub, [110, 186], [140, 214], [168, 222], [barX(200), 200], [barX(170), 170], [barX(130), 130], [barX(90), 90], [barX(48), 48], [164, 28], [140, 12], N], { w: 1.2, grade: 3 });
    k.road([[30, 128], [24, 90], [14, 56], NW], { w: 1.1, grade: 3 });
    k.road([[30, 128], [24, 170], [14, 206], SW], { w: 1.1, grade: 3 });
    // the bandits' camp by the pans, the salt-cutters' ruined huts on the bar's root, a well
    k.piece('mountains/watch-post', [92, 172], { r: 4 });
    k.piece('kyrene/ruin-wall', [96, 176], { r: 6, n: 3, gap: 3 });
    k.piece('kyrene/nomad-tent', [176, 230], { r: 8, n: 3, gap: 4 });
    k.piece('kyrene/ruin-wall', [184, 216], { r: 6, n: 2, gap: 3 });
    k.piece('boulder-b', [104, 164], { r: 7, n: 2 });
    k.village([54, 186], 3);
    k.resource('food', [180, 236], 2, 10);
    k.forest([40, 40, 6, 5, 0]);
    // fauna: the bandit camp on the salt, scorpions in the dunes and on the bar's head
    k.lair('bandit', [96, 164], { as: 'bandits' });
    k.lair('jackal', [32, 82], { as: 'scorpions' });
    k.lair('jackal', [44, 220], { as: 'scorpions' });
    k.lair('bandit', [160, 30], { as: 'bandits' });
    k.claim(hub, 160);
  },
};
export default def;
