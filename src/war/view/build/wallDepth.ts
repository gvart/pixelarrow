/**
 * Depth of a unit beside a tall building (./buildingLayer.ts). Units and art sort by x + y of their point, a building's
 * art by its footprint's centre; a man standing in front of a wall's +x or +y face but past the end of the next tile
 * (the tile diagonally up-left or up-right of his own) sorts behind that tile while his sprite, ~0.8 tile wide on
 * screen, overlaps its face: the wall's art cut through him. A man whose point is past a footprint's +x (or +y) side
 * stands in front of that whole face, so he draws over its art.
 */

/** A drawn footprint: its max corner (x1, y1) and the display depth of its back art. */
export interface Back { x1: number; y1: number; depth: number }

export const key = (x: number, y: number) => y * 65536 + x;
/** Tiles whose art a man's sprite can overlap from the front: up-left of him (+x faces), up-right (+y faces). */
const LEFT: [number, number][] = [[-1, 1], [-1, 2]];
const RIGHT: [number, number][] = [[1, -1], [2, -1]];

/** The least depth a unit at tile point (x, y) needs to draw over the faces it stands in front of; 0 none. */
export function frontDepth(x: number, y: number, backs: ReadonlyMap<number, Back>, step = 1e-6): number {
  const tx = Math.floor(x), ty = Math.floor(y);
  let d = 0;
  for (const [dx, dy] of LEFT) {
    const b = backs.get(key(tx + dx, ty + dy));
    if (b && x >= b.x1) d = Math.max(d, b.depth + step);
  }
  for (const [dx, dy] of RIGHT) {
    const b = backs.get(key(tx + dx, ty + dy));
    if (b && y >= b.y1) d = Math.max(d, b.depth + step);
  }
  return d;
}
