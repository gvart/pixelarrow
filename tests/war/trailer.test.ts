/** The trailer's seeded scenes (src/war/scenarios/trailer.ts), played headless as the sandbox applies them (devPanel applyScenario). */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { COTTAGE, NODE_MARBLE, NODE_OLIVE, NODE_WOOD, RIDGE } from '../../src/war/scenarios/trailer';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { ResourceKind, Snapshot } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(files[`../../src/war/regions/${id}.json`]);

function play(id: string, seed = 1) {
  const sc = scenarioById(id)!, e = sc.economy, a = sc.after;
  const sim = createSim(region(sc.region!), seed), bots = createBots(sim);
  const step = (n: number, until?: (s: Snapshot) => boolean) => {
    for (let t = 0; t < n; t++) {
      sim.step();
      bots.tick();
      if (until?.(sim.snapshot())) return t;
    }
    return n;
  };
  if (sc.neutral) sim.spawnMobs();
  for (const c of e?.claims ?? []) sim.claim(c.team, c.x, c.y, c.r);
  for (const [r, n] of Object.entries(e?.stock ?? {})) sim.addStock(0, r as ResourceKind, n);
  for (const [r, n] of Object.entries(e?.foeStock ?? {})) sim.addStock(1, r as ResourceKind, n);
  const spawn = (q: (typeof sc.squads)[number], owner: string) => {
    const s = sim.spawnSquad(owner, q.team, q.cls, q.count, q.x, q.y);
    if (q.bot) bots.set(s, q.bot);
  };
  for (const q of sc.squads) spawn(q, q.owner ?? (q.team === 0 ? 'you' : 'bot'));
  for (const o of a?.orders ?? []) sim.order(o);
  step(a?.settle ?? 0);
  for (const q of a?.squads ?? []) spawn(q, q.team === 0 ? 'you' : q.bot ? 'bot' : 'raiders');
  for (const o of a?.then ?? []) sim.order(o);
  step(a?.later?.settle ?? 0);
  for (const o of a?.later?.orders ?? []) sim.order(o);
  return { sim, step };
}
const alive = (s: Snapshot, q: number) => s.squads[q].units.filter((id) => s.units[id].state !== 'dead').length;

describe('trailer scenes', () => {
  it('Elaia at peace: the brazier stands lit by the well, the foragers work wood, marble and olives, the column waits', () => {
    const { sim, step } = play('trailer-elaia');
    const nodes = sim.resourceNodes();
    expect([nodes[NODE_WOOD].res, nodes[NODE_MARBLE].res, nodes[NODE_OLIVE].res]).toEqual(['wood', 'marble', 'food']);
    step(400);
    const s = sim.snapshot();
    expect(s.buildings!.some((b) => b.type === 'brazier' && b.team === 0)).toBe(true);
    for (const q of [3, 4, 5]) expect(s.squads[q].order, `squad ${q}`).toBe('gather');
    // the column has not moved off the ridge
    const u = s.units[s.squads[7].units[0]];
    expect(Math.hypot(u.x - RIDGE[0], u.y - RIDGE[1])).toBeLessThan(8);
  });

  it('Elaia raided: the fire arrows set the cottage alight', () => {
    const { sim, step } = play('trailer-elaia-raid');
    const t = step(300, (s) => (s.buildings![COTTAGE].burning ?? 0) > 0);
    expect(t).toBeLessThan(300);
    expect(sim.snapshot().buildings![COTTAGE].type).toBe('cottage');
  });

  it('the hunt: the archers bring down ibex', () => {
    const { sim, step } = play('trailer-hunt');
    const n0 = alive(sim.snapshot(), 3);
    expect(sim.snapshot().squads[3].cls).toBeUndefined();
    step(300, (s) => alive(s, 3) < n0);
    expect(alive(sim.snapshot(), 3)).toBeLessThan(n0);
  });

  for (const [id, boss] of [['landmark-forge', 'gyges'], ['landmark-hold', 'chimera'], ['landmark-watchtower', 'scylla'], ['landmark-temple', 'titan']] as const) {
    it(`${id}: the raid reaches ${boss} within 60 s`, () => {
      const { sim, step } = play(id);
      sim.step();
      const b = () => sim.snapshot().bosses!.find((x) => x.id === boss)!;
      expect(b()).toBeDefined();
      for (const q of sim.snapshot().squads.filter((q) => q.owner === 'you')) expect(q.team).toBe(0);
      // Scylla is fought through her heads: there the raid's first losses count
      const raid = () => sim.snapshot().squads.filter((q) => q.owner === 'you').reduce((n, q) => n + alive(sim.snapshot(), q.id), 0), n0 = raid();
      const met = () => (boss === 'scylla' ? raid() < n0 : b().hp < b().maxHp);
      step(600, met);
      expect(met()).toBe(true);
    });
  }
});
