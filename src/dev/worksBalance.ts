/**
 * Field works balance (headless): the rows of design/gdd/field-works.md
 * "Balance targets". `npm run balance` prints them.
 *
 * FW-01 rows (the works sim; FW-02 adds the ridge, turtle and bot-placement
 * rows, AR-02 the lair assault):
 *  - stakes on the threatened flank: ordersBalance's flank battle (6 hoplites
 *    + 2 Companions vs the same cost in hoplites, both bot-driven), with and
 *    without one stakes segment laid by the defender at the corner of its
 *    line that faces the riders. Defender win rate, and the gain.
 *  - riders into stakes: 3 Companions (human, scripted) charge 6 braced
 *    hoplites holding behind a stakes row, or on open ground. The riders'
 *    charge damage (a rider's hit in the tick his impact lands) with stakes
 *    as a share of it without, and the hoplites' win rate with stakes.
 *  - ditch line: 6 hoplites (human, holding in line) behind two ditch
 *    segments, 2 paces out, against Celtic swordsmen (human, charging):
 *    6 of them (equal numbers, as balance.ts's frontal charge) and 7 (an
 *    even fight). Defender win rate without the ditch, and the gain.
 *  - reference army with 3 works: balance.ts's matched battle with a ditch
 *    across the centre and stakes on both wings, 2 paces in front of the
 *    main line; the starting army holding its deployment (the passive row)
 *    and bot-driven (the matched row). Player win rate with and without.
 */
import { armySpec } from '../game/armySpec';
import { generateEnemyArmy } from '../game/enemy';
import { standardArmy } from '../game/heroes';
import { CLASSES } from '../data/classes';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Order, Side, SimGroup } from '../sim/types';
import type { BalanceRow } from './balance';
import { classSquad } from './classBalance';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pts = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts`;
const ALL = { stakes: 3, ditch: 3, laager: 3 };
/**
 * How far in front of the line the harness lays stakes, in paces. A lance
 * reaches about 3 paces (reach plus both radii), so riders charging a line
 * head on strike it over stakes laid 2 paces out without ever entering them;
 * 3.5 puts the row across their path (docs/v5/balance/FW-01.md).
 */
const STAKES_OUT = 3.5;

/** Play a battle to its end; returns the side's result (1 win, 0.5 draw). */
function finish(b: Battle, side: Side): number {
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) b.step();
  return b.winner === side ? 1 : b.winner === -1 ? 0.5 : 0;
}

/** A point `out` paces in front of a group's front rank, shifted along the line by `lat` paces (to its right). */
function ahead(g: SimGroup, lat: number, out = 2): { x: number; y: number } {
  const f = g.formation; // the anchor (cx, cy) is the front rank's centre
  return { x: f.cx - f.fy * lat + f.fx * out, y: f.cy + f.fx * lat + f.fy * out };
}

/** Half the frontage of a group's front rank, in paces. */
function halfFront(b: Battle, g: SimGroup): number {
  const n = Math.min(g.formation.frontage, b.activeMembers(g.id).length);
  return ((n - 1) * (g.formation.fs ?? 1)) / 2;
}

/**
 * The flank battle (ordersBalance runFlankAnswer, no answer), the defender
 * laying one stakes segment at the corner of its main line nearer the
 * riders: half a pace beyond the end and a pace out, laid diagonally (facing
 * half out, half to that flank). Of the placements tried (docs/v5/balance/
 * FW-01.md) this one sits across most of the riders' paths. Returns the
 * defender's result.
 */
export function runFlankStakes(seed: number, stakes: boolean): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const line = classSquad(rng, ids, 'hoplite', 6, 3, 0);
  const horse = classSquad(rng, ids, 'companion', 2, 3, 3);
  const extra = Math.round((2 * CLASSES.companion.cost) / CLASSES.hoplite.cost);
  const other = [...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'hoplite', extra, 3, 2)];
  const side: Side = (seed & 1) as Side;
  const def = (1 - side) as Side;
  const mine = armySpec([...line, ...horse], true);
  const theirs = armySpec(other, true);
  theirs.works = ALL;
  const bt = new Battle({ seed, armies: side === 0 ? [mine, theirs] : [theirs, mine] });
  if (stakes) {
    const main = bt.sideGroups(def)[0];
    const riders = bt.sideGroups(side).find((g) => bt.activeMembers(g.id).some((u) => u.stats.mount))!;
    const f = main.formation;
    // which end of the line faces the riders: the sign of their offset along the line's right
    const s = (riders.formation.cx - f.cx) * -f.fy + (riders.formation.cy - f.cy) * f.fx >= 0 ? 1 : -1;
    const p = ahead(main, s * (halfFront(bt, main) + 0.5), 1);
    bt.issue(def, { kind: 'work', type: 'stakes', x: p.x, y: p.y, fx: f.fx - f.fy * s, fy: f.fy + f.fx * s });
  }
  bt.startBattle();
  return finish(bt, def);
}

/**
 * 3 Companions charge 6 braced hoplites (both human). The hoplites hold a
 * shield wall at y 26 facing north; with `stakes`, two segments cover their
 * front STAKES_OUT paces out. Returns the damage of the riders' charge blows (a
 * rider's hit in the tick his impact lands) and the hoplites' result.
 */
export function runRidersIntoStakes(seed: number, stakes: boolean): { charge: number; win: number } {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const foot = armySpec(classSquad(rng, ids, 'hoplite', 6, 3, 0), false);
  const horse = armySpec(classSquad(rng, ids, 'companion', 3, 3, 0), false);
  foot.works = ALL;
  const bt = new Battle({ seed, armies: [foot, horse] });
  bt.issue(0, { kind: 'form', group: 0, cx: 12, cy: 26, fx: 0, fy: -1, frontage: 6, type: 'shieldwall' });
  bt.issue(1, { kind: 'form', group: 4, cx: 12, cy: 8, fx: 0, fy: 1, frontage: 3 });
  if (stakes) {
    bt.issue(0, { kind: 'work', type: 'stakes', x: 10.5, y: 26 - STAKES_OUT, fx: 0, fy: -1 });
    bt.issue(0, { kind: 'work', type: 'stakes', x: 13.5, y: 26 - STAKES_OUT, fx: 0, fy: -1 });
  }
  bt.startBattle();
  bt.issue(1, { kind: 'order', group: 4, order: 'charge' });
  const riders = new Set(bt.units.filter((u) => u.side === 1).map((u) => u.id));
  let charge = 0;
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    bt.step();
    const ev = bt.drainEvents();
    // a charge blow: a rider's hit in the tick his impact lands
    const impacts = new Set(ev.filter((e) => e.type === 'impact' && riders.has(e.by)).map((e) => (e as { by: number }).by));
    for (const e of ev) if (e.type === 'hit' && impacts.has(e.by) && !e.ranged) charge += e.dmg;
  }
  return { charge, win: bt.winner === 0 ? 1 : bt.winner === -1 ? 0.5 : 0 };
}

/**
 * 6 hoplites (human, holding in line at y 26) against `n` Celtic swordsmen
 * (human, charging from tick 20). With `ditch`, two segments lie 2 paces in
 * front of the hoplites. Returns the hoplites' result.
 */
export function runDitchLine(seed: number, ditch: boolean, n = 7): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const foot = armySpec(classSquad(rng, ids, 'hoplite', 6, 3, 0), false);
  const blades = armySpec(classSquad(rng, ids, 'celt_sword', n, 3, 0), false);
  foot.works = ALL;
  const bt = new Battle({ seed, armies: [foot, blades] });
  bt.issue(0, { kind: 'form', group: 0, cx: 12, cy: 26, fx: 0, fy: -1, frontage: 6, type: 'line' });
  bt.issue(1, { kind: 'form', group: 4, cx: 12, cy: 10, fx: 0, fy: 1, frontage: n });
  if (ditch) {
    bt.issue(0, { kind: 'work', type: 'ditch', x: 10.5, y: 24, fx: 0, fy: -1 });
    bt.issue(0, { kind: 'work', type: 'ditch', x: 13.5, y: 24, fx: 0, fy: -1 });
  }
  bt.startBattle();
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    if (bt.tick === 20) bt.issue(1, { kind: 'order', group: 4, order: 'charge' });
    bt.step();
  }
  return bt.winner === 0 ? 1 : bt.winner === -1 ? 0.5 : 0;
}

/** The reference army's three works: a ditch across the main line's centre and stakes on both wings, 2 paces out. */
export function referenceWorks(b: Battle, side: Side): Order[] {
  const main = b.sideGroups(side)[0];
  const f = main.formation;
  const w = Math.max(3, halfFront(b, main) + 1);
  return [
    { kind: 'work', type: 'ditch', ...ahead(main, 0), fx: f.fx, fy: f.fy },
    { kind: 'work', type: 'stakes', ...ahead(main, -w), fx: f.fx, fy: f.fy },
    { kind: 'work', type: 'stakes', ...ahead(main, w), fx: f.fx, fy: f.fy },
  ];
}

/**
 * balance.ts's matched battle with or without the three works: the player
 * holds its deployment (`passive`, the passive row) or is bot-driven (the
 * matched row). Returns the player's result.
 */
export function runReferenceWorks(seed: number, works: boolean, passive = true): number {
  const ids = { nextId: 1 };
  const heroes = standardArmy(new Rng(seed), ids);
  const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), ids, heroes, 0).heroes;
  const mine = armySpec(heroes, !passive);
  mine.works = ALL;
  const b = new Battle({ seed, armies: [mine, armySpec(enemy, true)] });
  if (works) for (const o of referenceWorks(b, 0)) b.issue(0, o);
  b.startBattle();
  return finish(b, 0);
}

const rate = (n: number, f: (seed: number) => number, base: number) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += f(base + i);
  return s / n;
};

/** `n` = seeds per row. */
export function worksRows(n: number): BalanceRow[] {
  const rows: BalanceRow[] = [];
  const f0 = rate(n, (s) => runFlankStakes(s, false), 4000);
  const f1 = rate(n, (s) => runFlankStakes(s, true), 4000);
  rows.push({ label: 'Flank, no stakes: defender wins', measured: pct(f0), target: '-' });
  rows.push({ label: 'Flank, 1 stakes on the threatened flank', measured: pct(f1), target: '-' });
  rows.push({ label: 'Stakes on the threatened flank: gain', measured: pts(f1 - f0), target: '+10..+15 pts' });

  const k = Math.max(20, Math.round(n / 2));
  let c0 = 0;
  let c1 = 0;
  let w1 = 0;
  for (let i = 0; i < k; i++) {
    c0 += runRidersIntoStakes(4500 + i, false).charge;
    const r = runRidersIntoStakes(4500 + i, true);
    c1 += r.charge;
    w1 += r.win;
  }
  rows.push({ label: `Riders into stakes: charge damage (${k} seeds)`, measured: c0 > 0 ? `${Math.round((100 * (c1 - c0)) / c0)}%` : '-', target: '<= -80%' });
  rows.push({ label: `Riders into stakes: hoplites win (${k} seeds)`, measured: pct(w1 / k), target: '100%' });

  for (const blades of [6, 7]) {
    const d0 = rate(n, (s) => runDitchLine(s, false, blades), 4700);
    const d1 = rate(n, (s) => runDitchLine(s, true, blades), 4700);
    rows.push({ label: `Ditch vs ${blades} swordsmen: defender, no ditch`, measured: pct(d0), target: '-' });
    // the even fight (7) is the target row (V5-065); 6 vs 6 starts at the defender's ceiling
    rows.push({ label: `Ditch vs ${blades} swordsmen: gain`, measured: pts(d1 - d0), target: blades === 7 ? '+6..+12 pts' : '(info: ceiling)' });
  }

  for (const passive of [true, false]) {
    const r0 = rate(n, (s) => runReferenceWorks(s, false, passive), passive ? 5000 : 1000);
    const r1 = rate(n, (s) => runReferenceWorks(s, true, passive), passive ? 5000 : 1000);
    const how = passive ? 'holding' : 'bot-driven';
    rows.push({ label: `Reference ${how}, no works: player wins`, measured: pct(r0), target: '-' });
    rows.push({ label: `Reference ${how}, 3 works: player wins`, measured: pct(r1), target: '<= 62%' });
  }
  return rows;
}
