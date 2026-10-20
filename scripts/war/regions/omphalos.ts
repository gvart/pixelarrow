/**
 * Omphalos Plateau, the centre (docs/WAR.md): a high mesa with a ruined temple city; titan and minotaur; silver,
 * marble. Strategic purpose: the prestige seat and the high ground of the world, reached from the four gate regions
 * only by one ramp each.
 * Layout (Gemini reference shots/war/gemini/art2/omphalos): a skirt of low ground (h2) round the map edge carries the
 * four entries; the mesa (h6) fills the middle behind a cliff rim (4 levels, impassable), climbed by four built ramps,
 * one per side, each a choke a few men can hold. On top: the crater lake (deep) in its bowl in the north-west, the
 * temple city in the south-east round a paved square (the claim point), the acropolis knoll (h7) over it with the
 * titan, the labyrinth's mouth below it with the minotaur. The Achelous rises at a spring south of the crater, runs
 * across the mesa, falls over the south rim and leaves south in a deep bed with a narrows. The skirt's corners take the
 * flavour of their gate: woods west (Erymanthos), red sand east (Canyons), crags north (Saddle).
 */
import type { Kit, RegionDef } from './kit.ts';
import { templeCity } from './landmarks.ts';

const def: RegionDef = {
  id: 'omphalos',
  style: { dry: -0.2 },
  build(k: Kit) {
    k.fill(2);
    k.zone('elaia', [128, 128, 104, 98, 0.1], 6);
    k.zone('kyrene', [262, 200, 40, 70, 0.2], 6);
    // the mesa
    k.plateau([128, 128, 92, 86, 0.2], 6, { rough: 6 });
    k.spot('mesa', [128, 92]);
    // the crater lake in its bowl, the acropolis knoll
    k.waterBody([96, 98, 22, 17, 0.4], { shore: 3, beach: 2 });
    k.hill([76, 178, 14, 10, 0.5], 7, 3, 2);
    k.forest([84, 196, 10, 6, 0.3], [176, 64, 8, 5, 0.2]);
    // the Achelous: spring pool, across the mesa (bed 5), over the south rim, deep below (narrows)
    k.waterBody([108, 138, 4, 3, 0], { deep: false, beach: 1 });
    k.river([[108, 140], [104, 164], [114, 190], [110, 214], [118, 236], [110, 262]], { half: 2.2, deep: false, bed: (s) => (s < 76 ? 5 : 1), bank: 0.25 });
    k.river([[110, 220], [118, 236], [110, 262]], { half: 4, bed: 1, bank: 1, narrows: [[[116, 232], 2.5]], name: 'achelous' });
    k.spot('falls', [111, 213]);
    k.spot('fortress', [128, 92]);
    // M7d / W-48: the Temple City of the Navel over the whole mesa top: the ramp gate forts, the processional ways to
    // the Great Fair and the precinct, the Titan in his arena, the Minotaur in the labyrinth
    const C = templeCity(k, [44, 46], 6);
    for (const [n, v] of Object.entries(C.spots)) k.spot(n, v);
    k.spot('acropolis', C.spots.precinct);
    // the four ramps (built up from the skirt) up to the gate forts
    k.road([k.entry('saddle'), [128, 10], [128, 28], [128, 46]], { fill: true, grade: 3 });
    k.road([k.entry('erymanthos'), [10, 128], [28, 128], [46, 130]], { fill: true, grade: 3 });
    k.road([k.entry('gorge'), [140, 248], [142, 230], [144, 210]], { fill: true, grade: 3 });
    k.road([k.entry('canyons'), [246, 128], [228, 128], [212, 130]], { fill: true, grade: 3 });
    k.spot('rampN', [128, 34]);
    k.spot('rampW', [34, 128]);
    k.spot('rampS', [142, 224]);
    k.spot('rampE', [222, 128]);
    // the skirt's corners
    k.forest([18, 40, 18, 30, 0.2], [24, 220, 20, 28, -0.2], [70, 64, 10, 6, 0.3]);
    k.rockMass([236, 22, 26, 18, 0.3]);
    k.rockMass([24, 6, 18, 8, 0]);
    k.paint('sand', [236, 214, 26, 40, 0.2], { on: ['grass'], maxH: 3 });
    k.patch('kyrene', 'redrock', [244, 210, 10, 24, 0.2], ['sand']);
    k.patch('elaia', 'marble', [190, 120, 12, 8, 0.3]);
    k.patch('elaia', 'marble', [130, 196, 8, 5, 0.2]);
    // resources (stone 2, marble 2, silver 3: no node art for silver) and the ruins
    k.resource('marble', [190, 120], 4, 10);
    k.piece('elaia/marble-quarry', [196, 112], { r: 8 });
    k.resource('stone', [60, 168], 3, 12);
    k.piece('kyrene/rock-pillar', [62, 200], { r: 12, n: 3, gap: 6 });
    k.piece('watchtower', [128, 52], { r: 6 });
    k.piece('watchtower', [52, 128], { r: 6 });
    k.piece('watchtower', [204, 136], { r: 6 });
    // fauna: the titan on the acropolis, the minotaur at the labyrinth, wolves on the north mesa, harpies by the falls
    k.lair('bear', [166, 140], { count: 12, as: 'titan' });
    k.lair('bear', [184, 176], { count: 8, as: 'minotaur' });
    k.lair('wolf', [150, 70], { as: 'wolves' });
    k.lair('wolf', [96, 196], { as: 'harpies' });
    k.claim(C.spots.templeSquare, 150);
  },
};
export default def;
