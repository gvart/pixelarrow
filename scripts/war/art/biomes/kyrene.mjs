// Kyrene biome library (ART-7, W-21): desert-edge oasis on a river terrace, red cliffs, dunes, salt flats, copper
// (docs/WAR.md: Kyrene and its entries Thornscrub Rise, Lagoon Coast, Southern Dunes, plus Ammos and Ammon next door).
// Prompts: PROMPTS_ART.md "Biome: Kyrene". Built by `node scripts/war/art/build.mjs` (all biomes after the global set) into
// public/war/biomes/kyrene/. Same format as assets.mjs. Every Kyrene set pairs its terrain with the global sand (first
// terrain), so sand is the built global sand pixel for pixel and grass / shallow water are the global ones too.
export { PX_PER_M, TILE_M } from '../assets.mjs';
export const BATCH = 'kyrene'; // raws: shots/war/pixellab/kyrene/raw (git-ignored)
export const EXTRA_COLOURS = 64;

// Kyrene's own terrains. grade = { sat, val } on the raw fill (PixelLab draws them far brighter than the dark palette).
export const FILLS = {
  dune: { dir: 'sand-dune', frame: 0, grade: { sat: 0.8, val: 0.74 } },
  hardpan: { dir: 'sand-hardpan', frame: 0, grade: { sat: 1.1, val: 0.9 } },
  redrock: { dir: 'sand-redrock', frame: 0, grade: { sat: 0.62, val: 0.6 } },
  reg: { dir: 'sand-reg', frame: 0, grade: { sat: 0.9, val: 0.95 } },
  salt: { dir: 'sand-salt', frame: 0, grade: { sat: 0.5, val: 0.6 } },
  oasis: { dir: 'sand-oasis', frame: 0, grade: { sat: 0.85, val: 0.82 } },
};

export const SETS = [
  { pair: 'sand-dune', first: 'sand', second: 'dune', dir: 'sand-dune', side: 'earth', source: 'tiles_pro 73a5c978 (ART-7)' },
  { pair: 'sand-hardpan', first: 'sand', second: 'hardpan', dir: 'sand-hardpan', side: 'earth', source: 'tiles_pro 4570c4d8 (ART-7)' },
  { pair: 'sand-redrock', first: 'sand', second: 'redrock', dir: 'sand-redrock', side: 'earth', sideName: 'redrock', sideFrom: 0, sideGrade: { sat: 0.62, val: 0.6 }, source: 'tiles_pro 056704a9 (ART-7)' },
  { pair: 'sand-reg', first: 'sand', second: 'reg', dir: 'sand-reg', side: 'earth', source: 'tiles_pro ebedeac5 (ART-7)' },
  { pair: 'sand-salt', first: 'sand', second: 'salt', dir: 'sand-salt', side: 'earth', source: 'tiles_pro 1c47a090 (ART-7)' },
  { pair: 'sand-oasis', first: 'sand', second: 'oasis', dir: 'sand-oasis', side: 'earth', source: 'tiles_pro 83db5c22 (ART-7)' },
];

// 'fills' = tiles_pro 3fa738fa (ART-7): 2 independent tiles per item, top vertex at y 11 (items: dune x2, hardpan,
// red rock, reg, salt, oasis grass, stony desert sand).
const fills = (frame) => ({ dir: 'fills', frame, y: 11 });
export const VARIANTS = {
  dune: [fills(0), fills(1), fills(2), fills(3)],
  hardpan: [fills(4), fills(5), 'shift'],
  redrock: [fills(6), fills(7), 'shift'],
  reg: [fills(8), fills(9), 'shift'],
  salt: [fills(10), fills(11)],
  oasis: [fills(12), fills(13), 'shift'],
  // desert sand with stones and dry grass blades (replaces the global sand variants inside Kyrene)
  sand: [fills(14), fills(15), { dir: 'sand-shallow', frame: 15, batch: 'art5' }],
};

export const CLIFFS = [{ id: 'redrock', from: 'redrock' }];

// Kyrene terrains only have a set with sand, so the land buffer is sand: any other pair (dune-hardpan, oasis-grass, ...)
// gets a sand verge. Water: oasis-shallow and dune-shallow get a sand bank (sand-shallow is a global set).
export const FALLBACK = {
  note: 'Same rule as the global tiles.json fallback, over the global sheets plus these, but the land buffer is sand: Kyrene terrains only have a set with sand, so any other pair (dune-hardpan, oasis-shallow, redrock-grass, ...) gets a sand verge; order says which corner gives way first.',
  order: ['deep', 'shallow', 'marsh', 'grass', 'dirt', 'oasis', 'salt', 'hardpan', 'reg', 'dune', 'forest', 'redrock', 'rock', 'road', 'sand'],
  buffer: { water: 'shallow', land: 'sand' },
};

// Objects: create_map_object, high top-down, high detail, detailed shading, true scale (33 px/m). Field meanings: assets.mjs;
// base.drop = [[hex, manhattan tol], ...]: also drop pixels near these colours (a sand floor or red-earth apron that is
// neither green nor grey; keep may be left out). extra = metadata copied into objects.json (resource nodes, fauna).
const tree = { kind: 'tree', blocks: false, footprint: [1, 1] };
const bush = { kind: 'bush', blocks: false, footprint: [1, 1] };
const stone = { kind: 'stone', blocks: true };
const palm = { sat: 0.7, val: 0.8 };
const red = { sat: 0.65, val: 0.72 };
const mud = { sat: 0.6, val: 0.72 };
export const OBJECTS = [
  { id: 'date-palm-tall', raw: 'date-palm-tall', ...tree, metres: 11.4, keyAll: true, base: { y0: 346, x0: 88, x1: 116, cut: 362, keep: 'neutral' }, grade: palm, source: 'map_object 5be1a05c' },
  { id: 'date-palm-mid', raw: 'date-palm-mid', ...tree, metres: 7.4, keyAll: true, base: { y0: 236, x0: 80, x1: 116, cut: 254, keep: 'neutral' }, grade: palm, source: 'map_object 82202c8f' },
  { id: 'date-palm-fruit', raw: 'doum-try2', ...tree, metres: 8.8, keyAll: true, grade: palm, source: 'map_object 5784fd97 (asked for a doum palm)' },
  { id: 'date-palm-young', raw: 'date-palm-c', ...tree, metres: 8.6, keyAll: true, grade: palm, source: 'map_object 2c726ba0 (asked for a doum palm)' },
  { id: 'doum-palm', raw: 'doum-forked', ...tree, metres: 8, keyAll: true, grade: palm, source: 'pixflux 84b2f490 (img2img over a hand-drawn forked palm)' },
  { id: 'date-palm-clump', raw: 'date-palm-clump', ...tree, metres: 3.9, grade: palm, source: 'map_object 3dfe73c1' },
  { id: 'acacia', raw: 'acacia-table', ...tree, metres: 4.5, keyAll: true, grade: { sat: 0.7, val: 0.8 }, source: 'pixflux 76440984 (img2img over pro_flash 530a7839)' },
  { id: 'acacia-old', raw: 'acacia-table-old', ...tree, metres: 4.5, keyAll: true, grade: { sat: 0.7, val: 0.8 }, source: 'pixflux 8ed7998d (img2img over acacia, mirrored)' },
  { id: 'thorn-tree', raw: 'acacia-scrub', ...tree, metres: 3, grade: { sat: 0.6, val: 0.8 }, source: 'map_object a6145348' },
  { id: 'tamarisk', raw: 'tamarisk', ...tree, metres: 4.2, grade: { sat: 0.6, val: 0.8 }, source: 'map_object ba6827ea' },
  { id: 'saltbush', raw: 'saltbush', ...bush, metres: 0.9, grade: { sat: 0.6, val: 0.8 }, source: 'map_object c1763a97' },
  { id: 'camelthorn', raw: 'camelthorn', ...bush, metres: 1, grade: { sat: 0.6, val: 0.8 }, source: 'map_object 3b3a43ff' },
  { id: 'broom', raw: 'broom', ...bush, metres: 1.4, grade: { sat: 0.6, val: 0.8 }, source: 'map_object 79ab144e' },
  { id: 'dry-grass', raw: 'dry-grass', kind: 'grass', blocks: false, footprint: [1, 1], metres: 0.5, scale: 0.7, grade: { sat: 0.6, val: 0.75 }, source: 'map_object 6443d446' },
  { id: 'reeds', raw: 'reeds', kind: 'reeds', blocks: false, footprint: [1, 1], metres: 2.2, grade: { sat: 0.65, val: 0.8 }, source: 'map_object 3efd5b01' },
  // the mesa and the butte: relief.mjs heightfields (flat caprock, sheer walls, a banded slope, a talus skirt) in the game's iso
  // projection, both side faces in view (SW lit, SE shaded), textured with the ART-7 mesa raw (pixflux 78bf3391) reprojected
  // onto each face (strata follow the face in perspective). No new generation: pixflux over these brought back plaid stumps.
  { id: 'mesa', raw: 'mesa-iso', ...stone, footprint: [6, 6], metres: 7.6, grade: { sat: 0.85, val: 0.66 }, source: 'relief.mjs mesa-big (texture: pixflux 78bf3391)' },
  { id: 'butte', raw: 'butte-iso', ...stone, footprint: [4, 4], metres: 6.6, grade: { sat: 0.85, val: 0.66 }, source: 'relief.mjs mesa-butte (texture: pixflux 78bf3391)' },
  { id: 'rock-pillar', raw: 'hoodoo', ...stone, footprint: [1, 1], metres: 8, keyAll: true, grade: red, source: 'pixflux 9e60a699 (img2img over a hand-drawn hoodoo)' },
  { id: 'boulder-red', raw: 'boulder-a', ...stone, footprint: [1, 1], metres: 1.8, grade: red, source: 'map_object 433d39a3' },
  { id: 'rocks-red', raw: 'boulder-b', ...stone, footprint: [1, 1], metres: 1.3, grade: red, source: 'map_object c23bdc41' },
  { id: 'well', raw: 'well', ...stone, footprint: [1, 1], metres: 2.4, grade: mud, source: 'map_object f4771a4e' },
  { id: 'ruin-wall', raw: 'ruin-wall', ...stone, footprint: [2, 1], metres: 2.6, grade: mud, source: 'map_object f192a057' },
  { id: 'ruin-corner', raw: 'ruin-corner', ...stone, footprint: [2, 2], metres: 2.2, base: { y0: 60, drop: [['#e8c48b', 70], ['#a67f60', 30]] }, grade: mud, source: 'map_object 6242db63' },
  { id: 'nomad-tent', raw: 'tent', ...stone, footprint: [2, 2], metres: 2.6, grade: mud, source: 'map_object 38218516' },
  { id: 'copper-ore', raw: 'copper', ...stone, footprint: [2, 1], metres: 2.2, grade: { sat: 0.7, val: 0.8 }, extra: { resource: 'copper' }, source: 'map_object 9a64c0ca' },
  { id: 'oasis-spring', raw: 'spring', kind: 'prop', blocks: true, footprint: [2, 1], metres: 2, grade: { sat: 0.65, val: 0.75 }, extra: { resource: 'water' }, source: 'map_object ff6716cd' },
  { id: 'camels', raw: 'camels', kind: 'fauna', blocks: false, footprint: [2, 1], metres: 2.1, grade: { sat: 0.65, val: 0.8 }, extra: { fauna: 'camel', animateLater: true }, source: 'map_object 7d986561' },
  { id: 'jackal', raw: 'jackal', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 0.65, scale: 0.7, grade: { sat: 0.65, val: 0.8 }, extra: { fauna: 'jackal', mob: true, animateLater: true }, source: 'map_object 6212438c' },
  { id: 'gazelle', raw: 'gazelle', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 1.3, grade: { sat: 0.65, val: 0.8 }, extra: { fauna: 'gazelle', animateLater: true }, source: 'map_object acc6c5b8' },
];
