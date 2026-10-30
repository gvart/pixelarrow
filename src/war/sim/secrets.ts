/**
 * world-fill hidden quests (the quests: src/data/warStories.ts hiddenStories; their spots: RegionData.secrets, left by
 * the region kit's fill pass). Nothing marks a hidden spot: a player's men walk onto it (STORY_R.talk) and his run of its
 * quest begins, one run per player and spot (the story runner, ./stories.ts StoryRun, keyed by his squads' owner). The
 * runner's notes become sim events (`secret`: found, a step done, done) that the view tells as a short notice; what a
 * step spawns goes through the mob controller (a once-lair, perhaps led by a chief), what it pays falls as a loot pile at
 * his men, his alone for a while.
 *
 * Cheap: every THINK ticks, and only while some run is open or a player's squad stands near a spot does it build the
 * runner's small snapshot (squads, units, lairs). Progress is plain saves in the sim's state (./state.ts); the runs are
 * rebuilt from them.
 */
import type { Item } from '../../data/items';
import { hiddenStories } from '../../data/warStories';
import type { GoodKind, LairSnap, MobKind, RegionData, Snapshot, SoulSnap, WarEvent } from '../types';
import { MOB_TEAM } from './mobs';
import { NEUTRAL_TEAM } from './economy';
import { STORY_R, StoryRun, type Story, type StoryHost, type StoryNote, type StoryReward, type StorySave } from './stories';

/** Ticks between looks. */
const THINK = 10;
/** A squad whose centre is this near a spot gets the runner's look (its men may stand within STORY_R.talk). */
const NEAR = STORY_R.talk + 14;

export type SecretEvent = Extract<WarEvent, { kind: 'secret' }>;

interface SecretSquad { id: number; owner: string; team: number; alive: number; civ?: boolean; cx: number; cy: number; units: { id?: number; x: number; y: number; alive: boolean; cls?: string }[] }

export interface SecretHost {
  squads: readonly SecretSquad[];
  lairs(): LairSnap[];
  souls(): SoulSnap[];
  addLair(d: { kind: MobKind; x: number; y: number; count?: number; lead?: true; chief?: string }): void;
  spawnSoul(x: number, y: number, cls: string, level: number): void;
  /** A pile at (x,y) of goods and items, `owner`'s alone for a while. */
  give(owner: string, name: string, x: number, y: number, goods: Partial<Record<GoodKind, number>>, items: Item[]): void;
  note(e: SecretEvent): void;
}

/** A player's squads: not the wild's, not roaming folk, not civilians, not the sim's bots. */
const playerSquad = (s: SecretSquad) => s.alive > 0 && s.team !== MOB_TEAM && s.team !== NEUTRAL_TEAM && !s.civ && !s.owner.startsWith('bot');

export function createSecrets(region: RegionData, host: SecretHost) {
  const stories: Story[] = hiddenStories(region);
  /** Saves by `${quest index}|${owner}`, with the owner's team. */
  const saves: Record<string, { save: StorySave; team: number }> = {};
  const runs = new Map<string, StoryRun>();
  let tick = 0;

  const run = (n: number, owner: string, team: number): StoryRun => {
    const key = `${n}|${owner}`;
    let r = runs.get(key);
    if (r) return r;
    const story = stories[n];
    const h: StoryHost = {
      addLair: (d) => host.addLair(d),
      spawnSoul: (x, y, cls, level) => host.spawnSoul(x, y, cls, level),
      give: (rw: StoryReward, at, item) => {
        if (rw.soul) host.spawnSoul(at.x + 1, at.y, rw.soul.cls, rw.soul.level);
        if (rw.goods || item) host.give(owner, story.title, at.x, at.y, rw.goods ?? {}, item ? [item] : []);
      },
    };
    r = new StoryRun(region, story, saves[key]?.save ?? null, { team, owner }, h);
    runs.set(key, r);
    return r;
  };

  /** The runner's look at the region: the squads near a spot or of an open run, their men, the lairs and souls. */
  const look = (owners: Set<string>): Snapshot => {
    const squads: Snapshot['squads'] = [], units: Snapshot['units'] = [];
    for (const q of host.squads) {
      if (!owners.has(q.owner) || !playerSquad(q)) continue;
      squads.push({ id: q.id, owner: q.owner, team: q.team, units: [], order: 'hold' });
      for (const u of q.units) if (u.alive) units.push({ id: u.id ?? -1, squad: q.id, x: u.x, y: u.y, facing: 0, hp: 1, maxHp: 1, cls: u.cls ?? 'man', state: 'idle' });
    }
    return { tick, squads, units, lairs: host.lairs(), souls: host.souls() };
  };

  const tell = (n: number, owner: string, team: number, notes: StoryNote[]) => {
    const story = stories[n], spot = story.giver.at;
    for (const x of notes) {
      const step = x.kind === 'step' ? story.steps.find((s) => s.id === x.step.split('#')[0]) : undefined;
      const goods = x.kind !== 'start' ? x.reward?.goods : undefined;
      host.note({
        t: tick, kind: 'secret', what: x.kind === 'start' ? 'found' : x.kind === 'end' ? 'done' : 'step', quest: story.id, owner, team,
        title: story.title, text: x.kind === 'start' ? `${story.giver.name}: ${story.hook}` : x.kind === 'end' ? story.end : step?.goal ?? '',
        x: spot[0], y: spot[1], ...(goods ? { goods } : {}),
      });
    }
    // the step after: its goal as the next line (the found notice then says what to do)
    const r = runs.get(`${n}|${owner}`), next = r?.step;
    if (next && notes.length && notes.at(-1)!.kind !== 'end') host.note({ t: tick, kind: 'secret', what: 'step', quest: story.id, owner, team, title: story.title, text: `${next.goal}: ${next.story}`, x: spot[0], y: spot[1] });
  };

  return {
    saveRoot: () => ({ saves, tick }),
    loadRoot: (o: { tick: number }) => void ((tick = o.tick), runs.clear()),
    /** The hidden quests here (tests, tools). */
    stories: (): readonly Story[] => stories,
    /** A player's save of quest n (tests). */
    save: (n: number, owner: string): StorySave | null => saves[`${n}|${owner}`]?.save ?? null,
    tick(t: number) {
      tick = t;
      if (!stories.length || t % THINK !== 0) return;
      // who stands near an unfound spot, and whose runs are open
      const want = new Map<string, number>(); // `${n}|${owner}` -> team
      for (const [key, v] of Object.entries(saves)) if (!v.save.done) want.set(key, v.team);
      for (const q of host.squads) {
        if (!playerSquad(q)) continue;
        stories.forEach((s, n) => {
          const key = `${n}|${q.owner}`;
          if (saves[key] || (q.cx - s.giver.at[0]) ** 2 + (q.cy - s.giver.at[1]) ** 2 > NEAR * NEAR) return;
          want.set(key, q.team);
        });
      }
      if (!want.size) return;
      const owners = new Set([...want.keys()].map((k) => k.slice(k.indexOf('|') + 1)));
      const snap = look(owners);
      for (const [key, team] of want) {
        const n = Number(key.slice(0, key.indexOf('|'))), owner = key.slice(key.indexOf('|') + 1);
        const r = run(n, owner, team), notes = r.tick(snap, []);
        if (r.save.at !== null || r.save.done) saves[key] = { save: { ...r.save, picks: { ...r.save.picks } }, team };
        else runs.delete(key); // not found after all (his men only passed near)
        if (notes.length) tell(n, owner, team, notes);
      }
    },
  };
}
export type Secrets = ReturnType<typeof createSecrets>;
