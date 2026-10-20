// Iron Teeth mountains biome library (ART-8, W-21): the h7 chain between Dodona and Skythia, the Kleisoura Pass (tin),
// Krios Glacier, Eagle Saddle, Teeth Foothills / Eastern Slopes (docs/WAR.md). Owner: mountains must read real and tall,
// not as stacked terraces, so the mountain mass is painted massif sprites (pieces from PixelLab, composed up to ~760 px)
// drawn over the impassable rock area; tiles are the ground round and under them.
// Prompts: PROMPTS_ART.md "Biome: Iron Teeth mountains". Built by `node scripts/war/art/build.mjs --biome mountains`.
// Placement of the massifs: public/war/biomes/mountains/massifs.json.
export { PX_PER_M, TILE_M } from '../assets.mjs';
export const BATCH = 'mountains'; // raws: shots/war/pixellab/mountains/raw (git-ignored)
export const EXTRA_COLOURS = 64;

// Own terrains (grass, rock and snow are the global full tiles). grade = { sat, val } on the raw fill.
export const FILLS = {
  scree: { dir: 'grass-scree', frame: 0, grade: { sat: 0.6, val: 0.9 } },
  meadow: { dir: 'grass-meadow', frame: 0, grade: { hue: -75, sat: 0.8, val: 0.75 } }, // PixelLab drew a teal turf: turned to a cool dark green
  gravel: { dir: 'grass-gravel', frame: 0, grade: { sat: 0.8, val: 0.72 } },
  paving: { dir: 'grass-paving', batch: 'art5', frame: 0, grade: { sat: 0.6, val: 0.75 } }, // W-48 landmark streets and plazas
};

export const SETS = [
  { pair: 'grass-scree', first: 'grass', second: 'scree', dir: 'grass-scree', side: 'rock', source: 'tiles_pro 13c4f212 (ART-8)' },
  { pair: 'grass-meadow', first: 'grass', second: 'meadow', dir: 'grass-meadow', side: 'earth', source: 'tiles_pro 2af39b25 (ART-8)' },
  { pair: 'grass-gravel', first: 'grass', second: 'gravel', dir: 'grass-gravel', side: 'earth', source: 'tiles_pro a3f7d872 (ART-8)' },
  { pair: 'grass-snow', first: 'grass', second: 'snow', dir: 'grass-snow', side: 'earth', organic: 0.6, source: 'tiles_pro 4418d45e (ART-8)' },
  { pair: 'rock-scree', first: 'rock', second: 'scree', dir: 'rock-scree', side: 'rock', globalFull: true, source: 'tiles_pro d316baf4 (ART-8)' },
  { pair: 'grass-paving', first: 'grass', second: 'paving', dir: 'grass-paving', batch: 'art5', side: 'earth', source: 'tiles_pro 03a3bc68 (W-48)' },
];

// 'fills' = tiles_pro c6456277 (ART-8): 16 independent 64x64 tiles, top vertex at y 11. PixelLab ignored the item order:
// 0-3 scree, 4-7 rock with fallen boulders, 8-15 teal alpine turf (no gravel, no steep slab).
const fills = (frame) => ({ dir: 'fills', frame, y: 11 });
const rockFills = (frame) => ({ dir: 'rock-fills', batch: 'tfix', frame, y: 11 }); // the global rock variants (terrain fix)
export const VARIANTS = {
  scree: [fills(0), fills(1), fills(2), fills(3)],
  meadow: ['shift', 'mirror'], // the turf fills (8-15) stay teal after the colour match: unused
  gravel: ['shift', 'mirror'],
  // a biome list replaces the global one: keep the global rock variants and add the boulder-strewn rock
  rock: [rockFills(0), rockFills(1), rockFills(2), rockFills(3), fills(4), fills(6)],
};

export const CLIFFS = [];

export const FALLBACK = {
  note: 'Same rule as the global tiles.json fallback, over the global sheets plus these (land buffer grass). Mountain pairs with a sheet: grass-scree, grass-meadow, grass-gravel, grass-snow, rock-scree (plus the global grass-rock, rock-snow, road-rock); others (scree-snow, meadow-rock, gravel-rock, ...) get a grass verge.',
  order: ['deep', 'shallow', 'marsh', 'sand', 'dirt', 'meadow', 'gravel', 'forest', 'snow', 'scree', 'rock', 'road', 'paving', 'grass'],
  buffer: { water: 'shallow', land: 'grass' },
};

// Objects: create_map_object (high top-down, high detail, detailed shading) unless noted; mountain pieces are
// create_image_pixflux img2img over crops of the approved Gemini Kleisoura art (opaque dark background, keyed here:
// keep the neutral greys, drop the background colour and everything under the `below` line). Field meanings: assets.mjs;
// base.below = [x0, y0, x1, y1]: drop pixels under that line (streaks and debris under a mountain's foot).
// compose = several raws pasted into one sprite (build.mjs). extra = metadata copied into objects.json.
const tree = { kind: 'tree', blocks: false, footprint: [1, 1] };
const bush = { kind: 'bush', blocks: false, footprint: [1, 1] };
const stone = { kind: 'stone', blocks: true };
const mtn = { kind: 'massif', blocks: true };
const rockG = { sat: 0.55, val: 0.86 };
// keyBorder floods the opaque background; `below` (the mountain's foot, read off the raw) drops the ledges, streaks and
// river PixelLab kept under it; `neutral` also drops the brown cliffs of the unmasked crops (the masked crops' snow is
// lilac, so they skip it).
const foot = (hex, below, neutral) => ({ y0: 0, drop: [[hex, 10]], below, ...(neutral && { keep: 'neutral' }) });
const RIDGE_A = foot('#1a120d', [[0, 260], [100, 290], [150, 296], [200, 260], [250, 220], [300, 170], [350, 130], [400, 100]], true);
const RIDGE_B = foot('#201613', [[0, 250], [30, 262], [100, 292], [150, 272], [200, 247], [275, 217], [325, 152], [400, 95]]);
const TWIN = foot('#1f1614', [[0, 170], [45, 250], [90, 330], [130, 365], [165, 340], [170, 280], [210, 240], [235, 210], [250, 202], [300, 185], [335, 155], [400, 150]]);
const BIG = foot('#1e140e', [[0, 160], [45, 240], [95, 320], [125, 330], [175, 250], [205, 185], [270, 160], [330, 150], [400, 140]], true);
// A massif along the tile y axis (compose, build.mjs): a peak behind, ridge-b further up-right covering the peak's foot,
// ridge-a in front down-left (one tile along -y is +32, -16 px); `x` mirrors the group for a chain along the x axis.
const RIDGE_C = foot('#1c1512', [[0, 252], [50, 262], [100, 270], [150, 250], [200, 235], [250, 215], [300, 165], [325, 145], [350, 125], [400, 115]]);
const PEAK_D = foot('#1d1513', [[0, 165], [45, 245], [90, 320], [125, 345], [165, 300], [185, 260], [210, 220], [240, 200], [280, 165], [320, 150], [400, 150]]);
const CW = 650, CH = 480;
const W_ = { 'peak-big': 345, 'peak-twin': 336, 'peak-d': 346, 'ridge-a': 400, 'ridge-b': 394, 'ridge-c': 400 }; // built widths
const chain = (peak, [px, py], [bx, by], x = false, back = 'ridge-b', front = 'ridge-a') => {
  const at = (id, X, Y) => (x ? { id: `${id}-x`, x: CW - X - W_[id], y: Y } : { id, x: X, y: Y });
  return { w: CW, h: CH, parts: [at(peak, px, py), at(back, bx, by), at(front, 0, 190)] };
};
const HW_ = 720, HH_ = 650;
const high = (x = false) => {
  const at = (id, X, Y, w) => (x ? { id: `${id}-x`, x: HW_ - X - w, y: Y } : { id, x: X, y: Y });
  return { w: HW_, h: HH_, parts: [at('peak-big', 280, 0, 345), at('peak-twin', 380, 50, 336), at('massif-b', 0, 170, 624)] };
};
// Relief pieces (ART-8 refine): pixflux img2img over heightfield inits drawn by relief.mjs (varied silhouettes so a range
// reads as one chain, not a field of cones). Foot line = the init's lowest drawn pixel per column, 6 px up; trimFoot then drops
// the bottom 12 px of every column (PixelLab paints a light scree rim round the base that reads as a plinth). [footprint, job, foot line, trim]
const R_FOOT = (below, trim = 12) => ({ ...foot('#1e1613', below), trimFoot: trim });
const RELIEF = {
  'peak-lean': [[5, 7], 'b05b0ce4', [[60, 286], [80, 297], [100, 303], [120, 325], [140, 332], [160, 331], [180, 323], [200, 319], [220, 314], [240, 306], [260, 300], [280, 292], [300, 278], [320, 258], [330, 248]]],
  'peak-horn': [[6, 6], '0c4c2304', [[40, 304], [60, 328], [80, 343], [100, 345], [120, 350], [140, 356], [160, 359], [180, 362], [200, 366], [220, 364], [240, 353], [260, 344], [280, 334], [290, 328]]],
  'saddle-long': [[4, 9], '0d261581', [[60, 257], [80, 265], [100, 266], [120, 265], [140, 262], [160, 255], [180, 248], [200, 235], [220, 229], [240, 222], [260, 213], [280, 201], [300, 194], [320, 187], [340, 177], [360, 166], [370, 158]]],
  'ridge-broken': [[4, 8], '3411e052', [[30, 212], [50, 224], [70, 234], [90, 240], [110, 239], [130, 236], [150, 236], [170, 233], [190, 225], [210, 218], [230, 210], [250, 200], [270, 192], [290, 176], [310, 158], [330, 145], [350, 131], [360, 128]]],
  'spur': [[4, 8], '94ef0361', [[60, 236], [80, 255], [100, 262], [120, 262], [140, 261], [160, 258], [180, 254], [200, 248], [220, 241], [240, 235], [260, 229], [280, 219], [300, 206], [320, 185], [340, 161]]],
  'shoulder': [[5, 7], 'bf60ba24', [[50, 189], [70, 201], [90, 211], [110, 216], [130, 218], [150, 219], [170, 216], [190, 208], [210, 206], [230, 201], [250, 194], [270, 185], [290, 165], [310, 135], [330, 129], [350, 116]]],
  'foothill-a': [[4, 5], 'ef843d7a', [[50, 118], [70, 124], [90, 138], [110, 148], [130, 151], [150, 148], [170, 143], [190, 133], [210, 126], [230, 117]], 18],
  'foothill-b': [[3, 7], 'fa6d0b07', [[60, 147], [80, 163], [100, 168], [120, 166], [140, 153], [160, 147], [180, 141], [200, 133], [220, 122], [240, 115], [260, 107], [280, 97], [300, 78], [310, 67]]],
  'crags': [[4, 5], 'b1814f87', [[50, 160], [70, 171], [90, 177], [110, 184], [130, 184], [150, 178], [170, 171], [190, 164], [210, 155], [230, 138], [240, 133]], 20],
  'massif-great': [[6, 6], '0fe030ab', [[30, 303], [50, 319], [70, 329], [90, 334], [110, 337], [130, 344], [150, 360], [170, 370], [190, 369], [210, 360], [230, 355], [250, 352], [270, 347], [290, 342], [310, 334], [330, 323], [350, 309]]],
  'massif-twin': [[6, 7], 'e321846c', [[50, 289], [70, 300], [90, 310], [110, 319], [130, 323], [150, 318], [170, 320], [190, 325], [210, 325], [230, 322], [250, 309], [270, 300], [290, 290], [310, 276], [330, 251]]],
};
const M_M = { 'peak-lean': 9.2, 'peak-horn': 8.9, 'saddle-long': 7.9, 'ridge-broken': 6.1, 'spur': 8, 'shoulder': 6.3, 'foothill-a': 3.1, 'foothill-b': 5, 'crags': 4.3, 'massif-great': 10.7, 'massif-twin': 7.8 }; // metres = built height / 33
// summits: the top ~400 px of a very tall mountain (the foot is cut by the canvas), only used at the back of a core
const P = (id, u, v, mirror = false) => ({ id, at: [u, v], mirror }); // a compose part with its foot at tile (u, v)
const summits = [['summit-a', '0e84dced'], ['summit-b', '54fd6558']].map(([id, job]) => ({ id, raw: id, ...mtn, part: true, footprint: [6, 6], metres: 10, base: foot('#1e1613', [[0, 400]]), grade: rockG, source: `pixflux ${job} (img2img over a relief.mjs summit init)` }));
const reliefPieces = Object.entries(RELIEF).flatMap(([id, [fp, job, below, trim]]) => [
  { id, raw: id, ...mtn, footprint: fp, metres: M_M[id], base: R_FOOT(below, trim), grade: rockG, extra: { massif: 'piece' }, source: `pixflux ${job} (img2img over a relief.mjs heightfield init)` },
  { id: `${id}-x`, raw: id, ...mtn, footprint: [fp[1], fp[0]], metres: M_M[id], mirror: true, base: R_FOOT(below, trim), grade: rockG, extra: { massif: 'piece' }, source: `pixflux ${job}, mirrored` },
]);
export const OBJECTS = [
  ...reliefPieces,
  ...summits,
  // mountain pieces (one PixelLab canvas each); ridges run along the tile y axis, `-x` mirrors run along x
  { id: 'ridge-a', raw: 'ridge-a', ...mtn, footprint: [3, 10], metres: 8.5, base: RIDGE_A, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux dfdc3263 (img2img, Gemini Kleisoura crop)' },
  { id: 'ridge-a-x', raw: 'ridge-a', ...mtn, footprint: [10, 3], metres: 8.5, mirror: true, base: RIDGE_A, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux dfdc3263, mirrored' },
  { id: 'ridge-b', raw: 'ridge-b', ...mtn, footprint: [3, 10], metres: 8.5, base: RIDGE_B, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux ab1339c9 (img2img, masked crop)' },
  { id: 'ridge-b-x', raw: 'ridge-b', ...mtn, footprint: [10, 3], metres: 8.5, mirror: true, base: RIDGE_B, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux ab1339c9, mirrored' },
  { id: 'peak-big', raw: 'peak-big', ...mtn, footprint: [5, 5], metres: 10, base: BIG, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux f2c391cb (img2img, Gemini Kleisoura crop)' },
  { id: 'peak-twin', raw: 'peak-twin', ...mtn, footprint: [5, 5], metres: 11.1, base: TWIN, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux 52aed892 (img2img, masked crop)' },
  { id: 'peak-big-x', raw: 'peak-big', ...mtn, footprint: [5, 5], metres: 10, mirror: true, base: BIG, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux f2c391cb, mirrored' },
  { id: 'peak-twin-x', raw: 'peak-twin', ...mtn, footprint: [5, 5], metres: 11.1, mirror: true, base: TWIN, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux 52aed892, mirrored' },
  { id: 'ridge-c', raw: 'ridge-c', ...mtn, footprint: [3, 10], metres: 8.5, base: RIDGE_C, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux 40248f1a (img2img, Gemini Kleisoura crop, seed 21)' },
  { id: 'ridge-c-x', raw: 'ridge-c', ...mtn, footprint: [10, 3], metres: 8.5, mirror: true, base: RIDGE_C, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux 40248f1a, mirrored' },
  { id: 'peak-d', raw: 'peak-d', ...mtn, footprint: [5, 5], metres: 10, base: PEAK_D, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux 64f107f6 (img2img, Gemini Kleisoura crop, seed 5)' },
  { id: 'peak-d-x', raw: 'peak-d', ...mtn, footprint: [5, 5], metres: 10, mirror: true, base: PEAK_D, grade: rockG, extra: { massif: 'piece' }, source: 'pixflux 64f107f6, mirrored' },
  // massifs: 2-3 pieces composed back to front into one sprite wider and taller than a PixelLab canvas
  { id: 'massif-a', ...mtn, footprint: [4, 16], metres: 15, compose: chain('peak-big', [220, 0], [250, 60]), extra: { massif: 'composite' }, source: 'composed: peak-big behind ridge-b and ridge-a' },
  { id: 'massif-a-x', ...mtn, footprint: [16, 4], metres: 15, compose: chain('peak-big', [220, 0], [250, 60], true), extra: { massif: 'composite' }, source: 'massif-a mirrored' },
  { id: 'massif-b', ...mtn, footprint: [4, 16], metres: 15, compose: chain('peak-twin', [170, 0], [230, 60]), extra: { massif: 'composite' }, source: 'composed: peak-twin behind ridge-b and ridge-a' },
  { id: 'massif-b-x', ...mtn, footprint: [16, 4], metres: 15, compose: chain('peak-twin', [170, 0], [230, 60], true), extra: { massif: 'composite' }, source: 'massif-b mirrored' },
  { id: 'massif-c', ...mtn, footprint: [4, 16], metres: 14.5, compose: chain('peak-d', [210, 0], [250, 70], false, 'ridge-c', 'ridge-b'), extra: { massif: 'composite' }, source: 'composed: peak-d behind ridge-c and ridge-b' },
  { id: 'massif-c-x', ...mtn, footprint: [16, 4], metres: 14.5, compose: chain('peak-d', [210, 0], [250, 70], true, 'ridge-c', 'ridge-b'), extra: { massif: 'composite' }, source: 'massif-c mirrored' },
  // the high massif: two more summits behind massif-b (four PixelLab canvases), for back rows and the chain's crest
  { id: 'massif-high', ...mtn, footprint: [6, 16], metres: 19.7, compose: high(), extra: { massif: 'composite' }, source: 'composed: peak-big and peak-twin behind massif-b' },
  { id: 'massif-high-x', ...mtn, footprint: [16, 6], metres: 19.7, compose: high(true), extra: { massif: 'composite' }, source: 'massif-high mirrored' },
  // cores: the dominant mountains of a wide rock area, 6-7 relief pieces stacked back to front (summits on top, shoulders,
  // spurs, foothills and crags in front), ~700 px; long ridges: 4 pieces chained down the tile y axis (~800 px)
  ...['', '-x'].flatMap((x) => [
    { id: `core-a${x}`, ...mtn, footprint: [14, 14], metres: 17.2, mirror: !!x, compose: { parts: [P('summit-a', 5, 5), P('massif-great', 4, 10), P('massif-twin', 10, 4), P('peak-horn', 9, 9), P('shoulder', 7, 13), P('spur', 13, 7, true), P('crags', 11, 11), P('foothill-b', 9, 14), P('foothill-a', 14, 10)] }, extra: { massif: 'composite' }, source: `composed: summit-a over the relief pieces${x && ', mirrored'}` },
    { id: `core-b${x}`, ...mtn, footprint: [14, 14], metres: 16.8, mirror: !!x, compose: { parts: [P('summit-b', 5, 5), P('peak-horn', 4, 10), P('massif-twin', 10, 4), P('massif-great', 9, 9, true), P('ridge-broken', 6, 14), P('shoulder', 13, 8, true), P('crags', 11, 11), P('foothill-a', 10, 13)] }, extra: { massif: 'composite' }, source: `composed: summit-b over the relief pieces${x && ', mirrored'}` },
    { id: `ridge-long-a${x}`, ...mtn, footprint: x ? [24, 6] : [6, 24], metres: 17.1, mirror: !!x, compose: { parts: [P('peak-lean', 5, 7), P('saddle-long', 5, 14), P('ridge-broken', 5, 19), P('foothill-b', 5, 24)] }, extra: { massif: 'composite' }, source: `composed: a chain of relief pieces along y${x && ', mirrored'}` },
    { id: `ridge-long-b${x}`, ...mtn, footprint: x ? [24, 6] : [6, 24], metres: 15.2, mirror: !!x, compose: { parts: [P('massif-twin', 6, 7), P('ridge-broken', 5, 13), P('saddle-long', 5, 19), P('spur', 5, 24)] }, extra: { massif: 'composite' }, source: `composed: a chain of relief pieces along y${x && ', mirrored'}` },
  ]),
  // flora
  { id: 'fir', raw: 'fir-a', ...tree, metres: 10.6, keyAll: true, base: { y0: 318, x0: 54, x1: 70, drop: [['#64696c', 12]] }, grade: { sat: 0.7, val: 0.8 }, source: 'map_object af526cc7' },
  { id: 'fir-snow', raw: 'fir-snow', ...tree, metres: 6.6, grade: { sat: 0.6, val: 0.8 }, source: 'map_object c8f302f0' },
  { id: 'black-pine', raw: 'black-pine', ...tree, metres: 9, keyAll: true, base: { y0: 272, x0: 74, x1: 110, cut: 300, keep: 'notgreen' }, grade: { sat: 0.6, val: 0.75 }, source: 'map_object e085861a' },
  { id: 'juniper', raw: 'juniper', ...bush, metres: 0.7, scale: 0.6, grade: { sat: 0.5, val: 0.8 }, source: 'map_object ef41dc3d' },
  { id: 'rhododendron', raw: 'rhodo', ...bush, metres: 0.9, grade: { sat: 0.5, val: 0.8 }, source: 'map_object 0be79a71' },
  { id: 'alpine-grass', raw: 'tussock', kind: 'bush', blocks: false, footprint: [1, 1], metres: 0.5, scale: 0.7, grade: { sat: 0.55, val: 0.8 }, source: 'map_object 9dfd1bc8' },
  // rock dressing
  { id: 'cliff-face', raw: 'cliff-relief', ...stone, footprint: [3, 7], metres: 6.6, base: R_FOOT([[50, 234], [70, 244], [90, 245], [110, 241], [130, 239], [150, 231], [170, 220], [190, 214], [210, 196], [230, 181], [250, 175], [260, 172]]), grade: rockG, source: 'pixflux 3ac98ab3 (img2img over a relief.mjs rock-wall init; map_object 6fc08c1a was a blocky wedge)' },
  { id: 'cliff-face-x', raw: 'cliff-relief', ...stone, footprint: [7, 3], metres: 6.6, mirror: true, base: R_FOOT([[50, 234], [70, 244], [90, 245], [110, 241], [130, 239], [150, 231], [170, 220], [190, 214], [210, 196], [230, 181], [250, 175], [260, 172]]), grade: rockG, source: 'pixflux 3ac98ab3, mirrored' },
  { id: 'boulder-field', raw: 'boulder-field', ...stone, footprint: [3, 2], metres: 2.9, grade: rockG, source: 'map_object 945b7d93' },
  { id: 'rockfall', raw: 'rockfall', ...stone, footprint: [3, 2], metres: 3, grade: rockG, source: 'map_object 442d7848' },
  // pass dressing
  { id: 'road-edge', raw: 'road-edge2', ...stone, footprint: [4, 1], metres: 2.9, grade: { sat: 0.6, val: 0.8 }, source: 'pixflux 9fa05507 (img2img over a drawn dry-stone row; map_object 50639405 was a walled box)' },
  { id: 'road-edge-x', raw: 'road-edge2', ...stone, footprint: [1, 4], metres: 2.9, mirror: true, grade: { sat: 0.6, val: 0.8 }, source: 'pixflux 9fa05507, mirrored' },
  { id: 'cairn', raw: 'cairn', ...stone, footprint: [1, 1], metres: 1.5, base: { y0: 40, keep: 'neutral' }, scale: 0.8, grade: rockG, source: 'map_object 5bbd7f16 (afa4ef4c drew two pine trees)' },
  { id: 'watch-post', raw: 'watch-ruin', ...stone, footprint: [2, 2], metres: 4.5, grade: { sat: 0.6, val: 0.8 }, source: 'pixflux 5d09a711 (img2img over map_object 8c9cffbd cut down to a broken stump with a rubble heap)' },
  // resources
  { id: 'iron-ore', raw: 'iron', ...stone, footprint: [2, 1], metres: 2.4, base: { y0: 40, drop: [['#473538', 30], ['#342325', 30], ['#998378', 40]] }, grade: { sat: 0.7, val: 0.85 }, extra: { resource: 'iron' }, source: 'map_object 5b6d418d' },
  { id: 'tin-ore', raw: 'tin-b', ...stone, footprint: [2, 1], metres: 2.5, grade: { sat: 0.7, val: 0.8 }, extra: { resource: 'tin' }, source: 'map_object 4581ab3f (11410032 had no visible veins)' },
  // fauna (static props, animate later)
  { id: 'ibex', raw: 'ibex', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 1.2, scale: 0.8, grade: { sat: 0.65, val: 0.8 }, extra: { fauna: 'ibex', animateLater: true }, source: 'map_object b70f2d24' },
  { id: 'bear', raw: 'bear', kind: 'fauna', blocks: false, footprint: [1, 1], metres: 1.6, grade: { sat: 0.65, val: 0.8 }, extra: { fauna: 'bear', mob: true, animateLater: true }, source: 'map_object 177ad7da' },
  { id: 'eagle-nest', raw: 'eagle-nest', ...stone, footprint: [1, 1], metres: 2.5, grade: { sat: 0.6, val: 0.8 }, extra: { fauna: 'eagle', animateLater: true }, source: 'map_object d88753c5' },
];
// role (objects.json extra.role), a size hint for the renderer: `core` = the big masses for the middle of a wide rock area,
// `ridge` = single peaks, ridges and spurs, `foothill` = low lumps, shoulders and crags for the rim of a rock area.
const ROLE = { core: /^(core-|massif-(a|b|c|high))/, foothill: /^(foothill-|crags|shoulder)/ };
for (const o of OBJECTS) if (o.kind === 'massif') o.extra = { ...o.extra, role: Object.keys(ROLE).find((r) => ROLE[r].test(o.id)) ?? 'ridge' };
