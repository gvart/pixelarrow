/**
 * W-62 the guided first hour, online (rules and spots: src/war/net/guide.ts; the HUD: src/war/view/hud/guide.ts). The
 * region room keeps one run per player of the home alliance who still has steps open: on his first visit (no save, or
 * the lair step still open) it wakes the guide's bandit pair on the road from his entry (one pair at a time per team:
 * a later new player gets a fresh pair once the last one fell), watches his men each tick, and tells him each step done.
 * The DO pays the step's reward into his home strongroom and keeps his save in its storage (`guide:<season>:<pid>`).
 * A full army (ARMY_MAX men across every region) has no soul to claim: the step closes unpaid at once, or when a claim
 * of his is refused. The haul step closes on a stow in, a hand-off done or a caravan (a transit's cargo) arriving here.
 */
import { doneNow, GUIDE_LAIR, GUIDE_STEPS, guideOpen, guideSpots, newWatch, watchEvents, type GuideSave, type GuideStepId, type GuideWatch } from '../../../src/war/net/guide';
import type { ServerMsg } from '../../../src/war/net/protocol';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import type { RegionData, Snapshot, WarBuildSim, WarEvent } from '../../../src/war/types';

/** A step done: the DO pays `reward` (when `paid`) into his strongroom and stores `save`. */
export interface GuideDone { pid: number; step: GuideStepId; paid: boolean; reward: Record<string, number>; save: GuideSave }

/** DO storage key of a player's save (per season: a new season is a new first hour). */
export const guideStorageKey = (season: number | string, pid: number) => `guide:${season}:${pid}`;

interface Run { pid: number; save: GuideSave; watch: GuideWatch }

export class RoomGuide {
  private runs = new Map<number, Run>();
  private done: GuideDone[] = [];

  constructor(private readonly region: RegionData, private readonly sim: WarBuildSim, private readonly home: number | undefined) {}

  /** The guide message for a save (what the client's tracker shows). */
  static msg(save: GuideSave, step?: GuideStepId, paid = false): ServerMsg {
    return { t: 'guide', done: [...save.done], ...(save.hidden ? { hidden: true } : {}), ...(step ? { step } : {}), ...(paid ? { paid: true } : {}) };
  }

  /**
   * A player of `team` (with `army` men in all) is in: his run starts if this is his alliance's home and his guide is
   * open. The message to send him (null: no guide here).
   */
  start(pid: number, team: number, save: GuideSave | null, army: number, snap: Snapshot): ServerMsg | null {
    if (this.home === undefined || team !== this.home) return null;
    const s: GuideSave = save ?? { v: 1, done: [] };
    if (!guideOpen(s)) return RoomGuide.msg(s);
    const spot = guideSpots(this.region, team).lair, run: Run = this.runs.get(pid) ?? { pid, save: s, watch: newWatch(team, spot, `p:${pid}`) };
    this.runs.set(pid, run);
    if (!s.done.includes('lair')) {
      const here = (snap.lairs ?? []).filter((l) => Math.hypot(l.x - spot.x, l.y - spot.y) < 0.5);
      if (!here.some((l) => l.state !== 'cleared')) this.sim.addLair({ kind: GUIDE_LAIR.kind, x: spot.x, y: spot.y, count: GUIDE_LAIR.count });
    }
    if (army >= ARMY_MAX) this.finish(run, 'soul', false);
    return RoomGuide.msg(s);
  }

  /** He hid the guide (the tracker's ×). */
  hide(pid: number): GuideSave | null {
    const r = this.runs.get(pid);
    if (!r) return null;
    r.save.hidden = true;
    this.runs.delete(pid);
    return r.save;
  }

  /** A step done outside the sim (stow, hand-off, caravan). */
  mark(pid: number, step: GuideStepId): void {
    this.runs.get(pid)?.watch.flags.add(step);
  }

  /** He left the region: his run ends (it starts again from his save next time). */
  leave(pid: number): void {
    this.runs.delete(pid);
  }

  private finish(r: Run, step: GuideStepId, paid: boolean): void {
    if (r.save.done.includes(step)) return;
    r.save.done.push(step);
    const reward = paid ? { ...(GUIDE_STEPS.find((s) => s.id === step)!.reward as Record<string, number>) } : {};
    this.done.push({ pid: r.pid, step, paid, reward, save: { ...r.save, done: [...r.save.done] } });
    if (!guideOpen(r.save)) this.runs.delete(r.pid);
  }

  /** After a step: the steps done this tick (the DO pays and stores them) and the messages to tell. */
  tick(snap: Snapshot, evs: readonly WarEvent[]): { done: GuideDone[]; msgs: [number, ServerMsg][] } {
    for (const r of [...this.runs.values()]) {
      if (evs.some((e) => e.kind === 'soulRefused' && e.owner === r.watch.owner)) this.finish(r, 'soul', false); // a full army: nothing to claim
      watchEvents(r.watch, snap, evs);
      for (const step of doneNow(r.watch, snap)) this.finish(r, step, true);
    }
    const done = this.done;
    this.done = [];
    return { done, msgs: done.map((d) => [d.pid, RoomGuide.msg(d.save, d.step, d.paid)]) };
  }

  /** Players with a run (tests). */
  get open(): number[] {
    return [...this.runs.keys()];
  }
}
