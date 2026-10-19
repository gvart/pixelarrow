// ART-4 asset list: which raw PixelLab sets/objects become which game assets (prompts: PROMPTS_ART.md §23).
export const PX_PER_M = 33; // W-18
export const TILE_M = 2;

// dir = raw/tiles/<dir>; first terrain = set bit. The first set is the grass reference: its full-grass tile
// replaces the grass of every set with unify: true (unifyFrom: another set's full tile, for shallow water). side: which side texture the tiles get ('own' keeps the raw).
export const SETS = [
  { pair: 'grass-dirt', first: 'grass', second: 'dirt', dir: 'grass-dirt', unify: false, side: 'own', sideName: 'earth', sideFrom: 15, source: 'tiles_pro 4dd226e7 (ART-3)' },
  { pair: 'grass-sand', first: 'grass', second: 'sand', dir: 'grass-sand', unify: true, side: 'earth', tone: 0.82, source: 'tiles_pro 15ee8a0d (palette-locked)' },
  { pair: 'grass-rock', first: 'grass', second: 'rock', dir: 'grass-rock', unify: true, side: 'own', sideName: 'rock', sideFrom: 0, source: 'tiles_pro 11b1a38c' },
  { pair: 'grass-forest', first: 'grass', second: 'forest', dir: 'grass-forest-2', unify: true, side: 'earth', source: 'tiles_pro dbdd9898 (seed 32; adbc0d25 read as tilled soil)' },
  { pair: 'grass-marsh', first: 'grass', second: 'marsh', dir: 'grass-marsh', unify: true, side: 'own', source: 'tiles_pro 5f02d0cd' },
  { pair: 'grass-road', first: 'grass', second: 'road', dir: 'grass-road', unify: true, side: 'earth', tone: 0.7, source: 'tiles_pro dc427abc' },
  { pair: 'grass-shallow', first: 'grass', second: 'shallow', dir: 'grass-shallow', unify: true, side: 'own', source: 'tiles_pro a7097915 (ART-3)' },
  { pair: 'shallow-deep', first: 'shallow', second: 'deep', dir: 'shallow-deep', unify: true, tone: 0.72, unifyFrom: { dir: 'grass-shallow', frame: 0 }, side: 'own', source: 'tiles_pro 05ee02ca' },
];

export const CLIFFS = [{ id: 'earth', from: 'earth' }, { id: 'rock', from: 'rock' }];

// raw = raw/objects/<raw>.png. metres = expected height. footprint in tiles (2 m). blocks = blocks movement.
// grade = { sat, val } darken/desaturate to the dark palette. keyAll = also key the background colour inside the sprite (holes in a crown). foot = foot point in raw px (default: bottom centre of the trimmed sprite).
// base = the ground patch PixelLab drew anyway: in raw rows >= y0, drop pixels outside x0..x1 and pixels that fail
// `keep` ('notgreen' trees, 'green' reeds/bushes, 'neutral' stone); rows >= cut are dropped.
const tree = { kind: 'tree', blocks: false, footprint: [1, 1] };
const stone = { kind: 'stone', blocks: true };
export const OBJECTS = [
  { id: 'pine-a', raw: 'pine-a', ...tree, metres: 12, keyAll: true, keyTol: 30, foot: { x: 115, y: 377 }, base: { y0: 350, x0: 92, x1: 136, cut: 378, keep: 'notgreen' }, source: 'map_object 5f138634' },
  { id: 'pine-b', raw: 'pine', ...tree, metres: 12, keyAll: true, foot: { x: 112, y: 379 }, base: { y0: 352, x0: 88, x1: 136, cut: 380, keep: 'notgreen' }, source: 'map_object f4cd85fe (ART-3)' },
  { id: 'tall-tree', raw: 'tall-tree', ...tree, metres: 11, keyTol: 30, keyAll: true, grade: { sat: 0.65, val: 0.72 }, foot: { x: 128, y: 371 }, base: { y0: 325, x0: 92, x1: 172, cut: 372, keep: 'notgreen' }, source: 'map_object f7af9159' },
  { id: 'cypress', raw: 'cypress', ...tree, metres: 10, grade: { sat: 0.7, val: 0.9 }, source: 'map_object 22d1629c' },
  { id: 'olive-a', raw: 'olive-a', ...tree, metres: 6, source: 'map_object 05b4c48b' },
  { id: 'olive-b', raw: 'olive-b', ...tree, metres: 6, source: 'map_object f4cb5094' },
  { id: 'oak', raw: 'oak', ...tree, metres: 10, keyAll: true, keyTol: 30, foot: { x: 160, y: 300 }, base: { y0: 240, x0: 102, x1: 218, cut: 303, keep: 'notgreen' }, source: 'map_object ad7a2a11' },
  { id: 'dead-tree', raw: 'dead-tree', ...tree, metres: 7, grade: { sat: 0.8, val: 0.8 }, source: 'map_object 9aa1eab1' },
  { id: 'bush-a', raw: 'bush-a', kind: 'bush', blocks: false, footprint: [1, 1], metres: 1.5, source: 'map_object bef56f03' },
  { id: 'bush-b', raw: 'bush-b', kind: 'bush', blocks: false, footprint: [1, 1], metres: 2.2, grade: { sat: 0.55, val: 0.85 }, base: { y0: 72, keep: 'green' }, source: 'map_object cf0ce6b4' },
  { id: 'reeds', raw: 'reeds', kind: 'reeds', blocks: false, footprint: [1, 1], metres: 2.2, base: { y0: 66, cut: 76, keep: 'green' }, source: 'map_object 5a5372ee' },
  { id: 'boulder-a', raw: 'boulder-a', ...stone, footprint: [1, 1], metres: 2, source: 'map_object 27f2ba41' },
  { id: 'boulder-b', raw: 'boulder-b', ...stone, footprint: [1, 1], metres: 1.4, base: { y0: 36, keep: 'neutral' }, source: 'map_object 65ddf82b' },
  { id: 'wall-ruin', raw: 'wall-ruin', ...stone, footprint: [2, 1], metres: 2.6, base: { y0: 62, keep: 'neutral' }, source: 'map_object c93797f6' },
  { id: 'watchtower', raw: 'watchtower', ...stone, footprint: [2, 2], metres: 12, grade: { sat: 0.8, val: 0.68 }, source: 'map_object 65e341c4' },
];
