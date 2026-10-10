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
 *  - flank vs orb: the flank battle above, but every defender group a rider
 *    threatens from off its facing forms an orb. Defender win rate, and the
 *    mean battle length against the same battles with no answer.
 *  - orb vs line: 6 hoplites + 4 archers holding (human) vs the same army
 *    (bot), in orb vs in line. Win rate of the holding side.
 *  - feint bait: 8 hoplites + 4 peltasts (human, holding) vs 6 hoplites +
 *    6 Celtic swordsmen (human, the swordsmen charge the peltasts). When a
 *    swordsman closes to 5 paces the peltasts feint, or plainly withdraw
 *    (`fallback`). Win rate of the peltasts' side, feint minus withdraw.
 */
import { armySpec } from '../game/armySpec';
import { CLASSES } from '../data/classes';
import { Battle, TICK_RATE } from '../sim/battle';
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
  let plainS = 0;
  let orbS = 0;
  for (let i = 0; i < k; i++) {
    const p = runFlankAnswer(21000 + i, 'none');
    const o = runFlankAnswer(21000 + i, 'orb');
    plain += p.win;
    plainS += p.s;
    faced += runFlankFace(21000 + i, true);
    orbed += o.win;
    orbS += o.s;
  }
  let orbLine = 0;
  let lineLine = 0;
  let baitF = 0;
  let baitW = 0;
  for (let i = 0; i < k; i++) {
    orbLine += runOrbVsLine(23000 + i, true);
    lineLine += runOrbVsLine(23000 + i, false);
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
    { label: 'Flank, defender answers with orb: defender wins', measured: pct(1 - orbed / k), target: '55-65%' },
    { label: 'Flank, orb answer lengthens the battle by', measured: pct(plainS > 0 ? orbS / plainS - 1 : 0), target: '>= 30%' },
    { label: 'Flank, mean length no answer / orb (s)', measured: `${(plainS / k).toFixed(0)}/${(orbS / k).toFixed(0)}`, target: '-' },
    { label: 'Orb vs equal army in line: orb side wins', measured: pct(orbLine / k), target: '35-45%' },
    { label: 'Same army holding in line (reference)', measured: pct(lineLine / k), target: '-' },
    { label: 'Feint bait: peltasts side wins, feint / withdraw', measured: `${pct(baitF / k)}/${pct(baitW / k)}`, target: '-' },
    { label: 'Feint bait gain over a plain withdraw', measured: `${Math.round(((baitF - baitW) / k) * 100)} pts`, target: '>= 8 pts' },
    { label: 'Slingers silenced, nearest fire (share)', measured: share(nearest), target: '-' },
    { label: 'Slingers silenced, focus fire (share)', measured: share(focused), target: '-' },
    { label: 'Slingers silenced, nearest / focus (mean s)', measured: `${mN.toFixed(0)}/${mF.toFixed(0)}`, target: '-' },
    { label: 'Focus silences slingers sooner by', measured: pct(mN > 0 ? 1 - mF / mN : 0), target: '>= 30%' },
  ];
}
