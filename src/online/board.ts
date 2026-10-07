/**
 * Geometry of the war-table hex map (docs/DESIGN_V2.md "Hex map: a map on a
 * war table"): the shard's hexes are raised tiles on a board seen at an
 * angle. Pure (no Phaser), unit-tested.
 *
 * Board pixels: a pointy-top hex's top face is TILE_W x TILE_H (28 x 20, a
 * true hex squashed to ~62% by the viewing angle); rows are ROW_H (15) apart
 * and every row is shifted by half a tile, so every hex centre lands on whole
 * pixels: x = 28 q + 14 r, y = 15 r. A tile's top face is raised by its
 * terrain's height (hills and mountains stand taller), so it is drawn
 * `elev` pixels higher and its side faces show below it.
 */
import { hexDistance, pixelToHex, type Axial, type HexType } from './hex';

export const TILE_W = 28;
export const TILE_H = 20;
export const ROW_H = 15;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** Height of a tile's top face above the table, in board pixels (tile thickness). */
export const ELEV: Record<HexType, number> = {
  water: 3,
  plains: 5,
  farmland: 5,
  town: 6,
  ruins: 6,
  forest: 6,
  hills: 9,
  mine: 9,
  mountain: 13,
};
/** Unknown (fogged) hexes: the parchment map lying flat on the table. */
export const FOG_ELEV = 0;

/** Ground-level centre of a hex (on the table, before raising it). */
export function hexBase(q: number, r: number): { x: number; y: number } {
  return { x: TILE_W * q + HALF_W * r, y: ROW_H * r };
}

/** Centre of a hex's top face, raised by `elev`. */
export function hexTop(q: number, r: number, elev: number): { x: number; y: number } {
  return { x: TILE_W * q + HALF_W * r, y: ROW_H * r - elev };
}

/** Board position of true hex coordinates (hexToPixel with size 1: x = √3 (q + r/2), y = 1.5 r). */
export function fromUnit(x: number, y: number): { x: number; y: number } {
  return { x: (x * TILE_W) / Math.sqrt(3), y: (y * TILE_H) / 2 };
}

/** The hex whose ground-level face holds board point (x, y) (no elevation). */
export function baseHexAt(x: number, y: number): Axial {
  return pixelToHex((x * Math.sqrt(3)) / TILE_W, (y * 2) / TILE_H, 1);
}

/** Is (dx, dy), relative to a top face's centre, inside that face (the tile's lit top)? */
export function inTopFace(dx: number, dy: number): boolean {
  const ax = Math.abs(dx);
  if (ax > HALF_W) return false;
  return Math.abs(dy) <= HALF_H - (ax * (HALF_H / 2)) / HALF_W;
}

/** Is (dx, dy), relative to a top face's centre, on the tile's top or its visible side faces (depth `elev`)? */
export function inTile(dx: number, dy: number, elev: number): boolean {
  if (inTopFace(dx, dy)) return true;
  if (Math.abs(dx) > HALF_W || dy < 0) return false;
  // the lower outline swept down by the thickness
  const lower = HALF_H - (Math.abs(dx) * (HALF_H / 2)) / HALF_W;
  return dy <= lower + elev;
}

/** The top-face polygon (board pixels, relative to its centre), clockwise from the top vertex. */
export function topCorners(inset = 0): { x: number; y: number }[] {
  const w = HALF_W - inset;
  const h = HALF_H - inset * 0.72;
  return [
    { x: 0, y: -h },
    { x: w, y: -h / 2 },
    { x: w, y: h / 2 },
    { x: 0, y: h },
    { x: -w, y: h / 2 },
    { x: -w, y: -h / 2 },
  ];
}

/**
 * Tap picking: the hex drawn on top at board point (x, y). The flat fog
 * parchment is drawn first; raised tiles nearer the viewer (higher r) are
 * drawn later and cover the ones behind; raised tiles reach up into the rows
 * behind them. `elevOf` gives a hex's height, or null
 * if there is no tile (outside the shard).
 */
export function pickHex(x: number, y: number, elevOf: (q: number, r: number) => number | null): Axial | null {
  const base = baseHexAt(x, y);
  // A tile can be at most ~1 row (mountains) up from its ground position: try the rows in front first.
  let best: Axial | null = null;
  let bestKey = -Infinity;
  for (let dr = 0; dr <= 2; dr++) {
    for (let dq = -2; dq <= 1; dq++) {
      const q = base.q + dq;
      const r = base.r + dr;
      const e = elevOf(q, r);
      if (e === null) continue;
      const c = hexTop(q, r, e);
      if (!inTile(x - c.x, y - c.y, e)) continue;
      // raised tiles lie over the flat parchment of the fog; then later rows win (inside a row tiles do not overlap)
      const key = (e > 0 ? 1e6 : 0) + r * 1000 + (inTopFace(x - c.x, y - c.y) ? 1 : 0);
      if (key > bestKey) {
        bestKey = key;
        best = { q, r };
      }
    }
  }
  return best;
}

/** Board bounds of a shard of `radius` (tiles and their thickness included). */
export function boardBounds(radius: number, maxElev = ELEV.mountain): { x: number; y: number; w: number; h: number } {
  const x0 = -TILE_W * radius - HALF_W;
  const x1 = TILE_W * radius + HALF_W;
  const y0 = -ROW_H * radius - HALF_H - maxElev;
  const y1 = ROW_H * radius + HALF_H + 4;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Painter's order for tiles: back rows first, left to right inside a row. */
export function drawOrder<T extends Axial>(hexes: readonly T[]): T[] {
  return [...hexes].sort((a, b) => a.r - b.r || a.q - b.q);
}

/** Hexes of a shard disc (all of them, fogged or not). */
export function shardHexes(radius: number): Axial[] {
  const out: Axial[] = [];
  for (let r = -radius; r <= radius; r++) for (let q = -radius; q <= radius; q++) if (hexDistance({ q, r }, { q: 0, r: 0 }) <= radius) out.push({ q, r });
  return out;
}

/** Camera zoom limits for a viewport: it starts one step closer than the UI scale (whole pixels), may shrink to half the UI scale and come close up to twice it. */
export function zoomLimits(uiScale: number): { min: number; max: number; start: number } {
  const start = uiScale + 1;
  return { min: Math.max(1, uiScale * 0.5), max: Math.max(5, uiScale * 2 + 1), start };
}

/** Keeps the camera centre on the board (cx, cy in board pixels). */
export function clampCenter(cx: number, cy: number, b: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: Math.max(b.x, Math.min(b.x + b.w, cx)), y: Math.max(b.y, Math.min(b.y + b.h, cy)) };
}
