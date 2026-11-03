/**
 * W-62 the guided first hour, online (rules and spots: src/war/net/guide.ts; the HUD: src/war/view/hud/guide.ts), one chain
 * per path (W-170). The region room keeps one run per player who still has steps open. A warrior's or builder's run is at
 * his home; a trader's also in the land next door, where his chain sells and hires. On a warrior's first visit it wakes the
 * guide's soul of his family and its small bandit camp on the road from his entry (W-171; one camp at a time per team: a later
 * new player gets a fresh one once the last fell); it watches his men each tick and tells him each step done.
 * The DO pays the step's reward into his home strongroom and keeps his save in D1 (`war_alliance_members.guide`), so it
 * follows him over a border.
 * A full army (his path's cap) has no soul to claim: the step closes unpaid at once, or when a claim of his is refused.
 * W-73 the warrior's hand-off, the road to the nearest region chain, closes when his men reach the exit towards it, or when
 * he departs for that region (the DO's depart marks it); a chain here (W-147) closes at its giver.
 * W-79: on his very first visit (no save) his men's packs get HUNGER.kit rations each (about two hours fed), once: the DO
 * stores the fresh save at once (saveOf), so a reconnect does not pack them again.
 */
import { doneNow, GUIDE_LAIR, GUIDE_NEAR, GUIDE_SOUL, guideHand, guideNext, guideOpen, guideSpots, guideSteps, watchEvents, watchFor, type GuideSave, type GuideStepId, type GuideWatch } from '../../../src/war/net/guide';
import type { ServerMsg } from '../../../src/war/net/protocol';
import { HUNGER } from '../../../src/war/sim/food';
import { put } from '../../../src/war/sim/holders';
import type { RegionData, Snapshot, WarBuildSim, WarEvent } from '../../../src/war/types';
import { FAMILIES, mayHold, NO_PATH, type PathId, type PlayerPath } from '../../../src/war/world/start';

/** A step done: the DO pays `reward` (when `paid`) into his strongroom and stores `save`. */
export interface GuideDone { pid: number; step: GuideStepId; paid: boolean; reward: Record<string, number>; save: GuideSave }

interface Run { pid: number; path: PathId | null; save: GuideSave; watch: GuideWatch; /** The region whose road closes the hand-off (W-73), null: a giver here. */ road: string | null }

export class RoomGuide {
  private runs = new Map<number, Run>();
  private done: GuideDone[] = [];

  constructor(private readonly region: RegionData, private readonly sim: WarBuildSim, private readonly home: number | undefined) {}

  /** The guide message for a save (what the client's tracker shows). */
  static msg(save: GuideSave, step?: GuideStepId, paid = false): ServerMsg {
    return { t: 'guide', done: [...save.done], ...(save.hidden ? { hidden: true } : {}), ...(step ? { step } : {}), ...(paid ? { paid: true } : {}) };
  }

  /**
   * A player of `team` (with `army` men in all, `cap` at most, W-85; `way`: his path; `home`: his home region, null: the
   * alliance's) is in: his run starts if he is at home, or a trader next door, and his guide is open. The message to send him
   * (null: no guide here).
   */
  start(pid: number, team: number, save: GuideSave | null, army: number, cap: number, snap: Snapshot, way: PlayerPath = NO_PATH, home: string | null = null): ServerMsg | null {
    const homeId = home ?? (this.home !== undefined && team === this.home ? this.region.id : null);
    if (!homeId || (homeId !== this.region.id && way.path !== 'trader')) return null;
    const s: GuideSave = save ?? { v: 1, done: [] };
    if (!guideOpen(s, way.path)) return RoomGuide.msg(s);
    const spots = guideSpots(this.region, team), fights = way.path === null || way.path === 'warrior';
    const hand = homeId === this.region.id ? guideHand(this.region.id, this.region, way.path) : null;
    const run: Run = this.runs.get(pid) ?? { pid, path: way.path, save: s, watch: watchFor(way.path, this.region, team, `p:${pid}`, homeId, spots.lair), road: hand?.road ?? null };
    this.runs.set(pid, run);
    if (!save) this.pack(pid, snap); // W-79: the start squad's march rations
    if (fights && !s.done.includes('lair')) {
      const here = (snap.lairs ?? []).filter((l) => Math.hypot(l.x - spots.lair.x, l.y - spots.lair.y) < 0.5);
      if (!here.some((l) => l.state !== 'cleared')) this.sim.addLair({ kind: GUIDE_LAIR.kind, x: spots.lair.x, y: spots.lair.y, count: GUIDE_LAIR.count });
    }
    if (fights) {
      if (army >= cap) this.finish(run, 'soul', false);
      else if (!s.done.includes('soul') && !(snap.souls ?? []).some((q) => mayHold(way, q.cls) && Math.hypot(q.x - spots.soul.x, q.y - spots.soul.y) < GUIDE_NEAR)) {
        this.sim.spawnSoul(spots.soul.x, spots.soul.y, way.family ? FAMILIES[way.family].start[0] : 'hoplite', GUIDE_SOUL.level, 'shrine'); // a soul he can take (W-101)
      }
    }
    return RoomGuide.msg(s);
  }

  /** W-79: HUNGER.kit rations into the pack of each of his men here. */
  private pack(pid: number, snap: Snapshot): void {
    for (const q of snap.squads) {
      if (q.owner !== `p:${pid}`) continue;
      for (const slot of this.sim.cargo({ squad: q.id })?.slots ?? []) put(slot.hold, 'ration', HUNGER.kit, this.region.id);
    }
  }

  /** His run's save (the DO stores a new player's at once: his rations are packed). */
  saveOf(pid: number): GuideSave | null {
    const r = this.runs.get(pid);
    return r ? { ...r.save, done: [...r.save.done] } : null;
  }

  /** He hid the guide (the tracker's ×). */
  hide(pid: number): GuideSave | null {
    const r = this.runs.get(pid);
    if (!r) return null;
    r.save.hidden = true;
    this.runs.delete(pid);
    return r.save;
  }

  /** A step done outside the sim (a deal with a town). */
  mark(pid: number, step: GuideStepId): void {
    this.runs.get(pid)?.watch.flags.add(step);
  }

  /** W-73: he departs for `to`: the hand-off closes if that is its road. */
  departed(pid: number, to: string): void {
    const r = this.runs.get(pid);
    if (r && r.road === to) r.watch.flags.add('next');
  }

  /** W-73: the hand-off's region from here (the DO marks `next` when he departs for it). */
  get nextRegion(): string | null {
    return this.home === undefined ? null : guideNext(this.region.id, this.region)?.region ?? null;
  }

  /** He left the region: his run ends (it starts again from his save next time). */
  leave(pid: number): void {
    this.runs.delete(pid);
  }

  private finish(r: Run, step: GuideStepId, paid: boolean): void {
    const st = guideSteps(r.path).find((s) => s.id === step);
    if (!st || r.save.done.includes(step)) return; // another path's work counts for nothing here
    if (step === 'hire' && !r.save.done.includes('sell')) return; // a trader buys his first load at home: this is the deal abroad
    r.save.done.push(step);
    const reward = paid ? { ...(st.reward as Record<string, number>) } : {};
    this.done.push({ pid: r.pid, step, paid, reward, save: { ...r.save, done: [...r.save.done] } });
    if (!guideOpen(r.save, r.path)) this.runs.delete(r.pid);
  }

  /** After a step: the steps done this tick (the DO pays and stores them) and the messages to tell. */
  tick(snap: Snapshot, evs: readonly WarEvent[]): { done: GuideDone[]; msgs: [number, ServerMsg][] } {
    for (const r of [...this.runs.values()]) {
      if (evs.some((e) => e.kind === 'soulRefused' && e.why === 'full' && e.owner === r.watch.owner)) this.finish(r, 'soul', false); // a full army: nothing to claim (a stranger, W-101: another soul will do)
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
