/**
 * CT-01: the turn knob sends `face` in battle and keeps the order
 * (controls.md R2.2, formations-orders.md R1); in deployment it still sends
 * `form`. An integration test from the drag gesture to the sim.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { dragOrder, dragPath, type DragGroup } from '../src/ui/dragFormation';
import type { BattleSetup, Order } from '../src/sim/types';

function setup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = () => armySpec(classSquad(rng, ids, 'hoplite', 6, 3, 0), false);
  return { seed, armies: [side(), side()] };
}

/** The selected group as the scene hands it to the drag (anchor, facing, frontage, men). */
function dragGroup(b: Battle, gid: number, battle: boolean): DragGroup {
  const g = b.groups[gid];
  const f = g.formation;
  const slots = b.groupSlots(gid);
  const n = slots.length;
  // in battle the turn pivots on the anchor, as the sim's `face` does
  if (battle) return { cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, frontage: f.frontage, n };
  return { cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, frontage: f.frontage, n, px: slots.reduce((a, q) => a + q.x, 0) / n, py: slots.reduce((a, q) => a + q.y, 0) / n };
}

/** Drag the knob (3 paces ahead) round to the right of the anchor. */
function turnRight(g: DragGroup): [number, number][] {
  const kx = g.cx + g.fx * 3;
  const ky = g.cy + g.fy * 3;
  return [
    [kx, ky],
    [g.cx + 1.5, g.cy - 1.5],
    [g.cx + 3, g.cy],
  ];
}

function charging(): Battle {
  const b = new Battle(setup(11));
  b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 30, fx: 0, fy: -1, frontage: 3 });
  b.issue(1, { kind: 'form', group: 4, cx: 12, cy: 2, fx: 0, fy: 1, frontage: 3 });
  b.startBattle();
  b.issue(0, { kind: 'order', group: 0, order: 'charge' });
  for (let i = 0; i < 5; i++) b.step();
  return b;
}

describe('the knob in battle sends face (controls.md R2.2)', () => {
  it('a knob drag during a charge issues face, and the charge continues', () => {
    const b = charging();
    const g = b.groups[0];
    const plan = dragPath('turn', dragGroup(b, 0, true), turnRight(dragGroup(b, 0, true)))!;
    const o = dragOrder(plan, b.phase);
    expect(o).toEqual({ kind: 'face', group: -1, fx: 1, fy: 0 });
    b.issue(0, { ...o, group: 0 } as Order);
    expect(g.order).toBe('charge');
    for (let i = 0; i < 2 * TICK_RATE; i++) b.step();
    expect(g.order).toBe('charge');
    expect(g.formation.fx).toBeCloseTo(1, 3);
    expect(b.orderLog.at(-1)?.order.kind).toBe('face');
  });

  it('a move drag in battle is still a form', () => {
    const b = charging();
    const fr = dragGroup(b, 0, true);
    const plan = dragPath('move', fr, [
      [fr.cx, fr.cy],
      [fr.cx + 4, fr.cy],
    ])!;
    expect(dragOrder(plan, b.phase)).toMatchObject({ kind: 'form', cx: fr.cx + 4, cy: fr.cy, fx: 0, fy: -1 });
  });

  it('in deployment the knob sends form (deploy orders must commute in duels)', () => {
    const b = new Battle(setup(12));
    const fr = dragGroup(b, 0, false);
    const plan = dragPath('turn', fr, turnRight(fr))!;
    const o = dragOrder(plan, b.phase);
    expect(o.kind).toBe('form');
    expect(o).toMatchObject({ fx: 1, fy: 0, frontage: fr.frontage });
  });
});
