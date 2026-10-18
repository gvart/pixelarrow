import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { buildGrid, canEnter, findPath } from '../../src/war/sim/grid';

const ridge = parseRegion(ridgeJson);
const grid = buildGrid(ridge);
const T = (x: number, y: number) => y * ridge.w + x;
const riverX = (y: number) => 100 + Math.round(4 * Math.sin(y / 14));

/** Every step of the path is a legal move: open tile, no cliff. */
function legal(path: number[]) {
  for (let i = 1; i < path.length; i++) expect(canEnter(grid, path[i - 1], path[i])).toBe(true);
}

describe('test-ridge region', () => {
  it('validates against the schema', () => {
    expect(ridge.w * ridge.h).toBe(160 * 160);
    expect(ridge.entries.map((e) => e.side).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(ridge.noBuild).toHaveLength(4);
  });

  it('rejects wrong layer lengths and unknown terrain', () => {
    expect(() => parseRegion({ ...ridge, height: ridge.height.slice(1) })).toThrow(/height/);
    expect(() => parseRegion({ ...ridge, terrain: ['lava', ...ridge.terrain.slice(1)] })).toThrow();
    expect(() => parseRegion({ ...ridge, height: [9, ...ridge.height.slice(1)] })).toThrow();
  });

  it('the river is deep everywhere but the ford and the bridge', () => {
    for (let y = 0; y < ridge.h; y++) {
      const w = ridge.water[T(riverX(y), y)];
      if (y >= 36 && y <= 39) expect(w).toBe(1);
      else if (y >= 118 && y <= 120) expect([w, ridge.terrain[T(riverX(y), y)]]).toEqual([0, 'road']);
      else expect(w).toBe(2);
    }
  });
});

describe('pathfinding', () => {
  it('crosses the mountain wall only through the pass, never over a cliff', () => {
    const path = findPath(grid, T(20, 70), T(20, 95));
    expect(path.at(-1)).toBe(T(20, 95));
    legal(path);
    const inWall = path.filter((t) => Math.floor(t / ridge.w) >= 78 && Math.floor(t / ridge.w) <= 86);
    expect(inWall.length).toBeGreaterThan(0);
    for (const t of inWall) expect(t % ridge.w).toBeGreaterThanOrEqual(38), expect(t % ridge.w).toBeLessThanOrEqual(40);
    expect(path.some((t) => ridge.terrain[t] === 'rock')).toBe(false);
  });

  it('crosses the river at the ford when it is the nearer crossing', () => {
    const path = findPath(grid, T(85, 30), T(115, 30));
    expect(path.at(-1)).toBe(T(115, 30));
    legal(path);
    expect(path.some((t) => ridge.water[t] === 1)).toBe(true);
    expect(path.some((t) => ridge.water[t] === 2)).toBe(false);
  });

  it('crosses the river on the bridge in the south', () => {
    const path = findPath(grid, T(85, 130), T(115, 130));
    legal(path);
    const crossing = path.filter((t) => Math.abs((t % ridge.w) - riverX(Math.floor(t / ridge.w))) <= 2);
    expect(crossing.length).toBeGreaterThan(0);
    for (const t of crossing) expect(ridge.terrain[t]).toBe('road');
  });

  it('climbs the ridge to the plateau by slopes', () => {
    const top = T(42, 40);
    expect(ridge.height[top]).toBe(5);
    const path = findPath(grid, T(42, 15), top);
    expect(path.at(-1)).toBe(top);
    legal(path);
  });

  it('stops at the closest reachable tile when the goal is walled off', () => {
    const path = findPath(grid, T(20, 70), T(20, 82)); // inside the rock wall
    expect(ridge.terrain[path.at(-1)!]).not.toBe('rock');
    legal(path);
  });
});
