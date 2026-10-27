/**
 * W-65 the region's story chain online (the runner and its rules: src/war/sim/stories.ts; the stories:
 * src/data/warStories.ts; the HUD: src/war/view/hud/story.ts). The region room keeps one run per player here whose
 * chain is not done: started from his save on his welcome, stepped on every tick, told to him as `story` messages.
 * Its lairs and souls are spawned into the room's sim, an item falls as a pile at his men, a soul wakes beside them;
 * goods are owed to his home strongroom, which the DO pays with his save into its storage (`story:<season>:<pid>`).
 */
import type { ServerMsg } from '../../../src/war/net/protocol';
import { storyOf } from '../../../src/data/warStories';
import { StoryRun, type StoryHost, type StoryNote, type StorySave } from '../../../src/war/sim/stories';
import type { RegionData, Snapshot, WarBuildSim, WarEvent } from '../../../src/war/types';

/** DO storage key of a player's story save in this region (per season: a new season is a new story). */
export const storyStorageKey = (season: number | string, pid: number) => `story:${season}:${pid}`;

/** A run moved: the DO stores `save` and pays `goods` into his home strongroom. */
export interface StoryDone { pid: number; save: StorySave; goods: Record<string, number> }

export class RoomStories {
  private runs = new Map<number, { run: StoryRun; goods: Record<string, number> }>();
  private moved: { pid: number; notes: StoryNote[] }[] = [];
  readonly story;

  constructor(private readonly region: RegionData, private readonly sim: WarBuildSim) {
    this.story = storyOf(region.id);
  }

  static msg(save: StorySave, notes?: StoryNote[]): ServerMsg {
    return { t: 'story', save, ...(notes?.length ? { notes } : {}) };
  }

  /** A player of `team` is in, his save from the DO: his run starts (none here, or his chain done: told, not run). */
  start(pid: number, team: number, save: StorySave | null): ServerMsg | null {
    if (!this.story) return null;
    const goods: Record<string, number> = {};
    const host: StoryHost = {
      addLair: (d) => void this.sim.addLair(d),
      spawnSoul: (x, y, cls, level) => void this.sim.spawnSoul(x, y, cls, level, 'lair'),
      give: (r, at, item) => {
        for (const [k, n] of Object.entries(r.goods ?? {})) goods[k] = (goods[k] ?? 0) + n!;
        if (item) this.sim.dropPile(at.x, at.y, [], [item]);
        if (r.soul) this.sim.spawnSoul(at.x + 1, at.y, r.soul.cls, r.soul.level, 'lair');
      },
    };
    const run = this.runs.get(pid)?.run ?? new StoryRun(this.region, this.story, save, { team, owner: `p:${pid}` }, host);
    if (!run.save.done) this.runs.set(pid, { run, goods });
    return RoomStories.msg(run.save);
  }

  /** He chose at the open choice step (an unknown option or no choice open: nothing). */
  choose(pid: number, option: string, snap: Snapshot): void {
    const r = this.runs.get(pid), notes = r?.run.choose(snap, option);
    if (notes?.length) this.moved.push({ pid, notes });
  }

  /** He left the region: his run ends (it starts again from his save next time). */
  leave(pid: number): void {
    this.runs.delete(pid);
  }

  /** After a step: the runs that moved (the DO stores and pays them) and the messages to tell. */
  tick(snap: Snapshot, evs: readonly WarEvent[]): { done: StoryDone[]; msgs: [number, ServerMsg][] } {
    for (const [pid, r] of this.runs) {
      const notes = r.run.tick(snap, evs);
      if (notes.length) this.moved.push({ pid, notes });
    }
    const done: StoryDone[] = [], msgs: [number, ServerMsg][] = [];
    for (const m of this.moved) {
      const r = this.runs.get(m.pid);
      if (!r) continue;
      const save: StorySave = { ...r.run.save, picks: { ...r.run.save.picks } };
      done.push({ pid: m.pid, save, goods: { ...r.goods } });
      for (const k of Object.keys(r.goods)) delete r.goods[k];
      msgs.push([m.pid, RoomStories.msg(save, m.notes)]);
      if (save.done) this.runs.delete(m.pid);
    }
    this.moved = [];
    return { done, msgs };
  }

  /** Players with a run (tests). */
  get open(): number[] {
    return [...this.runs.keys()];
  }
}
