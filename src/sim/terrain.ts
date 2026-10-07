/**
 * Battlefield terrain as the simulation sees it: a seeded grid of cells
 * (one field unit each) with a terrain kind and a whole-number height.
 *
 * The grid travels inside BattleSetup as plain strings, so the server replays
 * exactly the field the client fought on. A setup without a grid is an open,
 * flat plain and behaves exactly like battles before terrain existed.
 */
import { HEIGHT_RULES, TERRAIN, TERRAIN_LIST, terrainByCode, type TerrainDef, type TerrainKind } from '../data/terrain';

/** Serialized battlefield (part of BattleSetup). */
export interface TerrainGrid {
  /** Grid size in cells; normally the battle's width x height. */
  w: number;
  h: number;
  /** w*h characters, row-major (index y*w + x): terrain codes from src/data/terrain.ts. */
  cells: string;
  /** w*h digits '0'..'3': height level of each cell. Missing = flat. */
  height?: string;
  /** Display name of the site ("Wooded hills", "River ford", ...). */
  name?: string;
}

const KIND_INDEX = new Map<TerrainKind, number>(TERRAIN_LIST.map((d, i) => [d.kind, i]));

export class Terrain {
  readonly w: number;
  readonly h: number;
  /** Battle field size the grid is stretched over. */
  readonly fw: number;
  readonly fh: number;
  readonly name: string;
  private kind: Uint8Array;
  private hgt: Uint8Array;
  /** Centre of the ford cells, if the field has a river. */
  readonly ford: { x: number; y: number } | null;
  /** Rows (cell y) that hold river water. */
  readonly riverRows: number[];

  constructor(g: TerrainGrid, fieldW: number, fieldH: number) {
    this.w = Math.max(1, Math.floor(g.w));
    this.h = Math.max(1, Math.floor(g.h));
    this.fw = fieldW;
    this.fh = fieldH;
    this.name = g.name ?? '';
    const n = this.w * this.h;
    this.kind = new Uint8Array(n);
    this.hgt = new Uint8Array(n);
    let fx = 0;
    let fy = 0;
    let fn = 0;
    const rows = new Set<number>();
    for (let i = 0; i < n; i++) {
      const d = terrainByCode(g.cells?.charAt(i) ?? '.');
      this.kind[i] = KIND_INDEX.get(d.kind)!;
      const hc = g.height ? g.height.charCodeAt(i) - 48 : 0;
      this.hgt[i] = hc >= 0 && hc <= HEIGHT_RULES.maxHeight ? hc : 0;
      if (d.kind === 'ford') {
        fx += (i % this.w) + 0.5;
        fy += Math.floor(i / this.w) + 0.5;
        fn++;
      }
      if (d.kind === 'water' || d.kind === 'ford') rows.add(Math.floor(i / this.w));
    }
    const sx = this.fw / this.w;
    const sy = this.fh / this.h;
    this.ford = fn > 0 ? { x: (fx / fn) * sx, y: (fy / fn) * sy } : null;
    this.riverRows = [...rows].sort((a, b) => a - b);
  }

  /** Cell index under a field position (clamped to the grid). */
  index(x: number, y: number): number {
    let cx = Math.floor((x * this.w) / this.fw);
    let cy = Math.floor((y * this.h) / this.fh);
    cx = cx < 0 ? 0 : cx >= this.w ? this.w - 1 : cx;
    cy = cy < 0 ? 0 : cy >= this.h ? this.h - 1 : cy;
    return cy * this.w + cx;
  }

  at(x: number, y: number): TerrainDef {
    return TERRAIN_LIST[this.kind[this.index(x, y)]];
  }

  cellDef(i: number): TerrainDef {
    return TERRAIN_LIST[this.kind[i]];
  }

  heightAt(x: number, y: number): number {
    return this.hgt[this.index(x, y)];
  }

  cellHeight(i: number): number {
    return this.hgt[i];
  }

  blocked(x: number, y: number): boolean {
    return TERRAIN_LIST[this.kind[this.index(x, y)]].blocked;
  }

  isWater(x: number, y: number): boolean {
    const k = this.at(x, y).kind;
    return k === 'water' || k === 'ford';
  }

  /** Whether river water lies between two depths (field y) somewhere across the field. */
  riverBetween(y0: number, y1: number): boolean {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    const sy = this.fh / this.h;
    for (const r of this.riverRows) {
      const y = (r + 0.5) * sy;
      if (y > a && y < b) return true;
    }
    return false;
  }

  /** Field-space centre of a cell. */
  cellCenter(i: number): { x: number; y: number } {
    return { x: ((i % this.w) + 0.5) * (this.fw / this.w), y: (Math.floor(i / this.w) + 0.5) * (this.fh / this.h) };
  }

  get cells(): number {
    return this.w * this.h;
  }
}

/** An open, flat grid (useful for tests: it must behave exactly like no terrain). */
export function flatGrid(w: number, h: number): TerrainGrid {
  return { w, h, cells: TERRAIN.open.code.repeat(w * h), height: '0'.repeat(w * h) };
}

/** Small integer hash in [0, 1) for deterministic per-unit/per-cell jitter. */
export function cellHash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
