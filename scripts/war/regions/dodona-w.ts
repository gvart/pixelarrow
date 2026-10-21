/**
 * Western Heath (docs/WAR.md): windswept heath over sea cliffs, Dodona (E) inland, the Siren Estuary (S) down the
 * coast, Dodona's two other entries at the east edge's ends, the sea (W). Strategic purpose: Dodona's salt and silver
 * lifeline to Siren and room for a field battle. Depth 1: wolves and boars; the oath-breakers' lanterns on the bogs.
 * Layout (Gemini reference shots/war/regions/proto/dodona-w.png): grey sea cliffs (the cliff-top heath at h5) stand
 * straight out of the sea along the west edge, broken once by a small cove beach; the coast track runs along their
 * tops, dark peat bogs with black pools flanking it. Inland the open heath rolls in two tiers (h4, h3) for a field
 * battle, crossed by one long low ridge of grey rock (h6) that the Dodona road cuts through at a saddle; standing
 * stones on the heath. The claim point at the road's meeting with the coast track.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'dodona-w',
  style: { meadow: 0.5, trees: 0.25, bushes: 0.6, dry: 0.4 },
  build(k: Kit) {
    const E = k.entry('dodona'), NE = k.entry('dodona-n'), SE = k.entry('dodona-s'), S = k.entry('siren');
    k.fill(3);
    k.zone('mountains', [60, 128, 70, 170, 0], 10);
    k.zone('dodona', [220, 128, 50, 160, 0], 10);
    // the heath's tiers: the cliff-top band highest, the inland heath a step down
    k.lift((x, y, s) => (x + 8 * Math.sin(y / 17 + s) < 92 ? 5 : x + 8 * Math.sin(y / 23) < 150 ? 4 : NaN), true);
    // the sea under the cliffs, the cove cut into them
    k.waterBody([-24, 128, 46, 200, 0], { shore: 3, beach: 0, rough: 4 });
    k.basin([30, 64, 18, 13, 0.3], 1, 0, 2);
    k.waterBody([18, 64, 14, 10, 0.3], { shore: 2, beach: 5, rough: 2 });
    k.spot('cove', [30, 64]);
    // the bogs along the coast track
    for (const [x, y] of [[58, 40], [64, 100], [56, 150], [66, 196], [80, 236]] as const) {
      k.paint('marsh', [x, y, 12, 9, 0.5], { rough: 3, on: ['grass'] });
      k.waterBody([x + 2, y, 3.5, 2.5, 0.5], { deep: true, shore: 1, beach: 0, rough: 1 });
    }
    // the grey ridge across the heath
    k.ridge([[100, 30], [130, 80], [150, 128], [170, 180], [200, 230]], { crest: 6, step: 2, top: 1.5, reach: 12, base: 3 });
    k.spot('ridge', [150, 128]);
    // roads: the coast track along the cliff tops to Siren; Dodona's road over the ridge's saddle to it; the side
    // tracks from Dodona's other entries
    const hub: Pt = [52, 128];
    k.road([[44, 10], [42, 64], [46, 100], hub, [46, 170], [60, 214], [100, 236], [124, 248], S], { w: 1.2, grade: 3 });
    k.road([E, [228, 128], [190, 130], [150, 128], [110, 130], [70, 128], hub], { w: 1.3, grade: 3 });
    k.road([NE, [230, 46], [190, 50], [150, 60], [110, 72], [60, 66], [44, 64]], { w: 1.1, grade: 3 });
    k.road([SE, [230, 212], [190, 220], [150, 236], [124, 248]], { w: 1.1, grade: 3 });
    k.road([[42, 64], [34, 64], [28, 64]], { w: 1, grade: 1.5 });
    // standing stones, cairns, a shepherds' hamlet, wind-bent trees
    k.piece('mountains/cairn', [100, 180], { r: 10, n: 3, gap: 5 });
    k.piece('mountains/cairn', [120, 90], { r: 6, n: 2, gap: 4 });
    k.village([200, 170], 4);
    k.forest([220, 90, 12, 10, 0.4], [210, 240, 12, 8, 0], [100, 30, 8, 6, 0]);
    k.resource('stone', [150, 110], 3, 10);
    k.resource('stone', [80, 200], 2, 10);
    k.resource('food', [200, 190], 2, 12);
    // fauna: wolves on the heath and by the bogs, boars in the east woods
    k.lair('wolf', [96, 100], { as: 'wolves' });
    k.lair('wolf', [84, 220], { as: 'wolves' });
    k.lair('boar', [218, 92], { as: 'boars' });
    k.lair('boar', [210, 236], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
