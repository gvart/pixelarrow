/**
 * W-184..W-193 the town boards (docs/WAR.md "Town boards"; numbers and text: src/data/warTownBoard.ts): what every NPC town
 * offers anyone, with no other player needed. Shared by the server (server/src/war/townBoard.ts, D1 and the room), the
 * Market panel and tests. Pure: all state comes in, time is the caller's clock, the same window gives the same board.
 *
 *  - A listing is seeded by town and window; a Kill's size also reads his army, never under a starting family (W-193).
 *  - A strength is Lanchester's: the square of the summed roots of each man's life x blows, so a Kill states honestly how
 *    hard it is whatever his men are (ratingOf; tests/war/townBoard.test.ts fights them to check the words).
 *  - Pay: the base of the job, more on his own path's kind (W-186), less on a repeat here (W-189), out of the town's purse
 *    (W-187: a thin purse pays less, npcMarket's thinPurse; never more than it holds).
 */
import { BAND_PEOPLE, BAND_WORDS, BOARD, BUILD_ANY, BUILD_WORK, ERRAND_STORY, GIVER_ANY, RATING } from '../../data/warTownBoard';
import { CHIEF_KINDS, chiefsOfKind } from '../../data/warBosses';
import { landOf } from '../../data/warStories';
import { afterArmour } from '../sim/combat';
import { warStats } from '../sim/classes';
import { DEPTH, depthOf } from '../sim/depth';
import { MOBS, mobClass } from '../sim/mobs';
import { perLoad } from '../sim/holders';
import type { MobKind, RegionData } from '../types';
import { FAMILIES, FAMILY_IDS, type PathId } from '../world/start';
import { hops, WORLD_IDS, worldRegion } from '../world/graph';
import { npcGood, npcGoods, npcSpot, thinPurse } from './npcMarket';

export type JobKind = 'kill' | 'build' | 'trade';
export type Rating = 'easy' | 'fair' | 'hard' | 'deadly';
export const JOB_KINDS: readonly JobKind[] = ['kill', 'build', 'trade'];
/** W-186: the kind of work each path does. */
export const PATH_KIND: Record<PathId, JobKind> = { warrior: 'kill', builder: 'build', trader: 'trade' };

export interface Band { kind: MobKind; count: number; lead?: true; chief?: string }
/** A line of a town's board: what is asked and its base pay (`points`: on his own path, before any repeat). */
export interface BoardEntry {
  id: string; kind: JobKind; goal: string; size: string; coin: number; points: number;
  /** W-190: a giver's errand: the giver and his line. */
  giver?: string; story?: string;
  band?: Band; strength?: number;
  /** Build: worker-seconds at this spot. */
  labour?: number; site?: { x: number; y: number };
  /** Trade: this much of this good to that town. */
  res?: string; n?: number; loads?: number; toTown?: string;
}
/** What the board shows him: a line, what it pays him now and how hard it is for him. */
export interface BoardLine extends BoardEntry { pay: number; gain: number; rating?: Rating; held: boolean }
/** A contract he holds. `state`: at it, or ready to hand in at its town. `done`/`need`: labour, or the load carried. */
export interface BoardJob {
  id: number; kind: JobKind; town: string; goal: string; state: 'taken' | 'ready'; done: number; need: number;
  x: number | null; y: number | null; toTown: string | null; res: string | null; n: number; coin: number; points: number; errand: boolean; giver?: string | null; story?: string | null;
}
export interface BoardView { town: string; purse: number; lines: BoardLine[]; jobs: BoardJob[]; until: number }

const HOUR = 3_600_000;
export const boardWindow = (now: number) => Math.floor(now / (BOARD.windowHours * HOUR));
export const windowEnd = (win: number) => (win + 1) * BOARD.windowHours * HOUR;

/** A stable hash (FNV-1a) of a board's seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const pick = <T>(xs: readonly T[], seed: string): T => xs[hash(seed) % xs.length];
const townsAt = (town: string, n: number) => WORLD_IDS.filter((t) => hops(town, t) === n);

// ---------------------------------------------------------------- strength

const rootOf = (hp: number, dps: number) => Math.sqrt(Math.max(0, hp) * Math.max(0, dps));
/** The armour blows meet (a mean man of the other side); the fight's damage is `afterArmour`'s. */
const ARMOUR_MET = 4;

/** One man's root by class: his life, his armour against the mean blow, his best blows a second. */
function manRoot(cls: string, level = 1): number {
  const s = warStats(cls), blow = Math.max(afterArmour(s.dmg, ARMOUR_MET, 0) * (10 / Math.max(1, s.atkTicks)), s.range > 0 ? afterArmour(s.rangedDmg, ARMOUR_MET, s.ap) * (10 / Math.max(1, s.shotTicks)) * s.accuracy : 0);
  const life = (s.maxHp * (10 + s.armor)) / 10, up = 1 + 0.04 * Math.max(0, level - 1);
  return rootOf(life * up, blow * up);
}

/** His army's strength: fighters only (a worker in a fight counts as what he is). `level`: his demigod's. */
export function armyStrength(men: readonly { cls: string; level?: number }[], level = 1): number {
  const k = 1 + 0.03 * Math.max(0, level - 1);
  return (men.reduce((a, m) => a + manRoot(m.cls, m.level) * (m.cls.startsWith('civ_') ? 0.4 : 1), 0) * k) ** 2;
}
/** The band's root over depth `depth`: a beast of it. */
function beastRoot(kind: MobKind, depth: number): number {
  const m = DEPTH[Math.max(0, Math.min(4, depth))].mob, def = MOBS[kind];
  return manRoot(mobClass(kind)) * m * (def.venom || def.dash ? 1.18 : 1);
}
export function bandStrength(b: Band, depth: number): number {
  const r = beastRoot(b.kind, depth), ck = b.chief ? CHIEF_KINDS[b.kind] : undefined;
  const lead = ck ? r * Math.sqrt(ck.hp * ck.dmg) : b.lead ? r * Math.sqrt(2 * 1.25) : r;
  return (lead + r * Math.max(0, b.count - 1)) ** 2;
}
/** W-193: a starting family: the weakest of them. No board sizes a fight under it. */
export const FLOOR_STRENGTH = Math.min(...FAMILY_IDS.map((f) => armyStrength(FAMILIES[f].start.map((cls) => ({ cls })))));

/** How a fight reads for an army of this strength: the card's honest word. */
export function ratingOf(army: number, band: number): Rating {
  const r = army / Math.max(1e-6, band);
  return r >= RATING.easy ? 'easy' : r >= RATING.fair ? 'fair' : r >= RATING.hard ? 'hard' : 'deadly';
}

// ---------------------------------------------------------------- the listing

/** The kinds a region's bands come from: what lives there; a region of nothing but herds gets wolves. */
function kindsOf(r: RegionData): MobKind[] {
  const out = [...new Set((r.lairs ?? []).map((l) => l.kind))].filter((k) => !MOBS[k].passive);
  return out.length ? out : ['wolf'];
}

/** A band of about `target` strength from what lives here; a kind too strong to come at least in a pair gives way. */
function bandFor(r: RegionData, target: number, seed: string, hard: boolean, rested: boolean): Band {
  const depth = depthOf(r), kinds = kindsOf(r), fit = kinds.filter((k) => Math.sqrt(target) / beastRoot(k, depth) >= 1.5);
  // nothing here comes in a pair at this size: the weakest thing anywhere in the wild does (W-193: it must be a fight he can win)
  const kind = fit.length ? pick(fit, seed) : (['jackal', 'wolf', 'bandit'] as MobKind[]).sort((a, b) => beastRoot(a, depth) - beastRoot(b, depth))[0];
  const r0 = beastRoot(kind, depth), most = BOARD.bandMost, n = (x: number) => Math.max(2, Math.min(most, Math.round(x)));
  if (hard) {
    // a rested board names a chief who fits this size (his escort makes up the rest); else a captain leads it
    const ck = CHIEF_KINDS[kind], chiefs = chiefsOfKind(kind), lr = ck ? r0 * Math.sqrt(ck.hp * ck.dmg) : Infinity, left = Math.sqrt(target) - lr;
    if (rested && chiefs.length && left >= r0) return { kind, count: n(left / r0 + 1), chief: pick(chiefs, seed).id };
    return { kind, count: n((Math.sqrt(target) - r0 * Math.sqrt(2.5)) / r0 + 1), lead: true };
  }
  return { kind, count: n(Math.sqrt(target) / r0) };
}

const bandGoal = (b: Band, seed: string, land: string | undefined): string => {
  if (b.chief) return `Slay ${chiefsOfKind(b.kind).find((c) => c.id === b.chief)?.name ?? 'the chief'}`;
  const words = BAND_WORDS[(land ?? 'any') as keyof typeof BAND_WORDS];
  return `${b.kind === 'bandit' ? 'Break' : 'Hunt'} the ${pick(words, seed)} ${BAND_PEOPLE[b.kind]}`;
};

/** The works his men may be set at: prebuilt pieces near the town. */
function sitesOf(r: RegionData): { x: number; y: number; type: string }[] {
  const at = npcSpot(r), near = (r.prebuilt ?? []).filter((p) => BUILD_WORK[p.type] && (p.x - at.x) ** 2 + (p.y - at.y) ** 2 <= BOARD.siteReach ** 2);
  return near.length ? near.map((p) => ({ x: p.x, y: p.y, type: p.type })) : [{ x: at.x, y: at.y, type: '' }];
}

/** The town a load goes to: `hops` roads off, by name order so the seed alone picks; a good both deal in. */
function tradeFor(town: string, hops: number, seed: string): { to: string; res: string } | null {
  for (const h of [hops, hops === 1 ? 2 : 1]) {
    const tos = townsAt(town, h).filter((t) => npcGoods(t).length);
    if (!tos.length) continue;
    const to = pick(tos, seed), both = npcGoods(town).filter((g) => npcGood(to, g.res)).map((g) => g.res as string);
    if (both.length) return { to, res: pick(both, `${seed}:g`) };
  }
  return null;
}

export interface BoardFor {
  /** The strength of his army now. */
  army: number;
  path: PathId | null;
  /** The weight on Kill here (W-189): a chief only on a rested board. */
  killHeat?: number;
  /** W-190: a giver's errand is open to him: his chain here is over, or there never was one. */
  errand?: boolean;
  /** The giver who speaks for this town to him. */
  giver?: string | null;
}

/**
 * What the town's board lists this window for him: all three kinds, his own path's first (W-186). Never empty: every town
 * lists fights of three sizes, two works and two loads (`tests/war/townBoard.test.ts` holds it over every town).
 */
export function boardEntries(r: RegionData, win: number, f: BoardFor): BoardEntry[] {
  const town = r.id, land = landOf(town), depth = depthOf(r), rested = (f.killHeat ?? 0) < BOARD.chiefHeat, out: BoardEntry[] = [];
  const base = Math.max(f.army, FLOOR_STRENGTH);
  BOARD.kill.forEach((t, i) => {
    const seed = `${town}:${win}:k${i}`, band = bandFor(r, base * t.share, seed, t.size === 'hard', rested), strength = bandStrength(band, depth);
    // the pay follows the band: a bigger fight pays more, whoever takes it (W-186: nothing scaled for him)
    const scale = Math.sqrt(strength / Math.max(1e-6, FLOOR_STRENGTH * t.share));
    out.push({ id: `k${i}.${win}`, kind: 'kill', goal: bandGoal(band, seed, land), size: t.size, coin: Math.round(t.coin * scale), points: Math.round(t.points * scale), band, strength });
  });
  const sites = sitesOf(r);
  BOARD.build.forEach((t, i) => {
    const seed = `${town}:${win}:b${i}`, s = pick(sites, seed), words = BUILD_WORK[s.type] ?? BUILD_ANY;
    out.push({ id: `b${i}.${win}`, kind: 'build', goal: words[i], size: t.size, coin: t.coin, points: t.points, labour: t.labour, site: { x: s.x, y: s.y } });
  });
  BOARD.trade.forEach((t, i) => {
    const seed = `${town}:${win}:t${i}`, way = tradeFor(town, t.hops, seed);
    if (!way) return;
    const n = t.loads * perLoad(way.res);
    out.push({ id: `t${i}.${win}`, kind: 'trade', goal: `Carry ${way.res} to ${worldRegion(way.to)?.name ?? way.to}`, size: t.size, coin: t.coin, points: t.points, res: way.res, n, loads: t.loads, toTown: way.to });
  });
  const mine = f.path ? PATH_KIND[f.path] : null;
  const ordered = [...out.filter((e) => e.kind === mine), ...out.filter((e) => e.kind !== mine)];
  if (f.errand && mine) {
    // W-190: the giver's errand: the smallest of his own kind, in the town's own words
    const small = out.find((e) => e.kind === mine)!, story = ERRAND_STORY[(land ?? 'any') as keyof typeof ERRAND_STORY][mine];
    ordered.unshift({ ...small, id: `e.${win}`, size: 'errand', coin: BOARD.errand.coin, points: BOARD.errand.points, giver: f.giver ?? GIVER_ANY, story });
  }
  return ordered;
}

// ---------------------------------------------------------------- pay

/** W-189: the weight on a kind at a town `ms` after it stood at `heat` (63% gone in recoverHours). */
export const heatAfter = (heat: number, ms: number): number => (ms <= 0 ? heat : heat * Math.exp(-ms / (BOARD.repeat.recoverHours * HOUR)));
/** W-189: what's left of the pay under this weight. */
export const repeatShare = (heat: number): number => Math.max(BOARD.repeat.floor, 1 / (1 + BOARD.repeat.per * heat));

/** W-186, W-188: a job's pay for his path before the purse and the repeats. */
export function pathPay(job: { kind: JobKind; coin: number; points: number }, path: PathId | null): { coin: number; points: number } {
  const on = !!path && PATH_KIND[path] === job.kind;
  return { coin: job.coin * (on ? BOARD.onPath : 1), points: on || !path ? job.points : job.points * BOARD.offPathPoints };
}
/** What a job pays him now (W-187, W-189): coin out of this purse, points; rounded down. */
export function quotePay(job: { kind: JobKind; coin: number; points: number }, path: PathId | null, heat: number, purse: number): { coin: number; points: number } {
  const p = pathPay(job, path), share = repeatShare(heat);
  return { coin: Math.floor(Math.min(Math.max(0, purse), thinPurse(p.coin * share, purse))), points: Math.round(p.points * share) };
}

/** The board's lines as he reads them. */
export function boardLines(entries: readonly BoardEntry[], f: { army: number; path: PathId | null; heat: (k: JobKind) => number; purse: number; held: ReadonlySet<string>; depth: number }): BoardLine[] {
  return entries.map((e) => {
    const q = quotePay(e, f.path, f.heat(e.kind), f.purse);
    return { ...e, pay: q.coin, gain: q.points, held: f.held.has(e.id), ...(e.strength !== undefined ? { rating: ratingOf(f.army, e.strength) } : {}) };
  });
}
/** A seal for a town's load, apart from carry contracts' (their row ids) and from tribute (negative). */
export const TOWN_SEAL = 1_000_000_000;
