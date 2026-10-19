import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import mountainsJson from '../../public/war/biomes/mountains/objects.json';
import { parseRegion } from '../../src/war/region/schema';
import { behindFootprint, columnSpans, massifBase, placeMassifs, spriteTiles, type MassifPiece } from '../../src/war/region/massifs';
import { decodeBiomes } from '../../src/war/regions/visual';
import { buildGrid } from '../../src/war/sim/grid';
import { createSim } from '../../src/war/sim';
import { Massifs, type MassifDef } from '../../src/war/view/massifs';
import { readRgba } from '../support/nodeIo';

const ridge = parseRegion(ridgeJson);
type Piece = MassifPiece & MassifDef;
const pieces: Piece[] = (mountainsJson.objects as unknown as (MassifDef & { kind: string; file: string })[])
  .filter((d) => d.kind === 'massif' && d.footprint)
  .map((d) => ({ ...d, id: `mountains/${d.id}`, file: d.file, ...columnSpans(readRgba(`public/war/biomes/mountains/${d.file}`)) }));
const mask = (() => {
  const b = decodeBiomes(ridge.biomes!.rle, ridge.w * ridge.h), k = ridge.biomes!.names.indexOf('mountains'), m = new Uint8Array(b.length);
  for (let i = 0; i < m.length; i++) if (b[i] === k && ridge.terrain[i] === 'rock' && !ridge.water[i]) m[i] = 1;
  return m;
})();
const byId = new Set(pieces.map((d) => d.id));
const stored = ridge.objects!.filter((o) => byId.has(o.id));
const asObjects = (list: ReturnType<typeof placeMassifs>) => list.map((m) => ({ id: m.def.id, x: m.x0 + m.fw, y: m.y0 + m.fh, ...(m.shade < 1 ? { shade: Math.round(m.shade * 100) / 100 } : {}) }));

describe('massif placement (generator)', () => {
  it('is deterministic and is what test-ridge stores', () => {
    const a = placeMassifs(ridge, mask, pieces), b = placeMassifs(ridge, mask, pieces);
    expect(a.length).toBeGreaterThan(500);
    expect(asObjects(b)).toEqual(asObjects(a));
    expect(stored).toEqual(asObjects(a));
  });

  it('the renderer draws exactly the stored list, in its order', () => {
    const view = new Massifs(ridge, mask, pieces);
    expect(view.list.map((m) => ({ id: m.def.id, x: m.x0 + m.fw, y: m.y0 + m.fh, ...(m.shade < 1 ? { shade: m.shade } : {}) }))).toEqual(stored);
  });

  it('sorts a point the sprite reaches over past the massif unless the footprint hides it', () => {
    const view = new Massifs(ridge, mask, pieces);
    let front = 0, behind = 0;
    for (const m of view.list.slice(0, 200)) {
      spriteTiles(m, ridge.w, ridge.h, 0, (x, y, px, py) => {
        if (px < 0 || px >= m.def.w || py < m.def.top[px] || (y + 0.5) + (x + 0.5) >= m.v) return;
        const d = view.depth(x + 0.5, y + 0.5);
        if (behindFootprint(m, x + 0.5, y + 0.5)) { if (!view.foot[y * ridge.w + x]) { behind++; } }
        else { front++; expect(d).toBeGreaterThan(m.v); }
      });
    }
    expect(front).toBeGreaterThan(100);
    expect(behind).toBeGreaterThan(100);
  });
});

describe('massif blocking', () => {
  const placed = new Massifs(ridge, mask, pieces).list;
  const grid = buildGrid(ridge);
  const base = massifBase(ridge, placed);

  it('closes every massif footprint, its painted base and a 1-tile margin (roads and water excepted)', () => {
    for (let i = 0; i < base.length; i++) if (base[i]) expect(grid.cost[i]).toBe(0);
    const { w } = ridge;
    let core = 0;
    for (const m of placed) {
      for (let y = m.y0; y < m.y0 + m.fh; y++) for (let x = m.x0; x < m.x0 + m.fw; x++) expect(['foot', x, y, grid.cost[y * w + x]]).toEqual(['foot', x, y, 0]);
      spriteTiles(m, w, ridge.h, 0, (x, y, px, py) => {
        const d = m.def;
        if (px < 0 || px >= d.w || py < d.top[px] + 2 || py > (d as Piece).bottom![px] - 2 || behindFootprint(m, x + 0.5, y + 0.5)) return;
        core++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * w + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= ridge.h) continue;
          if (ridge.terrain[j] !== 'road' && !ridge.water[j]) expect(['base', x + dx, y + dy, grid.cost[j]]).toEqual(['base', x + dx, y + dy, 0]);
        }
      });
    }
    expect(core).toBeGreaterThan(1000);
  });

  it('soldiers sent into a massif stop at its foot, off its base', () => {
    // the massif in front with the most open ground south of it
    const m = placed.filter((q) => q.def.footprint[0] * q.def.footprint[1] >= 25).find((q) => {
      const t = (q.y0 + q.fh + 6) * ridge.w + q.x0 + (q.fw >> 1);
      return grid.cost[t] > 0 && ridge.terrain[t] !== 'rock';
    })!;
    expect(m).toBeDefined();
    const sim = createSim(ridge, 5);
    const s = sim.spawnSquad('a', 0, 'militia', 16, m.x0 + (m.fw >> 1) + 0.5, m.y0 + m.fh + 6.5);
    sim.order({ kind: 'move', squad: s, x: m.x0 + m.fw / 2, y: m.y0 + m.fh / 2 });
    for (let t = 0; t < 400; t++) {
      sim.step();
      for (const u of sim.snapshot().units) expect(base[Math.floor(u.y) * ridge.w + Math.floor(u.x)]).toBe(0);
    }
  });
});
