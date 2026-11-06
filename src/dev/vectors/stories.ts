/**
 * The story runner (src/war/sim/stories.ts) and the hidden quests (src/data/warStories.ts hiddenStories, HIDDEN's
 * `make`) on real stories and regions: snapped spots, paths through the choices, the items they pay, and a scripted
 * play of every authored chain and a spread of hidden ones. The driver walks a few men to each open step, lets asked-for
 * lairs and souls appear (or not, so the runner asks again), clears them, claims souls, raises buildings, trades and
 * chooses; each input goes in the vector with what the runner said (notes), asked its host for and saved.
 */
import { Rng } from '../../sim/rng';
import { ITEMS } from '../../data/items';
import { HIDDEN, PATH_STORIES, STORIES, hiddenStories } from '../../data/warStories';
import { parseRegion } from '../../war/region/schema';
import {
  StoryRun, saveOk, snapOpen, stepOf, storyItem, storyPath, storySpots, STORY_R,
  type Story, type StoryHost, type StoryMe, type StorySave,
} from '../../war/sim/stories';
import type { BuildingSnap, LairSnap, RegionData, Snapshot, SoulSnap, SquadSnap, UnitSnap, WarEvent } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const regions = new Map<string, RegionData>();
const load = (id: string): RegionData => {
  let r = regions.get(id);
  if (!r) regions.set(id, (r = parseRegion(regionFiles[`../../war/regions/${id}.json`])));
  return r;
};
const regionIds = Object.keys(regionFiles).map((p) => p.replace(/^.*\/|\.json$/g, '')).sort();

/** Where a story comes from, so the Godot side takes it from the same table: STORIES, PATH_STORIES or hiddenStories. */
type Ref = { table: 'stories'; key: string } | { table: 'path'; key: string; path: string } | { table: 'hidden'; key: string; n: number };

function authored(): { ref: Ref; story: Story }[] {
  const out: { ref: Ref; story: Story }[] = [];
  for (const [key, s] of Object.entries(STORIES)) out.push({ ref: { table: 'stories', key }, story: s });
  for (const [key, by] of Object.entries(PATH_STORIES)) for (const [path, s] of Object.entries(by)) if (s) out.push({ ref: { table: 'path', key, path }, story: s });
  return out;
}

interface World { tick: number; lairs: LairSnap[]; souls: SoulSnap[]; buildings: BuildingSnap[]; men: { x: number; y: number }; pending: SoulSnap[] }

/** One scripted play of a story; `save`: a run started again from a save. */
function play(story: Story, me: StoryMe, rng: Rng, save: unknown, budget: number) {
  const region = load(story.region), w: World = { tick: 1000 + rng.int(0, 500), lairs: [], souls: [], buildings: [], men: { x: 0, y: 0 }, pending: [] };
  const calls: unknown[] = [];
  let nextId = 1;
  const host: StoryHost = {
    addLair(d) {
      calls.push(['addLair', { ...d }]);
      if (rng.chance(0.75)) w.lairs.push({ id: nextId++, kind: d.kind, x: d.x, y: d.y, state: 'home' } as LairSnap);
    },
    spawnSoul(x, y, cls, level) {
      calls.push(['spawnSoul', x, y, cls, level]);
      if (rng.chance(0.75)) w.pending.push({ id: 500 + nextId++, x, y, cls, level } as SoulSnap);
    },
    give(reward, at, item) { calls.push(['give', reward, at, item]); },
  };
  const run = new StoryRun(region, story, save as StorySave | null, me, host);
  const owner = me.owner ?? 'p:bot';
  w.men = { ...run.spots.giver };
  w.men.x += rng.range(-40, 40);
  w.men.y += rng.range(-40, 40);
  const steps: unknown[] = [];
  const snap = (): Snapshot => {
    const squads: SquadSnap[] = [
      { id: 1, owner, team: me.team } as SquadSnap, { id: 2, owner: 'p:foe', team: 1 } as SquadSnap, { id: 3, owner: 'p:ally', team: me.team } as SquadSnap,
    ];
    const at = (k: number) => ({ x: w.men.x + ((k % 3) - 1) * 0.7, y: w.men.y + (((k / 3) | 0) - 1) * 0.6 });
    const units: UnitSnap[] = [0, 1, 2, 3].map((k) => ({ id: 10 + k, squad: 1, ...at(k), cls: 'hoplite', state: k === 3 ? 'dead' : 'move' }) as UnitSnap);
    // near the target but not his: a civilian of his squad, a foe, an ally of another owner (online only theirs count)
    const t = target();
    units.push({ id: 20, squad: 1, x: t.x, y: t.y, cls: 'civ_smith', state: 'idle' } as UnitSnap, { id: 21, squad: 2, x: t.x, y: t.y, cls: 'archer', state: 'idle' } as UnitSnap);
    if (!me.owner) units.push({ id: 22, squad: 1, x: t.x + 50, y: t.y, cls: 'archer', state: 'idle' } as UnitSnap);
    else units.push({ id: 22, squad: 3, x: t.x, y: t.y, cls: 'archer', state: 'idle' } as UnitSnap);
    return { tick: w.tick, units, squads, lairs: w.lairs.map((l) => ({ ...l })), souls: w.souls.map((x) => ({ ...x })), buildings: w.buildings.map((b) => ({ ...b })) } as Snapshot;
  };
  function target(): { x: number; y: number } {
    const st = run.step;
    if (!st) return run.spots.giver;
    const ps = run.spots.steps[st.id] ?? [];
    if (st.trigger.kind === 'track') return ps[Math.min(run.save.n, ps.length - 1)];
    return ps[0] ?? run.spots.giver;
  }
  const record = (input: unknown, notes: unknown) => {
    steps.push({ input, notes, calls: calls.splice(0), save: JSON.parse(JSON.stringify(run.save)) });
  };
  const tickWith = (evs: WarEvent[]) => {
    const s = snap();
    const notes = run.tick(s, evs);
    record({ op: 'tick', snap: s, evs }, notes);
  };
  let mid: unknown = null;
  for (let k = 0; k < budget && !run.save.done; k++) {
    w.tick += rng.chance(0.2) ? 320 : rng.int(10, 120);
    const st = run.step, t = target(), go = rng.next();
    // walk: most looks put the men on the target, some halfway, some just off its radius
    if (go < 0.6) w.men = { x: t.x + rng.range(-1, 1), y: t.y + rng.range(-1, 1) };
    else if (go < 0.8) w.men = { x: (w.men.x + t.x) / 2, y: (w.men.y + t.y) / 2 };
    else w.men = { x: t.x + STORY_R.reach + rng.range(-0.3, 0.3), y: t.y };
    // the world answers
    for (const l of w.lairs) if (l.state !== 'cleared' && rng.chance(0.3)) l.state = 'cleared';
    if (w.pending.length && rng.chance(0.7)) w.souls.push(...w.pending.splice(0));
    if (rng.chance(0.05) && w.souls.length) w.souls.shift(); // a soul faded
    if (rng.chance(0.05) && w.lairs.length) w.lairs.shift(); // a region woke without it
    const evs: WarEvent[] = [];
    if (st?.trigger.kind === 'rescue' && w.souls.length && rng.chance(0.6)) {
      const soul = w.souls[rng.int(0, w.souls.length - 1)].id, by = rng.next();
      if (by < 0.15) evs.push({ t: w.tick, kind: 'soulClaimed', soul, squad: 2, owner: 'p:foe' } as WarEvent);
      else if (by < 0.3) evs.push({ t: w.tick, kind: 'soulClaimed', soul: soul + 1000, squad: 1, owner } as WarEvent);
      else if (by < 0.45) evs.push({ t: w.tick, kind: 'soulClaimed', soul, squad: 3, owner: 'p:ally' } as WarEvent);
      else evs.push({ t: w.tick, kind: rng.chance(0.5) ? 'soulClaimed' : 'soulRefused', soul, squad: 1, owner } as WarEvent);
    }
    if (st?.trigger.kind === 'built' && rng.chance(0.5)) {
      const type = st.trigger.type, b = (o: Partial<BuildingSnap>) => ({ id: nextId++, type, team: me.team, owner, x: 1, y: 1, state: 'done', ...o }) as BuildingSnap;
      const pick = rng.int(0, 5);
      w.buildings.push(b(pick === 0 ? { pre: true } : pick === 1 ? { team: 1 } : pick === 2 ? { state: 'building' as BuildingSnap['state'] } : pick === 3 ? { owner: 'p:ally' } : pick === 4 ? { type: 'farm' as BuildingSnap['type'] } : {}));
    }
    if (st?.trigger.kind === 'trade') {
      const ops = ['sell', 'buy', 'hire', 'cart'] as const, op = rng.chance(0.7) ? st.trigger.op : ops[rng.int(0, 3)];
      const coin = rng.int(0, 40), abroad = rng.int(0, coin);
      const s = snap();
      record({ op: 'trade', snap: s, kind: op, coin, abroad }, run.trade(s, op, coin, abroad));
      continue;
    }
    if (st?.trigger.kind === 'choice' && rng.chance(0.7)) {
      const opts = st.trigger.options, option = rng.chance(0.2) ? 'nope' : opts[rng.int(0, opts.length - 1)].id;
      const s = snap();
      record({ op: 'choose', snap: s, option }, run.choose(s, option));
      continue;
    }
    if (rng.chance(0.03)) { // a stray choice or trade at a step that is neither
      const s = snap();
      record({ op: 'choose', snap: s, option: 'x' }, run.choose(s, 'x'));
    }
    tickWith(evs);
    if (mid === null && run.save.at !== null && rng.chance(0.3)) mid = JSON.parse(JSON.stringify(run.save));
  }
  return { me, save: save ?? null, spots: run.spots, steps, mid };
}

export const vectors = () => {
  const r = new Rng(65);
  const all = authored();
  const hidden: { region: string; stories: Story[] }[] = regionIds.map((id) => ({ region: id, stories: hiddenStories(load(id)) }));
  for (const h of hidden) h.stories.forEach((story, n) => all.push({ ref: { table: 'hidden', key: h.region, n }, story }));

  // snapOpen on points round each region: in water, off the map, on the rim
  const snaps = regionIds.filter((_, i) => i % 3 === 0).map((id) => {
    const reg = load(id), pts: [number, number][] = [[-5, -5], [reg.w + 3, reg.h + 3], [reg.w / 2, reg.h / 2], [0.5, reg.h - 0.5]];
    for (let i = 0; i < 30; i++) pts.push([r.range(-2, reg.w + 2), r.range(-2, reg.h + 2)]);
    return { region: id, pts: pts.map((p) => [p, snapOpen(reg, p)]) };
  });

  const stories = all.map(({ ref, story }, i) => {
    const out: Record<string, unknown> = { ref, id: story.id, spots: storySpots(load(story.region), story) };
    // the path from scratch, and with every option of each choice picked
    const paths: unknown[] = [[null, storyPath(story, null).map((s) => s.id)]];
    for (const st of story.steps) if (st.trigger.kind === 'choice') for (const o of st.trigger.options) {
      const save: StorySave = { v: 1, story: story.id, at: null, n: 0, picks: { [st.id]: o.id } };
      paths.push([save, storyPath(story, save).map((s) => s.id)]);
    }
    out.paths = paths;
    const items: unknown[] = [];
    for (const owner of ['t:0', 'p:abc']) {
      for (const st of story.steps) {
        if (st.reward?.item) items.push([st.id, owner, st.reward, storyItem(story, st.id, owner, st.reward)]);
        if (st.trigger.kind === 'choice') for (const o of st.trigger.options) items.push([`${st.id}:${o.id}`, owner, o.reward ?? null, storyItem(story, `${st.id}:${o.id}`, owner, o.reward)]);
      }
      items.push(['end', owner, story.reward ?? null, storyItem(story, 'end', owner, story.reward)]);
    }
    out.items = items;
    // saves: the good, the foreign and the broken
    const saves: unknown[] = [null, 7, 'x', {}, { v: 2, story: story.id, at: null, n: 0, picks: {} }, { v: 1, story: 'other', at: null, n: 0, picks: {} },
      { v: 1, story: story.id, at: 'nope', n: 0, picks: {} }, { v: 1, story: story.id, at: null, n: '0', picks: {} }, { v: 1, story: story.id, at: null, n: 0, picks: 3 },
      { v: 1, story: story.id, at: story.steps[story.steps.length - 1].id, n: 1, picks: { a: 'b' } }, { v: 1, story: story.id, at: null, n: 0, picks: {}, done: true }];
    out.saves = saves.map((s) => [s, saveOk(story, s), stepOf(story, saveOk(story, s) ? s : null)?.id ?? null]);
    // plays: hidden ones every 4th, authored all; online and offline in turn
    if (ref.table !== 'hidden' || i % 4 === 0) {
      const me: StoryMe = i % 2 ? { team: i % 4, owner: `p:${i}` } : { team: i % 4 };
      const p = play(story, me, r, null, 120), plays = [p];
      if (p.mid) plays.push(play(story, me, r, p.mid, 80));
      out.plays = plays.map(({ mid: _m, ...x }) => x);
    }
    return out;
  });

  // makeItem through storyItem on every item def (shield paint, crested helmets, the rest)
  const defs = Object.keys(ITEMS).map((def, i) => {
    const rarity = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as const)[i % 5];
    const s = { id: 'probe', region: 'dodona-e' } as Story;
    return [def, rarity, storyItem(s, `k${i}`, 't:0', { item: { def, rarity } })];
  });
  return {
    radius: STORY_R, hidden: hidden.map((h) => [h.region, h.stories]), templates: HIDDEN.map((h) => h.id), snaps, stories, defs,
  };
};
