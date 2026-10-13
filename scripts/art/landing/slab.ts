// The landing hero diorama slab drawn by the game's own art code, with no units (P5-LAND-ART).
// Run through scripts/art/landing/diorama.mjs (vite ssrLoadModule). Returns RGBA buffers; the caller writes PNGs.
import { renderGround } from '../../../src/art/ground';
import { renderTree, renderBoulder, TREE_GEOM, BOULDER_GEOM } from '../../../src/art/terrainArt';
import { Pix, hash2 } from '../../../src/art/pixels';
import { isoToScreen, ISO_HW, ISO_HH } from '../../../src/art/iso';
import { generateBattlefield } from '../../../src/world/battlefield';
import { Terrain } from '../../../src/sim/terrain';

export function render(F: number, seed: number, depth: number, woods: number, props = true, groundOn = true) {
  const grid = generateBattlefield(seed, { base: 'plain', river: true, coast: false, rocky: true, woods }, F, F);
  const t = new Terrain(grid, F, F);
  // diamond corners in world px: top (0,0) -> x 0; left (0,F); right (F,0); bottom (F,F)
  const x0 = -F * ISO_HW;
  const W = 2 * F * ISO_HW;
  const H = 2 * F * ISO_HH;
  const TOP = 64; // room for trees poking above the far corner
  const out = new Pix(W, TOP + H + depth + 2);
  const g = renderGround(W, H, { originX: x0, originY: 0, fieldW: F, fieldH: F, seed: 21, terrain: t });
  // top face: only inside the diamond
  if (groundOn) for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const wx = x0 + x + 0.5;
      const wy = y + 0.5;
      const fx = (wx / ISO_HW + wy / ISO_HH) / 2;
      const fy = (wy / ISO_HH - wx / ISO_HW) / 2;
      if (fx < 0 || fy < 0 || fx >= F || fy >= F) continue;
      out.set(x, TOP + y, g.get(x, y));
    }
  // cut earth sides: lit face under the lower-left edge, shaded face under the lower-right edge
  const LIT = [0x7b503d, 0x6a4a1e, 0x5b3f2a];
  const DARK = [0x5b3f2a, 0x442618, 0x2a1a12];
  if (groundOn) for (let x = 0; x < W; x++) {
    // lower edge y of the diamond at column x
    const cx = x0 + x + 0.5;
    const edge = cx < 0 ? (F * ISO_HH) + (cx + F * ISO_HW) * 0.5 : (2 * F * ISO_HH) - cx * 0.5;
    const ey = Math.floor(edge);
    const lit = cx < 0;
    for (let d = 0; d < depth; d++) {
      const y = TOP + ey + d;
      // strata: a soil band on top, then two deeper bands with a ragged boundary
      const n = hash2(x >> 1, d, seed + 7);
      const band = d < 2 ? 0 : d + (n < 0.2 ? -1 : n > 0.85 ? 1 : 0) < depth * 0.55 ? 1 : 2;
      const ramp = lit ? LIT : DARK;
      let c = ramp[band];
      if (hash2(x, d, seed + 9) < 0.05) c = ramp[Math.min(2, band + 1)]; // pebbles
      if (d === depth - 1) c = 0x2a1a12; // the slab's bottom lip
      out.set(x, y, c);
    }
    // a grass lip hanging over the cut
    if (hash2(x, 3, seed) < 0.35) out.set(x, TOP + ey, lit ? 0x8d7d38 : 0x6b6038);
  }
  if (props) {
    const sprites: { y: number; draw: () => void }[] = [];
    const tree = [0, 1, 2].map((v) => renderTree(v));
    const boulder = [0, 1].map((v) => renderBoulder(v));
    const h = (a: number, b: number) => ((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663) ^ seed) >>> 0) % 1000 / 1000;
    const place = (img: Pix, fx: number, fy: number, footY: number) => {
      const p = isoToScreen(fx, fy);
      const dx = Math.round(p.x - x0 - img.w / 2);
      const dy = Math.round(TOP + p.y - footY);
      sprites.push({ y: p.y, draw: () => out.blit(img, dx, dy) });
    };
    for (let i = 0; i < t.cells; i++) {
      const d = t.cellDef(i);
      const c = t.cellCenter(i);
      if (d.kind === 'forest') {
        const n = h(i, 1) < 0.12 ? 2 : h(i, 1) < 0.66 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const v = h(i, 10 + k) < 0.2 ? 2 : h(i, 20 + k) < 0.35 ? 1 : 0;
          place(tree[v], c.x + (h(i, 2 + k) - 0.5) * 0.7, c.y + (h(i, 4 + k) - 0.5) * 0.7, TREE_GEOM.footY);
        }
      } else if (d.kind === 'rocks') {
        place(boulder[i % 2], c.x + (h(i, 6) - 0.5) * 0.3, c.y + (h(i, 7) - 0.5) * 0.3, BOULDER_GEOM.footY);
      }
    }
    sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());
  }
  return { w: out.w, h: out.h, data: out.data, name: grid.name, top: TOP };
}
