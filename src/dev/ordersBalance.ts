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
    bt.step();
  }
  return bt.winner === side ? 1 : bt.winner === -1 ? 0.5 : 0;
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
  for (let i = 0; i < k; i++) {
    plain += runFlankFace(21000 + i, false);
    faced += runFlankFace(21000 + i, true);
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
    { label: 'Slingers silenced, nearest fire (share)', measured: share(nearest), target: '-' },
    { label: 'Slingers silenced, focus fire (share)', measured: share(focused), target: '-' },
    { label: 'Slingers silenced, nearest / focus (mean s)', measured: `${mN.toFixed(0)}/${mF.toFixed(0)}`, target: '-' },
    { label: 'Focus silences slingers sooner by', measured: pct(mN > 0 ? 1 - mF / mN : 0), target: '>= 30%' },
  ];
}
