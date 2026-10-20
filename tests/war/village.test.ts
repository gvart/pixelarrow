import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { ResourceKind, Snapshot } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);

/** The village scenario as the sandbox plays it (../../src/war/view/devPanel.ts applyScenario), headless. */
function village(seed = 1) {
  const sc = scenarioById('village')!, e = sc.economy!, a = sc.after!;
  const sim = createSim(ridge, seed), bots = createBots(sim);
  for (const c of e.claims) sim.claim(c.team, c.x, c.y, c.r);
  for (const [r, n] of Object.entries(e.stock ?? {})) sim.addStock(0, r as ResourceKind, n);
  for (const q of sc.squads) {
    const id = sim.spawnSquad(q.owner ?? 'you', q.team, q.cls, q.count, q.x, q.y);
    if (q.bot) bots.set(id, q.bot);
  }
  for (const t of e.sites ?? []) sim.order({ kind: 'placeBuilding', squad: t.squad, type: t.type, x: t.x, y: t.y });
  for (let t = 0; t < e.prebuild! && sim.snapshot().buildings![0]?.state !== 'done'; t++) (sim.step(), bots.tick());
  for (const o of a.orders) sim.order(o);
  for (let t = 0; t < (a.settle ?? 0); t++) (sim.step(), bots.tick());
  for (const q of a.squads) {
    const id = sim.spawnSquad(q.owner ?? 'you', q.team, q.cls, q.count, q.x, q.y);
    if (q.bot) bots.set(id, q.bot);
  }
  for (const o of a.then ?? []) sim.order(o);
  const step = (n: number, until?: (s: Snapshot) => boolean) => {
    for (let t = 0; t < n; t++) {
      sim.step();
      bots.tick();
      if (until?.(sim.snapshot())) return t;
    }
    return n;
  };
  return { sim, step };
}
const civSquads = [2, 3, 4, 5, 6, 7];
const men = (s: Snapshot, q: number) => s.squads[q].units.map((id) => s.units[id]);

describe('M5f village scenario', () => {
  it('the foragers start on a pine by the camp', () => {
    const sc = scenarioById('village')!, home = sc.economy!.claims[0];
    const sim = createSim(ridge, 1);
    const gather = sc.after!.then!.find((o) => o.kind === 'gather')!;
    const n = sim.resourceNodes()[gather.kind === 'gather' ? gather.node : -1];
    expect(n.res).toBe('wood');
    expect(Math.hypot(n.x - home.x, n.y - home.y)).toBeLessThan(14);
  });

  it('civilians of every class at work; the wolves come, they run; then back to work', () => {
    const { sim, step } = village();
    let s = sim.snapshot();
    expect(s.buildings![0].state).toBe('done');
    expect(civSquads.every((q) => s.squads[q].civ && s.squads[q].units.length === 3)).toBe(true);
    // at work before the wolves arrive
    const seen = new Set<string>();
    step(150, (x) => {
      for (const q of civSquads) for (const u of men(x, q)) {
        if (u.work) seen.add(u.work);
        if (u.state === 'gather' || u.state === 'build') seen.add(u.state);
        if (u.carry) seen.add('carry');
      }
      return false;
    });
    expect([...seen].sort()).toEqual(expect.arrayContaining(['cook', 'forge', 'trade', 'heal', 'build', 'gather']));
    expect(s.buildings!.some((b) => b.type === 'storehouse')).toBe(false);
    s = sim.snapshot();
    expect(s.buildings!.some((b) => b.type === 'storehouse')).toBe(true);
    // the raid: some civilian squad flees
    const t = step(900, (x) => civSquads.some((q) => x.squads[q].flee));
    expect(t).toBeLessThan(900);
    const fled = new Set<number>();
    step(300, (x) => (civSquads.filter((q) => x.squads[q].flee).forEach((q) => fled.add(q)), false));
    expect(fled.size).toBeGreaterThanOrEqual(3);
    // the guard deals with the pack; all go back to work
    step(3000, (x) => men(x, 8).every((u) => u.state === 'dead') && civSquads.every((q) => !x.squads[q].flee));
    s = sim.snapshot();
    expect(men(s, 8).every((u) => u.state === 'dead')).toBe(true);
    expect(civSquads.every((q) => !s.squads[q].flee)).toBe(true);
    expect([2, 3, 4, 5].every((q) => s.squads[q].order === 'civWork')).toBe(true);
  });
});
