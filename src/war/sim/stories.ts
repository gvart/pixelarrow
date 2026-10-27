/**
 * W-65 region story chains: a neutral region's quest told in 3-5 steps from its lore (the stories: src/data/warStories.ts;
 * the HUD: src/war/view/hud/story.ts; online: server/src/war/stories.ts). A story is data: a giver standing in the
 * region's village, steps that send a player's men to places of the region (hear the giver, find a clue, follow marks,
 * break a camp, free a captive, face a named captain or beast, choose), and what each pays.
 *
 * The runner is pure and deterministic: it reads the sim's snapshots and events and asks its host for what it spawns
 * (a lair, a soul) and pays (goods, an item, a soul). Item rolls use the sim's seeded Rng, keyed by region, story and
 * owner, so the same run pays the same item. Progress is one small save per player (offline: localStorage; online: the
 * region DO's storage `story:<season>:<pid>`); a run started again from a save (a reload, a region asleep and woken)
 * re-spawns what its open step needs and goes on.
 */
import type { Item, Rarity } from '../../data/items';
import { makeItem } from '../../game/heroes';
import { hashString, Rng } from '../../sim/rng';
import type { GoodKind, MobKind, RegionData, Snapshot, WarEvent } from '../types';
import { buildGrid } from './grid';

/** A tile point as authored (snapped to open ground by storySpots). */
export type Pt = readonly [number, number];

export interface StoryReward {
  /** Into his stores (offline) or his home strongroom (online). */
  goods?: Partial<Record<GoodKind, number>>;
  /** An item dropped at his men's feet as a loot pile. */
  item?: { def: string; rarity: Rarity };
  /** A soul who wakes beside his men, his to claim (a recruit). */
  soul?: { cls: string; level: number; name: string };
}

export type StoryTrigger =
  /** His men reach the giver. */
  | { kind: 'talk' }
  /** A clue: his men reach the spot. */
  | { kind: 'reach'; at: Pt }
  /** Follow the marks: his men reach each in turn. */
  | { kind: 'track'; marks: readonly Pt[] }
  /** A camp or a named foe spawned for him at the spot (`lead`: its first man a captain, x2 hp); done once it is cleared with his men near. */
  | { kind: 'clear'; at: Pt; mob: MobKind; count: number; lead?: true; name?: string }
  /** A captive (a soul at the spot) his squad claims. */
  | { kind: 'rescue'; at: Pt; cls: string; level: number; name: string }
  /** A choice on the story card: each option pays and leads on (no `next`: the chain ends). */
  | { kind: 'choice'; options: readonly StoryOption[] };

export interface StoryOption { id: string; label: string; text: string; reward?: StoryReward; next?: string }

export interface StoryStep {
  id: string;
  /** The objective: a verb and a target ("Search the old diggings"). */
  goal: string;
  /** 1-2 short lines, told on the card and the step's banner. */
  story: string;
  /** Where to go. */
  where: string;
  /** The world marker's label ("Cairn", "Lykon"). */
  label: string;
  trigger: StoryTrigger;
  reward?: StoryReward;
  /** The step after this one (default: the next in the list; 'end': the chain ends). */
  next?: string;
}

export interface Story {
  id: string;
  region: string;
  title: string;
  giver: { name: string; title: string; at: Pt; /** The civilian sheet he is drawn with. */ cls: string };
  /** The giver's one-line call, under his "!". */
  hook: string;
  /** The backstory, told on the card and the start banner. */
  backstory: string;
  steps: readonly StoryStep[];
  /** The closing line, told with the last reward. */
  end: string;
  /** Paid when the chain ends (either branch). */
  reward?: StoryReward;
}

/** A player's progress in one region's story. at: the open step (null: not begun); n: marks reached; picks: choices made. */
export interface StorySave { v: 1; story: string; at: string | null; n: number; picks: Record<string, string>; done?: true }
export const newSave = (story: Story): StorySave => ({ v: 1, story: story.id, at: null, n: 0, picks: {} });
/** A save is this story's and sane (an old or foreign save starts afresh). */
export const saveOk = (story: Story, s: unknown): s is StorySave =>
  !!s && typeof s === 'object' && (s as StorySave).v === 1 && (s as StorySave).story === story.id && typeof (s as StorySave).n === 'number' && typeof (s as StorySave).picks === 'object'
  && ((s as StorySave).at === null || story.steps.some((x) => x.id === (s as StorySave).at));

/** Radii in tiles: the giver, a clue or mark reached; his men near a camp as it falls (as the guide's GUIDE_NEAR). */
export const STORY_R = { talk: 8, reach: 5, mark: 6, near: 30, soul: 2.5 };
/** Ticks before a spawn not seen yet is asked for again (offline the sim answers from its worker). */
const RESPAWN = 300;

/** What the runner tells: the chain begun, a step done (its reward; `option`: the choice made), the chain done. */
export type StoryNote =
  | { kind: 'start' }
  | { kind: 'step'; step: string; reward?: StoryReward; option?: string }
  | { kind: 'end'; reward?: StoryReward };

/** What a run spawns and pays through (the server room, the offline page, tests). `at`: his men's middle (or the step's spot). */
export interface StoryHost {
  addLair(d: { kind: MobKind; x: number; y: number; count: number; lead?: true }): void;
  spawnSoul(x: number, y: number, cls: string, level: number): void;
  give(reward: StoryReward, at: { x: number; y: number }, item: Item | null): void;
}

// ---------------------------------------------------------------- spots

const open = new WeakMap<RegionData, Float32Array>();
/** Tiles a man may stand on: the sim's own movement grid (no deep water, rock, cliffs or massifs). */
function openMask(r: RegionData): Float32Array {
  let m = open.get(r);
  if (!m) open.set(r, (m = buildGrid(r).cost));
  return m;
}
/** The open tile nearest an authored point (rings outward up to 16 tiles), its middle. */
export function snapOpen(r: RegionData, p: Pt): { x: number; y: number } {
  const m = openMask(r), x0 = Math.max(0, Math.min(r.w - 1, Math.floor(p[0]))), y0 = Math.max(0, Math.min(r.h - 1, Math.floor(p[1])));
  for (let d = 0; d <= 16; d++) {
    let best = -1, bd = Infinity;
    for (let y = y0 - d; y <= y0 + d; y++) for (let x = x0 - d; x <= x0 + d; x++) {
      if (x < 0 || y < 0 || x >= r.w || y >= r.h || (Math.abs(x - x0) !== d && Math.abs(y - y0) !== d) || !(m[y * r.w + x] > 0)) continue;
      const dd = (x - x0) ** 2 + (y - y0) ** 2;
      if (dd < bd) (bd = dd), (best = y * r.w + x);
    }
    if (best >= 0) return { x: (best % r.w) + 0.5, y: Math.floor(best / r.w) + 0.5 };
  }
  return { x: x0 + 0.5, y: y0 + 0.5 };
}

export interface StorySpots { giver: { x: number; y: number }; steps: Record<string, { x: number; y: number }[]> }
/** Where the giver and each step's places stand in this region (the same on the server and the page). */
export function storySpots(r: RegionData, s: Story): StorySpots {
  const steps: StorySpots['steps'] = {}, giver = snapOpen(r, s.giver.at);
  for (const st of s.steps) {
    const t = st.trigger;
    steps[st.id] = t.kind === 'talk' ? [giver] : t.kind === 'track' ? t.marks.map((p) => snapOpen(r, p)) : t.kind === 'choice' ? [] : [snapOpen(r, t.at)];
  }
  return { giver, steps };
}

/** The step a save stands at (null: not begun or done). */
export const stepOf = (s: Story, save: StorySave | null): StoryStep | null => (save && !save.done && save.at ? s.steps.find((x) => x.id === save.at) ?? null : null);
/** The step after `st` (null: the chain ends). */
const after = (s: Story, st: StoryStep, next = st.next): StoryStep | null =>
  next === 'end' ? null : next ? s.steps.find((x) => x.id === next) ?? null : s.steps[s.steps.indexOf(st) + 1] ?? null;
/** The steps a save will walk, in order, from the start (the choices made pick the branch; an open choice: its first option's way). */
export function storyPath(s: Story, save: StorySave | null): StoryStep[] {
  const out: StoryStep[] = [];
  for (let st: StoryStep | null = s.steps[0]; st && out.length < s.steps.length; ) {
    out.push(st);
    if (st.trigger.kind === 'choice') {
      const o = st.trigger.options.find((x) => x.id === save?.picks[st!.id]) ?? st.trigger.options[0];
      st = after(s, st, o.next ?? 'end');
    } else st = after(s, st);
  }
  return out;
}

/** The item a step pays this owner (the same run, the same item: rolled on the seeded Rng). */
export function storyItem(s: Story, step: string, owner: string, r: StoryReward | undefined): Item | null {
  if (!r?.item) return null;
  const key = `${s.region}:${s.id}:${step}:${owner}`;
  return { ...makeItem(new Rng(hashString(key) || 1), { nextId: 0 }, r.item.def, r.item.rarity), uid: `story:${key}` };
}

// ---------------------------------------------------------------- the runner

export interface StoryMe {
  team: number;
  /** Online: his squads' owner (`p:<pid>`); only his men count. Offline: his team's men. */
  owner?: string;
}

export class StoryRun {
  readonly spots: StorySpots;
  save: StorySave;
  /** A lair or soul of the open step seen at its spot (it then counts once gone); when it was last asked for. */
  private seen = false;
  private asked = -Infinity;
  private souls = new Set<number>();

  constructor(readonly region: RegionData, readonly story: Story, save: StorySave | null, readonly me: StoryMe, private readonly host: StoryHost) {
    this.spots = storySpots(region, story);
    this.save = save && saveOk(story, save) ? { ...save, picks: { ...save.picks } } : newSave(story);
  }

  get step(): StoryStep | null { return stepOf(this.story, this.save); }
  get owner(): string { return this.me.owner ?? `t:${this.me.team}`; }

  private men(s: Snapshot) {
    const own = new Set(s.squads.filter((q) => q.team === this.me.team && (!this.me.owner || q.owner === this.me.owner)).map((q) => q.id));
    return s.units.filter((u) => own.has(u.squad) && u.state !== 'dead' && !u.cls.startsWith('civ_'));
  }
  private centre(s: Snapshot, or: { x: number; y: number }) {
    const m = this.men(s);
    return m.length ? { x: m.reduce((a, u) => a + u.x, 0) / m.length, y: m.reduce((a, u) => a + u.y, 0) / m.length } : or;
  }

  private pay(s: Snapshot, step: string, r: StoryReward | undefined, at: { x: number; y: number }): void {
    if (r && (r.goods || r.item || r.soul)) this.host.give(r, this.centre(s, at), storyItem(this.story, step, this.owner, r));
  }

  /** Move on to `next` (null: the chain ends: its own reward). */
  private advance(s: Snapshot, next: StoryStep | null, notes: StoryNote[]): void {
    this.save.n = 0;
    this.seen = false;
    this.asked = -Infinity;
    this.souls.clear();
    if (next) {
      this.save.at = next.id;
      return;
    }
    this.save.at = null;
    this.save.done = true;
    this.pay(s, 'end', this.story.reward, this.spots.giver);
    notes.push({ kind: 'end', ...(this.story.reward ? { reward: this.story.reward } : {}) });
  }

  private finish(s: Snapshot, st: StoryStep, notes: StoryNote[]): void {
    const at = this.spots.steps[st.id]?.[0] ?? this.spots.giver;
    this.pay(s, st.id, st.reward, at);
    notes.push({ kind: 'step', step: st.id, ...(st.reward ? { reward: st.reward } : {}) });
    this.advance(s, after(this.story, st), notes);
  }

  /** Spawn what the open step needs at its spot (none there yet, or it went: a woken region, a soul who faded). */
  private ensure(s: Snapshot, st: StoryStep): void {
    const t = st.trigger, p = this.spots.steps[st.id]?.[0];
    if (!p || (t.kind !== 'clear' && t.kind !== 'rescue')) return;
    if (t.kind === 'clear') {
      const ls = (s.lairs ?? []).filter((l) => Math.hypot(l.x - p.x, l.y - p.y) < 0.5);
      if (ls.some((l) => l.state !== 'cleared')) return void (this.seen = true);
      if (this.seen || s.tick - this.asked < RESPAWN) return;
      this.asked = s.tick;
      this.host.addLair({ kind: t.mob, x: p.x, y: p.y, count: t.count, ...(t.lead ? { lead: true as const } : {}) });
      return;
    }
    const here = (s.souls ?? []).filter((x) => Math.hypot(x.x - p.x, x.y - p.y) < STORY_R.soul);
    for (const x of here) this.souls.add(x.id);
    if (here.length || s.tick - this.asked < RESPAWN) return;
    this.asked = s.tick;
    this.host.spawnSoul(p.x, p.y, t.cls, t.level);
  }

  /** One snapshot and the events since the last: what happened (the caller tells it and stores the save when any). */
  tick(s: Snapshot, evs: readonly WarEvent[]): StoryNote[] {
    const notes: StoryNote[] = [];
    if (this.save.done) return notes;
    const men = this.men(s), near = (p: { x: number; y: number }, r: number) => men.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < r);
    if (this.save.at === null) {
      // not begun: his men reach the giver
      if (!near(this.spots.giver, STORY_R.talk)) return notes;
      this.save.at = this.story.steps[0].id;
      notes.push({ kind: 'start' });
    }
    for (let guard = 0; guard < 8; guard++) {
      const st = this.step;
      if (!st) break;
      const t = st.trigger, ps = this.spots.steps[st.id] ?? [];
      this.ensure(s, st);
      let done = false;
      if (t.kind === 'talk') done = near(this.spots.giver, STORY_R.talk);
      else if (t.kind === 'reach') done = near(ps[0], STORY_R.reach);
      else if (t.kind === 'track') {
        while (this.save.n < ps.length && near(ps[this.save.n], STORY_R.mark)) this.save.n++, notes.push({ kind: 'step', step: `${st.id}#${this.save.n}` });
        done = this.save.n >= ps.length;
      } else if (t.kind === 'clear') {
        const ls = (s.lairs ?? []).filter((l) => Math.hypot(l.x - ps[0].x, l.y - ps[0].y) < 0.5);
        done = this.seen && ls.length > 0 && ls.every((l) => l.state === 'cleared') && near(ps[0], STORY_R.near);
      } else if (t.kind === 'rescue') {
        const mine = (e: WarEvent) => (e.kind === 'soulClaimed' || e.kind === 'soulRefused') && this.souls.has(e.soul)
          && (this.me.owner ? e.owner === this.me.owner : e.kind === 'soulClaimed' && s.squads.find((q) => q.id === e.squad)?.team === this.me.team);
        done = evs.some(mine);
      }
      if (!done) break;
      this.finish(s, st, notes);
    }
    return notes;
  }

  /** He chose `option` at the open choice step; null when there is no such choice open. */
  choose(s: Snapshot, option: string): StoryNote[] | null {
    const st = this.step;
    if (!st || st.trigger.kind !== 'choice') return null;
    const o = st.trigger.options.find((x) => x.id === option);
    if (!o) return null;
    const notes: StoryNote[] = [];
    this.save.picks[st.id] = o.id;
    this.pay(s, `${st.id}:${o.id}`, o.reward, this.spots.giver);
    notes.push({ kind: 'step', step: st.id, option: o.id, ...(o.reward ? { reward: o.reward } : {}) });
    this.advance(s, after(this.story, st, o.next ?? 'end'), notes);
    return notes;
  }
}
