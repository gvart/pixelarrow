/**
 * Headless balance harness (no Phaser). `npm run balance` runs it through
 * scripts/dev/balance.mjs; tests reuse the scenarios with fewer seeds.
 *
 * Scenarios:
 *  - matched: a fresh starting army vs the bot army generated for it, both
 *    sides driven by the bot AI (the player's side uses the same AI).
 *  - frontal: 6 swordsmen charge straight into 6 hoplites braced in a shield wall.
 *  - flank:   6 v 6 hoplite lines fighting head-on; the attacker has 3 more
 *    swordsmen who either join the front ('front') or hit the enemy's rear ('rear').
 *  - terrain: mirror battles of identical armies on a hill held by one side,
 *    across a river with a ford, and on generated battlefields of every kind.
 */
import { generateEnemyArmy } from '../game/enemy';
import { armySpec } from '../game/armySpec';
import { makeHero, setBotLevel, standardArmy, type Archetype } from '../game/heroes';
import { PERKS, type PerkId } from '../data/perks';
import { Battle, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Hero } from '../data/units';
import type { BattleSetup, Side } from '../sim/types';
import { flatGrid, type TerrainGrid } from '../sim/terrain';
import { TERRAIN } from '../data/terrain';
import { SITE_BASES, generateBattlefield, type BattleSite } from '../world/battlefield';
import { classReport } from './classBalance';
import { beastReport } from './beastBalance';

export interface MatchedResult {
  winner: Side | -1;
  seconds: number;
  timeLimit: boolean;
  contact: number; // s, -1 = never
  firstRout: [number, number]; // s of each side's first group rout, -1 = none
  survivors: [number, number];
}

function track(b: Battle, maxTicks: number): { contact: number; firstRout: [number, number] } {
  let contact = -1;
  const firstRout: [number, number] = [-1, -1];
  for (let i = 0; i < maxTicks && b.phase !== 'ended'; i++) {
    b.step();
    for (const e of b.drainEvents()) {
      if (e.type === 'contact' && contact < 0) contact = e.tick / TICK_RATE;
      if (e.type === 'rout' && firstRout[e.side] < 0) firstRout[e.side] = e.tick / TICK_RATE;
    }
  }
  return { contact, firstRout };
}

/** passive = the player's side never gives an order (holds its deployment). */
export function runMatched(seed: number, passive = false): MatchedResult {
  const ids = { nextId: 1 };
  const heroes = standardArmy(new Rng(seed), ids);
  const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), ids, heroes, 0).heroes;
  const b = new Battle({ seed, armies: [armySpec(heroes, !passive), armySpec(enemy, true)] });
  b.startBattle();
  const t = track(b, b.timeLimitTicks + 10);
  const alive = (s: Side) => b.units.filter((u) => u.side === s && u.state !== 'dead').length;
  return {
    winner: b.winner ?? -1,
    seconds: b.tick / TICK_RATE,
    timeLimit: b.tick >= b.timeLimitTicks,
    contact: t.contact,
    firstRout: t.firstRout,
    survivors: [alive(0), alive(1)],
  };
}

function squad(rng: Rng, ids: { nextId: number }, arch: Archetype, n: number, group: number, level = 2): Hero[] {
  const out: Hero[] = [];
  for (let i = 0; i < n; i++) out.push(makeHero(rng, ids, 'greek', arch, level, 1, group, out));
  return out;
}

/** Place a group's formation anywhere (battle phase) and teleport its men into their slots. */
function place(b: Battle, side: Side, gid: number, cx: number, cy: number, fy: number, frontage: number, type?: 'line' | 'shieldwall'): void {
  b.issue(side, { kind: 'form', group: gid, cx, cy, fx: 0, fy, frontage, type });
  for (const u of b.activeMembers(gid)) {
    const p = b.slotPos(u);
    u.x = p.x;
    u.y = p.y;
    u.fx = 0;
    u.fy = fy;
  }
}

export interface FrontalResult {
  contact: number; // s
  attackerRout: number; // s after contact, -1 = held for the whole test
  attackerLoss15: number; // attackers dead or routing 15 s after contact
  defenderLoss15: number;
  attackerHp15: number; // hit points lost by each side in the first 15 s after contact
  defenderHp15: number;
  attackerHp5: number; // ... and in the clash itself (first 5 s)
  defenderHp5: number;
  attackerWon: boolean;
}

/** Swordsmen charge a braced hoplite shield wall head-on. */
export function runFrontal(seed: number, seconds = 60): FrontalResult {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const att = squad(rng, ids, 'swordsman', 6, 0);
  const def = squad(rng, ids, 'hoplite', 6, 0);
  const b = new Battle({ seed, armies: [armySpec(att, false), armySpec(def, false)], timeLimit: seconds + 5 });
  b.startBattle();
  place(b, 0, 0, 12, 22, -1, 3, 'line');
  place(b, 1, 4, 12, 14, 1, 3, 'shieldwall');
  b.issue(0, { kind: 'order', group: 0, order: 'charge' });
  let contact = -1;
  let rout = -1;
  let l15: [number, number] = [-1, -1];
  let hp15: [number, number] = [0, 0];
  let hp5: [number, number] = [-1, -1];
  const lost = (s: Side) => b.units.filter((u) => u.side === s && u.state !== 'ready').length;
  const hpLost = (s: Side) => b.units.filter((u) => u.side === s).reduce((a, u) => a + u.stats.maxHp - Math.max(0, u.hp), 0);
  for (let i = 0; i < seconds * TICK_RATE && b.phase !== 'ended'; i++) {
    b.step();
    for (const e of b.drainEvents()) {
      if (e.type === 'contact' && contact < 0) contact = e.tick / TICK_RATE;
      if (e.type === 'rout' && e.side === 0 && rout < 0 && contact >= 0) rout = e.tick / TICK_RATE - contact;
    }
    if (contact >= 0 && hp5[0] < 0 && b.tick / TICK_RATE >= contact + 5) hp5 = [hpLost(0), hpLost(1)];
    if (contact >= 0 && l15[0] < 0 && b.tick / TICK_RATE >= contact + 15) {
      l15 = [lost(0), lost(1)];
      hp15 = [hpLost(0), hpLost(1)];
    }
  }
  if (l15[0] < 0) {
    l15 = [lost(0), lost(1)];
    hp15 = [hpLost(0), hpLost(1)];
  }
  return { contact, attackerRout: rout, attackerLoss15: l15[0], defenderLoss15: l15[1], attackerHp15: hp15[0], defenderHp15: hp15[1], attackerHp5: Math.max(0, hp5[0]), defenderHp5: Math.max(0, hp5[1]), attackerWon: b.winner === 0 };
}

export interface FlankResult {
  defenderRout: number; // s from the start until the defending main line routs, -1 = never
  attackerWon: boolean;
  seconds: number;
}

/** Equal lines fight head-on; 3 extra attackers join the front or strike the rear. */
export function runFlank(seed: number, mode: 'front' | 'rear', seconds = 120): FlankResult {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  // 'front': the extra men stand in the line's second rank; 'rear': a separate group behind the enemy.
  const att = [...squad(rng, ids, 'hoplite', 6, 0), ...squad(rng, ids, 'swordsman', 3, mode === 'rear' ? 3 : 0)];
  const def = squad(rng, ids, 'hoplite', 6, 0);
  const b = new Battle({ seed, armies: [armySpec(att, false), armySpec(def, false)], timeLimit: seconds });
  b.startBattle();
  place(b, 0, 0, 12, 19.2, -1, 6, 'line');
  place(b, 1, 4, 12, 17.8, 1, 6, 'line');
  if (mode === 'rear') {
    place(b, 0, 3, 12, 13.4, 1, 3, 'line');
    b.issue(0, { kind: 'order', group: 3, order: 'charge' });
  }
  b.issue(0, { kind: 'order', group: 0, order: 'advance' });
  b.issue(1, { kind: 'order', group: 4, order: 'advance' });
  let rout = -1;
  for (let i = 0; i < seconds * TICK_RATE && b.phase !== 'ended'; i++) {
    b.step();
    for (const e of b.drainEvents()) if (e.type === 'rout' && e.side === 1 && rout < 0) rout = e.tick / TICK_RATE;
  }
  return { defenderRout: rout, attackerWon: b.winner === 0, seconds: b.tick / TICK_RATE };
}

// ------------------------------------------------------------------ progression

/** Who receives a perk in the mirror test. */
const PERK_HOLDERS: Record<string, (h: Hero, i: number) => boolean> = {
  one: (_h, i) => i === 0,
  oneSkirm: (h) => h.group === 1,
  melee: (h) => h.group === 0,
};

export const PERK_TESTS: { label: string; perks: PerkId[]; who: keyof typeof PERK_HOLDERS; firstOnly?: boolean }[] = [
  { label: 'Shield Bash (all line men)', perks: ['shield_bash'], who: 'melee' },
  { label: 'Berserk (all line men)', perks: ['berserk'], who: 'melee' },
  { label: 'Volley (one skirmisher)', perks: ['volley'], who: 'oneSkirm', firstOnly: true },
  { label: 'Rally Cry (one hero)', perks: ['rally_cry'], who: 'one' },
  { label: 'Steady Presence aura (one)', perks: ['steady_presence'], who: 'one' },
  { label: 'Eagle Eye aura (one skirmisher)', perks: ['eagle_eye'], who: 'oneSkirm', firstOnly: true },
  { label: 'Warlord aura (one)', perks: ['warlord'], who: 'one' },
];

/** A level-4 ten-man army, attributes developed but no perks (identical on both sides). */
function mirrorArmy(seed: number): Hero[] {
  const heroes = standardArmy(new Rng(seed), { nextId: 1 });
  for (const h of heroes) {
    setBotLevel(h, 4);
    h.perks = [];
  }
  return heroes;
}

/**
 * Mirror battle: two identical armies (both bot-driven); side 0 additionally
 * has `perks` on the chosen heroes. Returns the winner.
 */
export function runMirror(seed: number, perks: PerkId[], who: keyof typeof PERK_HOLDERS, firstOnly = false): Side | -1 {
  const a = mirrorArmy(seed);
  const b: Hero[] = JSON.parse(JSON.stringify(a));
  b.forEach((h, i) => (h.id = `m${i}`));
  let given = 0;
  a.forEach((h, i) => {
    if (!PERK_HOLDERS[who](h, i) || (firstOnly && given > 0)) return;
    for (const p of perks) if (PERKS[p] && !h.perks.includes(p)) h.perks.push(p);
    given++;
  });
  // Alternate sides between seeds so map side does not bias the result.
  const flip = seed % 2 === 1;
  const armies = flip ? [armySpec(b, true), armySpec(a, true)] : [armySpec(a, true), armySpec(b, true)];
  const battle = new Battle({ seed, armies: armies as [ReturnType<typeof armySpec>, ReturnType<typeof armySpec>] });
  battle.startBattle();
  for (let i = 0; i < battle.timeLimitTicks + 10 && battle.phase !== 'ended'; i++) battle.step();
  const w = battle.winner ?? -1;
  if (w === -1) return -1;
  return (flip ? (w === 0 ? 1 : 0) : w) as Side;
}

// ------------------------------------------------------------------ terrain

/**
 * A broad ridge (height 2, a step of 1 on its forward slope) under one side's
 * deployment front, across the whole field width.
 */
export function hillGrid(defender: Side, w = 24, h = 36): TerrainGrid {
  const g = flatGrid(w, h);
  let hs = '';
  for (let y = 0; y < h; y++) {
    // side 1 deploys at the top (small y), side 0 at the bottom; mirror for side 0
    const d = defender === 1 ? y : h - 1 - y;
    const lv = d >= 3 && d <= 10 ? 2 : d >= 11 && d <= 12 ? 1 : d === 2 ? 1 : 0;
    hs += String(lv).repeat(w);
  }
  return { ...g, height: hs, name: 'Ridge' };
}

/** A river across the middle of the field with a ford in the centre. */
export function riverGrid(w = 24, h = 36): TerrainGrid {
  let cells = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const river = y === 17 || y === 18;
      cells += river ? (x >= 10 && x < 14 ? TERRAIN.ford.code : TERRAIN.water.code) : TERRAIN.open.code;
    }
  }
  return { w, h, cells, height: '0'.repeat(w * h), name: 'River ford' };
}

/**
 * Mirror battle of identical level-4 armies (both bot-driven) on the given
 * terrain. Returns the winner from the point of view of `hero`, the side
 * that holds the advantage being tested.
 */
export function runTerrainMirror(seed: number, terrain: (hero: Side, seed: number) => TerrainGrid | undefined): { win: boolean; loss: boolean; seconds: number } {
  const a = mirrorArmy(seed);
  const b: Hero[] = JSON.parse(JSON.stringify(a));
  b.forEach((h, i) => (h.id = `m${i}`));
  const hero: Side = seed % 2 === 1 ? 1 : 0;
  const setup: BattleSetup = { seed, armies: [armySpec(a, true), armySpec(b, true)], terrain: terrain(hero, seed) };
  const battle = new Battle(setup);
  battle.startBattle();
  for (let i = 0; i < battle.timeLimitTicks + 10 && battle.phase !== 'ended'; i++) battle.step();
  const w = battle.winner ?? -1;
  return { win: w === hero, loss: w !== -1 && w !== hero, seconds: battle.tick / TICK_RATE };
}

export interface TerrainReport {
  label: string;
  win: number;
  loss: number;
  seconds: number;
}

function terrainRow(label: string, n: number, terrain: (hero: Side, seed: number) => TerrainGrid | undefined, base = 9000): TerrainReport {
  let win = 0;
  let loss = 0;
  const secs: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = runTerrainMirror(base + i, terrain);
    if (r.win) win++;
    else if (r.loss) loss++;
    secs.push(r.seconds);
  }
  secs.sort((x, y) => x - y);
  return { label, win: win / n, loss: loss / n, seconds: secs[Math.floor(n / 2)] };
}

export function terrainImpact(n: number): TerrainReport[] {
  const site = (base: BattleSite['base']): BattleSite => ({ base, river: false, coast: base === 'beach', rocky: base === 'hills', woods: 0.2 });
  return [
    terrainRow('Flat open plain (control)', n, () => flatGrid(24, 36)),
    terrainRow('Defending a ridge (vs attacking it)', n, (hero) => hillGrid(hero)),
    terrainRow('River with a ford (side A)', n, () => riverGrid()),
    ...SITE_BASES.map((b) => terrainRow(`Generated ${b} (side A)`, n, (_h, seed) => generateBattlefield(seed, site(b)))),
  ];
}

export function perkImpact(n: number): { label: string; win: number; loss: number }[] {
  const out: { label: string; win: number; loss: number }[] = [];
  const tests: { label: string; perks: PerkId[]; who: keyof typeof PERK_HOLDERS; firstOnly?: boolean }[] = [{ label: 'Baseline (no perks)', perks: [], who: 'one' }, ...PERK_TESTS];
  for (const t of tests) {
    let win = 0;
    let loss = 0;
    for (let i = 0; i < n; i++) {
      const r = runMirror(7000 + i, t.perks, t.who, t.firstOnly);
      if (r === 0) win++;
      else if (r === 1) loss++;
    }
    out.push({ label: t.label, win: win / n, loss: loss / n });
  }
  return out;
}

// ------------------------------------------------------------------ report

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (k: number, n: number) => `${((100 * k) / Math.max(1, n)).toFixed(0)}%`;
const f1 = (x: number) => (isNaN(x) ? '-' : x.toFixed(1));

export function balanceReport(n = 200): string {
  const lines: string[] = [];
  const m = Array.from({ length: n }, (_, i) => runMatched(1000 + i));
  const wins = m.filter((r) => r.winner === 0).length;
  const losses = m.filter((r) => r.winner === 1).length;
  const draws = n - wins - losses;
  const dur = m.map((r) => r.seconds);
  const inBand = dur.filter((d) => d >= 60 && d <= 150).length;
  const rout0 = m.map((r) => r.firstRout[0] - r.contact).filter((_x, i) => m[i].firstRout[0] >= 0 && m[i].contact >= 0);
  const rout1 = m.map((r) => r.firstRout[1] - r.contact).filter((_x, i) => m[i].firstRout[1] >= 0 && m[i].contact >= 0);
  lines.push(`Matched: starting army vs matched bot (both bot-driven), ${n} seeds`);
  lines.push(`  player win ${pct(wins, n)}  loss ${pct(losses, n)}  draw/stalemate ${pct(draws, n)}  (time limit hit ${pct(m.filter((r) => r.timeLimit).length, n)})`);
  lines.push(`  duration mean ${f1(mean(dur))} s  median ${f1(median(dur))} s  min ${f1(Math.min(...dur))}  max ${f1(Math.max(...dur))}  in 60-150 s: ${pct(inBand, n)}`);
  lines.push(`  first contact mean ${f1(mean(m.filter((r) => r.contact >= 0).map((r) => r.contact)))} s`);
  lines.push(`  first group rout after contact: player median ${f1(median(rout0))} s (${pct(rout0.length, n)} of battles), bot median ${f1(median(rout1))} s (${pct(rout1.length, n)})`);
  lines.push(`  survivors (not dead) mean: player ${f1(mean(m.map((r) => r.survivors[0])))}, bot ${f1(mean(m.map((r) => r.survivors[1])))}`);

  const pv = Array.from({ length: Math.round(n / 2) }, (_, i) => runMatched(5000 + i, true));
  lines.push(`Passive player (never orders, holds deployment) vs bot, ${pv.length} seeds`);
  lines.push(`  5-minute time limit reached ${pct(pv.filter((r) => r.timeLimit).length, pv.length)}; duration median ${f1(median(pv.map((r) => r.seconds)))} s; player win ${pct(pv.filter((r) => r.winner === 0).length, pv.length)}`);

  const k = Math.max(20, Math.round(n / 4));
  const fr = Array.from({ length: k }, (_, i) => runFrontal(2000 + i));
  const routed = fr.filter((r) => r.attackerRout >= 0);
  const early = fr.filter((r) => r.attackerRout >= 0 && r.attackerRout < 15).length;
  lines.push(`Frontal charge: 6 swordsmen into 6 braced hoplites, ${k} seeds`);
  lines.push(`  attacker routs within 15 s of contact: ${pct(early, k)}; routs at all (60 s): ${pct(routed.length, k)}, median ${f1(median(routed.map((r) => r.attackerRout)))} s after contact`);
  lines.push(`  the clash (first 5 s after contact): HP lost attacker ${f1(mean(fr.map((r) => r.attackerHp5)))} vs defender ${f1(mean(fr.map((r) => r.defenderHp5)))}`);
  lines.push(`  first 15 s after contact: HP lost attacker ${f1(mean(fr.map((r) => r.attackerHp15)))} vs defender ${f1(mean(fr.map((r) => r.defenderHp15)))}; men down (dead/routing) ${f1(mean(fr.map((r) => r.attackerLoss15)))} vs ${f1(mean(fr.map((r) => r.defenderLoss15)))}`);
  lines.push(`  attacker eventually wins ${pct(fr.filter((r) => r.attackerWon).length, k)} (60 s, equal numbers)`);

  for (const mode of ['front', 'rear'] as const) {
    const fl = Array.from({ length: k }, (_, i) => runFlank(3000 + i, mode));
    const r = fl.filter((x) => x.defenderRout >= 0).map((x) => x.defenderRout);
    lines.push(`Flank test (${mode === 'rear' ? '3 extra men hit the REAR' : '3 extra men join the FRONT'}), ${k} seeds`);
    lines.push(`  attacker wins ${pct(fl.filter((x) => x.attackerWon).length, k)}; defender line routs in ${pct(r.length, k)}, median at ${f1(median(r))} s; battle median ${f1(median(fl.map((x) => x.seconds)))} s`);
  }
  const pk = Math.max(40, Math.round(n * 0.8));
  lines.push(`Abilities and auras: mirror battles, level-4 ten-man armies, only one side has the perk, ${pk} seeds each`);
  for (const r of perkImpact(pk)) lines.push(`  ${r.label.padEnd(34)} win ${pct(Math.round(r.win * pk), pk).padStart(4)}  loss ${pct(Math.round(r.loss * pk), pk).padStart(4)}`);
  const tk = Math.max(40, Math.round(n * 0.6));
  lines.push(`Terrain: mirror battles of identical level-4 armies (both bot-driven), ${tk} seeds each; win/loss for the side named`);
  for (const r of terrainImpact(tk)) lines.push(`  ${r.label.padEnd(36)} win ${pct(Math.round(r.win * tk), tk).padStart(4)}  loss ${pct(Math.round(r.loss * tk), tk).padStart(4)}  median ${f1(r.seconds)} s`);
  lines.push(classReport(Math.max(8, Math.round(n / 16))));
  lines.push(beastReport(Math.max(20, Math.round(n / 5))));
  return lines.join('\n');
}
