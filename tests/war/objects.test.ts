import { describe, expect, it } from 'vitest';
import objectsJson from '../../public/war/objects/objects.json';
import elaiaJson from '../../public/war/biomes/elaia/objects.json';
import kyreneJson from '../../public/war/biomes/kyrene/objects.json';
import mountainsJson from '../../public/war/biomes/mountains/objects.json';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { footprintTiles, OBJECT_BLOCKS } from '../../src/war/region/objects';
import { buildGrid } from '../../src/war/sim/grid';
import type { RegionData } from '../../src/war/types';

type Def = { id: string; kind?: string; footprint: number[]; blocksMovement: boolean };
const globalDefs = objectsJson.objects as Def[];
// biome objects are named `<biome>/<id>` in regions
const defs = [...globalDefs, ...Object.entries({ elaia: elaiaJson, kyrene: kyreneJson, mountains: mountainsJson }).flatMap(([b, j]) => (j.objects as Def[]).map((d) => ({ ...d, id: `${b}/${d.id}` })))];

describe('map objects', () => {
  it('the sim table matches objects.json (every global blocker; the biome blockers regions place)', () => {
    // massifs close the ground their sprite stands on instead (RegionData.blocked, tests/war/massifs.test.ts)
    const blocking = Object.fromEntries(defs.filter((d) => d.blocksMovement && d.kind !== 'massif').map((d) => [d.id, d.footprint]));
    for (const d of globalDefs) if (d.blocksMovement) expect(OBJECT_BLOCKS[d.id]).toEqual(d.footprint);
    for (const [id, fp] of Object.entries(OBJECT_BLOCKS)) expect([id, fp]).toEqual([id, blocking[id]]);
    for (const o of parseRegion(ridgeJson).objects!) if (blocking[o.id]) expect([o.id, OBJECT_BLOCKS[o.id]]).toEqual([o.id, blocking[o.id]]);
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
