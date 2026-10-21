// Elaia biome library (ART-6, W-21): terraced olive hills round a bay, marble (docs/WAR.md). Prompts: PROMPTS_ART.md
// "Biome: Elaia". Built by `node scripts/war/art/build.mjs` (all biomes after the global set) into public/war/biomes/elaia/.
// Same format as assets.mjs. Terrains not listed in FILLS (grass, sand, shallow, ...) are the built global ones, so every
// set's grass is the global grass pixel for pixel and Elaia joins the global sheets seamlessly.
export { PX_PER_M, TILE_M } from '../assets.mjs';
export const BATCH = 'elaia'; // raws: shots/war/pixellab/elaia/raw (git-ignored)
export const EXTRA_COLOURS = 64;

// Elaia's own terrains. grade = { sat, val } on the raw fill (PixelLab draws them far brighter than the dark palette).
export const FILLS = {
  dry: { dir: 'grass-dry', frame: 0, grade: { sat: 0.75, val: 0.6 } },
  rossa: { dir: 'grass-rossa', frame: 0, grade: { sat: 0.8, val: 0.68 } },
  marble: { dir: 'grass-marble', frame: 0, grade: { sat: 0.5, val: 0.6 } },
  grove: { dir: 'grass-grove', frame: 0, grade: { sat: 0.75, val: 0.75 } },
  paving: { dir: 'grass-paving', batch: 'art5', frame: 0, grade: { sat: 0.45, val: 1 } }, // W-48 landmark streets and plazas
  ruin: { dir: 'grass-rubble', frame: 0, grade: { sat: 0.55, val: 0.8 } }, // W-51: a ruined Greek quarter (broken paving, fallen ashlar, smashed roof tiles)
};

export const SETS = [
  { pair: 'grass-dry', first: 'grass', second: 'dry', dir: 'grass-dry', side: 'earth', source: 'tiles_pro 1d78f560 (ART-6)' },
  { pair: 'grass-rossa', first: 'grass', second: 'rossa', dir: 'grass-rossa', side: 'earth', source: 'tiles_pro eab57a4f (ART-6)' },
  { pair: 'grass-marble', first: 'grass', second: 'marble', dir: 'grass-marble', side: 'marble', sideName: 'marble', sideFrom: 0, sideGrade: { sat: 0.5, val: 0.6 }, source: 'tiles_pro 4138d83c (ART-6)' },
  { pair: 'grass-grove', first: 'grass', second: 'grove', dir: 'grass-grove', side: 'earth', source: 'tiles_pro bb9d82ae (ART-6)' },
  { pair: 'grass-paving', first: 'grass', second: 'paving', dir: 'grass-paving', batch: 'art5', side: 'earth', source: 'tiles_pro 03a3bc68 (W-48)' },
  { pair: 'grass-ruin', first: 'grass', second: 'ruin', dir: 'grass-rubble', side: 'earth', source: 'tiles_pro 90f682ab (W-51)' },
];

// 'fills' = tiles_pro a8909d68 (ART-6): 2 independent tiles per item, top vertex at y 11 (items: dry x2, rossa x2,
// marble x2, grove, pebble sand).
const fills = (frame) => ({ dir: 'fills', frame, y: 11 });
export const VARIANTS = {
  dry: [fills(0), fills(1), fills(2), fills(3)],
  rossa: [fills(4), fills(5), fills(6), fills(7)],
  marble: [fills(8), fills(9), fills(10)],
  grove: [fills(12), fills(13), 'shift'],
  ruin: ['shift', 'mirror'],
  // the bay's beach: the global sand with pebbles and shells (replaces the global sand variants inside Elaia)
  sand: [fills(14), fills(15), { dir: 'sand-shallow', frame: 15, batch: 'art5' }],
};

// W-51 crag kit: tall cliff faces cut from create_tiles_pro runs of tall iso rock blocks (build.mjs faceStrips).
export const CLIFFS = [
  { id: 'marble', from: 'marble' },
  { id: 'limestone', material: 'pale grey limestone, bedding, karst', faces: { dir: 'face-limestone', batch: 'crag', tiles: [0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 4, 5], grade: { sat: 0.6, val: 0.66 } }, source: 'tiles_pro b4073d50 (W-51)' },
];

export const FALLBACK = {
  note: 'Same rule as the global tiles.json fallback, over the global sheets plus these. Elaia terrains only have a set with grass, so any other pair (dry-rossa, marble-sand, ...) gets a grass verge; order says which corner gives way first.',
  order: ['deep', 'shallow', 'marsh', 'sand', 'dirt', 'grove', 'dry', 'rossa', 'forest', 'marble', 'rock', 'road', 'paving', 'ruin', 'grass'],
  buffer: { water: 'shallow', land: 'grass' },
};

// Objects: create_map_object, high top-down, high detail, detailed shading, true scale (33 px/m). Field meanings: assets.mjs.
// extra = extra metadata copied into objects.json (resource nodes, fauna). scale = area-downscale (PixelLab drew it too big for
// 33 px/m). mirror = flip (wall-a and vines run along the tile y axis, wall-b mirrored along x; footprint [x, y] tiles).
const tree = { kind: 'tree', blocks: false, footprint: [1, 1] };
const bush = { kind: 'bush', blocks: false, footprint: [1, 1] };
const stone = { kind: 'stone', blocks: true };
const greyGreen = { sat: 0.55, val: 0.75 };
export const OBJECTS = [
  { id: 'olive-ancient', raw: 'olive-ancient', ...tree, metres: 5.4, keyAll: true, base: { y0: 140, x0: 70, x1: 140, cut: 183, keep: 'notgreen' }, grade: greyGreen, source: 'map_object e67a8531' },
  { id: 'olive-orchard', raw: 'olive-orchard', ...tree, metres: 4.4, grade: greyGreen, source: 'map_object d181e4d7' },
  { id: 'olive-tall', raw: 'olive-tall', ...tree, metres: 5.6, keyAll: true, base: { y0: 170, x0: 65, x1: 125, cut: 197, keep: 'notgreen' }, grade: greyGreen, source: 'map_object d38dc264' },
  { id: 'cypress-tall', raw: 'cypress-tall', ...tree, metres: 10.5, grade: { sat: 0.7, val: 0.85 }, source: 'map_object e088c969' },
  { id: 'cypress-flame', raw: 'cypress-flame', ...tree, metres: 7.2, grade: { sat: 0.6, val: 0.8 }, source: 'map_object 5b4c60f0' },
  { id: 'stone-pine', raw: 'stone-pine', batch: 'art5', ...tree, metres: 10, keyAll: true, keyTol: 24, grade: { sat: 0.8, val: 0.85 }, source: 'map_object 5a38a8c6 (ART-5, shared with the global set)' },
  { id: 'holm-oak', raw: 'holm-oak-b', ...tree, metres: 5.9, keyAll: true, base: { y0: 190, x0: 82, x1: 152, cut: 222, keep: 'notgreen' }, grade: { sat: 0.7, val: 0.8 }, source: 'map_object a8afba0d' },
  { id: 'maquis-a', raw: 'maquis-a', ...bush, metres: 1.45, grade: { sat: 0.6, val: 0.8 }, source: 'map_object e631e831' },
  { id: 'maquis-b', raw: 'maquis-b', ...bush, metres: 2.4, grade: { sat: 0.6, val: 0.85 }, source: 'map_object 4eb56e7b' },
  { id: 'maquis-c', raw: 'maquis-c', ...bush, metres: 2, grade: { sat: 0.4, val: 0.7 }, source: 'map_object 119b5c90' },
  { id: 'herbs', raw: 'herbs', ...bush, metres: 0.65, scale: 0.65, grade: { sat: 0.6, val: 0.8 }, source: 'map_object 8e20f9f2' },
  { id: 'vines', raw: 'vines', kind: 'crop', blocks: false, footprint: [1, 2], metres: 2.6, grade: { sat: 0.65, val: 0.8 }, source: 'map_object e46652d4' },
  { id: 'marble-outcrop-a', raw: 'marble-crags', ...stone, footprint: [2, 1], metres: 2.6, base: { y0: 50, keep: 'neutral' }, grade: { sat: 0.5, val: 0.7 }, source: 'map_object f769bb66' },
  { id: 'marble-outcrop-b', raw: 'marble-outcrop-b', ...stone, footprint: [1, 1], metres: 1.6, grade: { sat: 0.5, val: 0.75 }, source: 'map_object 16026d8f' },
  { id: 'marble-quarry', raw: 'quarry-c', ...stone, footprint: [2, 2], metres: 4.3, base: { y0: 60, keep: 'neutral' }, grade: { sat: 0.5, val: 0.7 }, source: 'map_object d54f3bef' },
  { id: 'wall-a', raw: 'wall-a', ...stone, footprint: [1, 2], metres: 2, grade: { sat: 0.6, val: 0.75 }, source: 'map_object ef0ea0ce' },
  { id: 'wall-b', raw: 'wall-b', mirror: true, ...stone, footprint: [2, 1], metres: 1.9, base: { y0: 25, keep: 'neutral' }, grade: { sat: 0.6, val: 0.75 }, source: 'map_object acc796ff' },
  { id: 'shrine', raw: 'shrine', ...stone, footprint: [1, 1], metres: 2.6, grade: { sat: 0.6, val: 0.75 }, source: 'map_object c83847e6' },
  { id: 'beehives', raw: 'beehives-b', ...stone, footprint: [1, 1], metres: 1.1, scale: 0.8, grade: { sat: 0.6, val: 0.8 }, source: 'map_object 8db371d9' },
  { id: 'marble-deposit', raw: 'marble-deposit', ...stone, footprint: [2, 1], metres: 2.6, grade: { sat: 0.55, val: 0.85 }, extra: { resource: 'marble' }, source: 'map_object bbbe3413' },
  { id: 'olive-harvest', raw: 'olive-harvest', kind: 'prop', blocks: false, footprint: [1, 1], metres: 2, scale: 0.75, grade: { sat: 0.65, val: 0.8 }, extra: { resource: 'food' }, source: 'map_object b1d19d12' },
  { id: 'goats', raw: 'goats', kind: 'fauna', blocks: false, footprint: [2, 1], metres: 1.15, scale: 0.7, grade: { sat: 0.65, val: 0.8 }, extra: { fauna: 'goat', animateLater: true }, source: 'map_object 4d90e5b6' },
  { id: 'boar', raw: 'boar', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 1.05, scale: 0.65, grade: { sat: 0.7, val: 0.8 }, extra: { fauna: 'boar', mob: true, animateLater: true }, source: 'map_object 1a2ffbf2' },
  // W-48 waterfalls where a river falls over a cliff step (the fall itself is water: impassable), the foam of its plunge pool
  { id: 'waterfall', raw: 'waterfall', kind: 'prop', blocks: false, footprint: [1, 1], metres: 4.2, grade: { sat: 0.45, val: 0.72 }, source: 'map_object 8fdf1472 (W-48)' },
  { id: 'falls-foam', raw: 'falls-foam', kind: 'prop', blocks: false, footprint: [2, 1], metres: 1.7, grade: { sat: 0.45, val: 0.75 }, source: 'map_object 871f74b0 (W-48)' },
  // W-51 (PROMPTS_ART.md 40h): talus under the limestone faces, Greek ruin dressing and street life
  { id: 'talus-lime', raw: 'talus-lime', kind: 'stone', blocks: true, footprint: [2, 1], metres: 2.24, grade: { sat: 0.55, val: 0.68 }, extra: { overlay: 'talus', cliff: 'limestone' }, source: 'map_object 0c7de336 (W-51)' },
  { id: 'debris-stone', raw: 'debris-stone', kind: 'prop', blocks: false, footprint: [1, 1], metres: 1.88, grade: { sat: 0.55, val: 0.72 }, extra: { overlay: 'debris' }, source: 'map_object f791ec49 (W-51)' },
  { id: 'wall-fallen-stone', raw: 'wall-fallen-stone', kind: 'stone', blocks: true, footprint: [2, 1], metres: 2.58, grade: { sat: 0.55, val: 0.72 }, extra: { ruin: 'collapsed wall' }, source: 'map_object d5d0ba84 (W-51)' },
  { id: 'stall-awning', raw: 'stall-awning', kind: 'prop', blocks: false, footprint: [1, 1], metres: 2.27, grade: { sat: 0.6, val: 0.75 }, extra: { dressing: 'market awning' }, source: 'map_object 77c273fe (W-51)' },
  { id: 'palm-pot', raw: 'palm-pot', kind: 'prop', blocks: false, footprint: [1, 1], metres: 2.67, grade: { sat: 0.6, val: 0.75 }, extra: { dressing: 'potted palm' }, source: 'map_object 9a8f77ec (W-51)' },
  { id: 'amphora-stack', raw: 'amphora-stack', kind: 'prop', blocks: false, footprint: [1, 1], metres: 1.39, grade: { sat: 0.6, val: 0.75 }, extra: { dressing: 'amphorae' }, source: 'map_object 2839d874 (W-51)' },
  { id: 'handcart', raw: 'handcart', kind: 'prop', blocks: false, footprint: [1, 1], metres: 1.33, grade: { sat: 0.6, val: 0.75 }, extra: { dressing: 'cart' }, source: 'map_object da27388a (W-51)' },
  { id: 'steps-stone', raw: 'steps-stone', kind: 'prop', blocks: false, footprint: [1, 1], metres: 2.06, grade: { sat: 0.55, val: 0.72 }, extra: { dressing: 'steps' }, source: 'map_object 7d3fba3a (W-51)' },
];
