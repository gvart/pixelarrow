/**
 * Pixel-art pieces for the menus (docs/UI_ITERATION_2.md "Game feel"): the
 * ladder chest in its states, a torch and a pennant that flicker / flutter in
 * headers. Authored as letter grids over a small palette (one letter, one
 * colour, '.' clear) and drawn 1 art pixel = 1 UI pixel with nearest
 * filtering, so they read as the same pixel art as the battle sprites while
 * text and panels stay smooth. Pure data + one texture builder; the motion
 * lives with the screens (src/ui/motion.ts, off under Reduce motion).
 */
import Phaser from 'phaser';

/** Shared palette: warm outline, wood, bronze, gold, cloth, flame, stone. */
export const MENU_PAL: Record<string, number> = {
  k: 0x1a0f08, // outline
  d: 0x5a3818, // wood dark
  w: 0x8a5a2b, // wood
  W: 0xb07a3c, // wood light
  b: 0xa8742e, // bronze
  B: 0xf0c870, // bronze light
  g: 0xe0b23a, // gold
  G: 0xfff2a8, // gold light
  r: 0x2a1608, // dark interior
  s: 0x6e6252, // stone
  S: 0x9a8c76, // stone light
  t: 0x4a4036, // stone dark
  c: 0xc23a2c, // cloth red
  C: 0xe86a4c, // cloth light
  f: 0xf28a2c, // flame
  F: 0xffe892, // flame core
  y: 0xd6473a, // flame edge
  i: 0xeadfc4, // ivory
  n: 0x2d6a8a, // sea blue
  N: 0x5aa0c0, // sea light
};

/** A grid of letters as one image (rows must be the same length). */
export type Grid = readonly string[];

// ------------------------------------------------------------------ chest

/** Closed chest, 16 x 13. */
export const CHEST_CLOSED: Grid = [
  '..kkkkkkkkkkkk..',
  '.kWWWWWWWWWWWWk.',
  'kWwwwwwbbwwwwwwk',
  'kwwwwwwbBwwwwwwk',
  'kbbbbbbbbbbbbbbk',
  'kddddddkkddddddk',
  'kwwwwwkBBkwwwwwk',
  'kWwwwwkbbkwwwwWk',
  'kwwwwwwkkwwwwwwk',
  'kbbwwwwwwwwwwbbk',
  'kwwwwwwwwwwwwwwk',
  'kddddddddddddddk',
  '.kkkkkkkkkkkkkk.',
];

/** Open chest, lid thrown back, gold heaped over the rim (the moment of claiming), 16 x 15. */
export const CHEST_FULL: Grid = [
  '..kkkkkkkkkkkk..',
  '.kWWWWWWWWWWWWk.',
  '.kddddddddddddk.',
  '.kdrrrrrrrrrrdk.',
  'kkbbbbbbbbbbbbkk',
  'krrGgGrrgGgrGgrk',
  'kGgggGgGgggGggGk',
  'kbbbbbbbbbbbbbbk',
  'kwwwwwkBBkwwwwwk',
  'kWwwwwkbbkwwwwWk',
  'kwwwwwwkkwwwwwwk',
  'kbbwwwwwwwwwwbbk',
  'kwwwwwwwwwwwwwwk',
  'kddddddddddddddk',
  '.kkkkkkkkkkkkkk.',
];

/** Open and empty (claimed), 16 x 15. */
export const CHEST_EMPTY: Grid = [
  '..kkkkkkkkkkkk..',
  '.kWWWWWWWWWWWWk.',
  '.kddddddddddddk.',
  '.kdrrrrrrrrrrdk.',
  'kkbbbbbbbbbbbbkk',
  'krrrrrrrrrrrrrrk',
  'krrrrrrrrrrrrrrk',
  'kbbbbbbbbbbbbbbk',
  'kwwwwwkBBkwwwwwk',
  'kWwwwwkbbkwwwwWk',
  'kwwwwwwkkwwwwwwk',
  'kbbwwwwwwwwwwbbk',
  'kwwwwwwwwwwwwwwk',
  'kddddddddddddddk',
  '.kkkkkkkkkkkkkk.',
];

// ------------------------------------------------------------------ torch and pennant (header idle animation)

/** A wall torch, 7 x 14, three flame frames. */
export const TORCH: Grid[] = [
  ['...y...', '..yfy..', '..fFf..', '.yfFfy.', '..fFf..', '..kfk..', '.kbbbk.', '.kBbbk.', '..kwk..', '..kwk..', '..kdk..', '..kwk..', '..kdk..', '...k...'],
  ['..y....', '..yf...', '.yfFy..', '.yfFfy.', '..fFf..', '..kfk..', '.kbbbk.', '.kBbbk.', '..kwk..', '..kwk..', '..kdk..', '..kwk..', '..kdk..', '...k...'],
  ['....y..', '...fy..', '..yFfy.', '.yfFfy.', '..fFf..', '..kfk..', '.kbbbk.', '.kBbbk.', '..kwk..', '..kwk..', '..kdk..', '..kwk..', '..kdk..', '...k...'],
];

/** A pennant on a spear, 12 x 14, three flutter frames. */
export const PENNANT: Grid[] = [
  ['.B..........', 'kbk.........', '.wkkkkkkk...', '.wkcCcccck..', '.wkcccccccck', '.wkcCcccck..', '.wkkkkkkk...', '.w..........', '.w..........', '.w..........', '.w..........', '.w..........', '.w..........', '.d..........'],
  ['.B..........', 'kbk.........', '.wkkkkkkkk..', '.wkcCccccck.', '.wkccccccck.', '.wkcCccccckk', '.wkkkkkkkkk.', '.w..........', '.w..........', '.w..........', '.w..........', '.w..........', '.w..........', '.d..........'],
  ['.B..........', 'kbk.........', '.wkkkkkkk...', '.wkcCccck...', '.wkccccccckk', '.wkcCcccccck', '.wkkkkkkkkk.', '.w..........', '.w..........', '.w..........', '.w..........', '.w..........', '.w..........', '.d..........'],
];

/** A laurel branch (the left half of a victor's wreath; flip it for the right), 13 x 18. */
export const LAUREL: Grid = [
  '.....kgGkk.kk',
  '......kgGbkgG',
  '...kk..kbkgGk',
  '..kgGkkbkkkk.',
  '...kgGbkgGk..',
  '..kkkgbgGk...',
  '.kgGkbkkk....',
  '..kgGbkgGk...',
  '..kkgbgGk....',
  '.kgGkbkkk....',
  '..kgGbkgGk...',
  '...kgbgGk....',
  '..kgGkbkkk...',
  '...kgGbkgGk..',
  '....kgkbGk...',
  '.....k.kbkk..',
  '........kbBk.',
  '.........kk..',
];

// ------------------------------------------------------------------ texture builder

/** Paints a grid into a canvas (pure: tests and the texture builder). Unknown letters are skipped. */
export function paintGrid(ctx: CanvasRenderingContext2D, grid: Grid, ox = 0, oy = 0, pal: Record<string, number> = MENU_PAL, dim = false): void {
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (c === undefined) continue;
      ctx.fillStyle = `#${(dim ? desaturate(c) : c).toString(16).padStart(6, '0')}`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

/** Grey and darker: the locked look of a sprite. */
export function desaturate(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const l = Math.round((r * 0.3 + g * 0.59 + b * 0.11) * 0.62);
  return (l << 16) | (l << 8) | l;
}

/** Grid size: [w, h]. */
export function gridSize(grid: Grid): [number, number] {
  return [grid[0]?.length ?? 0, grid.length];
}

/**
 * The texture of one or more grids side by side (frames of a spritesheet when
 * there are several), nearest-filtered. Cached by key.
 */
export function gridTexture(scene: Phaser.Scene, key: string, frames: Grid[], dim = false): string {
  const k = `msp_${key}${dim ? '_d' : ''}`;
  if (scene.textures.exists(k)) return k;
  const [w, h] = gridSize(frames[0]);
  const cv = document.createElement('canvas');
  cv.width = w * frames.length;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  frames.forEach((g, i) => paintGrid(ctx, g, i * w, 0, MENU_PAL, dim));
  const tex = scene.textures.addCanvas(k, cv)!;
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  if (frames.length > 1) for (let i = 0; i < frames.length; i++) tex.add(i, 0, i * w, 0, w, h);
  return k;
}

/** One sprite of a grid, top-left at x, y (UI px; 1 art px = `scale` UI px). */
export function addGridImage(scene: Phaser.Scene, x: number, y: number, key: string, grid: Grid, o: { dim?: boolean; scale?: number } = {}): Phaser.GameObjects.Image {
  const tk = gridTexture(scene, key, [grid], o.dim);
  return scene.add.image(Math.round(x), Math.round(y), tk).setOrigin(0, 0).setScale(o.scale ?? 1);
}

/**
 * The chest in its ladder state: locked (closed, grey), ready (closed, full
 * colour), claimed (open, empty), full (open on its gold). (x, y) is the top
 * of a closed chest: the open ones (2 px taller, the lid up) grow upwards.
 */
export function addChestSprite(scene: Phaser.Scene, x: number, y: number, st: 'locked' | 'ready' | 'claimed' | 'full', scale = 1): Phaser.GameObjects.Image {
  const up = (CHEST_FULL.length - CHEST_CLOSED.length) * scale;
  if (st === 'claimed') return addGridImage(scene, x, y - up, 'chest_empty', CHEST_EMPTY, { scale });
  if (st === 'full') return addGridImage(scene, x, y - up, 'chest_full', CHEST_FULL, { scale });
  return addGridImage(scene, x, y, 'chest_closed', CHEST_CLOSED, { dim: st === 'locked', scale });
}
