import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { buildGrid, canEnter, findPath, nearestOpen } from '../../src/war/sim/grid';

const ridge = parseRegion(ridgeJson);
const K = ridge.w / 256; // features are authored on a 256 map and scale with it
const grid = buildGrid(ridge);
const T = ([x, y]: readonly [number, number]) => Math.floor(y) * ridge.w + Math.floor(x);
const near = (t: number, p: readonly [number, number], r: number) => Math.hypot((t % ridge.w) + 0.5 - p[0], Math.floor(t / ridge.w) + 0.5 - p[1]) <= r;

/** Every step of the path is a legal move: open tile, no cliff. */
function legal(path: number[]) {
  for (let i = 1; i < path.length; i++) expect(canEnter(grid, path[i - 1], path[i])).toBe(true);
}

describe('test-ridge region', () => {
  it('validates against the schema', () => {
    expect([ridge.w, ridge.h]).toEqual([512, 512]);
    expect(ridge.entries.map((e) => e.side).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(ridge.noBuild).toHaveLength(4);
  });

  it('rejects wrong layer lengths and unknown terrain', () => {
    expect(() => parseRegion({ ...ridge, height: ridge.height.slice(1) })).toThrow(/height/);
    expect(() => parseRegion({ ...ridge, terrain: ['lava', ...ridge.terrain.slice(1)] })).toThrow();
    expect(() => parseRegion({ ...ridge, height: [9, ...ridge.height.slice(1)] })).toThrow();
  });

  it('every named spot is open ground', () => {
    for (const [name, p] of Object.entries(SPOTS)) expect([name, grid.cost[T(p)] > 0]).toEqual([name, true]);
    expect(ridge.water[T(SPOTS.ford)]).toBe(1);
    expect(ridge.terrain[T(SPOTS.bridge)]).toBe('road');
    expect(ridge.terrain[T(SPOTS.forest)]).toBe('forest');
    expect(ridge.terrain[T(SPOTS.marsh)]).toBe('marsh');
    expect(ridge.terrain[T(SPOTS.sand)]).toBe('sand');
    expect(ridge.height[T(SPOTS.plateauTop)]).toBe(5);
    expect(ridge.height[T(SPOTS.ridgeCrest)]).toBe(5);
  });
});

describe('pathfinding', () => {
  it('crosses the mountain chain only by the switchback pass, never over rock', () => {
    const path = findPath(grid, T(SPOTS.passN), T(SPOTS.passS));
    expect(path.at(-1)).toBe(T(SPOTS.passS));
    legal(path);
    expect(path.some((t) => near(t, SPOTS.passSaddle, 2 * K))).toBe(true);
    expect(path.some((t) => ridge.terrain[t] === 'rock')).toBe(false);
    // the road winds: much longer than the straight line
    expect(path.length).toBeGreaterThan(1.5 * Math.hypot(SPOTS.passS[0] - SPOTS.passN[0], SPOTS.passS[1] - SPOTS.passN[1]));
  });

  it('crosses the river at the ford when it is the nearer crossing', () => {
    const path = findPath(grid, T(SPOTS.fordW), T(SPOTS.fordE));
    expect(path.at(-1)).toBe(T(SPOTS.fordE));
    legal(path);
    expect(path.some((t) => ridge.water[t] === 1)).toBe(true);
    expect(path.some((t) => ridge.water[t] === 2)).toBe(false);
  });

  it('crosses the river on the bridge in the south', () => {
    const path = findPath(grid, T(SPOTS.bridgeW), T(SPOTS.bridgeE));
    expect(path.at(-1)).toBe(T(SPOTS.bridgeE));
    legal(path);
    expect(path.some((t) => near(t, SPOTS.bridge, 1.5))).toBe(true);
    expect(path.some((t) => ridge.water[t] !== 0)).toBe(false);
  });

  it('climbs the ridge by its gentle side; the north face is a cliff', () => {
    const up = findPath(grid, T(SPOTS.ridgeFoot), T(SPOTS.ridgeCrest));
    expect(up.at(-1)).toBe(T(SPOTS.ridgeCrest));
    legal(up);
    expect(up.length).toBeLessThan(30 * K);
    const cliff = findPath(grid, T(SPOTS.ridgeCliffFoot), T(SPOTS.ridgeCrest));
    expect(cliff.at(-1)).toBe(T(SPOTS.ridgeCrest));
    legal(cliff);
    expect(cliff.length).toBeGreaterThan(40 * K); // around the ridge end, not up the face
  });

  it('reaches the plateau only by the ramp', () => {
    const path = findPath(grid, T(SPOTS.fieldE), T(SPOTS.plateauTop));
    expect(path.at(-1)).toBe(T(SPOTS.plateauTop));
    legal(path);
    expect(path.some((t) => near(t, SPOTS.rampMid, 2 * K))).toBe(true);
  });

  it('long searches through the sector layer match a plain search closely', () => {
    const a = nearestOpen(grid, 12 * K, 30 * K);
    const b = nearestOpen(grid, 244 * K, 230 * K);
    const path = findPath(grid, a, b);
    expect(path.at(-1)).toBe(b);
    legal(path);
    expect(path.length).toBeLessThan(380 * K);
  });

  it('stops at the closest reachable tile when the goal is walled off', () => {
    const rock = ridge.terrain.findIndex((t, i) => t === 'rock' && Math.floor(i / ridge.w) === 146 * K);
    const path = findPath(grid, T(SPOTS.passN), rock);
    expect(ridge.terrain[path.at(-1)!]).not.toBe('rock');
    legal(path);
  });
});
