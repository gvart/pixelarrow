import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { formationOffsets } from '../../src/war/sim/formation';
import { SQUAD_MAX, XP } from '../../src/war/sim/soldiers';
import { makePerson } from '../../src/war/sim/roster';
import { Rng } from '../../src/sim/rng';

const ridge = parseRegion(ridgeJson);

/** Men per rank (forward offset), front first. */
function ranks(off: number[]): number[] {
  const by = new Map<number, number>();
  for (let i = 0; i < off.length; i += 2) {
    const f = Math.round(off[i] * 100) / 100;
    by.set(f, (by.get(f) ?? 0) + 1);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([, n]) => n);
}

describe('M5a squad size', () => {
  it('N is 12 and the sim clamps a spawn to it', () => {
    expect(SQUAD_MAX).toBe(12);
    const sim = createSim(ridge, 1);
    const s = sim.spawnSquad('a', 0, 'militia', 20, 200, 200);
    expect(sim.snapshot().squads[s].units).toHaveLength(SQUAD_MAX);
  });

  it('formation slots at N: line 6x2, column 2x6, wedge 1-2-3-6, loose 6x2 spread out', () => {
    const rng = new Rng(1);
    expect(ranks(formationOffsets('line', SQUAD_MAX, rng))).toEqual([6, 6]);
    expect(ranks(formationOffsets('column', SQUAD_MAX, rng))).toEqual([2, 2, 2, 2, 2, 2]);
    expect(ranks(formationOffsets('wedge', SQUAD_MAX, rng))).toEqual([1, 2, 3, 6]);
    const loose = formationOffsets('loose', SQUAD_MAX, rng);
    expect(loose).toHaveLength(2 * SQUAD_MAX);
    const xs = loose.filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8); // 6 files 1.8 apart
    // every shape: N distinct slots at least a body apart, centred front to back
    for (const shape of ['line', 'column', 'wedge', 'loose'] as const) {
      const o = formationOffsets(shape, SQUAD_MAX, new Rng(2));
      let mf = 0;
      for (let i = 0; i < o.length; i += 2) {
        mf += o[i];
        for (let j = i + 2; j < o.length; j += 2) expect(Math.hypot(o[i] - o[j], o[i + 1] - o[j + 1])).toBeGreaterThan(0.5);
      }
      expect(Math.abs(mf / SQUAD_MAX)).toBeLessThan(1e-9);
    }
    // a detachment of 4 still forms up
    expect(ranks(formationOffsets('wedge', 4, rng))).toEqual([1, 3]);
    expect(ranks(formationOffsets('line', 4, rng))).toEqual([2, 2]);
  });

  it.each(['pass-ambush', 'ford-crossing', 'hill-assault', 'bridge-vs-ford'])('scenario %s still ends with a winner at N; XP totals (M5d)', (id) => {
    const sc = scenarioById(id)!;
    const sim = createSim(ridge, 7);
    const bots = createBots(sim);
    // every man a fresh person (they bake to the class): the fight reports XP
    sc.squads.forEach((q, i) => {
      expect(q.count).toBeLessThanOrEqual(SQUAD_MAX);
      const ps = Array.from({ length: q.count }, (_, k) => makePerson(`s${i}-${k}`, q.cls));
      const s = sim.spawnSquad(q.owner ?? (q.team ? 'bot' : 'you'), q.team, q.cls, q.count, q.x, q.y, ps);
      if (q.bot) bots.set(s, q.bot);
    });
    const alive = (team: number) => {
      const snap = sim.snapshot();
      return snap.units.filter((u) => u.state !== 'dead' && snap.squads[u.squad].team === team).length;
    };
    // your side (no bots in the sandbox) attacks the nearest enemy squad now and then
    for (let t = 0; t < 9000 && alive(0) && alive(1); t++) {
      if (t % 50 === 0) {
        const snap = sim.snapshot();
        const c = snap.squads.map((s) => {
          const us = s.units.map((u) => snap.units[u]).filter((u) => u.state !== 'dead');
          return us.length ? [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length] : null;
        });
        for (const s of snap.squads) {
          if (s.team !== 0 || !c[s.id]) continue;
          let best = -1, bd = Infinity;
          for (const o of snap.squads) {
            if (o.team === 0 || !c[o.id]) continue;
            const d = Math.hypot(c[o.id]![0] - c[s.id]![0], c[o.id]![1] - c[s.id]![1]);
            if (d < bd) (bd = d), (best = o.id);
          }
          if (best >= 0) sim.order({ kind: 'attack', squad: s.id, target: best });
        }
      }
      sim.step();
      bots.tick();
    }
    expect(Math.min(alive(0), alive(1))).toBe(0);
    expect(Math.max(alive(0), alive(1))).toBeGreaterThan(0);
    const r = sim.endFight();
    const fallen = sim.snapshot().units.filter((u) => u.state === 'dead').length;
    expect(r.persons.reduce((a, p) => a + p.kills, 0)).toBe(fallen);
    const xp = [0, 1].map((team) => r.persons.filter((p) => p.team === team).reduce((a, p) => a + p.xp, 0));
    const win = alive(0) ? 0 : 1;
    expect(xp[win]).toBeGreaterThan(0);
    for (const p of r.persons) if (p.state === 'fit' && p.team === win) expect(p.xp).toBeGreaterThanOrEqual(XP.survived);
    console.log(`${id}: XP you ${xp[0]}, foe ${xp[1]}; fallen ${fallen}, winner team ${win}`);
  });
});
