// W-86, W-112: no family is a trap on the choice screen. Each fights as a player would: its melee men go in first as the
// line, its missile men follow and shoot from behind them. Seeded on a flat map; the families come from the start table.
import { describe, expect, it } from 'vitest';
import { CHIEF_KINDS, chiefsOfKind } from '../../src/data/warBosses';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import { makePerson } from '../../src/war/sim/roster';
import { FAMILY_IDS, pathStart, type StartFamily } from '../../src/war/world/start';
import type { MobKind, RegionData } from '../../src/war/types';

const SEEDS = [11, 22, 33];

function flat(lair: NonNullable<RegionData['lairs']>[number], n = 96): RegionData {
  return { id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [], objects: [], lairs: [lair], claimPoints: [] };
}

/** The family's men at this man level and demigod level against one lair: did the lair fall? */
function clears(family: StartFamily, men: readonly string[], level: number, demigod: number, kind: MobKind, chief: string | undefined, seed: number): boolean {
  const sim = createSim(flat({ kind, x: 48.5, y: 48.5, ...(chief ? { chief } : {}) }), seed);
  sim.setPaths(() => ({ path: 'warrior', family, level: demigod }));
  sim.spawnMobs();
  const l = sim.snapshot().lairs![0];
  const ps = men.map((c, i) => makePerson(`m${i}`, c, { level }));
  const line = ps.filter((p) => warStats(p.hero.cls!).range === 0), back = ps.filter((p) => warStats(p.hero.cls!).range > 0);
  const front = sim.spawnSquad('p:1', 0, line[0].hero.cls!, line.length, l.x + 18, l.y, line);
  const rear = back.length ? sim.spawnSquad('p:1', 0, back[0].hero.cls!, back.length, l.x + 24, l.y, back) : -1;
  sim.order({ kind: 'attack', squad: front, target: l.squad });
  for (let t = 0; t < 6000; t++) {
    if (t === 15 && rear >= 0) sim.order({ kind: 'attack', squad: rear, target: l.squad });
    sim.step();
    const s = sim.snapshot();
    if (s.lairs![0].state === 'cleared') return true;
    if (!s.units.some((u) => s.squads[u.squad]?.team === 0 && u.state !== 'dead')) return false;
  }
  return false;
}

const startMen = (f: StartFamily) => pathStart('warrior', f);
/** Grown to the warrior's cap: his first men again and again. */
const grown = (f: StartFamily) => Array.from({ length: 12 }, (_, i) => startMen(f)[i % startMen(f).length]);

describe.each(FAMILY_IDS)('family %s', (f) => {
  it('its first men, at the start, clear the beasts of a home', () => {
    for (const kind of ['wolf', 'boar', 'bear'] as const) for (const seed of SEEDS) expect(clears(f, startMen(f), 1, 1, kind, undefined, seed), `${kind} ${seed}`).toBe(true);
  });

  it('with level 3 men and the early perks they clear a bandit lair', () => {
    for (const seed of SEEDS) expect(clears(f, startMen(f), 3, 3, 'bandit', undefined, seed), `${seed}`).toBe(true);
  });

  it('grown to 12 level 3 men at demigod level 5 they beat the chiefs of every near kind', () => {
    for (const kind of ['bandit', 'wolf', 'boar', 'bear'] as const) {
      expect(CHIEF_KINDS[kind]).toBeDefined();
      for (const seed of SEEDS) expect(clears(f, grown(f), 3, 5, kind, chiefsOfKind(kind)[0].id, seed), `${kind} ${seed}`).toBe(true);
    }
  });
});
