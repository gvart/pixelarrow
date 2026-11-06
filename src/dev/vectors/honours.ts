/** Honour vectors (src/war/sim/honours.ts): honoursOf on random fights (teams, states, chokepoints, holders, stormed teams). */
import { honoursOf } from '../../war/sim/honours';
import { Rng } from '../../sim/rng';
import type { FightReport, PersonResult } from '../../war/types';

const STATES = ['fit', 'fit', 'fit', 'wounded', 'captive', 'dead'] as const;

export const vectors = () => {
  const r = new Rng(23), fights: unknown[] = [];
  for (let i = 0; i < 160; i++) {
    const teams = r.int(1, 3), n = r.int(0, 40);
    const persons = Array.from({ length: n }, (_, k) => ({ pid: `p${r.int(0, i % 4 === 0 ? 8 : 60)}-${k % 3}`, team: r.int(0, teams - 1), state: r.pick(STATES) }));
    const ctx = {
      region: r.pick(['Boreas Fjords', 'the Saddle', 'Ελαία']), chokepoint: r.chance(0.5), holder: r.chance(0.3) ? null : r.int(0, 2),
      stormed: new Set<number>(r.chance(0.7) ? [] : [r.int(0, 2)]),
    };
    const out = honoursOf({ tick: 0, persons: persons as unknown as PersonResult[], loot: {} } as FightReport, ctx);
    fights.push([persons.map((p) => [p.pid, p.team, p.state]), { ...ctx, stormed: [...ctx.stormed] }, [...out].map(([pid, h]) => [pid, h.name, h.stat])]);
  }
  return { fights };
};
