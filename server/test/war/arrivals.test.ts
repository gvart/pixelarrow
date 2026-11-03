/**
 * Men come in over a border on ground that leads somewhere. Entries spread squads round their middle, and on some maps a
 * corner of an entry is a pocket cut off by cliffs: a group set down there walked nowhere, cart and all, until it left.
 */
import { describe, expect, it } from 'vitest';
import { npcSpot } from '../../../src/war/net/npcMarket';
import { buildGrid, canEnter, tileAt } from '../../../src/war/sim/grid';
import { makePerson } from '../../../src/war/sim/roster';
import type { Side } from '../../../src/war/world/types';
import { warRegion } from '../../src/war/regions';
import { WarRoom } from '../../src/war/room';

/** Every tile a man can walk to from the town. */
function townGround(id: string) {
  const r = warRegion(id)!, g = buildGrid(r), at = npcSpot(r), seen = new Uint8Array(g.w * g.h);
  let start = -1;
  for (let d = 0; d < 14 && start < 0; d++) for (let a = 0; a < 16 && start < 0; a++) {
    const t = tileAt(g, at.x + Math.cos((a * Math.PI) / 8) * d, at.y + Math.sin((a * Math.PI) / 8) * d);
    if (t >= 0 && g.cost[t] > 0) start = t;
  }
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const c = q.pop()!, cx = c % g.w, cy = (c / g.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy, n = y * g.w + x;
      if (x >= 0 && y >= 0 && x < g.w && y < g.h && !seen[n] && canEnter(g, c, n)) (seen[n] = 1), q.push(n);
    }
  }
  return { on: (x: number, y: number) => seen[tileAt(g, x, y)] === 1 };
}

describe('arriving over a border', () => {
  // the maps whose entries hold the biggest pockets
  for (const [id, side] of [['dodona-n', 'E'], ['canyons', 'E'], ['canyons', 'S'], ['delta', 'N']] as [string, Side][]) {
    it(`${id} ${side}: every squad, wherever the entry spreads it, can walk to the town`, () => {
      const room = new WarRoom({ region: warRegion(id)!, seed: 7, cap: 600 }), ground = townGround(id);
      for (let pid = 1; pid <= 25; pid++) {
        const got = room.arrive(pid, 0, [makePerson(`p${pid}`, 'hoplite')], side);
        expect('error' in got, `player ${pid}`).toBe(false);
      }
      room.tick(() => 0);
      const men = room.sim.snapshot().units.filter((u) => u.cls === 'hoplite');
      expect(men.length).toBe(25);
      for (const u of men) expect(ground.on(u.x, u.y), `${u.x},${u.y}`).toBe(true);
    });
  }
});
