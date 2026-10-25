// Dodona biome library (ART-9, W-21): dense oak, beech and silver fir forest of the NW home region, the oracle grove,
// iron bog ore, timber and pitch (docs/WAR.md: Dodona, Ladon Oakwood, Teeth Foothills). Prompts: PROMPTS_ART.md
// "Biome: Dodona". Built by `node scripts/war/art/build.mjs` (all biomes after the global set) into public/war/biomes/dodona/.
// Same format as assets.mjs. Every land set pairs its terrain with the global grass (first terrain), so grass is the built
// global grass pixel for pixel; the stream bank pairs with the global shallow water.
export { PX_PER_M, TILE_M } from '../assets.mjs';
export const BATCH = 'dodona'; // raws: shots/war/pixellab/dodona/raw (git-ignored)
export const EXTRA_COLOURS = 64;

// Dodona's own terrains. grade = { sat, val } on the raw fill (PixelLab draws them far brighter than the dark palette).
export const FILLS = {
  litter: { dir: 'grass-litter', frame: 0, grade: { sat: 0.9, val: 0.8 } },
  moss: { dir: 'grass-moss', frame: 0, grade: { sat: 0.8, val: 0.8 } },
  fern: { dir: 'grass-fern', frame: 0, grade: { sat: 0.8, val: 0.8 } },
  mud: { dir: 'grass-mud', frame: 0, grade: { sat: 0.9, val: 0.8 } },
  bank: { dir: 'bank-shallow', frame: 15, grade: { sat: 0.9, val: 0.8 } },
};

export const SETS = [
  // litter and fern came back as straight block splits (stair-step edges on the map): split by noise as well
  { pair: 'grass-litter', first: 'grass', second: 'litter', dir: 'grass-litter', side: 'earth', organic: 0.6, source: 'tiles_pro 9a5bf453 (ART-9)' },
  // the moss set came back without a mask-8 tile (tile_8 is a second mask 0): split by noise, not by the raw edge
  { pair: 'grass-moss', first: 'grass', second: 'moss', dir: 'grass-moss', side: 'earth', organic: 0.6, source: 'tiles_pro a1a6008c (ART-9)' },
  { pair: 'grass-fern', first: 'grass', second: 'fern', dir: 'grass-fern', side: 'earth', organic: 0.6, source: 'tiles_pro 521687cc (ART-9)' },
  { pair: 'grass-mud', first: 'grass', second: 'mud', dir: 'grass-mud', side: 'earth', organic: 0.6, source: 'tiles_pro ea0c817f (ART-9)' },
  { pair: 'bank-shallow', first: 'bank', second: 'shallow', dir: 'bank-shallow', side: 'earth', source: 'tiles_pro e57b498a (ART-9)' },
];

// 'fills' = tiles_pro cd0f4cfd (ART-9): PixelLab drew only the first 4 of 8 items, 4 tiles each (0-7 leaf litter and twigs,
// 8-11 moss, 12-15 ferns). 'fills2' = tiles_pro 8003c3fb: 4 items x 4 (0-3 mud, 4-7 bank, 8-11 flowered clearing grass,
// 12-15 clover clearing grass). Top vertex at y 11.
const fills = (frame) => ({ dir: 'fills', frame, y: 11 });
const fills2 = (frame) => ({ dir: 'fills2', frame, y: 11 });
const art5 = (frame) => ({ dir: 'fills', batch: 'art5', frame, y: 11 });
export const VARIANTS = {
  litter: [fills(0), fills(1), fills(2), fills(5)],
  moss: [fills(8), fills(9), fills(10)],
  fern: [fills(12), fills(13), fills(15)],
  mud: [fills2(0), fills2(1), fills2(2)],
  bank: [fills2(4), fills2(5), 'shift'],
  // forest clearings: the global grass variants plus wildflower and clover grass (replaces the global list inside Dodona)
  grass: [art5(12), art5(14), art5(15), { dir: 'grass-rock', frame: 15, batch: 'art4' }, fills2(8), fills2(9), fills2(12), fills2(13)],
};

export const CLIFFS = [];

// Dodona terrains only have a set with grass (bank: with shallow water), so any other pair (litter-moss, fern-mud, ...)
// gets a grass verge; a forest terrain next to water gets a grass bank, the bank meets water directly.
export const FALLBACK = {
  note: 'Same rule as the global tiles.json fallback, over the global sheets plus these. Dodona terrains only have a set with grass (bank: with shallow), so any other pair (litter-moss, fern-mud, bank-grass, ...) gets a grass verge; order says which corner gives way first.',
  order: ['deep', 'shallow', 'marsh', 'sand', 'dirt', 'bank', 'mud', 'moss', 'fern', 'litter', 'forest', 'snow', 'rock', 'road', 'grass'],
  buffer: { water: 'shallow', land: 'grass' },
};

// Objects: create_map_object, high top-down, high detail, detailed shading, true scale (33 px/m). Field meanings: assets.mjs
// and elaia.mjs / kyrene.mjs. extra = metadata copied into objects.json (resource nodes, fauna, sacred set pieces).
const tree = { kind: 'tree', blocks: false, footprint: [1, 1] };
const bush = { kind: 'bush', blocks: false, footprint: [1, 1] };
const stone = { kind: 'stone', blocks: true };
const leaf = { sat: 0.7, val: 0.75 };
const wood = { sat: 0.7, val: 0.75 };
export const OBJECTS = [
  { id: 'oak-sacred', raw: 'oak-sacred', ...tree, footprint: [2, 2], metres: 10, keyAll: true, base: { y0: 230, below: [[95, 235], [130, 258], [165, 300], [200, 335], [235, 305], [255, 262], [285, 238], [330, 228]], keep: 'notgreen' }, grade: leaf, extra: { sacred: true }, source: 'map_object 3c4515e1' },
  { id: 'oak-a', raw: 'oak-a', ...tree, metres: 9, keyAll: true, base: { y0: 255, x0: 140, x1: 185, cut: 300, keep: 'notgreen' }, grade: leaf, source: 'map_object 3e22bfd2' },
  { id: 'oak-b', raw: 'oak-b', ...tree, metres: 7, keyAll: true, base: { y0: 190, drop: [['#acb2bc', 24]] }, grade: leaf, source: 'map_object dfda2b18' },
  { id: 'beech-a', raw: 'beech-a', ...tree, metres: 11, keyAll: true, grade: leaf, source: 'map_object aefee5fd' },
  { id: 'beech-young', raw: 'beech-young', ...tree, metres: 6.5, keyAll: true, grade: leaf, source: 'map_object 21c14136' },
  { id: 'fir-silver', raw: 'fir-a', ...tree, metres: 11, keyAll: true, base: { y0: 320, drop: [['#4a6475', 24]] }, grade: { sat: 0.75, val: 0.85 }, source: 'map_object 680fb86e' },
  { id: 'fir-silver-b', raw: 'fir-b', ...tree, metres: 7.5, grade: { sat: 0.75, val: 0.85 }, source: 'map_object 6ed6a245' },
  { id: 'log-fallen', raw: 'log', kind: 'prop', blocks: true, footprint: [1, 2], metres: 1.6, scale: 0.8, grade: wood, source: 'map_object 0db6b9fd' },
  { id: 'stump-a', raw: 'stump-a', kind: 'prop', blocks: false, footprint: [1, 1], metres: 1.05, scale: 0.75, grade: wood, source: 'map_object 66db7c77' },
  { id: 'stump-moss', raw: 'stump-b', kind: 'prop', blocks: false, footprint: [1, 1], metres: 1.3, scale: 0.7, base: { y0: 44, x0: 28, x1: 58, cut: 60, keep: 'notgreen' }, grade: wood, source: 'map_object a1218c36' },
  { id: 'fern-a', raw: 'fern-a', ...bush, metres: 1, scale: 0.75, grade: leaf, source: 'map_object f35b94e9' },
  { id: 'fern-b', raw: 'fern-b', ...bush, metres: 0.6, scale: 0.55, grade: leaf, source: 'map_object 24f28600' },
  { id: 'fern-c', raw: 'fern-c', ...bush, footprint: [2, 1], metres: 1, scale: 0.62, grade: leaf, source: 'map_object 452862e7' },
  { id: 'mushrooms', raw: 'mushrooms', ...bush, metres: 0.35, scale: 0.36, base: { y0: 30, keep: 'notgreen' }, grade: wood, source: 'map_object f7cf68fb' },
  { id: 'boulder-moss-a', raw: 'boulder-a', ...stone, footprint: [1, 1], metres: 1.6, base: { y0: 52, keep: 'notgreen' }, grade: { sat: 0.7, val: 0.8 }, source: 'map_object 26a02221' },
  { id: 'boulder-moss-b', raw: 'boulder-b', ...stone, footprint: [1, 1], metres: 1.35, base: { y0: 38, below: [[8, 40], [30, 47], [50, 49], [70, 47], [90, 40]], keep: 'notgreen' }, grade: { sat: 0.7, val: 0.8 }, source: 'map_object b1eff51e' },
  { id: 'bramble', raw: 'bramble', ...bush, footprint: [2, 1], metres: 1.3, scale: 0.67, grade: leaf, source: 'map_object 4ecce8cc' },
  { id: 'oracle-grove', raw: 'shrine', ...stone, footprint: [3, 3], metres: 4.5, base: { y0: 40, keep: 'notgreen' }, grade: { sat: 0.7, val: 0.8 }, extra: { sacred: true }, source: 'map_object b4195dcd' },
  { id: 'hut-ruin', raw: 'hut', ...stone, footprint: [2, 2], metres: 3.3, grade: wood, source: 'map_object 1954cea1' },
  { id: 'charcoal-pile', raw: 'charcoal', ...stone, footprint: [2, 2], metres: 3.1, base: { y0: 70, keep: 'notgreen' }, grade: wood, source: 'map_object aa08c249' },
  { id: 'iron-bog', raw: 'iron-bog', ...stone, footprint: [2, 1], metres: 2, grade: { sat: 0.75, val: 0.8 }, extra: { resource: 'iron' }, source: 'map_object 926e88cb' },
  { id: 'timber-stand', raw: 'timber-stand', ...tree, blocks: true, footprint: [2, 2], metres: 7.5, keyAll: true, base: { y0: 195, below: [[8, 212], [100, 262], [192, 210]], drop: [['#49652d', 40], ['#6f9a40', 50], ['#a8b878', 50], ['#76337f', 40]] }, grade: leaf, extra: { resource: 'wood', rich: true }, source: 'map_object 735af61e' },
  { id: 'pitch-pine', raw: 'pitch-pine', ...tree, metres: 9.5, keyAll: true, base: { y0: 275, x0: 55, x1: 90, cut: 315, keep: 'notgreen' }, grade: { sat: 0.75, val: 0.8 }, extra: { resource: 'pitch' }, source: 'map_object 8ae6b3c1' },
  { id: 'red-deer', raw: 'deer', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 2, scale: 0.8, grade: { sat: 0.7, val: 0.8 }, extra: { fauna: 'deer', idle: { file: 'red-deer-idle.png', frames: 6, w: 45, h: 69, anchor: { x: 19, y: 68 } } }, source: 'map_object 7bc4f304' },
  { id: 'owl', raw: 'owl', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 0.7, scale: 0.6, grade: { sat: 0.7, val: 0.8 }, extra: { fauna: 'owl', flying: true, idle: { file: 'owl-idle.png', frames: 6, w: 37, h: 29, anchor: { x: 18, y: 28 } } }, source: 'map_object 20db2686' },
];
