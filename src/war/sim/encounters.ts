/**
 * W-65 random encounters (docs/WAR.md "Random encounters"; the kinds: src/data/warEncounters.ts; the HUD:
 * src/war/view/hud/encounter.ts; online: server/src/war/encounters.ts). While a human player's men travel a neutral
 * region (depth 1+), now and then something happens near them: an ambush from cover, a wounded deserter, a shrine or a
 * cache to search, a lost merchant to guide, travellers beset by beasts, an omen pointing to a lair or the story's giver.
 * Each is one or two steps (the story runner's kinds: reach, clear, choice; and guide) and pays a little.
 *
 * The runner is pure and deterministic like ./stories.ts: it reads the sim's snapshots and asks its host to spawn and
 * pay. Every roll (which kind, where, the next cooldown, a search's risk, an item) is drawn on the sim's seeded Rng keyed
 * by region, owner and the encounter's number, so the same run meets the same things. The cooldown counts ticks of
 * travel only (his men walking, no foe near), never rolls in a fight. Progress is one small save per player (offline:
 * localStorage; online: the region DO's storage `encounter:<season>:<pid>`).
 */
import type { Item } from '../../data/items';
import { makeItem } from '../../game/heroes';
import { hashString, Rng } from '../../sim/rng';
import type { MobKind, RegionData, Snapshot, UnitSnap, WarEvent } from '../types';
import { depthOf } from './depth';
import { NEUTRAL_TEAM } from './economy';
import { snapOpen, storySpots, type StoryReward, type Story } from './stories';

/** Where a step points: the encounter's spot, the nearest town, the nearest lair still held, the story's giver. */
export type EncWhere = 'here' | 'town' | 'lair' | 'giver';

export type EncTrigger =
  /** His men reach the place (`r` tiles, default ENC.reach; `off`: a spot that far from it, rolled). */
  | { kind: 'reach'; at?: EncWhere; r?: number; off?: number }
  /** Foes spawned at the spot (`fauna`: a beast kind of the region); done once cleared with his men near. */
  | { kind: 'clear'; mob: MobKind | 'fauna'; count: number }
  /** Buttons on the card; each pays and may lead on; `risk`: a roll that sends it to another step instead. */
  | { kind: 'choice'; options: readonly EncOption[] }
  /** Reach the one who waits at the spot, then bring him to the nearest town (he follows your men). */
  | { kind: 'guide' };

export interface EncOption {
  id: string; label: string; text: string; reward?: StoryReward;
  /** With this chance the option goes wrong: `text` told, no reward, on to step `next` (a fight). */
  risk?: { chance: number; text: string; next: string };
  /** The step after (default: the encounter ends). */
  next?: string;
}

export interface EncStep {
  id: string;
  /** The objective ("Beat off the ambush"). */
  goal: string;
  /** One line told on the card. */
  text: string;
  /** The marker's label. */
  label: string;
  trigger: EncTrigger;
  reward?: StoryReward;
  /** The step after (default: the next in the list; 'end': it ends). */
  next?: string;
}

export interface EncounterDef {
  id: string;
  title: string;
  /** 1-2 lines of lore, told on the start banner and the card. */
  lore: string;
  /** The closing line. */
  end: string;
  /** Relative chance among the kinds that can happen here. */
  weight: number;
  /** Only from this depth (default 1). */
  minDepth?: number;
  /** It needs a town, a lair still held, or the region's story to point at. */
  needs?: 'town' | 'lair' | 'story';
  /** It springs this near his squad (tiles; default ENC.far). */
  near?: readonly [number, number];
  /** Who waits at the spot, painted by the page only (no sim unit): a sheet and how many. */
  figure?: { cls: string; count: number; name: string };
  steps: readonly EncStep[];
}

export const ENC = {
  /** Ticks of travel between encounters (3-5 minutes at 10 Hz). */
  cool: [1800, 3000] as const,
  /** A foe this near any of his men (or one of them fighting): a fight; no travel counted, no roll. */
  fightR: 16,
  /** An encounter springs this far from his squad (tiles). */
  far: [10, 14] as const,
  /** Reach radius (tiles); a cleared camp counts with his men this near; a town or lair reached this near. */
  reach: 5, near: 30, town: 12, lair: 18, giver: 8,
  /** An open step lapses after this long (ticks; a guide three times) or with all his men this far from it. */
  lapse: 1800, leave: 70,
  /** Ticks before a spawn not seen yet is asked for again. */
  respawn: 300,
  /** Travel ticks between quiet saves (the cooldown's progress). */
  saveEvery: 600,
};

export interface EncOpen {
  /** The kind (EncounterDef.id) and its open step. */
  id: string; step: string;
  /** The encounter's spot and the open step's target. */
  x: number; y: number; tx: number; ty: number;
  /** Tick the open step began. */
  since: number;
  /** A guide: he has been reached and follows. */
  with?: true;
}

/** n: encounters met; travel: ticks of travel since the last; next: travel ticks the next one waits for. */
export interface EncSave { v: 1; n: number; travel: number; next: number; last?: string; open: EncOpen | null }

export type EncNote =
  | { kind: 'start'; enc: string }
  /** A step done (`#1`: a guide reached), a choice made (`option`), a choice gone wrong (`risk`). */
  | { kind: 'step'; enc: string; step: string; option?: string; risk?: true; reward?: StoryReward }
  | { kind: 'end'; enc: string }
  /** Left behind: the moment passed. */
  | { kind: 'lapse'; enc: string };

export interface EncHost {
  addLair(d: { kind: MobKind; x: number; y: number; count: number }): void;
  spawnSoul(x: number, y: number, cls: string, level: number): void;
  give(reward: StoryReward, at: { x: number; y: number }, item: Item | null): void;
}

export interface EncMe {
  team: number;
  /** Online: his squads' owner (`p:<pid>`); offline: his team's men. */
  owner?: string;
  /** The sim's seed (offline ?seed; the server room's). */
  seed?: number;
}

const rngOf = (key: string) => new Rng(hashString(key) || 1);
const coolOf = (r: Rng) => r.int(ENC.cool[0], ENC.cool[1]);

/** A fresh save: the first encounter after one cooldown. */
export function newEncSave(region: string, owner: string, seed = 1): EncSave {
  return { v: 1, n: 0, travel: 0, next: coolOf(rngOf(`enc:${region}:${owner}:${seed}:cool:0`)), open: null };
}
export const encSaveOk = (s: unknown, defs: Readonly<Record<string, EncounterDef>>): s is EncSave =>
  !!s && typeof s === 'object' && (s as EncSave).v === 1 && typeof (s as EncSave).n === 'number' && typeof (s as EncSave).travel === 'number'
  && typeof (s as EncSave).next === 'number' && ((s as EncSave).open === null || (!!defs[(s as EncSave).open!.id] && defs[(s as EncSave).open!.id].steps.some((x) => x.id === (s as EncSave).open!.step)));

/** The open step of a save (null: none). */
export const encStepOf = (defs: Readonly<Record<string, EncounterDef>>, s: EncSave | null): EncStep | null =>
  s?.open ? defs[s.open.id]?.steps.find((x) => x.id === s.open!.step) ?? null : null;

/** The region's towns (its safe ground, then its claim points), else its entries. */
export function encTowns(r: RegionData): { x: number; y: number }[] {
  const t = [...(r.safe ?? []).map((a) => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 })), ...(r.claimPoints ?? []).map((c) => ({ x: c.x, y: c.y }))];
  return t.length ? t : r.entries.map((e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 }));
}
/** The region's beast kind for a `fauna` fight (its lairs' first hunter, else wolves). */
export function encFauna(r: RegionData): MobKind {
  return (r.lairs ?? []).find((l) => l.kind === 'wolf' || l.kind === 'jackal' || l.kind === 'boar' || l.kind === 'bear')?.kind ?? 'wolf';
}

const near = <T extends { x: number; y: number }>(xs: readonly T[], p: { x: number; y: number }): T | null =>
  xs.reduce<T | null>((a, q) => (!a || Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? q : a), null);

export class EncounterRun {
  save: EncSave;
  readonly depth: number;
  /** A quiet save is due (the cooldown moved on); the caller stores it and clears this. */
  due = false;
  private seen = false;
  private asked = -Infinity;
  private towns: { x: number; y: number }[];
  private giver: { x: number; y: number } | null;

  constructor(readonly region: RegionData, readonly defs: Readonly<Record<string, EncounterDef>>, save: EncSave | null, readonly me: EncMe, private readonly host: EncHost, story?: Story | null) {
    this.depth = depthOf(region);
    this.save = save && encSaveOk(save, defs) ? { ...save, open: save.open ? { ...save.open } : null } : newEncSave(region.id, this.owner, me.seed);
    this.towns = encTowns(region);
    this.giver = story ? storySpots(region, story).giver : null;
  }

  get owner(): string { return this.me.owner ?? `t:${this.me.team}`; }
  get def(): EncounterDef | null { return this.save.open ? this.defs[this.save.open.id] ?? null : null; }
  get step(): EncStep | null { return encStepOf(this.defs, this.save); }
  private key(...k: (string | number)[]) { return `enc:${this.region.id}:${this.owner}:${this.me.seed ?? 1}:${k.join(':')}`; }

  private men(s: Snapshot): UnitSnap[] {
    const own = new Set(s.squads.filter((q) => q.team === this.me.team && (!this.me.owner || q.owner === this.me.owner)).map((q) => q.id));
    return s.units.filter((u) => own.has(u.squad) && u.state !== 'dead' && !u.cls.startsWith('civ_'));
  }
  private centre(men: readonly UnitSnap[], or: { x: number; y: number }) {
    return men.length ? { x: men.reduce((a, u) => a + u.x, 0) / men.length, y: men.reduce((a, u) => a + u.y, 0) / men.length } : or;
  }

  /** A fight: one of his men striking, or a foe's man (the wild's, another player's) within ENC.fightR of his squads. */
  inFight(s: Snapshot, men: readonly UnitSnap[] = this.men(s)): boolean {
    if (men.some((u) => u.state === 'attack')) return true;
    const by = new Map<number, { x: number; y: number; n: number }>();
    for (const u of men) {
      const c = by.get(u.squad) ?? { x: 0, y: 0, n: 0 };
      (c.x += u.x), (c.y += u.y), c.n++;
      by.set(u.squad, c);
    }
    const cs = [...by.values()].map((c) => ({ x: c.x / c.n, y: c.y / c.n })), team = new Map(s.squads.map((q) => [q.id, q.team]));
    const r2 = ENC.fightR * ENC.fightR;
    for (const u of s.units) {
      if (u.state === 'dead' || u.cls.startsWith('civ_')) continue;
      const t = team.get(u.squad);
      if (t === undefined || t === this.me.team || t === NEUTRAL_TEAM) continue;
      for (const c of cs) if ((u.x - c.x) ** 2 + (u.y - c.y) ** 2 <= r2) return true;
    }
    return false;
  }

  /** The kinds that can happen here now. */
  private choices(s: Snapshot): EncounterDef[] {
    return Object.values(this.defs).filter((d) => this.depth >= (d.minDepth ?? 1) && (d.id !== this.save.last || Object.keys(this.defs).length < 2)
      && (d.needs !== 'story' || !!this.giver) && (d.needs !== 'lair' || (s.lairs ?? []).some((l) => l.state !== 'cleared')) && (d.needs !== 'town' || this.towns.length > 0));
  }

  /** Where a step points from the encounter's spot. */
  private target(s: Snapshot, st: EncStep, at: { x: number; y: number }): { x: number; y: number } {
    const t = st.trigger, w = t.kind === 'reach' ? t.at ?? 'here' : 'here';
    if (w === 'town') return near(this.towns, at) ?? at;
    if (w === 'giver') return this.giver ?? at;
    if (w === 'lair') {
      const l = near((s.lairs ?? []).filter((x) => x.state !== 'cleared' && Math.hypot(x.x - at.x, x.y - at.y) > 2), at);
      return l ? { x: l.x, y: l.y } : at;
    }
    if (t.kind === 'reach' && t.off) {
      const a = rngOf(this.key(this.save.n, st.id, 'off')).range(0, Math.PI * 2);
      return snapOpen(this.region, [Math.max(2, Math.min(this.region.w - 3, at.x + Math.cos(a) * t.off)), Math.max(2, Math.min(this.region.h - 3, at.y + Math.sin(a) * t.off))]);
    }
    return at;
  }

  /** Step `st` of the open encounter begins: its target, its clock. */
  private open(s: Snapshot, st: EncStep): void {
    const o = this.save.open!;
    const p = this.target(s, st, { x: o.x, y: o.y });
    Object.assign(o, { step: st.id, tx: p.x, ty: p.y, since: s.tick });
    delete o.with;
    this.seen = false;
    this.asked = -Infinity;
  }

  /** Meet `def` now beside his squad `squad` (a roll; also dev and tests). */
  fire(s: Snapshot, def: EncounterDef, from?: { x: number; y: number }): EncNote[] {
    const men = this.men(s), notes: EncNote[] = [];
    if (!men.length && !from) return notes;
    const r = rngOf(this.key(this.save.n, 'where'));
    const c = from ?? this.centre(men.filter((u) => u.squad === (men.find((m) => m.state === 'move') ?? men[0]).squad), { x: 0, y: 0 });
    // a spot round him, away from the map's edge (a few tries, then the last)
    const [d0, d1] = def.near ?? ENC.far, M = 8, { w, h } = this.region;
    let x = c.x, y = c.y;
    for (let k = 0; k < 8; k++) {
      const a = r.range(0, Math.PI * 2), d = r.range(d0, d1);
      (x = c.x + Math.cos(a) * d), (y = c.y + Math.sin(a) * d);
      if (x >= M && y >= M && x < w - M && y < h - M) break;
    }
    const p = snapOpen(this.region, [Math.max(2, Math.min(w - 3, x)), Math.max(2, Math.min(h - 3, y))]);
    this.save.open = { id: def.id, step: def.steps[0].id, x: p.x, y: p.y, tx: p.x, ty: p.y, since: s.tick };
    this.save.last = def.id;
    this.save.travel = 0;
    this.save.n++;
    this.save.next = coolOf(rngOf(this.key('cool', this.save.n)));
    this.open(s, def.steps[0]);
    notes.push({ kind: 'start', enc: def.id });
    return notes;
  }

  private item(step: string, rw: StoryReward | undefined): Item | null {
    if (!rw?.item) return null;
    const key = this.key(this.save.n, step);
    return { ...makeItem(rngOf(key), { nextId: 0 }, rw.item.def, rw.item.rarity), uid: key };
  }
  private pay(s: Snapshot, step: string, rw: StoryReward | undefined): void {
    if (!rw || !(rw.goods || rw.item || rw.soul)) return;
    const o = this.save.open!;
    this.host.give(rw, this.centre(this.men(s), { x: o.x, y: o.y }), this.item(step, rw));
  }

  /** Go on to step `next` of the open encounter (undefined: the next in the list; 'end' or none: it ends). */
  private advance(s: Snapshot, def: EncounterDef, st: EncStep, next: string | undefined, notes: EncNote[]): void {
    const to = next === 'end' ? null : next ? def.steps.find((x) => x.id === next) ?? null : def.steps[def.steps.indexOf(st) + 1] ?? null;
    if (to) return this.open(s, to);
    this.save.open = null;
    notes.push({ kind: 'end', enc: def.id });
  }

  /** Spawn the open fight's foes at its spot (not there yet, or gone: a reloaded page). */
  private ensure(s: Snapshot, st: EncStep): void {
    const t = st.trigger, o = this.save.open!;
    if (t.kind !== 'clear') return;
    const ls = (s.lairs ?? []).filter((l) => Math.hypot(l.x - o.tx, l.y - o.ty) < 0.5);
    if (ls.some((l) => l.state !== 'cleared')) return void (this.seen = true);
    if (this.seen || s.tick - this.asked < ENC.respawn) return;
    this.asked = s.tick;
    this.host.addLair({ kind: t.mob === 'fauna' ? encFauna(this.region) : t.mob, x: o.tx, y: o.ty, count: t.count + Math.floor(this.depth / 2) });
  }

  /** One snapshot: what happened (the caller tells it and stores the save when any, or when `due`). */
  tick(s: Snapshot, _evs: readonly WarEvent[] = []): EncNote[] {
    const notes: EncNote[] = [], men = this.men(s), o = this.save.open;
    if (o) {
      const def = this.defs[o.id], st = this.step;
      if (!def || !st) return (this.save.open = null), notes;
      if (s.tick < o.since) o.since = s.tick; // a sim started afresh (a reload): the step's clock with it
      this.ensure(s, st);
      const at = (p: { x: number; y: number }, r: number) => men.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < r);
      const t = st.trigger;
      let done = false;
      if (t.kind === 'reach') done = at({ x: o.tx, y: o.ty }, t.r ?? (t.at === 'town' ? ENC.town : t.at === 'lair' ? ENC.lair : t.at === 'giver' ? ENC.giver : ENC.reach));
      else if (t.kind === 'clear') {
        const ls = (s.lairs ?? []).filter((l) => Math.hypot(l.x - o.tx, l.y - o.ty) < 0.5);
        done = this.seen && ls.length > 0 && ls.every((l) => l.state === 'cleared') && at({ x: o.tx, y: o.ty }, ENC.near);
      } else if (t.kind === 'guide') {
        if (!o.with && at({ x: o.x, y: o.y }, ENC.reach)) {
          const town = near(this.towns, { x: o.x, y: o.y }) ?? { x: o.x, y: o.y };
          Object.assign(o, { with: true as const, tx: town.x, ty: town.y, since: s.tick });
          notes.push({ kind: 'step', enc: def.id, step: `${st.id}#1` });
        }
        done = !!o.with && at({ x: o.tx, y: o.ty }, ENC.town);
      }
      if (done) {
        this.pay(s, st.id, st.reward);
        notes.push({ kind: 'step', enc: def.id, step: st.id, ...(st.reward ? { reward: st.reward } : {}) });
        this.advance(s, def, st, st.next, notes);
        return notes;
      }
      // the moment passes: too long, or his men gone far (a guide is followed: only the clock)
      const far = !men.length || (!o.with && !men.some((u) => Math.hypot(u.x - o.tx, u.y - o.ty) < ENC.leave && Math.hypot(u.x - o.x, u.y - o.y) < ENC.leave));
      if (s.tick - o.since > ENC.lapse * (t.kind === 'guide' ? 3 : 1) || far) {
        this.save.open = null;
        notes.push({ kind: 'lapse', enc: def.id });
      }
      return notes;
    }
    if (this.depth < 1 || !men.length || !men.some((u) => u.state === 'move') || this.inFight(s, men)) return notes;
    this.save.travel++;
    if (this.save.travel % ENC.saveEvery === 0) this.due = true;
    if (this.save.travel < this.save.next) return notes;
    const ks = this.choices(s);
    if (!ks.length) return notes;
    const r = rngOf(this.key(this.save.n, 'kind')), sum = ks.reduce((a, d) => a + d.weight, 0);
    let x = r.range(0, sum), def = ks[ks.length - 1];
    for (const d of ks) if ((x -= d.weight) < 0) { def = d; break; }
    return this.fire(s, def);
  }

  /** He chose `option` at the open choice; null when there is no such choice open. */
  choose(s: Snapshot, option: string): EncNote[] | null {
    const def = this.def, st = this.step;
    if (!def || !st || st.trigger.kind !== 'choice') return null;
    const opt = st.trigger.options.find((x) => x.id === option);
    if (!opt) return null;
    const notes: EncNote[] = [];
    if (opt.risk && rngOf(this.key(this.save.n, st.id, opt.id, 'risk')).chance(opt.risk.chance)) {
      notes.push({ kind: 'step', enc: def.id, step: st.id, option: opt.id, risk: true });
      this.advance(s, def, st, opt.risk.next, notes);
      return notes;
    }
    this.pay(s, `${st.id}:${opt.id}`, opt.reward);
    notes.push({ kind: 'step', enc: def.id, step: st.id, option: opt.id, ...(opt.reward ? { reward: opt.reward } : {}) });
    this.advance(s, def, st, opt.next ?? 'end', notes);
    return notes;
  }
}
