/**
 * Southern Dunes (docs/WAR.md): a dune field down to the sea, Kyrene (N) inland, the Achelous Delta (W) along the
 * coast, Kyrene's two other entries at the south ends of the side edges. Strategic purpose: salt, the way to the
 * Delta's iron, and the only well. Depth 1: scorpions and lions; the dunes walk over everyone but the well-digger.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-s.png): tall dunes (h2-h4) fill the map and slow everything.
 * In the middle one red-rock outcrop rises on sheer walls (skirt h7, top h11) with the only well on its top, one path up
 * its south face. A long low ridge of red rock (h6) runs south-east across the dunes from the outcrop, the defensive
 * line of the Delta way. The north edge is the desert plateau, two cliff tiers (h6, h9) over the dunes. The sea fills the south; a low sand bluff over the beach, and a salt crust in a hollow behind
 * it. The caravan track comes down from Kyrene to the outcrop's foot (the claim point) and on west to the Delta.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'kyrene-s',
  style: { dry: 0.1, trees: 0.25 },
  build(k: Kit) {
    const N = k.entry('kyrene'), W = k.entry('delta'), SW = k.entry('kyrene-w'), SE = k.entry('kyrene-e');
    k.fill(2);
    k.zone('kyrene', () => 99);
    k.paint('sand', [128, 128, 200, 200, 0], { rough: 8 });
    // the dunes: many long crests
    for (let n = 0; n < 18; n++) {
      const x = 20 + ((n * 97) % 216), y = 20 + ((n * 61) % 170);
      if (Math.hypot(x - 128, y - 112) < 34) continue;
      k.hill([x, y, 10 + (n % 4) * 3, 4 + (n % 3) * 2, 0.5 + (n % 5) * 0.2], 4, 2.5, 2);
    }
    // the outcrop with the well; the red ridge
    // (the north edge: the desert plateau steps down to the dunes in two sandstone cliff tiers)
    k.lift((x, y, s) => { const e = y + 6 * Math.sin(x / 17 + s) + 3 * Math.sin(x / 7); return e < 20 ? 9 : e < 38 ? 6 : NaN; }, true);
    k.plateau([128, 112, 22, 18, 0.3], 7, { rough: 2 });
    k.plateau([126, 110, 14, 12, 0.3], 11, { rough: 1, terrain: 'dirt' });
    k.patch('kyrene', 'redrock', [128, 112, 23, 19, 0.3], ['sand', 'dirt'], undefined, 7);
    k.spot('outcrop', [126, 110]);
    k.ridge([[150, 136], [178, 154], [204, 176], [230, 200]], { crest: 6, step: 1.5, top: 1.5, reach: 12, base: 2 });
    k.patch('kyrene', 'redrock', [190, 168, 44, 6, 0.65], ['sand'], undefined, 4);
    k.spot('ridge', [190, 166]);
    // the sea, the bluff and the salt hollow
    k.waterBody([128, 268, 220, 34, 0], { shore: 5, beach: 4, rough: 5 });
    k.basin([60, 214, 18, 9, 0.2], 1, 0, 2);
    k.patch('kyrene', 'salt', [60, 214, 18, 9, 0.2], ['sand']);
    k.spot('salt', [60, 214]);
    // roads: the caravan track down to the outcrop and west to the Delta, the path up, the side tracks, a haul track
    const hub: Pt = [130, 140];
    k.road([N, [128, 40], [116, 86], [104, 124], hub], { w: 1.3, grade: 3 });
    k.road([hub, [90, 132], [50, 128], [16, 128], W], { w: 1.3, grade: 3 });
    k.road([[130, 140], [128, 130], [127, 124], [126, 116]], { w: 1, grade: 1.2, fill: true });
    k.road([hub, [100, 170], [60, 200], [24, 214], SW], { w: 1.1, grade: 3 });
    k.road([hub, [170, 180], [210, 214], [240, 216], SE], { w: 1.1, grade: 3 });
    // the well on the top; stone; dead thorn trees and dry grass
    k.piece('kyrene/well', [126, 108], { r: 4 });
    k.piece('kyrene/ruin-wall', [130, 104], { r: 5, n: 2, gap: 3 });
    k.resource('stone', [200, 172], 3, 8);
    k.piece('boulder-b', [60, 214], { r: 8, n: 2 });
    k.forest([40, 60, 6, 4, 0], [220, 60, 6, 4, 0]);
    k.village([180, 104], 3);
    // fauna: scorpions in the salt hollow and the dunes, lions under the ridge
    k.lair('jackal', [66, 206], { as: 'scorpions' });
    k.lair('jackal', [40, 60], { as: 'scorpions' });
    k.lair('jackal', [210, 196], { as: 'lions' });
    k.lair('jackal', [210, 70], { as: 'lions' });
    k.claim(hub, 160);
  },
};
export default def;
