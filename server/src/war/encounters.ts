/**
 * W-65 random encounters online (the runner and its rules: src/war/sim/encounters.ts; the kinds:
 * src/data/warEncounters.ts; the HUD: src/war/view/hud/encounter.ts). The region room keeps one run per welcomed player
 * here, started from his save, stepped on every tick, told to him as `encounter` messages. Its foes and souls are
 * spawned into the room's sim, an item falls as a pile at his men; goods are owed to his home strongroom, which the DO
 * pays with his save into its storage (`encounter:<season>:<pid>`). A quiet save (the cooldown's progress) goes too.
 */
import type { ServerMsg } from '../../../src/war/net/protocol';
import { ENCOUNTERS } from '../../../src/data/warEncounters';
import { storyOf } from '../../../src/data/warStories';
import { EncounterRun, type EncHost, type EncNote, type EncSave } from '../../../src/war/sim/encounters';
import type { RegionData, Snapshot, WarBuildSim, WarEvent } from '../../../src/war/types';

/** DO storage key of a player's encounter save in this region (per season). */
export const encounterStorageKey = (season: number | string, pid: number) => `encounter:${season}:${pid}`;

/** A run moved: the DO stores `save` and pays `goods` into his home strongroom. */
export interface EncounterDone { pid: number; save: EncSave; goods: Record<string, number>; notes?: EncNote[] }

export class RoomEncounters {
  private runs = new Map<number, { run: EncounterRun; goods: Record<string, number> }>();
  private moved: { pid: number; notes: EncNote[] }[] = [];

  constructor(private readonly region: RegionData, private readonly sim: WarBuildSim, private readonly seed = 1) {}

  static msg(save: EncSave, notes?: EncNote[]): ServerMsg {
    return { t: 'encounter', save, ...(notes?.length ? { notes } : {}) };
  }

  /** A player of `team` is in, his save from the DO: his run starts (or goes on, when he was here already). */
  start(pid: number, team: number, save: EncSave | null): ServerMsg {
    const had = this.runs.get(pid);
    if (had) return RoomEncounters.msg(had.run.save);
    const goods: Record<string, number> = {};
    const host: EncHost = {
      addLair: (d) => void this.sim.addLair(d),
      spawnSoul: (x, y, cls, level) => void this.sim.spawnSoul(x, y, cls, level, 'lair'),
      give: (r, at, item) => {
        for (const [k, n] of Object.entries(r.goods ?? {})) goods[k] = (goods[k] ?? 0) + n!;
        if (item) this.sim.dropPile(at.x, at.y, [], [item]);
        if (r.soul) this.sim.spawnSoul(at.x + 1, at.y, r.soul.cls, r.soul.level, 'lair');
      },
    };
    const run = new EncounterRun(this.region, ENCOUNTERS, save, { team, owner: `p:${pid}`, seed: this.seed }, host, storyOf(this.region.id));
    this.runs.set(pid, { run, goods });
    return RoomEncounters.msg(run.save);
  }

  /** He chose at the open encounter's choice (an unknown option or none open: nothing). */
  choose(pid: number, option: string, snap: Snapshot): void {
    const notes = this.runs.get(pid)?.run.choose(snap, option);
    if (notes?.length) this.moved.push({ pid, notes });
  }

  /** After a step: the runs that moved or owe a quiet save (the DO stores and pays them) and the messages to tell. */
  tick(snap: Snapshot, evs: readonly WarEvent[]): { done: EncounterDone[]; msgs: [number, ServerMsg][] } {
    const done: EncounterDone[] = [], msgs: [number, ServerMsg][] = [];
    for (const [pid, r] of this.runs) {
      const notes = r.run.tick(snap, evs);
      if (notes.length) this.moved.push({ pid, notes });
      else if (r.run.due) done.push({ pid, save: { ...r.run.save }, goods: {} });
      r.run.due = false;
    }
    for (const m of this.moved) {
      const r = this.runs.get(m.pid);
      if (!r) continue;
      const save: EncSave = { ...r.run.save, open: r.run.save.open ? { ...r.run.save.open } : null };
      done.push({ pid: m.pid, save, goods: { ...r.goods }, notes: m.notes });
      for (const k of Object.keys(r.goods)) delete r.goods[k];
      msgs.push([m.pid, RoomEncounters.msg(save, m.notes)]);
    }
    this.moved = [];
    return { done, msgs };
  }

  /** Players with a run (tests). */
  get open(): number[] {
    return [...this.runs.keys()];
  }
}
