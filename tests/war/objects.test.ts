import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { footprintTiles, OBJECT_BLOCKS } from '../../src/war/region/objects';
import { buildGrid } from '../../src/war/sim/grid';
import type { RegionData } from '../../src/war/types';

const defs = JSON.parse(readFileSync('public/war/objects/objects.json', 'utf8')).objects as { id: string; footprint: [number, number]; blocksMovement: boolean }[];

describe('map objects', () => {
  it('the sim table matches objects.json', () => {
    const blocking = Object.fromEntries(defs.filter((d) => d.blocksMovement).map((d) => [d.id, d.footprint]));
    expect(OBJECT_BLOCKS).toEqual(blocking);
  });

  it('blocking objects close their footprint, others stay open', () => {
    const n = 6, r: RegionData = {
      id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [],
      objects: [{ id: 'watchtower', x: 3, y: 3 }, { id: 'oak', x: 0.5, y: 0.5 }, { id: 'boulder-a', x: 5.4, y: 0.6 }],
    };
    const g = buildGrid(r);
    const closed = [...g.cost.keys()].filter((i) => g.cost[i] === 0).sort((a, b) => a - b);
    expect(closed).toEqual([5, 2 * n + 2, 2 * n + 3, 3 * n + 2, 3 * n + 3]);
    expect(footprintTiles(10.5, 4.5, [2, 1])).toEqual([[10, 4], [11, 4]]);
  });

  it('test-ridge has objects of known ids, deterministic and off the named spots', () => {
    const r = parseRegion(ridgeJson), ids = new Set(defs.map((d) => d.id));
    expect(r.objects!.length).toBeGreaterThan(1000);
    for (const o of r.objects!) expect(ids.has(o.id)).toBe(true);
    for (const id of ['watchtower', 'wall-ruin', 'reeds', 'olive-a', 'pine-a', 'boulder-a']) expect(r.objects!.some((o) => o.id === id)).toBe(true);
    const g = buildGrid(r);
    for (const [name, [x, y]] of Object.entries(SPOTS)) expect([name, g.cost[Math.floor(y) * r.w + Math.floor(x)] > 0]).toEqual([name, true]);
  });
});
