// The living hero's sprite atlas (V6-LAND-02): the two hero formations' men drawn by the game's own
// figure code (paperdoll renderFrame) at the battle's 2x render, in the animations the battle plays
// (walk, run, attack, hit, die, rout, win). Same men, seeds and layout as units.ts, so the canvas
// starts on the poster's pose. Run through scripts/art/landing/sprites.mjs (vite ssrLoadModule).
import { dollFromHero, renderFrame, dollGeom, ANIM, FRAME, BATTLE_RES, BATTLE_SCALE, attackFrame, attackLength, weaponClass, type DollSpec } from '../../../src/art/paperdoll';
import { renderBasePlate, plateOrigin } from '../../../src/art/ground';
import { Pix } from '../../../src/art/pixels';
import { makeHero } from '../../../src/game/heroes';
import { Rng } from '../../../src/sim/rng';
import type { Block } from './units';

const K = 2;
/** Distinct men drawn per side; the rest of the formation reuses them (the front rank's first men are exact). */
const VARIANTS = 6;
/** Facings (paperdoll DIRS): 1 = toward -y (up-right on screen), 2 = toward +y (down-left). */
const UP = 1, DOWN = 2;

/** Animations per side: [name, facing, frame columns]. The player faces up, the enemy down and routs up. */
function anims(side: 'player' | 'enemy'): [string, number, readonly number[]][] {
  const face = side === 'player' ? UP : DOWN;
  const list: [string, number, readonly number[]][] = [
    ['idle', face, ANIM.idle],
    ['walk', face, ANIM.walk],
    ['attack', face, ANIM.attack],
    ['hit', face, ANIM.hit],
    ['die', face, ANIM.die],
  ];
  if (side === 'player') list.push(['win', face, ANIM.win]);
  else list.push(['run', face, ANIM.run], ['dieB', face, ANIM.dieB], ['rout', UP, ANIM.rout]);
  return list;
}

function up(p: Pix): Pix {
  const o = new Pix(p.w * K, p.h * K);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const a = p.alpha(Math.floor(x / K), Math.floor(y / K));
    if (a) o.set(x, y, p.get(Math.floor(x / K), Math.floor(y / K)), a);
  }
  return o;
}

/** The alpha bounding box of a frame, or null when it is empty. */
function trim(p: Pix): { x: number; y: number; w: number; h: number } | null {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alpha(x, y)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

interface Cell { img: Pix; sx: number; sy: number; w: number; h: number; dx: number; dy: number; ax?: number; ay?: number }

/** Attack timing from the game's own table: [column, seconds] for each phase the weapon plays. */
function attackTiming(spec: DollSpec): [number, number][] {
  const w = weaponClass(spec.weapon);
  const out: [number, number][] = [];
  const len = attackLength(w);
  for (let t = 0; t < len; t += 0.005) {
    const f = attackFrame(w, t);
    if (f < 0) break;
    const last = out[out.length - 1];
    if (last && last[0] === f) last[1] += 0.005;
    else out.push([f, 0.005]);
  }
  return out.map(([f, s]) => [f, Math.round(s * 100) / 100]);
}

export function render(blocks: Record<string, Block[]>) {
  const cells: Cell[] = [];
  const men: number[][] = [];
  const sides: Record<string, { anims: Record<string, number[][]>; attack: [number, number][] }> = {};
  const plate = up(renderBasePlate(20));
  const [pox, poy] = plateOrigin(20);
  const pt = trim(plate)!;
  const plateCell: Cell = { img: plate, sx: pt.x, sy: pt.y, w: pt.w, h: pt.h, dx: Math.round(pt.x - pox * plate.w), dy: Math.round(pt.y - poy * plate.h) };
  cells.push(plateCell);
  let id = 1;
  for (const [side, list] of Object.entries(blocks)) {
    const b = list[0];
    const rng = new Rng(b.seed);
    const ids = { nextId: id };
    const specs: DollSpec[] = [];
    let i = 0;
    for (let r = 0; r < b.ranks; r++)
      for (let c = 0; c < b.cols; c++, i++) {
        const hero = makeHero(rng, ids, b.culture, b.cls as never, 3, 1);
        if (specs.length < VARIANTS) specs.push({ ...dollFromHero(hero), scale: BATTLE_SCALE, res: BATTLE_RES });
        const jx = (rng.next() - 0.5) * 0.08;
        const jy = (rng.next() - 0.5) * 0.08;
        const fx = b.cx + (c - (b.cols - 1) / 2) * b.gap + jx;
        const fy = b.cy + (r - (b.ranks - 1) / 2) * b.gap * (b.row === 1 ? 1 : -1) + jy;
        // [side 0 player / 1 enemy, variant, field x, field y, rank, column]
        men.push([side === 'player' ? 0 : 1, i % VARIANTS, +fx.toFixed(3), +fy.toFixed(3), r, c]);
      }
    id = ids.nextId;
    const out: Record<string, number[][]> = {};
    for (const [name, dir, cols] of anims(side as 'player' | 'enemy')) {
      // per animation: for each variant, the cell index of each frame
      out[name] = specs.map((spec) => {
        const g = dollGeom(spec);
        return cols.map((col) => {
          const img = renderFrame(spec, col, dir);
          const t = trim(img) ?? { x: 0, y: 0, w: 1, h: 1 };
          cells.push({ img, sx: t.x, sy: t.y, w: t.w, h: t.h, dx: t.x - g.fw / 2, dy: t.y - g.footY });
          return cells.length - 1;
        });
      });
      // attack phases name columns; map them to the animation's own frame order
      if (name === 'attack') sides[side] = { anims: out, attack: attackTiming(specs[0]).map(([f, s]) => [(cols as readonly number[]).indexOf(f), s]) };
    }
  }
  // shelf pack, tallest first, 1 px gutters
  const W = 1024;
  const order = cells.map((_, i) => i).sort((a, b) => cells[b].h - cells[a].h || cells[b].w - cells[a].w);
  let x = 0, y = 0, shelf = 0;
  for (const i of order) {
    const c = cells[i];
    if (x + c.w > W) { x = 0; y += shelf + 1; shelf = 0; }
    c.ax = x; c.ay = y;
    x += c.w + 1;
    shelf = Math.max(shelf, c.h);
  }
  const H = y + shelf;
  const atlas = new Pix(W, H);
  for (const c of cells)
    for (let yy = 0; yy < c.h; yy++) for (let xx = 0; xx < c.w; xx++) {
      const a = c.img.alpha(c.sx + xx, c.sy + yy);
      if (a) atlas.set(c.ax! + xx, c.ay! + yy, c.img.get(c.sx + xx, c.sy + yy), a);
    }
  // frames: [atlas x, atlas y, w, h, offset x, offset y from the foot point]
  const frames = cells.map((c) => [c.ax!, c.ay!, c.w, c.h, c.dx, c.dy]);
  return { w: W, h: H, data: atlas.data, meta: { frames, plate: 0, men, sides } };
}
