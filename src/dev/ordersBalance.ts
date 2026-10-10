/**
 * Orders balance (headless): the rows of design/gdd/formations-orders.md
 * "Balance targets" (face, focus fire, the orb, feint, cohesion, army break).
 * `npm run balance` prints them; FO-01, FO-02 and FO-03 fill them in.
 *
 * FO-01 rows:
 *  - flank vs face: 6 hoplites + 2 Companions (bot) vs the same cost in
 *    hoplites (bot) whose reserve answers the riders with `face`. The same
 *    battle without the face answer is printed for reference.
 *  - focus on slingers: 6 hoplites + 6 archers (held, shooting at will) vs
 *    6 hoplites + 6 slingers in reserve (bot). Time until half the slingers
 *    are down or running, focused on the slingers vs nearest-target fire.
 *
 * FO-02 rows:
 *  - orb vs riders: the flank battle above, but every defender group a rider
 *    threatens from off its facing forms an orb. Defender win rate.
 *  - orb vs a flank-and-rear attack (runOrbRear) and vs an equal line,
 *    frontal (runOrbVsLine), each against the same army holding in line.
 *  - feint bait: 8 hoplites + 4 peltasts (human, holding) vs 6 hoplites +
 *    6 Celtic swordsmen (human, the swordsmen charge the peltasts). When a
 *    swordsman closes to 5 paces the peltasts feint, or plainly withdraw
 *    (`fallback`). Win rate of the peltasts' side, feint minus withdraw.
 *
 * FO-03 rows (cohesion and army break), on balance.ts's matched battle (a
 * starting army vs its matched bot, both bot-driven), under three rule sets:
 * all on, cohesion off (army break on), and both off (the rules before FO-03):
 *  - dead fights: the share of battles with one side at 2 active men or fewer
 *    for more than 30 s, and the mean length;
 *  - the gap from a side's first group rout to its second (median, battles
 *    with a second rout; and censored at the battle's end);
 *  - the cascade: further groups of the first-routed side that rout, each
 *    within 10 s of the one before (median over battles with a rout).
 */
import { armySpec } from '../game/armySpec';
import { generateEnemyArmy } from '../game/enemy';
import { standardArmy } from '../game/heroes';
import { CLASSES } from '../data/classes';
import { Battle, RULES, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Side } from '../sim/types';
import type { BalanceRow } from './balance';
import { classSquad } from './classBalance';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * One flank battle; returns 1 if the side with cavalry won, 0.5 a draw.
 * The defender is 6 hoplites in its main group and the rest (the riders' cost
 * in hoplites) in its reserve. With `face`, every half second the reserve
 * turns to the nearest rider within 10 paces that is more than 45 degrees
 * off its facing.
 */
export function runFlankFace(seed: number, face: boolean): number {
  return runFlankAnswer(seed, face ? 'face' : 'none').win;
}

/**
 * The flank battle with the defender answering the riders by `face` (its
 * reserve), by `orb` (every group a rider threatens), or not at all.
 * Returns the flanker's result (1 win, 0.5 draw) and the battle length in s.
 */
export function runFlankAnswer(seed: number, answer: 'none' | 'face' | 'orb'): { win: number; s: number } {
  const face = answer === 'face';
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
  const bt = new Battle({ seed, armies: side === 0 ? [mine, theirs] : [theirs, mine] });
  const reserve = bt.sideGroups(def)[2].id;
  bt.startBattle();
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    if (face && bt.tick % 10 === 0) {
      const g = bt.groups[reserve];
      const f = g.formation;
      let best: { dx: number; dy: number; d: number } | null = null;
      for (const u of bt.units) {
        if (u.side === def || u.state !== 'ready' || !u.stats.mount) continue;
        const dx = u.x - f.cx;
        const dy = u.y - f.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 10 && (!best || d < best.d)) best = { dx, dy, d };
      }
      if (best && !g.routed && (best.dx * f.fx + best.dy * f.fy) / best.d < Math.SQRT1_2) {
        bt.issue(def, { kind: 'face', group: reserve, fx: best.dx, fy: best.dy });
      }
    }
    if (answer === 'orb' && bt.tick % 10 === 0) {
      for (const g of bt.sideGroups(def)) {
        const f = g.formation;
        if (g.routed || f.type === 'orb' || bt.activeMembers(g.id).length === 0) continue;
        const threat = bt.units.some((u) => {
          if (u.side === def || u.state !== 'ready' || !u.stats.mount) return false;
          const dx = u.x - f.cx;
          const dy = u.y - f.cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          return d < 8 && (dx * f.fx + dy * f.fy) / d < Math.SQRT1_2;
        });
        if (threat) bt.issue(def, { kind: 'preset', group: g.id, type: 'orb' });
      }
    }
    bt.step();
  }
  return { win: bt.winner === side ? 1 : bt.winner === -1 ? 0.5 : 0, s: bt.tick / TICK_RATE };
}

/**
 * Orb vs line on an open field: two equal armies of 8 hoplites (both human,
 * scripted). One holds in orb, or in line for the reference; the other
 * advances in line and charges at 4 paces. Returns the holding side's result
 * (1 win, 0.5 draw).
 */
export function runOrbVsLine(seed: number, orb: boolean): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side: Side = (seed & 1) as Side;
  const other = (1 - side) as Side;
  const mine = armySpec(classSquad(rng, ids, 'hoplite', 8, 3, 0), false);
  const theirs = armySpec(classSquad(rng, ids, 'hoplite', 8, 3, 0), false);
  const bt = new Battle({ seed, armies: side === 0 ? [mine, theirs] : [theirs, mine] });
  const own = bt.sideGroups(side)[0].id;
  const foe = bt.sideGroups(other)[0].id;
  if (orb) bt.issue(side, { kind: 'preset', group: own, type: 'orb' });
  bt.startBattle();
  bt.issue(other, { kind: 'order', group: foe, order: 'advance' });
  let charged = false;
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    if (!charged && bt.tick % 5 === 0) {
      const mem = bt.activeMembers(own);
      if (bt.activeMembers(foe).some((e) => mem.some((u) => (u.x - e.x) ** 2 + (u.y - e.y) ** 2 < 16))) {
        charged = true;
        bt.issue(other, { kind: 'order', group: foe, order: 'charge' });
      }
    }
    bt.step();
  }
  return bt.winner === side ? 1 : bt.winner === -1 ? 0.5 : 0;
}

/**
 * Orb vs a flank-and-rear attack: 8 hoplites holding (in orb, or in line for
 * the reference) are attacked by 8 hoplites, 5 advancing on the front and 3
 * charging the rear. Both human, scripted. Returns the defender's result.
 */
export function runOrbRear(seed: number, orb: boolean): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const att = armySpec([...classSquad(rng, ids, 'hoplite', 5, 3, 0), ...classSquad(rng, ids, 'hoplite', 3, 3, 3)], false);
  const def = armySpec(classSquad(rng, ids, 'hoplite', 8, 3, 0), false);
  const bt = new Battle({ seed, armies: [att, def] });
  bt.startBattle();
  // Teleport the groups into place (as the classic flank test does).
  const place = (side: Side, gid: number, cy: number, fy: number, frontage: number) => {
    bt.issue(side, { kind: 'form', group: gid, cx: 12, cy, fx: 0, fy, frontage });
    for (const u of bt.activeMembers(gid)) {
      const p = bt.slotPos(u);
      u.x = p.x;
      u.y = p.y;
      u.fy = fy;
    }
  };
  if (orb) bt.issue(1, { kind: 'preset', group: 4, type: 'orb' });
  place(1, 4, 16, 1, 8);
  place(0, 0, 23, -1, 5);
  place(0, 3, 8, 1, 3);
  bt.issue(0, { kind: 'order', group: 0, order: 'advance' });
  bt.issue(0, { kind: 'order', group: 3, order: 'charge' });
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) bt.step();
  return bt.winner === 1 ? 1 : bt.winner === -1 ? 0.5 : 0;
}

/**
 * The feint bait: 8 hoplites + 4 peltasts in front (side A, holding) vs
 * 6 hoplites (advancing) + 6 Celtic swordsmen charging the peltasts (side B),
 * both scripted. When a swordsman comes within 5 paces of a peltast, the
 * peltasts feint, or plainly withdraw. Returns side A's result (1 win, 0.5 draw).
 */
export function runFeintBait(seed: number, feint: boolean): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const a = armySpec([...classSquad(rng, ids, 'hoplite', 8, 3, 0), ...classSquad(rng, ids, 'peltast', 4, 3, 3)], false);
  const b = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'celt_sword', 6, 3, 3)], false);
  const sa: Side = (seed & 1) as Side;
  const sb = (1 - sa) as Side;
  const bt = new Battle({ seed, armies: sa === 0 ? [a, b] : [b, a] });
  const aMain = bt.sideGroups(sa)[0].id;
  const aPelt = bt.sideGroups(sa)[3].id;
  const bMain = bt.sideGroups(sb)[0].id;
  const bSword = bt.sideGroups(sb)[3].id;
  const fa = bt.groups[aMain].formation;
  const fwd = fa.fy; // side A's forward along y
  bt.issue(sa, { kind: 'form', group: aMain, cx: bt.width / 2, cy: fa.cy, fx: 0, fy: fwd, frontage: 8 });
  bt.issue(sa, { kind: 'form', group: aPelt, cx: bt.width / 2, cy: fa.cy + fwd * 4, fx: 0, fy: fwd, frontage: 4 });
  const fb = bt.groups[bMain].formation;
  bt.issue(sb, { kind: 'form', group: bMain, cx: bt.width / 2 + 3, cy: fb.cy, fx: 0, fy: -fwd, frontage: 6 });
  bt.issue(sb, { kind: 'form', group: bSword, cx: bt.width / 2 - 3, cy: fb.cy, fx: 0, fy: -fwd, frontage: 6 });
  bt.startBattle();
  bt.issue(sa, { kind: 'loose', group: aPelt, on: true });
  bt.issue(sb, { kind: 'order', group: bSword, order: 'charge' });
  bt.issue(sb, { kind: 'order', group: bMain, order: 'advance' });
  let sprung = false;
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    if (!sprung && bt.tick % 5 === 0) {
      const pelts = bt.activeMembers(aPelt);
      const close = bt.activeMembers(bSword).some((s) => pelts.some((p) => (p.x - s.x) ** 2 + (p.y - s.y) ** 2 < 25));
      if (close) {
        sprung = true;
        bt.issue(sa, { kind: 'order', group: aPelt, order: feint ? 'feint' : 'fallback' });
      }
    }
    bt.step();
  }
  return bt.winner === sa ? 1 : bt.winner === -1 ? 0.5 : 0;
}

/**
 * Seconds until the slingers are silenced: half of them (3 of 6) down or
 * running. A battle that ends first counts as the time limit (censored).
 * The archers' side (6 hoplites + 6 archers) is human: it holds and shoots
 * at will, focused on the slingers or not. The bot keeps its slingers in its
 * reserve, behind its 6 hoplites, so the nearest man is usually a hoplite.
 */
export function runFocusSlingers(seed: number, focus: boolean): number {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'archer', 6, 3, 1)], false);
  const theirs = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'slinger', 6, 3, 2)], true);
  const side: Side = (seed & 1) as Side;
  const bt = new Battle({ seed, armies: side === 0 ? [mine, theirs] : [theirs, mine] });
  const own = bt.sideGroups(side)[1].id;
  const slingers = bt.sideGroups((1 - side) as Side)[2].id;
  bt.startBattle();
  bt.issue(side, { kind: 'loose', group: own, on: true });
  if (focus) bt.issue(side, { kind: 'focus', group: own, target: slingers });
  for (let i = 0; i < bt.timeLimitTicks + 10 && bt.phase !== 'ended'; i++) {
    bt.step();
    if (bt.activeMembers(slingers).length <= 3) return bt.tick / TICK_RATE;
  }
  return bt.timeLimitTicks / TICK_RATE;
}

/** `n` = seeds per row. */
export function ordersRows(n: number): BalanceRow[] {
  const k = Math.max(4, n);
  let plain = 0;
  let faced = 0;
  let orbed = 0;
  for (let i = 0; i < k; i++) {
    const p = runFlankAnswer(21000 + i, 'none');
    const o = runFlankAnswer(21000 + i, 'orb');
    plain += p.win;
    faced += runFlankFace(21000 + i, true);
    orbed += o.win;
  }
  let orbLine = 0;
  let lineLine = 0;
  let orbRear = 0;
  let lineRear = 0;
  let baitF = 0;
  let baitW = 0;
  for (let i = 0; i < k; i++) {
    orbLine += runOrbVsLine(23000 + i, true);
    lineLine += runOrbVsLine(23000 + i, false);
    orbRear += runOrbRear(25000 + i, true);
    lineRear += runOrbRear(25000 + i, false);
    baitF += runFeintBait(24000 + i, true);
    baitW += runFeintBait(24000 + i, false);
  }
  const nearest: number[] = [];
  const focused: number[] = [];
  for (let i = 0; i < k; i++) {
    nearest.push(runFocusSlingers(22000 + i, false));
    focused.push(runFocusSlingers(22000 + i, true));
  }
  // Most nearest-fire battles never silence the slingers, so the medians sit
  // on the time limit: compare mean times, censored at the limit.
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const limit = Math.max(...nearest, ...focused);
  const share = (xs: number[]) => pct(xs.filter((x) => x < limit).length / xs.length);
  const mN = mean(nearest);
  const mF = mean(focused);
  return [
    { label: 'Flank, defender reserve answers with face', measured: pct(faced / k), target: 'flanker >= 52%' },
    { label: 'Flank, same battle without face (reference)', measured: pct(plain / k), target: '-' },
    { label: 'Orb vs riders: flank answered with orb, defender wins', measured: pct(1 - orbed / k), target: '>= 55%' },
    { label: 'Orb vs flank-and-rear attack: defender wins', measured: pct(orbRear / k), target: '55-70%' },
    { label: 'Same attack on a line (reference)', measured: pct(lineRear / k), target: '-' },
    { label: 'Orb vs equal line, frontal: orb side wins', measured: pct(orbLine / k), target: '20-35%' },
    { label: 'Same army holding in line (reference)', measured: pct(lineLine / k), target: '-' },
    { label: 'Feint bait: peltasts side wins, feint / withdraw', measured: `${pct(baitF / k)}/${pct(baitW / k)}`, target: '-' },
    { label: 'Feint bait gain over a plain withdraw', measured: `${Math.round(((baitF - baitW) / k) * 100)} pts`, target: '>= 8 pts' },
    { label: 'Slingers silenced, nearest fire (share)', measured: share(nearest), target: '-' },
    { label: 'Slingers silenced, focus fire (share)', measured: share(focused), target: '-' },
    { label: 'Slingers silenced, nearest / focus (mean s)', measured: `${mN.toFixed(0)}/${mF.toFixed(0)}`, target: '-' },
    { label: 'Focus silences slingers sooner by', measured: pct(mN > 0 ? 1 - mF / mN : 0), target: '>= 30%' },
    ...cohesionRows(k),
  ];
}

/** Which FO-03 rules a harness battle runs with. */
export type CohesionRules = 'on' | 'noCohesion' | 'off';

/** Run `fn` with the FO-03 knobs switched off as `rules` says, then restore them. */
function withCohesionRules<T>(rules: CohesionRules, fn: () => T): T {
  const saved = { cohesionSelf: RULES.cohesionSelf, cohesionNear: RULES.cohesionNear, armyBreakShare: RULES.armyBreakShare };
  if (rules !== 'on') {
    RULES.cohesionSelf = 0;
    RULES.cohesionNear = 0;
  }
  if (rules === 'off') RULES.armyBreakShare = 0; // no side is ever at or under 0 active men while it fights
  try {
    return fn();
  } finally {
    Object.assign(RULES, saved);
  }
}

export interface DeadFight {
  seconds: number;
  /** Longest stretch (s) with one side at 2 active men or fewer while both still fight. */
  tail: number;
  /** Group routs of each side, in s. */
  routs: [number[], number[]];
  /** Side of the first group rout, -1 = none. */
  firstSide: Side | -1;
  winner: Side | -1;
}

/** balance.ts's matched battle (seed for seed), tracking the dead-fight tail and the group routs. */
export function runDeadFight(seed: number, rules: CohesionRules = 'on'): DeadFight {
  return withCohesionRules(rules, () => {
    const ids = { nextId: 1 };
    const heroes = standardArmy(new Rng(seed), ids);
    const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), ids, heroes, 0).heroes;
    const b = new Battle({ seed, armies: [armySpec(heroes, true), armySpec(enemy, true)] });
    b.startBattle();
    const routs: [number[], number[]] = [[], []];
    let firstSide: Side | -1 = -1;
    let run = 0;
    let tail = 0;
    for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) {
      b.step();
      for (const e of b.drainEvents()) {
        if (e.type !== 'rout') continue;
        if (firstSide < 0) firstSide = e.side;
        routs[e.side].push(e.tick / TICK_RATE);
      }
      const act = [0, 0];
      for (const u of b.units) if (u.state === 'ready') act[u.side]++;
      run = act[0] > 0 && act[1] > 0 && Math.min(act[0], act[1]) <= 2 ? run + 1 : 0;
      tail = Math.max(tail, run);
    }
    return { seconds: b.tick / TICK_RATE, tail: tail / TICK_RATE, routs, firstSide, winner: b.winner ?? -1 };
  });
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** First-to-second group rout gap of the side that routed first: [gap or null, gap censored at the end]. */
function routGap(r: DeadFight): [number | null, number] | null {
  if (r.firstSide === -1) return null;
  const xs = r.routs[r.firstSide];
  return xs.length > 1 ? [xs[1] - xs[0], xs[1] - xs[0]] : [null, r.seconds - xs[0]];
}

/** Further groups of the first-routed side that rout, each within 10 s of the one before. */
function cascade(r: DeadFight): number {
  if (r.firstSide === -1) return 0;
  const xs = r.routs[r.firstSide];
  let n = 0;
  for (let i = 1; i < xs.length && xs[i] - xs[i - 1] <= 10; i++) n++;
  return n;
}

/** The FO-03 rows; `n` = seeds per rule set (balance.ts's matched seeds, 1000 + i). */
export function cohesionRows(n: number): BalanceRow[] {
  const sets = (['on', 'noCohesion', 'off'] as const).map((rules) => Array.from({ length: n }, (_, i) => runDeadFight(1000 + i, rules)));
  const [on, noCoh, off] = sets;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const dead = (rs: DeadFight[]) => rs.filter((r) => r.tail > 30).length / rs.length;
  const len = (rs: DeadFight[]) => mean(rs.map((r) => r.seconds));
  const gaps = (rs: DeadFight[]) => rs.map(routGap).filter((g): g is [number | null, number] => g !== null);
  const seen = (rs: DeadFight[]) => median(gaps(rs).flatMap(([g]) => (g === null ? [] : [g])));
  const cens = (rs: DeadFight[]) => median(gaps(rs).map(([, c]) => c));
  const second = (rs: DeadFight[]) => gaps(rs).filter(([g]) => g !== null).length;
  const shrink = (a: number, b: number) => pct(b > 0 ? 1 - a / b : 0);
  const routed = (rs: DeadFight[]) => rs.filter((r) => r.firstSide >= 0);
  const casc = (rs: DeadFight[]) => routed(rs).map(cascade);
  const f1 = (x: number) => x.toFixed(1);
  return [
    { label: 'Dead fights (a side <= 2 men for > 30 s), on / off', measured: `${pct(dead(on))}/${pct(dead(off))}`, target: '<= 2%' },
    { label: 'Mean length, on / off (s)', measured: `${f1(len(on))}/${f1(len(off))}`, target: `within 10% (${pct(len(on) / len(off) - 1)})` },
    { label: 'Player win, on / off', measured: `${pct(on.filter((r) => r.winner === 0).length / n)}/${pct(off.filter((r) => r.winner === 0).length / n)}`, target: '45-55%' },
    { label: 'First-to-second rout gap, cohesion on / off (s)', measured: `${f1(seen(on))}/${f1(seen(noCoh))}`, target: '-' },
    { label: '  battles with a second rout, on / off', measured: `${second(on)}/${second(noCoh)}`, target: '-' },
    { label: 'Rout gap shrinks with cohesion (median)', measured: shrink(seen(on), seen(noCoh)), target: '20-40%' },
    { label: 'Same, censored at the battle end', measured: shrink(cens(on), cens(noCoh)), target: '(info)' },
    { label: 'Cascade: more groups routing, median / max', measured: `${median(casc(on))}/${Math.max(0, ...casc(on))}`, target: '<= 2 (median)' },
    { label: '  share of routs with a cascade over 2, on / off', measured: `${pct(casc(on).filter((c) => c > 2).length / Math.max(1, routed(on).length))}/${pct(casc(noCoh).filter((c) => c > 2).length / Math.max(1, routed(noCoh).length))}`, target: '-' },
  ];
}
