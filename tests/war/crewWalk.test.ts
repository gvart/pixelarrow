/**
 * A cart's crew keeps with its cart on real ground (docs/WAR.md "Carts"), the two ways men were lost in the solo runs:
 *
 *  - a man behind his cart on his own way, inside the loose hold on a waypoint but on the tile a cliff closes the next one
 *    from, turned back and forth for good (dodona, 344,231);
 *  - a crew point over a cliff from the cart sent both pullers the long way round, and the cart waited for them (elaia-n);
 *  - W-207 a way stepping diagonally past the very end of a cliff: no body fits by, so he slid along the cliff, searched again
 *    and got the same way, for good (dodona, 344,231 again).
 */
import { describe, expect, it } from 'vitest';
import { npcSpot } from '../../src/war/net/npcMarket';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { buildGrid, canEnter, findPath, walkClear } from '../../src/war/sim/grid';
import type { RegionData } from '../../src/war/types';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;

/** Two men pulling a handcart from (x,y) to (gx,gy): ticks until cart and both men are there, and how far a man ever fell behind for long. */
function pull(id: string, x: number, y: number, gx: number, gy: number, max: number) {
  const sim = createSim(region(id), 7);
  const q = sim.spawnSquad('p:1', 0, 'hoplite', 2, x, y);
  sim.spawnCart(0, 'p:1', 'handcart', x + 2, y, q);
  sim.step();
  sim.order({ kind: 'move', squad: q, x: gx, y: gy });
  let t = 0, behind = 0;
  for (; t < max; t++) {
    sim.step();
    const s = sim.snapshot(), c = s.sieges![0], men = s.units.filter((u) => u.squad === q && u.state !== 'dead');
    if (t > 300) behind = Math.max(behind, ...men.map((u) => Math.hypot(u.x - c.x, u.y - c.y)));
    if (Math.hypot(c.x - gx, c.y - gy) < 6 && men.every((u) => Math.hypot(u.x - gx, u.y - gy) < 8)) break;
  }
  return { t, behind };
}

describe('a crew and its cart', () => {
  it('no man is left on a corner of his way behind the cart (dodona, the road down from the north)', () => {
    const r = pull('dodona', 244, 1, 300, 322, 5000);
    expect(r.t).toBeLessThan(5000);
    expect(r.behind).toBeLessThan(12);
  });

  it('W-207 no way passes the end of a cliff on a diagonal: the man goes round by the open tile (dodona, 344,231)', () => {
    const g = buildGrid(region('dodona')), id = (x: number, y: number) => y * g.w + x;
    expect(canEnter(g, id(343, 231), id(344, 231)), 'the cliff').toBe(false);
    expect(canEnter(g, id(343, 230), id(344, 231)), 'its end').toBe(true);
    expect(findPath(g, id(343, 230), id(344, 231))).toEqual([id(343, 230), id(344, 230), id(344, 231)]);
    expect(walkClear(g, 343.5, 230.5, 344.5, 231.5)).toBe(false);
    // the start that came closest to losing him there
    expect(pull('dodona', 258, 3, 312, 339, 5000).behind).toBeLessThan(3);
  });

  it('a crew point over a cliff from the cart is no place to walk to (elaia-n, the east road)', () => {
    const at = npcSpot(region('elaia-n'));
    const r = pull('elaia-n', 494, 70, Math.round(at.x), Math.round(at.y), 9000);
    expect(r.t).toBeLessThan(9000);
    expect(r.behind).toBeLessThan(12);
  });
});
