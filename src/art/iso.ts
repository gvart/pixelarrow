/**
 * 2:1 diamond isometric projection used by the battle renderer.
 *
 * The simulation lives in its own flat field coordinates (x lateral, y depth;
 * side 0 deploys at large y facing -y). The renderer rotates that grid 45° and
 * squashes it 2:1: one field unit is one diamond tile ISO_TW x ISO_TH pixels.
 *
 *   screen.x = (x - y) * ISO_HW        field +x -> down-right on screen
 *   screen.y = (x + y) * ISO_HH        field +y -> down-left on screen
 *
 * So the battle line (field x) runs diagonally from top-left to bottom-right,
 * the player's army stands bottom-left facing up-right and the enemy top-right
 * facing down-left. Pure maths, no Phaser: the ground generator, the scene and
 * tests share it.
 */
export const ISO_HW = 18;
export const ISO_HH = 9;
export const ISO_TW = ISO_HW * 2;
export const ISO_TH = ISO_HH * 2;

export interface Pt {
  x: number;
  y: number;
}

/** Field (sim) coordinates -> world pixels. */
export function isoToScreen(x: number, y: number): Pt {
  return { x: (x - y) * ISO_HW, y: (x + y) * ISO_HH };
}

/** World pixels -> field (sim) coordinates (exact inverse of isoToScreen). */
export function screenToIso(sx: number, sy: number): Pt {
  const a = sx / ISO_HW; // x - y
  const b = sy / ISO_HH; // x + y
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** A field-space direction projected to screen space (not normalised). */
export function isoDir(dx: number, dy: number): Pt {
  return { x: (dx - dy) * ISO_HW, y: (dx + dy) * ISO_HH };
}

/** Screen-space bounding box of a w x h field. */
export function isoFieldBounds(w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: -h * ISO_HW, y0: 0, x1: w * ISO_HW, y1: (w + h) * ISO_HH };
}

/**
 * Sprite facing for a field-space facing vector: row 0 = 3/4 front (facing
 * down on screen), row 1 = 3/4 back (facing up); flip = facing left.
 */
export function isoFacing(fx: number, fy: number): { back: boolean; left: boolean; sx: number; sy: number } {
  const d = isoDir(fx, fy);
  return { back: d.y < 0, left: d.x < 0, sx: d.x, sy: d.y };
}
