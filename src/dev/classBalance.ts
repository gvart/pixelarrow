/**
 * Class balance (headless): equal-cost battles between unit classes and the
 * scripted matchups the class design is built on. `npm run balance` prints
 * them after the classic scenarios; tests/classes.test.ts reuses them with
 * fewer seeds.
 *
 *  - equal-cost duels: a budget is spent on men of one class per side
 *    (CLASSES[id].cost each), both sides bot-driven, sides alternated.
 *  - cavalry on the flank: a hoplite line with riders on its wing vs an
 *    all-hoplite line of the same cost.
 *  - cavalry frontal: riders ordered straight into hoplites braced in a
 *    shield wall.
 *  - animals vs militia: packs of wolves, boars, a bear vs the same cost of
 *    farm levies.
 *  - signature actives (abilities.md R3, AB-02): each active's mirror
 *    (activeImpact), the GDD's level-4 target rows, and the same-class A vs B
 *    mirror per perk tier (pathMirror; run on demand, not in the report).
 *  - the Standard (abilities.md R5, AB-03): the reference army with a bearer
 *    against its copy without one, and the bearer killed at 30 s
 *    (standardMirror, standardReport).
 */
import { armySpec } from '../game/armySpec';
import { makeHero, setBotLevel, standardArmy } from '../game/heroes';
import { CLASSES, type ClassId } from '../data/classes';
import { PERKS, retrainPerks, type PerkId } from '../data/perks';
import { Battle, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Hero } from '../data/units';
import type { Side } from '../sim/types';
import type { TerrainGrid } from '../sim/terrain';

export function classSquad(rng: Rng, ids: { nextId: number }, cls: ClassId, n: number, level = 3, group?: number, tier = 2): Hero[] {
  const out: Hero[] = [];
  for (let i = 0; i < n; i++) {
    const h = makeHero(rng, ids, CLASSES[cls].cultures[0] ?? 'greek', cls, 1, tier, group, out);
    setBotLevel(h, level);
    out.push(h);
  }
  return out;
}

/** Men of a class a budget buys (at least one). */
export function countFor(cls: ClassId, budget: number): number {
  return Math.max(1, Math.round(budget / CLASSES[cls].cost));
}

export interface DuelResult {
  /** Winner from class A's point of view: 1 = A won, 0 = B won, 0.5 = draw. */
  score: number;
  seconds: number;
}

/** Heroes with their tier-2 pick switched to the class's signature active (B), as a player would develop them (AB-02 rows). */
export function withActive(hs: Hero[]): Hero[] {
  for (const h of hs) {
    const t2 = CLASSES[h.cls as ClassId]?.tree[1];
    if (t2) h.perks = h.perks.map((p) => (p === t2[0] ? t2[1] : p));
  }
  return hs;
}

/** Equal-cost battle of class a vs class b; A plays side (seed & 1). `active`: both sides take the tier-2 signature active (level 4 and up). */
export function runClassDuel(seed: number, a: ClassId, b: ClassId, budget = 800, terrain?: TerrainGrid, level = 3, active = false): DuelResult {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const sa = classSquad(rng, ids, a, countFor(a, budget), level);
  const sb = classSquad(rng, ids, b, countFor(b, budget), level);
  if (active) {
    withActive(sa);
    withActive(sb);
  }
  const aSide: Side = (seed & 1) as Side;
  const armies = aSide === 0 ? [armySpec(sa, true), armySpec(sb, true)] : [armySpec(sb, true), armySpec(sa, true)];
  const bt = new Battle({ seed, armies: armies as [ReturnType<typeof armySpec>, ReturnType<typeof armySpec>], terrain });
  bt.startBattle();
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) bt.step();
  const w = bt.winner ?? -1;
  return { score: w === -1 ? 0.5 : w === aSide ? 1 : 0, seconds: bt.tick / TICK_RATE };
}

/**
 * Win rate of a over b at equal cost. With several budgets, pairs of seeds
 * (both sides) cycle through them, so one man more or less from rounding
 * does not decide the matchup.
 */
export function duelRate(a: ClassId, b: ClassId, n: number, seed0 = 9000, budget: number | number[] = 800, level = 3, active = false): { rate: number; seconds: number } {
  const budgets = Array.isArray(budget) ? budget : [budget];
  let s = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const r = runClassDuel(seed0 + i, a, b, budgets[Math.floor(i / 2) % budgets.length], undefined, level, active);
    s += r.score;
    t += r.seconds;
  }
  return { rate: s / n, seconds: t / n };
}

/**
 * A hoplite line with `riders` of a cavalry class on its flank vs an
 * all-hoplite army of the same cost. Returns 1 if the side with cavalry wins.
 */
export function runCavalryFlank(seed: number, cav: ClassId = 'companion', riders = 2, level = 3, path?: 'A' | 'B'): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const line = classSquad(rng, ids, 'hoplite', 6, level, 0);
  const horse = classSquad(rng, ids, cav, riders, level, 3);
  // the riders' tier-2 option forced (A: Lance Charge, B: Wheel and Re-charge); missing = as a bot picks
  const t2 = CLASSES[cav].tree[1];
  if (path) for (const h of horse) h.perks = h.perks.map((p) => (t2.includes(p) ? t2[path === 'A' ? 0 : 1] : p));
  const other = classSquad(rng, ids, 'hoplite', 6 + Math.round((riders * CLASSES[cav].cost) / CLASSES.hoplite.cost), level, 0);
  const side: Side = (seed & 1) as Side;
  const mine = armySpec([...line, ...horse], true);
  const theirs = armySpec(other, true);
  const bt = new Battle({ seed, armies: side === 0 ? [mine, theirs] : [theirs, mine] });
  bt.startBattle();
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) bt.step();
  return bt.winner === side ? 1 : bt.winner === -1 ? 0.5 : 0;
}

export interface FrontalCavResult {
  hoplitesWon: boolean;
  /** Riders down (dead or routing) 10 s after the clash, of the riders sent. */
  ridersDown10: number;
  riders: number;
}

/**
 * Riders (equal cost) charge straight into hoplites braced in a shield wall,
 * no manoeuvre: the bot is off on both sides, the riders are ordered in.
 */
export function runCavalryFrontal(seed: number, cav: ClassId = 'companion', budget = 900): FrontalCavResult {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const hop = classSquad(rng, ids, 'hoplite', countFor('hoplite', budget), 3, 0);
  const horse = classSquad(rng, ids, cav, countFor(cav, budget), 3, 0);
  const bt = new Battle({ seed, armies: [armySpec(horse, false), armySpec(hop, false)], timeLimit: 120 });
  const n = horse.length;
  bt.issue(0, { kind: 'form', group: 0, cx: 12, cy: 30, fx: 0, fy: -1, frontage: n });
  bt.issue(1, { kind: 'form', group: bt.sideGroups(1)[0].id, cx: 12, cy: 8, fx: 0, fy: 1, frontage: Math.ceil(hop.length / 2), type: 'shieldwall' });
  bt.startBattle();
  bt.issue(0, { kind: 'order', group: 0, order: 'charge' });
  let clash = -1;
  let down10 = -1;
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    bt.step();
    for (const e of bt.drainEvents()) if ((e.type === 'impact' || e.type === 'hit') && clash < 0) clash = bt.tick;
    if (clash >= 0 && down10 < 0 && bt.tick - clash >= 10 * TICK_RATE) down10 = bt.units.filter((u) => u.side === 0 && u.state !== 'ready').length;
    // after the first clash the riders keep at it (a stubborn commander)
    if (bt.tick % 40 === 0) bt.issue(0, { kind: 'order', group: 0, order: 'charge' });
  }
  if (down10 < 0) down10 = bt.units.filter((u) => u.side === 0 && u.state !== 'ready').length;
  return { hoplitesWon: bt.winner === 1, ridersDown10: down10, riders: n };
}

/** Budgets of the class round robin (an army of 6-20 men). */
export const RR_BUDGETS = [700, 900];

/** Equal-cost animals vs militia (both bot-driven). Returns 1 if the animals win. */
export function runBeastsVsMilitia(seed: number, beast: ClassId, budget = 900): number {
  return 1 - runClassDuel(seed, 'militia', beast, budget).score;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

// ------------------------------------------------------------------ signature actives (AB-02)

/** A perk mirror (abilities.md "Balance targets"): who on the perk side receives it. */
export interface ActiveTest {
  label: string;
  perk: PerkId;
  /** line: every man of the line (group 0); skirm: the first skirmisher; one: the first hero; extra: the added men. */
  who: 'line' | 'skirm' | 'one' | 'extra';
  /** Men added to both armies (class, count, group): riders or a chariot for the horse actives. */
  extra?: [ClassId, number, number];
}

/** The seven signature actives (R3). */
export const ACTIVE_TESTS: ActiveTest[] = [
  { label: 'Push of Pike (line)', perk: 'push', who: 'line' },
  { label: 'Sacred Bond (line)', perk: 'bond', who: 'line' },
  { label: 'War-cry (line)', perk: 'warcry', who: 'line' },
  { label: 'Sunder (line)', perk: 'sunder', who: 'line' },
  { label: 'Aimed Volley (one skirmisher)', perk: 'aimed', who: 'skirm' },
  { label: 'Wheel and Re-charge (2 Companions)', perk: 'recharge', who: 'extra', extra: ['companion', 2, 3] },
  { label: 'Scythe Run (1 chariot)', perk: 'scythe', who: 'extra', extra: ['chariot', 1, 3] },
];

/** The four re-tuned actives and three auras (R2), held as perkImpact holds them. */
export const RETUNED_TESTS: ActiveTest[] = [
  { label: 'Shield Bash (line)', perk: 'shield_bash', who: 'line' },
  { label: 'Berserk (line)', perk: 'berserk', who: 'line' },
  { label: 'Volley (one skirmisher)', perk: 'volley', who: 'skirm' },
  { label: 'Rally Cry (one)', perk: 'rally_cry', who: 'one' },
  { label: 'Steady Presence (one)', perk: 'steady_presence', who: 'one' },
  { label: 'Eagle Eye (one skirmisher)', perk: 'eagle_eye', who: 'skirm' },
  { label: 'Warlord (one)', perk: 'warlord', who: 'one' },
];

/**
 * One perk mirror: the level-4 standard army (plus the test's extra men),
 * attributes developed and no perks, against its copy; the perk side's
 * holders get the perk. Both bot-driven, sides alternated. 1 = the perk side
 * won, 0.5 = a draw.
 */
export function runActiveMirror(seed: number, t: ActiveTest): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const a = standardArmy(rng, ids);
  if (t.extra) a.push(...classSquad(rng, ids, t.extra[0], t.extra[1], 4, t.extra[2], 1));
  for (const h of a) {
    setBotLevel(h, 4);
    h.perks = [];
  }
  const b: Hero[] = JSON.parse(JSON.stringify(a));
  b.forEach((h, i) => (h.id = `m${i}`));
  const firstSkirm = a.findIndex((h) => h.group === 1);
  const extra = t.extra?.[1] ?? 0;
  a.forEach((h, i) => {
    const give = t.who === 'line' ? h.group === 0 : t.who === 'skirm' ? i === firstSkirm : t.who === 'one' ? i === 0 : i >= a.length - extra;
    if (give && PERKS[t.perk]) h.perks.push(t.perk);
  });
  const side: Side = (seed & 1) as Side;
  const bt = new Battle({ seed, armies: side === 0 ? [armySpec(a, true), armySpec(b, true)] : [armySpec(b, true), armySpec(a, true)] });
  bt.startBattle();
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) bt.step();
  return bt.winner === side ? 1 : bt.winner === -1 ? 0.5 : 0;
}

/** Win rate of the perk side over n seeds (abilities.md target: +5..+10 pts over 50%). */
export function activeImpact(n: number, tests: ActiveTest[] = ACTIVE_TESTS, seed0 = 7000): { label: string; win: number }[] {
  return tests.map((t) => {
    let w = 0;
    for (let i = 0; i < n; i++) w += runActiveMirror(seed0 + i, t);
    return { label: t.label, win: w / n };
  });
}

/**
 * The same-class A vs B mirror of one perk tier (abilities.md "A vs B per
 * tier", target |A - B| <= 6 pts): 8 men of the class at level 10, side A on
 * path A, side B the same men with this tier switched to B. Both bot-driven,
 * sides alternated. Returns A's and B's win rates (draws count for neither).
 */
export function pathMirror(cls: ClassId, tier: number, n: number, seed0 = 31000): { a: number; b: number } {
  let wa = 0;
  let wb = 0;
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i;
    const rng = new Rng(seed);
    const ids = { nextId: 1 };
    const sa = classSquad(rng, ids, cls, 8, 10);
    for (const h of sa) h.perks = CLASSES[cls].tree.map((t) => t[0]);
    const sb: Hero[] = JSON.parse(JSON.stringify(sa));
    sb.forEach((h, k) => {
      h.id = `b${k}`;
      h.perks = retrainPerks(h, tier) ?? h.perks;
    });
    const side: Side = (seed & 1) as Side;
    const bt = new Battle({ seed, armies: side === 0 ? [armySpec(sa, true), armySpec(sb, true)] : [armySpec(sb, true), armySpec(sa, true)] });
    bt.startBattle();
    for (let k = 0; k < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; k++) bt.step();
    if (bt.winner === side) wa++;
    else if (bt.winner !== -1) wb++;
  }
  return { a: wa / n, b: wb / n };
}

/** Mean equal-cost win rate of a class against every other soldier class, at a level, every side holding its tier-2 active. */
export function classMean(a: ClassId, n: number, level: number): number {
  const ids = (Object.keys(CLASSES) as ClassId[]).filter((c) => CLASSES[c].kind !== 'animal' && c !== a);
  let s = 0;
  ids.forEach((b, j) => (s += duelRate(a, b, n, 26000 + j * 31, RR_BUDGETS, level, true).rate));
  return s / ids.length;
}

/** The AB-02 section of the report: the seven actives' mirrors and the GDD's level-4 target rows. */
export function activeReport(n: number, k: number): string {
  const lines: string[] = [];
  lines.push(`Signature actives (abilities.md R3): perk mirrors, level-4 standard army (+ riders / a chariot), ${n} seeds each; target +5..+10 pts`);
  for (const r of activeImpact(n)) lines.push(`  ${r.label.padEnd(36)} win ${pct(r.win).padStart(4)}  (${r.win >= 0.5 ? '+' : ''}${Math.round(r.win * 100 - 50)} pts)`);
  let fa = 0;
  let fb = 0;
  for (let i = 0; i < k; i++) {
    fa += runCavalryFlank(11000 + i, 'companion', 2, 4, 'A');
    fb += runCavalryFlank(11000 + i, 'companion', 2, 4, 'B');
  }
  lines.push(`Level-4 target rows, ${k} seeds each`);
  lines.push(`  Cavalry on the flank, Companions with recharge ${pct(fb / k).padStart(4)}  (Lance Charge instead: ${pct(fa / k)}); target >= 58%`);
  lines.push(`  Chariots vs militia (scythe)                ${pct(duelRate('chariot', 'militia', k, 9000, 800, 4, true).rate).padStart(4)}  target >= 30%`);
  const rr = Math.max(4, Math.round(k / 3));
  const means = (['archer', 'slinger', 'royal_guard', 'sacred_band'] as ClassId[]).map((c) => `${CLASSES[c].short} ${pct(classMean(c, rr, 4))}`);
  lines.push(`  Equal-cost means at level 4 (${rr} seeds per pair): ${means.join(', ')}; target archer/slinger >= 40%, Guard/Sacred Band >= 46% (AB-03)`);
  return lines.join('\n');
}

/**
 * Intended counters: [winner, loser] pairs where the winner is meant to beat
 * the loser clearly at equal cost (rock-paper-scissors), as GAMEPLAY.md states
 * them. Missiles are not a counter to the hoplite (the hoplon and shield wall
 * are its identity); they counter unshielded foot, and horse archers bleed slow
 * heavy foot (QA-04, BAL-02 D14).
 */
export const INTENDED_COUNTERS: [ClassId, ClassId][] = [
  ['hoplite', 'companion'], ['hoplite', 'thessalian'], ['hoplite', 'chariot'], ['royal_guard', 'companion'], ['sacred_band', 'companion'],
  ['companion', 'archer'], ['companion', 'slinger'], ['companion', 'javelineer'], ['thessalian', 'archer'], ['thessalian', 'slinger'],
  ['peltast', 'archer'], ['peltast', 'slinger'], ['archer', 'rhomphaia'], ['slinger', 'rhomphaia'], ['horse_archer', 'celt_sword'],
  ['horse_archer', 'thureophoros'], ['rhomphaia', 'hoplite'], ['falx', 'thureophoros'],
];

/** The shock infantry of the elite-trap check (BASELINE R1): the classes the elites lost 92-100% to. */
export const SHOCK_CLASSES: ClassId[] = ['celt_sword', 'rhomphaia', 'peltast', 'falx', 'gallic', 'fanatic'];

export function classReport(n = 12): string {
  const lines: string[] = [];
  const k = Math.max(16, n * 2);
  let flank = 0;
  for (let i = 0; i < k; i++) flank += runCavalryFlank(11000 + i);
  lines.push(`Cavalry on the flank: 6 hoplites + 2 Companions vs the same cost in hoplites (10), both bot-driven, ${k} seeds`);
  lines.push(`  side with cavalry wins ${pct(flank / k)}`);
  let hw = 0;
  let down = 0;
  let sent = 0;
  for (let i = 0; i < k; i++) {
    const r = runCavalryFrontal(12000 + i);
    hw += r.hoplitesWon ? 1 : 0;
    down += r.ridersDown10;
    sent += r.riders;
  }
  lines.push(`Cavalry frontal: Companions (equal cost) charge braced hoplites head on, ${k} seeds`);
  lines.push(`  hoplites win ${pct(hw / k)}; riders down 10 s after the clash ${pct(down / Math.max(1, sent))}`);
  const named: [ClassId, ClassId, string][] = [
    ['peltast', 'archer', 'Peltasts vs Cretan archers'],
    ['horse_archer', 'hoplite', 'Horse archers vs hoplites'],
    ['horse_archer', 'celt_sword', 'Horse archers vs Celtic swordsmen'],
    ['companion', 'archer', 'Companions vs archers'],
    ['chariot', 'militia', 'Chariots vs militia'],
  ];
  lines.push(`Matchups at equal cost (800), both bot-driven, ${k} seeds (win rate of the first)`);
  for (const [a, b, label] of named) {
    const r = duelRate(a, b, k);
    lines.push(`  ${label.padEnd(36)} ${pct(r.rate).padStart(4)}  mean ${r.seconds.toFixed(0)} s`);
  }
  lines.push(`Animals vs militia at equal cost (budgets 600 and 900), ${k} seeds each (win rate of the animals)`);
  for (const beast of ['wolf', 'boar', 'bear'] as ClassId[]) {
    const part: string[] = [];
    let total = 0;
    for (const budget of [600, 900]) {
      let w = 0;
      for (let i = 0; i < k; i++) w += runBeastsVsMilitia(13000 + i, beast, budget);
      total += w;
      part.push(`${countFor(beast, budget)} vs ${countFor('militia', budget)}: ${pct(w / k)}`);
    }
    lines.push(`  ${CLASSES[beast].name.padEnd(12)} ${pct(total / (2 * k)).padStart(4)}  (${part.join(', ')})`);
  }
  // Round robin of every soldier class.
  const ids = (Object.keys(CLASSES) as ClassId[]).filter((c) => CLASSES[c].kind !== 'animal');
  lines.push(`Equal-cost round robin (budgets ${RR_BUDGETS.join(' and ')}, ${n} seeds per pair, sides alternated): row's win rate vs column, then its mean`);
  lines.push('        ' + ids.map((c) => CLASSES[c].short.padStart(6)).join('') + '  mean');
  const over: string[] = [];
  const rows: Record<string, Record<string, number>> = {};
  for (const a of ids) rows[a] = {};
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const r = duelRate(ids[i], ids[j], n, 20000 + i * 97 + j * 13, RR_BUDGETS).rate;
      rows[ids[i]][ids[j]] = r;
      rows[ids[j]][ids[i]] = 1 - r;
    }
  }
  for (const a of ids) {
    const mean = ids.reduce((m, b) => m + (a === b ? 0 : rows[a][b]), 0) / (ids.length - 1);
    lines.push(CLASSES[a].short.padEnd(8) + ids.map((b) => (a === b ? '     -' : pct(rows[a][b]).padStart(6))).join('') + pct(mean).padStart(6));
    for (const b of ids) {
      if (a === b || rows[a][b] <= 0.6) continue;
      const intended = INTENDED_COUNTERS.some(([w, l]) => w === a && l === b);
      over.push(`${CLASSES[a].short}>${CLASSES[b].short} ${pct(rows[a][b])}${intended ? ' (counter)' : ''}`);
    }
  }
  lines.push(`  over 60%: ${over.join(', ') || 'none'}`);
  // EC-04 targets (BASELINE R1, R3, J1)
  let polar = 0;
  for (const a of ids) for (const b of ids) if (a !== b && (rows[a][b] <= 0.04 || rows[a][b] >= 0.96)) polar++;
  const shock = ids.filter((c) => SHOCK_CLASSES.includes(c));
  const overShock = ids.flatMap((b) => shock.filter((s) => s !== b && rows[s][b] > 0.85).map((s) => `${CLASSES[s].short}>${CLASSES[b].short} ${pct(rows[s][b])}`));
  const meanOf = (a: ClassId) => ids.reduce((m, b) => m + (a === b ? 0 : rows[a][b]), 0) / (ids.length - 1);
  lines.push(`  lopsided cells (0-4% or 96-100%): ${polar} of ${ids.length * (ids.length - 1)}`);
  lines.push(`  shock infantry over 85%: ${overShock.length} (${overShock.join(', ') || 'none'}); target none (EC-04 AC 1)`);
  lines.push(`  militia vs Companion / Thessalian / chariot: ${(['companion', 'thessalian', 'chariot'] as ClassId[]).map((c) => pct(rows.militia[c])).join(' / ')}; target not 100% (EC-04 AC 2)`);
  lines.push(`  means: archer ${pct(meanOf('archer'))}, slinger ${pct(meanOf('slinger'))} (target >= 40%); royal guard ${pct(meanOf('royal_guard'))}, Sacred Band ${pct(meanOf('sacred_band'))} (target >= 46%)`);
  lines.push(activeReport(Math.max(40, n * 25), k));
  lines.push(standardReport(Math.max(40, n * 25)));
  return lines.join('\n');
}

/** 'none': no standard on either side; 'std': side A's first man carries one; 'killed': and he is killed at STANDARD_KILL_S. */
export type StandardArm = 'none' | 'std' | 'killed';
/** abilities.md "Bearer killed at 30 s vs not". */
export const STANDARD_KILL_S = 30;

export interface StandardRun {
  /** 1 = side A (the bearer's) won, 0.5 = a draw. */
  win: number;
  /** Seconds from STANDARD_KILL_S to side A's first group rout after it (censored at the battle's end); -1 = the battle was over or A had routed by then. */
  rout: number;
  /** Side A's standard was lost (the bearer fell). */
  lost: boolean;
  /** Side A raised its standard. */
  raised: boolean;
}

/**
 * The Standard mirror (abilities.md "Balance targets"): the level-4 reference
 * army (perks cleared, as runActiveMirror) against its copy; side A's first
 * man (the veteran hoplite of the main line) takes `standard_bearer`. Both
 * bot-driven (each bot raises its standard by R6), sides alternated.
 */
export function standardMirror(seed: number, arm: StandardArm): StandardRun {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const a = standardArmy(rng, ids);
  for (const h of a) {
    setBotLevel(h, 4);
    h.perks = [];
  }
  const b: Hero[] = JSON.parse(JSON.stringify(a));
  b.forEach((h, i) => (h.id = `m${i}`));
  if (arm !== 'none') a[0].perks.push('standard_bearer');
  const side: Side = (seed & 1) as Side;
  const bt = new Battle({ seed, armies: side === 0 ? [armySpec(a, true), armySpec(b, true)] : [armySpec(b, true), armySpec(a, true)] });
  bt.startBattle();
  const killAt = STANDARD_KILL_S * TICK_RATE;
  let routedEarly = false;
  let rout = -1;
  let lost = false;
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    if (bt.tick === killAt && arm === 'killed') {
      const bearer = bt.standardBearer(side);
      const foe = bt.units.find((u) => u.side !== side && bt.isAlive(u));
      if (bearer && foe && bt.isAlive(bearer)) bt.kill(bearer, foe);
    }
    bt.step();
    for (const e of bt.drainEvents()) {
      if (e.type === 'standardLost' && e.side === side) lost = true;
      if (e.type !== 'rout' || e.side !== side) continue;
      if (e.tick <= killAt) routedEarly = true;
      else if (rout < 0) rout = (e.tick - killAt) / TICK_RATE;
    }
  }
  const raised = bt.standardRaised(side);
  if (rout < 0 && bt.tick > killAt) rout = (bt.tick - killAt) / TICK_RATE;
  return { win: bt.winner === side ? 1 : bt.winner === -1 ? 0.5 : 0, rout: routedEarly || bt.tick <= killAt ? -1 : rout, lost, raised };
}

/** The AB-03 section of the report: standard vs none (+5..+8 pts) and the bearer killed at 30 s (rout >= 15% sooner). */
export function standardReport(n: number, seed0 = 15000): string {
  const runs = (arm: StandardArm) => Array.from({ length: n }, (_, i) => standardMirror(seed0 + i, arm));
  const none = runs('none');
  const std = runs('std');
  const killed = runs('killed');
  const win = (r: StandardRun[]) => r.reduce((m, x) => m + x.win, 0) / r.length;
  // the rout rows compare the same seeds: those where side A still stood unrouted at 30 s in both arms
  const both = std.map((x, i) => [x.rout, killed[i].rout]).filter(([p, q]) => p >= 0 && q >= 0);
  const mean = (k: 0 | 1) => both.reduce((m, x) => m + x[k], 0) / Math.max(1, both.length);
  const sooner = both.length ? 1 - mean(1) / mean(0) : NaN;
  const pts = (w: number) => `${w >= 0.5 ? '+' : ''}${Math.round(w * 100 - 50)} pts`;
  return [
    `The Standard (abilities.md R5), level-4 reference army mirror, ${n} seeds each`,
    `  Standard vs none                           win ${pct(win(std)).padStart(4)}  (${pts(win(std))}; mirror with none ${pct(win(none))}); target +5..+8 pts`,
    `  Bearer killed at ${STANDARD_KILL_S} s: his side's first rout after it   ${mean(1).toFixed(1)} s vs ${mean(0).toFixed(1)} s (${Math.round(sooner * 100)}% sooner, ${both.length} seeds); win ${pct(win(killed))}; target >= 15% sooner`,
  ].join('\n');
}
