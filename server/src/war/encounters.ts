/**
 * W-65 random encounters online (the runner and its rules: src/war/sim/encounters.ts; the kinds:
 * src/data/warEncounters.ts; the HUD: src/war/view/hud/encounter.ts). The region room keeps one run per welcomed player
 * here, started from his save, stepped on every tick, told to him as `encounter` messages. Its foes and souls are
 * spawned into the room's sim, an item falls as a pile at his men; goods are owed to his home strongroom, which the DO
 * pays with his save into its storage (`encounter:<season>:<pid>`). A quiet save (the cooldown's progress) goes too.
 */
import type { ServerMsg } from '../../../src/war/net/protocol';
import { ENCOUNTERS, ROBBERS } from '../../../src/data/warEncounters';
import { hashString, Rng } from '../../../src/sim/rng';
import { perLoad } from '../../../src/war/sim/holders';
import { storyOf } from '../../../src/data/warStories';
import { awayLine, EncounterRun, goodsWords, pidOfUnit, type EncHost, type EncNote, type EncSave } from '../../../src/war/sim/encounters';
import { foesWord } from '../../../src/war/sim/mobs';
import type { RegionData, Snapshot, WarBuildSim, WarEvent } from '../../../src/war/types';
import { PORTER } from '../../../src/war/sim/trade';
import { robOf, tollOf, type Slot } from './cargo';

/** DO storage key of a player's encounter save in this region (per season). */
export const encounterStorageKey = (season: number | string, pid: number) => `encounter:${season}:${pid}`;

/** W-197: the loads of goods that crossed the border with him: what a robber would come for. A man's own food is not. */
export function ladenLoads(cargo: { packs: Readonly<Record<string, { lots: readonly { r: string; n: number }[] }>>; carts?: readonly { lots: readonly { r: string; n: number }[] }[] } | undefined): number {
  const lots = [...Object.values(cargo?.packs ?? {}), ...(cargo?.carts ?? [])].flatMap((h) => h.lots);
  return lots.filter((l) => l.r !== 'food' && l.r !== 'ration').reduce((a, l) => a + l.n / perLoad(l.r as never), 0);
}

/** W-219: robbers reach a load this far from where they beat his men. */
const ROB_REACH = 30;
/** W-219: at most this many lines kept for his return. */
const AWAY_MAX = 6;

/** A run moved: the DO stores `save` and pays `goods` into his home strongroom. */
export interface EncounterDone { pid: number; save: EncSave; goods: Record<string, number>; notes?: EncNote[] }

export class RoomEncounters {
  private runs = new Map<number, { run: EncounterRun; goods: Record<string, number> }>();
  private moved: { pid: number; notes: EncNote[] }[] = [];
  /** W-197: robbers waiting for him: they spring once his run is going and his men have come in. */
  private waiting = new Set<number>();

  constructor(private readonly region: RegionData, private readonly sim: WarBuildSim, private readonly seed = 1) {}

  static msg(save: EncSave, notes?: EncNote[]): ServerMsg {
    return { t: 'encounter', save, ...(notes?.length ? { notes } : {}) };
  }

  /** A player of `team` is in, his save from the DO: his run starts (or goes on, when he was here already). */
  start(pid: number, team: number, save: EncSave | null): ServerMsg {
    const had = this.runs.get(pid);
    if (had) return this.welcomeBack(had.run);
    const goods: Record<string, number> = {};
    const host: EncHost = {
      addLair: (d) => void this.sim.addLair(d),
      spawnSoul: (x, y, cls, level) => void this.sim.spawnSoul(x, y, cls, level, 'lair'),
      give: (r, at, item) => {
        for (const [k, n] of Object.entries(r.goods ?? {})) goods[k] = (goods[k] ?? 0) + n!;
        if (item) this.sim.dropPile(at.x, at.y, [], [item]);
        if (r.soul) this.sim.spawnSoul(at.x + 1, at.y, r.soul.cls, r.soul.level, 'lair');
      },
      toll: (share) => {
        const snap = this.sim.snapshot(), me = `p:${pid}`, slots: Slot[] = [];
        for (const q of snap.squads) if (q.owner === me) slots.push(...(this.sim.cargo({ squad: q.id })?.slots ?? []));
        for (const c of snap.sieges ?? []) if (c.owner === me) slots.push(...(this.sim.cargo({ cart: c.id })?.slots ?? []));
        tollOf(slots, share);
      },
      // W-219 as a raid (W-91): what they can carry, nothing more, from the load in their reach
      rob: (band) => {
        const snap = this.sim.snapshot(), me = `p:${pid}`, slots: Slot[] = [];
        for (const c of snap.sieges ?? []) if (c.owner === me && c.state !== 'destroyed' && Math.hypot(c.x - band.x, c.y - band.y) <= ROB_REACH) slots.push(...(this.sim.cargo({ cart: c.id })?.slots ?? []));
        for (const q of snap.squads) if (q.owner === me) slots.push(...(this.sim.cargo({ squad: q.id })?.slots ?? []).filter((x) => Math.hypot(x.x - band.x, x.y - band.y) <= ROB_REACH));
        const took = robOf(slots, band.alive * PORTER.loads);
        this.sim.dropSquad(band.squad);
        return took;
      },
    };
    const run = new EncounterRun(this.region, ENCOUNTERS, save, { team, owner: `p:${pid}`, seed: this.seed }, host, storyOf(this.region.id));
    this.runs.set(pid, { run, goods });
    return this.welcomeBack(run);
  }

  /** The message for a player coming in; W-219: what happened while he was gone goes with it, once. */
  private welcomeBack(run: EncounterRun): ServerMsg {
    const msg = RoomEncounters.msg({ ...run.save });
    if (run.save.away) {
      delete run.save.away;
      run.due = true;
    }
    return msg;
  }

  /** W-197: he came over the border with `loads` of goods; `key` seeds the roll (the crossing). Do robbers wait for him? */
  road(pid: number, loads: number, key: string): void {
    if (loads >= ROBBERS.minLoads && new Rng(hashString(`robbers:${this.seed}:${pid}:${key}`) || 1).chance(ROBBERS.chance)) this.waiting.add(pid);
  }

  /** He chose at the open encounter's choice (an unknown option or none open: nothing). */
  choose(pid: number, option: string, snap: Snapshot): void {
    const notes = this.runs.get(pid)?.run.choose(snap, option);
    if (notes?.length) this.moved.push({ pid, notes });
  }

  /** After a step: the runs that moved or owe a quiet save (the DO stores and pays them) and the messages to tell. */
  tick(snap: Snapshot, evs: readonly WarEvent[], online: (pid: number) => boolean = () => true): { done: EncounterDone[]; msgs: [number, ServerMsg][] } {
    const done: EncounterDone[] = [], msgs: [number, ServerMsg][] = [];
    for (const pid of this.waiting) {
      const r = this.runs.get(pid);
      if (!r) continue; // his run starts as he rejoins here: the robbers are patient
      this.waiting.delete(pid);
      if (!r.run.save.open) this.moved.push({ pid, notes: r.run.fire(snap, ENCOUNTERS[ROBBERS.id]) });
    }
    // W-221: his men fell while he was gone, by whose hand, and what lies there: told once when he is back
    for (const e of evs) {
      if (e.kind !== 'fall') continue;
      const pid = pidOfUnit(snap, e.unit), r = pid === null || online(pid) ? undefined : this.runs.get(pid);
      if (!r) continue;
      const by = snap.units.find((u) => u.id === e.by)?.cls;
      const line = `Your men fell to ${by ? foesWord(by, 2).replace(/^\d+ /, '') : 'a foe'}.${e.dropped ? ` ${goodsWords(e.dropped.goods)} lies where they fell.` : ''}`;
      if (!r.run.save.away?.includes(line)) r.run.save.away = [...(r.run.save.away ?? []), line].slice(-AWAY_MAX);
      r.run.due = true;
    }
    for (const [pid, r] of this.runs) {
      const notes = r.run.tick(snap, evs);
      if (notes.length) this.moved.push({ pid, notes });
      else if (r.run.due) done.push({ pid, save: { ...r.run.save }, goods: {} });
      r.run.due = false;
    }
    for (const m of this.moved) {
      const r = this.runs.get(m.pid);
      if (!r) continue;
      if (!online(m.pid)) {
        const lines = m.notes.flatMap((n) => awayLine(n, ENCOUNTERS) ?? []);
        if (lines.length) r.run.save.away = [...(r.run.save.away ?? []), ...lines].slice(-AWAY_MAX);
      }
      const save: EncSave = { ...r.run.save, open: r.run.save.open ? { ...r.run.save.open } : null };
      done.push({ pid: m.pid, save, goods: { ...r.goods }, notes: m.notes });
      for (const k of Object.keys(r.goods)) delete r.goods[k];
      msgs.push([m.pid, RoomEncounters.msg(save, m.notes)]);
    }
    this.moved = [];
    return { done, msgs };
  }

  /** Is anyone waiting for him (tests)? */
  waitingFor(pid: number): boolean {
    return this.waiting.has(pid);
  }

  /** Players with a run (tests). */
  get open(): number[] {
    return [...this.runs.keys()];
  }
}
