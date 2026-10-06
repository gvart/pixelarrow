/**
 * Headless balance harness (no Phaser). `npm run balance` runs it through
 * scripts/balance.mjs; tests reuse the scenarios with fewer seeds.
 *
 * Scenarios:
 *  - matched: a fresh starting army vs the bot army generated for it, both
 *    sides driven by the bot AI (the player's side uses the same AI).
 *  - frontal: 6 swordsmen charge straight into 6 hoplites braced in a shield wall.
 *  - flank:   6 v 6 hoplite lines fighting head-on; the attacker has 3 more
 *    swordsmen who either join the front ('front') or hit the enemy's rear ('rear').
 */
import { Campaign } from '../game/campaign';
import { generateEnemyArmy } from '../game/enemy';
import { armySpec } from '../game/armySpec';
import { makeHero, type Archetype } from '../game/heroes';
import { Battle, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Hero } from '../data/units';
import type { Side } from '../sim/types';

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
  const camp = Campaign.fresh(seed);
  const heroes = camp.data.heroes;
  const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), camp.data, heroes, 0).heroes;
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
  return lines.join('\n');
}
