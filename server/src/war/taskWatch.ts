/**
 * W-62 E7: the room's watch for the tasks' gathering tally (./tasks.ts books it). Pure: no D1, so the room keeps light
 * imports.
 */
import type { TaskMetric } from '../../../src/war/net/tasks';
import type { UnitSnap } from '../../../src/war/types';

const CARRIED = new Set(['wood', 'stone']);
/**
 * The room's watch on men carrying wood or stone home: a man who cut at a node (state 'gather') and then drops his
 * whole load (load to 0, alive: at a store) has gathered it. Loads fetched from a store for a building site are not
 * counted (he never cut). `drain` hands back the tallies by player since the last drain.
 */
export class GatherWatch {
  private was = new Map<number, { r: string; n: number; cut: boolean }>();
  private acc = new Map<string, number>();

  step(units: readonly UnitSnap[], ownerOf: (squad: number) => string | undefined): void {
    const seen = new Map<number, { r: string; n: number; cut: boolean }>();
    for (const u of units) {
      if (u.state === 'dead') continue;
      const prev = this.was.get(u.id), carrying = !!u.carry && CARRIED.has(u.carry) && (u.load ?? 0) > 0;
      if (carrying) {
        seen.set(u.id, { r: u.carry!, n: u.load!, cut: u.state === 'gather' || (!!prev?.cut && prev.r === u.carry) });
        continue;
      }
      if (!prev?.cut) continue;
      const m = /^p:(\d+)$/.exec(ownerOf(u.squad) ?? '');
      if (!m) continue;
      const k = `${m[1]}:${prev.r === 'wood' ? 'gatherWood' : 'gatherStone'}`;
      this.acc.set(k, (this.acc.get(k) ?? 0) + prev.n);
    }
    this.was = seen;
  }

  /** The tallies since the last drain: [player, metric, amount]. */
  drain(): [number, TaskMetric, number][] {
    const out = [...this.acc].map(([k, n]) => {
      const [p, m] = k.split(':');
      return [Number(p), m as TaskMetric, n] as [number, TaskMetric, number];
    });
    this.acc.clear();
    return out;
  }
}
