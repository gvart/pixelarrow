/**
 * W-76 proposal, hidden quest step markers: the `secret` step line that tells the next goal carries where it is (`to`:
 * the step's spot and its marker label), the sim answers a player's open steps for a fresh connection (`hiddenOpen`,
 * text empty: no notice), and the page keeps the owner's open steps only (src/war/view/secretSteps.ts), dropping a
 * quest once it is done.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { RegionData, WarBuildSim, WarEvent } from '../../src/war/types';
import { applySecrets, type SecretSteps } from '../../src/war/view/secretSteps';

type Secret = Extract<WarEvent, { kind: 'secret' }>;
function flat(quest: string, n = 128): RegionData {
  return {
    id: 'hid', name: 'hid', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects: [], lairs: [], claimPoints: [], depth: 1,
    secrets: [{ x: 70.5, y: 70.5, quest, then: [82.5, 70.5] }],
  };
}
function play(sim: WarBuildSim, ticks: number, evs: WarEvent[], until?: () => boolean) {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    evs.push(...sim.events());
    if (until?.()) return;
  }
}
const secrets = (evs: WarEvent[]) => evs.filter((e): e is Secret => e.kind === 'secret');

describe('hidden quest step markers', () => {
  it('the next-step line carries the spot and label; the open step is answered for its owner only', () => {
    const sim = createSim(flat('cache'), 5), evs: WarEvent[] = [];
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 6, 70.5, 72.5);
    play(sim, 60, evs);
    const next = secrets(evs).filter((e) => e.what === 'step' && e.to).at(-1)!;
    expect(next.to).toMatchObject({ label: 'Cache' });
    expect(Math.hypot(next.to!.x - 82.5, next.to!.y - 70.5)).toBeLessThan(1.5);
    const open = sim.hiddenOpen('p:1');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ kind: 'secret', what: 'step', owner: 'p:1', team: 0, text: '', to: next.to });
    expect(sim.hiddenOpen('p:2')).toEqual([]);
    sim.order({ kind: 'move', squad: me, x: 82.5, y: 70.5 });
    play(sim, 1500, evs, () => secrets(evs).some((e) => e.what === 'done'));
    expect(sim.hiddenOpen('p:1')).toEqual([]);
  });

  it('the page keeps its owner\'s open steps, not another player\'s, and drops a quest once done', () => {
    const sim = createSim(flat('cache'), 5), evs: WarEvent[] = [];
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 6, 70.5, 72.5);
    sim.spawnSquad('p:2', 0, 'hoplite', 6, 72.5, 70.5);
    play(sim, 60, evs);
    let mine: SecretSteps = new Map(), theirs: SecretSteps = new Map();
    mine = applySecrets(mine, evs, 0, 1);
    theirs = applySecrets(theirs, evs, 0, 2);
    expect([...mine.values()]).toEqual([expect.objectContaining({ label: 'Cache' })]);
    expect(theirs.size).toBe(1);
    expect(applySecrets(new Map(), evs, 1, 1).size).toBe(0); // another team's page
    sim.order({ kind: 'move', squad: me, x: 82.5, y: 70.5 });
    const more: WarEvent[] = [];
    play(sim, 1500, more, () => secrets(more).some((e) => e.what === 'done' && e.owner === 'p:1'));
    mine = applySecrets(mine, more, 0, 1);
    expect(mine.size).toBe(0);
    expect(applySecrets(theirs, more, 0, 2).size).toBe(1);
  });
});
