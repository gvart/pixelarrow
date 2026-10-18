// The two hero formations drawn by the game's own figure code (paperdoll) at the battle's 2x render
// resolution, on the slab's 2x canvas. Same coordinates as slab.ts (TOP = 64 at 1x).
import { dollFromHero, renderFrame, dollGeom, BATTLE_RES, BATTLE_SCALE } from '../../../src/art/paperdoll';
import { renderBasePlate, plateOrigin } from '../../../src/art/ground';
import { Pix } from '../../../src/art/pixels';
import { isoToScreen, ISO_HW } from '../../../src/art/iso';
import { makeHero } from '../../../src/game/heroes';
import { Rng } from '../../../src/sim/rng';
import { generateBattlefield } from '../../../src/world/battlefield';
import { Terrain } from '../../../src/sim/terrain';

const K = 2; // composite scale: slab pixels are doubled (nearest), figures are drawn at their 2x render

function up(p: Pix): Pix {
  const o = new Pix(p.w * K, p.h * K);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const a = p.alpha(Math.floor(x / K), Math.floor(y / K));
    if (a) o.set(x, y, p.get(Math.floor(x / K), Math.floor(y / K)), a);
  }
  return o;
}

export interface Block { culture: 'greek' | 'celtic' | 'phoenician'; cls: string; cx: number; cy: number; cols: number; ranks: number; gap: number; row: number; seed: number }

export function riverRows(F: number, seed: number, woods: number) {
  const t = new Terrain(generateBattlefield(seed, { base: 'plain', river: true, coast: false, rocky: true, woods }, F, F), F, F);
  return t.riverRows;
}

export function render(F: number, H1: number, blocks: Block[]) {
  const TOP = 64;
  const x0 = -F * ISO_HW;
  const out = new Pix(2 * F * ISO_HW * K, H1 * K);
  const plate = up(renderBasePlate(20));
  const [pox, poy] = plateOrigin(20);
  const items: { y: number; draw: () => void }[] = [];
  let id = 1;
  for (const b of blocks) {
    const rng = new Rng(b.seed);
    const ids = { nextId: id };
    for (let r = 0; r < b.ranks; r++)
      for (let c = 0; c < b.cols; c++) {
        const hero = makeHero(rng, ids, b.culture, b.cls as never, 3, 1);
        const spec = { ...dollFromHero(hero), scale: BATTLE_SCALE, res: BATTLE_RES };
        const g = dollGeom(spec);
        const jx = (rng.next() - 0.5) * 0.08;
        const jy = (rng.next() - 0.5) * 0.08;
        const fx = b.cx + (c - (b.cols - 1) / 2) * b.gap + jx;
        const fy = b.cy + (r - (b.ranks - 1) / 2) * b.gap * (b.row === 1 ? 1 : -1) + jy;
        const p = isoToScreen(fx, fy);
        const sx = (p.x - x0) * K;
        const sy = (p.y + TOP) * K;
        const frame = renderFrame(spec, 0, b.row);
        items.push({ y: p.y, draw: () => {
          out.blit(plate, Math.round(sx - pox * plate.w), Math.round(sy - poy * plate.h));
          out.blit(frame, Math.round(sx - g.fw / 2), Math.round(sy - g.footY));
        } });
      }
    id = ids.nextId;
  }
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
  return { w: out.w, h: out.h, data: out.data };
}
