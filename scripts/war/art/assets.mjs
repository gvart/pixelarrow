// War region asset list: which raw PixelLab sets/objects become which game assets (prompts: PROMPTS_ART.md §23, §24).
export const PX_PER_M = 33; // W-18
export const TILE_M = 2;

// Raws live in shots/war/pixellab/<batch>/raw (git-ignored); batch defaults to art4.
// FILLS: the one full tile of each terrain (raw set dir + frame, optional tone). Every set replaces both of its terrains by
// these fills, pixel for pixel, so a terrain looks the same in every set and edges line up (grass base identical across sets).
export const FILLS = {
  grass: { dir: 'grass-dirt', frame: 15 },
  dirt: { dir: 'grass-dirt', frame: 0 },
  sand: { dir: 'grass-sand', frame: 0, tone: 0.82 },
  rock: { dir: 'grass-rock', frame: 0 },
  forest: { dir: 'grass-forest-2', frame: 0 },
  marsh: { dir: 'grass-marsh', frame: 0 },
  road: { dir: 'grass-road', frame: 0, tone: 0.7 },
  shallow: { dir: 'grass-shallow', frame: 0 },
  deep: { dir: 'shallow-deep', frame: 0, tone: 0.72 },
};

// dir = raw/tiles/<dir>; first terrain = set bit. side: which side texture the tiles get ('own' keeps the raw);
// sideName/sideFrom: this set's side becomes a named side (cliff material).
export const SETS = [
  { pair: 'grass-dirt', first: 'grass', second: 'dirt', dir: 'grass-dirt', side: 'own', sideName: 'earth', sideFrom: 15, source: 'tiles_pro 4dd226e7 (ART-3)' },
  { pair: 'grass-sand', first: 'grass', second: 'sand', dir: 'grass-sand', side: 'earth', source: 'tiles_pro 15ee8a0d (palette-locked)' },
  { pair: 'grass-rock', first: 'grass', second: 'rock', dir: 'grass-rock', side: 'own', sideName: 'rock', sideFrom: 0, source: 'tiles_pro 11b1a38c' },
  { pair: 'grass-forest', first: 'grass', second: 'forest', dir: 'grass-forest-2', side: 'earth', source: 'tiles_pro dbdd9898 (seed 32; adbc0d25 read as tilled soil)' },
  { pair: 'grass-marsh', first: 'grass', second: 'marsh', dir: 'grass-marsh', side: 'own', source: 'tiles_pro 5f02d0cd' },
  { pair: 'grass-road', first: 'grass', second: 'road', dir: 'grass-road', side: 'earth', source: 'tiles_pro dc427abc' },
  { pair: 'grass-shallow', first: 'grass', second: 'shallow', dir: 'grass-shallow', side: 'own', source: 'tiles_pro a7097915 (ART-3)' },
  { pair: 'shallow-deep', first: 'shallow', second: 'deep', dir: 'shallow-deep', side: 'own', gate: 0.4, source: 'tiles_pro 05ee02ca' },
  { pair: 'sand-shallow', first: 'sand', second: 'shallow', dir: 'sand-shallow', batch: 'art5', side: 'earth', source: 'tiles_pro 8292629f (ART-5)' },
  { pair: 'road-rock', first: 'road', second: 'rock', dir: 'road-rock', batch: 'art5', side: 'rock', source: 'tiles_pro 2fb9aac7 (ART-5)' },
];

// Full-tile variants (W-21 repetition): frame 0 = the fill, then one frame per source. A source is the fill itself
// mirrored ('mirror'), the fill's periodic plane shifted by half a tile ('shift'), or another raw full tile of the same
// terrain ({ dir, frame, batch }) colour-matched to the fill. Each variant keeps the fill's outer band (seams) and swaps the interior.
// 'fills' = tiles_pro 7038755a (ART-5): independent 64x64 tiles, top vertex at y 11.
const fills = (frame) => ({ dir: 'fills', batch: 'art5', frame, y: 11 });
export const VARIANTS = {
  grass: [fills(12), fills(14), fills(15), { dir: 'grass-rock', frame: 15 }],
  forest: [fills(0), fills(4), fills(5)],
  marsh: [fills(6), fills(7), 'shift'],
  sand: [{ dir: 'sand-shallow', frame: 15, batch: 'art5' }, 'shift'],
  dirt: [fills(8), fills(9), fills(10)],
};

// Pairs test-ridge has with no set of their own: the renderer moves the corner terrain instead (see tiles.json fallback).
export const FALLBACK = {
  note: 'Corner terrain is per map vertex (water: 2 deep, 1 shallow, else the terrain). Before autotiling: (1) a deep vertex with any land vertex among its 8 neighbours becomes shallow, so shores always get a shallow band (grass-deep, sand-deep, rock-deep, marsh-deep, road-deep become X-shallow). (2) Repeat over tiles until stable (cap 30 passes): a corner pair with no sheet -> the land corner of a land/water pair, else the lower of the two in `order`, becomes grass (road-sand gets a grass verge; rock-, marsh-, road-shallow a grass bank; forest-rock a grass edge); a tile with 3+ corner terrains -> its grass corners take its commonest other terrain, or with no grass its rarest terrain does. (3) A tile still holding 3 terrains: draw the commonest pair that has a sheet, other corners count as that sheet\'s first terrain. Full tiles: draw a variant (variants[]). Reference implementation: scripts/war/art/preview.mjs resolve()/tileFor().',
  order: ['deep', 'shallow', 'marsh', 'sand', 'dirt', 'forest', 'rock', 'road', 'grass'],
  buffer: { water: 'shallow', land: 'grass' },
};

export const CLIFFS = [{ id: 'earth', from: 'earth' }, { id: 'rock', from: 'rock' }];

// raw = raw/objects/<raw>.png. metres = design height (QA: sprite height = metres x 33 +-10%). footprint in tiles (2 m).
// blocks = blocks movement. grade = { sat, val } darken/desaturate to the dark palette. keyAll = also key the background
// colour inside the sprite (holes in a crown). The anchor (foot) is the centre of the bottom rows of the trimmed sprite.
// base = the ground patch PixelLab drew anyway: in raw rows >= y0, drop pixels outside x0..x1 and pixels that fail
// `keep` ('notgreen' trees, 'green' reeds/bushes, 'neutral' stone); rows >= cut are dropped.
const tree = { kind: 'tree', blocks: false, footprint: [1, 1] };
const stone = { kind: 'stone', blocks: true };
export const OBJECTS = [
  { id: 'pine-a', raw: 'pine-a', ...tree, metres: 11, keyAll: true, keyTol: 30, base: { y0: 350, x0: 92, x1: 136, cut: 378, keep: 'notgreen' }, source: 'map_object 5f138634' },
  { id: 'pine-b', raw: 'pine', ...tree, metres: 11, keyAll: true, base: { y0: 352, x0: 88, x1: 136, cut: 380, keep: 'notgreen' }, source: 'map_object f4cd85fe (ART-3)' },
  { id: 'stone-pine', raw: 'stone-pine', batch: 'art5', ...tree, metres: 10, keyAll: true, keyTol: 24, grade: { sat: 0.8, val: 0.85 }, source: 'map_object 5a38a8c6 (ART-5)' },
  { id: 'cypress', raw: 'cypress', ...tree, metres: 10, grade: { sat: 0.7, val: 0.9 }, source: 'map_object 22d1629c' },
  { id: 'olive-a', raw: 'olive-a', ...tree, metres: 5.2, source: 'map_object 05b4c48b' },
  { id: 'olive-b', raw: 'olive-b', ...tree, metres: 5, source: 'map_object f4cb5094' },
  { id: 'oak', raw: 'oak', ...tree, metres: 8, keyAll: true, keyTol: 30, base: { y0: 240, x0: 102, x1: 218, cut: 303, keep: 'notgreen' }, source: 'map_object ad7a2a11' },
  { id: 'dead-tree', raw: 'dead-tree', ...tree, metres: 6, grade: { sat: 0.8, val: 0.8 }, source: 'map_object 9aa1eab1' },
  { id: 'bush-a', raw: 'bush-a', kind: 'bush', blocks: false, footprint: [1, 1], metres: 1.4, source: 'map_object bef56f03' },
  { id: 'bush-b', raw: 'bush-b', kind: 'bush', blocks: false, footprint: [1, 1], metres: 2.2, grade: { sat: 0.55, val: 0.85 }, base: { y0: 72, keep: 'green' }, source: 'map_object cf0ce6b4' },
  { id: 'reeds', raw: 'reeds', kind: 'reeds', blocks: false, footprint: [1, 1], metres: 1.8, base: { y0: 66, cut: 76, keep: 'green' }, source: 'map_object 5a5372ee' },
  { id: 'boulder-a', raw: 'boulder-a', ...stone, footprint: [1, 1], metres: 1.8, source: 'map_object 27f2ba41' },
  { id: 'boulder-b', raw: 'boulder-b', ...stone, footprint: [1, 1], metres: 1.2, base: { y0: 36, keep: 'neutral' }, source: 'map_object 65ddf82b' },
  { id: 'wall-ruin', raw: 'wall-ruin', ...stone, footprint: [2, 1], metres: 2.5, base: { y0: 62, keep: 'neutral' }, source: 'map_object c93797f6' },
  { id: 'watchtower', raw: 'watchtower-floor', batch: 'art5', ...stone, footprint: [2, 2], metres: 12, grade: { sat: 0.8, val: 0.68 }, source: 'map_object 9a04562b (ART-5)' },
];
