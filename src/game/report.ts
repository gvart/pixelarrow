/**
 * The post-battle report (docs/DESIGN_V2.md "Post-battle report"): one model
 * for offline battles, verified online attacks and live duels, built from the
 * finished sim (kills, damage, duration) and the outcome the rules applied
 * (XP, level-ups, wounds, deaths, gold, loot). Pure: the results screen only
 * draws it, and tests check the numbers.
 */
import { Battle, TICK_RATE } from '../sim/battle';
import type { SimEvent, Side } from '../sim/types';
import type { Hero } from '../data/units';
import type { Item } from '../data/items';
import { fmtClock } from '../util/format';

export type ReportResult = 'victory' | 'defeat' | 'draw' | 'retreat';

/** One soldier's battle, read off the sim. */
export interface UnitStat {
  heroId: string;
  side: Side;
  kills: number;
  /** Damage dealt (melee, missiles, abilities). */
  dmg: number;
  dead: boolean;
  ko: boolean;
  /** Side that killed him (-1: not killed). */
  killedBy: number;
}

/** What the rules decided for one of the player's heroes (game/loot.ts HeroOutcome or the server's). */
export interface HeroResult {
  heroId?: string;
  name: string;
  died: boolean;
  wounded?: boolean;
  fled?: boolean;
  xp: number;
  levelsGained: number;
  levelBefore?: number;
  xpBefore?: number;
}

export interface HeroLine {
  heroId: string;
  name: string;
  /** For the portrait (paper doll) and the class. */
  hero: Hero | null;
  kills: number;
  dmg: number;
  died: boolean;
  wounded: boolean;
  xp: number;
  levelBefore: number;
  xpBefore: number;
  levelsGained: number;
}

export interface BattleReport {
  result: ReportResult;
  /** "vs Galatae raiders". */
  vs: string;
  /** Seconds of battle. */
  duration: number;
  kills: number;
  enemyTotal: number;
  losses: number;
  gold: number;
  /** Duels: Glory earned (shown instead of gold). */
  glory?: number;
  xp: number;
  mvp: HeroLine | null;
  heroes: HeroLine[];
  loot: Item[];
  /** How many loot items the player may pick (0: none, or already in the stash). */
  picks: number;
  /** Online: the loot was already put into the stash by the server. */
  lootInStash: boolean;
  /** Online battles: the server's replay check (null offline). */
  verified: boolean | null;
  online: 'attack' | 'duel' | null;
  /** Extra lines (siege progress, "hex taken", friendly duel). */
  notes: string[];
  /** The enemy quit the field (ai-doctrines.md R8): a victory without the win bonus. */
  enemyRetreated: boolean;
  /** Gold for a band captain killed or captured (ai-doctrines.md R6), part of `gold`; 0 = none. */
  bounty: number;
  /** Why the battle went this way (battle-readability.md R5): parts drawn as one line; [] = none (a report from before RD-03). */
  why: WhyPart[];
}

/**
 * Per-unit numbers of a finished battle. Every finished battle passes through
 * here (the battle scene, settleBattle, an abandoned battle fought out), so it
 * also closes that battle's log for the why-line (`lastBattle.log`).
 */
export function unitStats(sim: Battle): UnitStat[] {
  lastBattle.log = finishLog(sim);
  return sim.units.map((u) => ({
    heroId: u.heroId,
    side: u.side,
    kills: u.kills,
    dmg: Math.round(u.dmgDealt),
    dead: u.state === 'dead',
    ko: u.ko,
    killedBy: u.killedBy,
  }));
}

/** The hero of the battle: most kills, then most damage; nobody without a kill (plan ANSWERS A-36, PLAY B4). */
export function pickMvp(lines: readonly HeroLine[]): HeroLine | null {
  let best: HeroLine | null = null;
  for (const l of lines) {
    if (l.kills <= 0) continue;
    if (!best || l.kills > best.kills || (l.kills === best.kills && l.dmg > best.dmg)) best = l;
  }
  return best;
}

/** "1:05" (minutes and seconds). */
export interface ReportInput {
  result: ReportResult;
  vs: string;
  ticks: number;
  side: Side;
  stats: readonly UnitStat[];
  /** The player's heroes as they went into battle (portraits, level before). */
  heroes: readonly Hero[];
  /** What the rules applied to them (absent for a friendly duel). */
  outcomes?: readonly HeroResult[];
  gold?: number;
  /** Duels pay Glory instead of gold: the report shows a Glory tile. */
  glory?: number;
  loot?: Item[];
  picks?: number;
  lootInStash?: boolean;
  verified?: boolean | null;
  online?: 'attack' | 'duel' | null;
  notes?: string[];
  /** The side that ordered a retreat (the sim's `retreated`); the enemy's is a victory for `side`. */
  retreated?: Side | null;
  bounty?: number;
  /** What the sim did (observeBattle); null/absent = unknown, and a defeat still gets the fallback line. */
  log?: BattleLog | null;
  /** Hero ids of band captains on the field (ai-doctrines.md R6), for the captain rule. */
  captains?: readonly string[];
}

export function buildReport(i: ReportInput): BattleReport {
  const mine = i.stats.filter((s) => s.side === i.side);
  const foes = i.stats.filter((s) => s.side !== i.side);
  const byId = new Map(i.heroes.map((h) => [h.id, h]));
  const outById = new Map<string, HeroResult>();
  const outByName = new Map<string, HeroResult>();
  for (const o of i.outcomes ?? []) {
    if (o.heroId) outById.set(o.heroId, o);
    else outByName.set(o.name, o);
  }
  const heroes: HeroLine[] = mine.map((s) => {
    const h = byId.get(s.heroId) ?? null;
    const name = h?.name ?? s.heroId;
    const o = outById.get(s.heroId) ?? outByName.get(name);
    const died = o ? o.died : !!i.outcomes && s.dead && !s.ko;
    return {
      heroId: s.heroId,
      name,
      hero: h,
      kills: s.kills,
      dmg: s.dmg,
      died,
      wounded: !died && (o ? !!o.wounded : !!i.outcomes && s.ko),
      xp: died ? 0 : o?.xp ?? 0,
      levelBefore: o?.levelBefore ?? h?.level ?? 1,
      xpBefore: o?.xpBefore ?? h?.xp ?? 0,
      levelsGained: died ? 0 : o?.levelsGained ?? 0,
    };
  });
  // Order: the fallen last, otherwise by kills then damage.
  heroes.sort((a, b) => Number(a.died) - Number(b.died) || b.kills - a.kills || b.dmg - a.dmg);
  const kills = foes.filter((s) => s.dead && s.killedBy === i.side).length;
  // Men struck down on the field (dead or knocked out), like Kills on the other side.
  // Counting only the dead-for-good showed 0 in duels, which have no permadeath (B4);
  // who died for good is in the per-hero rows.
  const losses = mine.filter((s) => s.dead).length;
  return {
    result: i.result,
    vs: i.vs,
    duration: Math.round(i.ticks / TICK_RATE),
    kills,
    enemyTotal: foes.length,
    losses,
    gold: i.gold ?? 0,
    ...(i.glory !== undefined ? { glory: i.glory } : {}),
    xp: heroes.reduce((a, h) => a + h.xp, 0),
    mvp: pickMvp(heroes),
    heroes,
    loot: i.loot ?? [],
    picks: Math.min(i.picks ?? 0, (i.loot ?? []).length),
    lootInStash: !!i.lootInStash,
    verified: i.verified ?? null,
    online: i.online ?? null,
    notes: i.notes ?? [],
    enemyRetreated: enemyRetreated(i.side, i.retreated),
    bounty: i.bounty ?? 0,
    why: whyLine(i.log ?? null, i.side, i.result, { enemyRetreated: enemyRetreated(i.side, i.retreated), captains: i.captains }),
  };
}

/** Whether the other side retreated, seen from `side` (ai-doctrines.md R8). */
export function enemyRetreated(side: Side, retreated?: number | null): boolean {
  return retreated !== undefined && retreated !== null && retreated !== side;
}

/** The result word for a winner seen from `side` (a retreat ordered by `side` is its own result). */
export function resultFor(winner: number, side: Side, retreated?: number | null): ReportResult {
  if (retreated === side) return 'retreat';
  return winner === side ? 'victory' : winner === -1 ? 'draw' : 'defeat';
}

/** Stats of the last battle the scene fought (online sources build their report from it). */
export const lastBattle: { stats: UnitStat[]; ticks: number; side: Side; heroes: Hero[]; log: BattleLog | null } = { stats: [], ticks: 0, side: 0, heroes: [], log: null };

// ------------------------------------------------------------------ the why-line

/*
 * design/gdd/battle-readability.md R5: one cause line for Results, from the
 * battle's events and end state. The sim's events are output only (never
 * hashed); the scenes drain them every frame, so this module keeps the few
 * kinds the rules read in a small per-battle log (observeBattle). Nothing here
 * changes the sim or anything it hashes.
 */

/** Seconds before a group's rout in which a `flanked` event on it explains the rout (R5 rule 2). */
export const WHY_FLANK_S = 10;
/** Head-count ratio at first contact at or below which a side was outnumbered (R5 rule 3). */
export const WHY_OUTNUMBERED = 0.75;
/** Share of the missile groups' time out of range that blames the missiles (R5 rule 4). */
export const WHY_OUT_OF_RANGE = 0.3;
/** Seconds without a target that count as out of range (formations-orders.md R4, noTargetS > 3). */
export const WHY_NO_TARGET_S = 3;
/** Seconds after a group's rout and cohesion shock in which more routs make it a cascade. */
export const WHY_CASCADE_S = 10;
/** Lines the Results why-line may wrap to (never an ellipsis, A11Y-10); a retreat's cause plus "We withdrew" needs 3 at 320 px. */
export const WHY_MAX_LINES = 3;

const LOG_TYPES = new Set<SimEvent['type']>(['contact', 'flanked', 'rout', 'unitRout', 'rally', 'death', 'cohesion', 'armyBreak', 'standardLost', 'retreat', 'end']);

/** The events the rules read. */
export type LogEvent = Extract<SimEvent, { type: 'contact' | 'flanked' | 'rout' | 'unitRout' | 'rally' | 'death' | 'cohesion' | 'armyBreak' | 'standardLost' | 'retreat' | 'end' }>;

/** One battle as the why-line sees it. Plain data, so tests build fixtures by hand. */
export interface BattleLog {
  /** The last tick seen. */
  ticks: number;
  /** Per unit id. */
  units: { side: Side; heroId: string }[];
  /** Per group id: its numeral as on the cards and badges ('*' = men fighting alone). */
  groups: { side: Side; numeral: string }[];
  events: LogEvent[];
  /** Focus orders (formations-orders.md R4): target -1 clears. */
  focus: { tick: number; side: Side; group: number; target: number }[];
  /** Per side: missile-group ticks seen, and how many of them were out of range (R5 rule 4). */
  shootTicks: [number, number];
  outTicks: [number, number];
}

/** One piece of the why-line: an i18n key (why.*) and its parameters. */
export interface WhyPart {
  key: string;
  params: Record<string, string | number>;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** A group's numeral, as src/ui/battleHud.ts groupNumeral (kept here so the report needs no UI module). */
function numeral(groups: Battle['groups'], gid: number): string {
  const g = groups[gid];
  if (!g || g.individual) return '*';
  let i = 0;
  for (const o of groups) {
    if (o.id === gid) break;
    if (o.side === g.side && !o.individual) i++;
  }
  return NUMERALS[i] ?? `${i + 1}`;
}

export function emptyLog(): BattleLog {
  return { ticks: 0, units: [], groups: [], events: [], focus: [], shootTicks: [0, 0], outTicks: [0, 0] };
}

interface LogState {
  log: BattleLog;
  /** Events already kept (finishLog peeks at undrained ones, which a later drain returns again). */
  seen: WeakSet<object>;
  orders: number;
  sampled: number;
}
const logs = new WeakMap<Battle, LogState>();

function logState(sim: Battle): LogState {
  let st = logs.get(sim);
  if (!st) {
    st = { log: emptyLog(), seen: new WeakSet(), orders: 0, sampled: -1 };
    logs.set(sim, st);
  }
  return st;
}

/** Add a batch of the sim's events (and its state right now) to its log. */
export function observeBattle(sim: Battle, events: readonly SimEvent[]): BattleLog {
  const st = logState(sim);
  const log = st.log;
  log.ticks = sim.tick;
  for (let i = log.units.length; i < sim.units.length; i++) log.units.push({ side: sim.units[i].side, heroId: sim.units[i].heroId });
  for (let i = log.groups.length; i < sim.groups.length; i++) log.groups.push({ side: sim.groups[i].side, numeral: numeral(sim.groups, i) });
  for (const e of events) {
    if (!LOG_TYPES.has(e.type) || st.seen.has(e)) continue;
    st.seen.add(e);
    log.events.push(e as LogEvent);
  }
  for (; st.orders < sim.orderLog.length; st.orders++) {
    const o = sim.orderLog[st.orders];
    if (o.order.kind === 'focus') log.focus.push({ tick: o.tick, side: o.side, group: o.order.group, target: o.order.target });
  }
  // R5 rule 4: sample the missile groups' range state (HUD state on the groups, not events)
  if (sim.phase === 'battle') {
    const dt = st.sampled >= 0 ? sim.tick - st.sampled : 0;
    if (dt > 0) {
      const shooting = new Set<number>();
      for (const u of sim.units) if (u.state === 'ready' && u.ammo > 0) shooting.add(u.group);
      for (const g of sim.groups) {
        if (g.disbanded || g.routed || !shooting.has(g.id)) continue;
        log.shootTicks[g.side] += dt;
        if (g.focusOutOfRange || (g.noTargetS ?? 0) > WHY_NO_TARGET_S) log.outTicks[g.side] += dt;
      }
    }
    st.sampled = sim.tick;
  }
  return log;
}

/** The finished battle's log, with any events not drained yet (an abandoned battle fought out is never drained). */
export function finishLog(sim: Battle): BattleLog {
  return observeBattle(sim, sim.events);
}

// Every battle the client runs drains its events through here once a frame.
const drain = Battle.prototype.drainEvents;
Battle.prototype.drainEvents = function (this: Battle): SimEvent[] {
  const e = drain.call(this);
  observeBattle(this, e);
  return e;
};

const clock = (tick: number): string => fmtClock(tick / TICK_RATE);

/** Men standing and not fleeing on each side just before `tick`. */
function activeAt(log: BattleLog, tick: number): [number, number] {
  const gone = new Set<number>();
  const routing = new Set<number>();
  for (const e of log.events) {
    if (e.tick >= tick) continue;
    if (e.type === 'death') gone.add(e.unit);
    else if (e.type === 'unitRout') routing.add(e.unit);
    else if (e.type === 'rally') routing.delete(e.unit);
  }
  const n: [number, number] = [0, 0];
  log.units.forEach((u, id) => {
    if (!gone.has(id) && !routing.has(id)) n[u.side]++;
  });
  return n;
}

type RoutEvent = Extract<LogEvent, { type: 'rout' }>;

/**
 * The cause that broke side `loser`, or null when no real rule matched.
 * `won`: seen from the winner (the mirror lines). Rules in priority order;
 * army break is the last real one, because it ends most defeats.
 */
function cause(log: BattleLog, loser: Side, won: boolean, captains: readonly string[]): WhyPart | null {
  const ev = log.events;
  const k = won ? 'why.won.' : 'why.lost.';
  const firstRout = ev.find((e): e is RoutEvent => e.type === 'rout' && e.side === loser);
  const routAt = firstRout ? firstRout.tick : Infinity;
  // 1. the captain fell before the first rout (he also carries the standard, so this comes first)
  const capSet = new Set(captains);
  const capDeath = ev.find((e) => e.type === 'death' && e.tick <= routAt && log.units[e.unit]?.side === loser && capSet.has(log.units[e.unit].heroId));
  if (capDeath) return { key: `${k}captain`, params: { t: clock(capDeath.tick) } };
  // 2. the standard fell before the first rout
  const std = ev.find((e) => e.type === 'standardLost' && e.side === loser && e.tick <= routAt);
  if (std) return { key: `${k}standard`, params: { t: clock(std.tick) } };
  if (firstRout) {
    const g = log.groups[firstRout.group]?.numeral ?? '*';
    // 3. the first group to rout was flanked just before
    const from = firstRout.tick - WHY_FLANK_S * TICK_RATE;
    if (ev.some((e) => e.type === 'flanked' && e.side === loser && e.group === firstRout.group && e.tick >= from && e.tick <= firstRout.tick)) {
      if (won) return { key: `${k}flanked`, params: { t: clock(firstRout.tick) } };
      return g === '*' ? { key: `${k}flankedLine`, params: {} } : { key: `${k}flanked`, params: { g } };
    }
    // 4. (a win) our missiles were focused on the group that routed first
    if (won) {
      const aim = new Map<number, number>();
      for (const f of log.focus) if (f.side !== loser && f.tick <= firstRout.tick) aim.set(f.group, f.target);
      if ([...aim.values()].includes(firstRout.group)) return { key: `${k}focus`, params: { t: clock(firstRout.tick) } };
    }
  }
  // 5. outnumbered at the first contact
  const contact = ev.find((e) => e.type === 'contact');
  if (contact) {
    const n = activeAt(log, contact.tick);
    const a = n[loser];
    const b = n[(1 - loser) as Side];
    if (b > 0 && a / b <= WHY_OUTNUMBERED) return won ? { key: `${k}outnumbered`, params: { a: b, b: a } } : { key: `${k}outnumbered`, params: { a, b } };
  }
  // 6. (a defeat) our missiles spent most of the fight out of range
  if (!won && log.shootTicks[loser] > 0 && log.outTicks[loser] / log.shootTicks[loser] > WHY_OUT_OF_RANGE) return { key: `${k}range`, params: {} };
  if (firstRout) {
    // 7. the first rout's cohesion shock spread: more groups routed soon after
    const shook = ev.some((e) => e.type === 'cohesion' && e.side === loser && e.group === firstRout.group);
    const more = ev.filter((e) => e.type === 'rout' && e.side === loser && e !== firstRout && e.tick <= firstRout.tick + WHY_CASCADE_S * TICK_RATE).length;
    if (shook && more > 0) {
      const g = log.groups[firstRout.group]?.numeral ?? '*';
      if (won) return { key: `${k}cascade`, params: { t: clock(firstRout.tick) } };
      return g === '*' ? { key: `${k}cascadeLine`, params: {} } : { key: `${k}cascade`, params: { g } };
    }
  }
  // 8. the army broke (only when nothing before it explains why)
  const brk = ev.find((e) => e.type === 'armyBreak' && e.side === loser);
  if (brk) {
    const n = ev.filter((e) => e.type === 'rout' && e.side === loser && e.tick <= brk.tick).length;
    return { key: `${k}armyBreak`, params: { n } };
  }
  return null;
}

/** Only what happened up to `tick` (the state at a retreat). */
function until(log: BattleLog, tick: number): BattleLog {
  return { ...log, ticks: tick, events: log.events.filter((e) => e.tick <= tick), focus: log.focus.filter((f) => f.tick <= tick) };
}

/**
 * The why-line for `side` (R5). Every defeat and retreat gets one, even with
 * no log (the fallback rule); a draw and a victory get theirs. Empty only for
 * a victory with no log.
 */
export function whyLine(log: BattleLog | null, side: Side, result: ReportResult, o: { enemyRetreated?: boolean; captains?: readonly string[] } = {}): WhyPart[] {
  const foe = (1 - side) as Side;
  const caps = o.captains ?? [];
  if (result === 'draw') return [{ key: 'why.draw', params: {} }];
  if (result === 'retreat') {
    const r = log?.events.find((e) => e.type === 'retreat' && e.side === side);
    const at = r ? r.tick : log?.ticks ?? 0;
    const c = log ? cause(until(log, at), side, false, caps) : null;
    return [...(c ? [c] : []), { key: 'why.withdrew', params: { t: clock(at) } }];
  }
  if (result === 'defeat') return [(log && cause(log, side, false, caps)) || { key: 'why.lost.held', params: {} }];
  // a victory
  if (o.enemyRetreated) {
    const r = log?.events.find((e) => e.type === 'retreat' && e.side === foe);
    return [{ key: 'why.won.withdrew', params: { t: clock(r ? r.tick : log?.ticks ?? 0) } }];
  }
  if (!log) return [];
  return [cause(log, foe, true, caps) || { key: 'why.won.held', params: {} }];
}
