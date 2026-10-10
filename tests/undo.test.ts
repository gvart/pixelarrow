/**
 * CT-03: undo (design/gdd/controls.md R4). The inverse of an order, issued as
 * ordinary orders, restores the previous formation and order; the battle keeps
 * one step for UNDO_S, deployment a stack of DEPLOY_UNDO_DEPTH; a replay of the
 * log (orders and their inverses) gives the same battle.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { BattleSetup, Order, Side } from '../src/sim/types';
import { DEPLOY_UNDO_DEPTH, UNDO_S, UndoHistory, groupsOf, inverseOf } from '../src/ui/input/undo';

function setup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (cls: 'hoplite' | 'peltast') => armySpec(classSquad(rng, ids, cls, 6, 3, 0), false);
  return { seed, armies: [side('hoplite'), side('peltast')] };
}

/** Issue `o` and record its inverse, as the scene does. */
function issueWithUndo(b: Battle, h: UndoHistory, side: Side, o: Order, now: number, join = false): void {
  const inv = inverseOf(o, b);
  if (inv) h.push(inv, groupsOf(o, b), now, join);
  b.issue(side, o);
}

function undo(b: Battle, h: UndoHistory, side: Side, now: number): boolean {
  const s = h.pop(now);
  if (!s) return false;
  for (const o of s.orders) b.issue(side, o);
  return true;
}

const shape = (b: Battle, gid: number) => {
  const g = b.groups[gid];
  return { f: { ...g.formation }, order: g.order, wall: g.shieldWall, fire: g.fireAtWill, focus: g.focus ?? -1 };
};
const positions = (b: Battle, gid: number) =>
  b.units
    .filter((u) => u.group === gid)
    .map((u) => `${u.x.toFixed(4)},${u.y.toFixed(4)}`)
    .sort();

describe('deployment undo (controls.md R4.2)', () => {
  it('undoing a mis-drag puts the group back where it stood, men included', () => {
    const b = new Battle(setup(3));
    const h = new UndoHistory(DEPLOY_UNDO_DEPTH);
    const before = shape(b, 0);
    const men = positions(b, 0);
    issueWithUndo(b, h, 0, { kind: 'form', group: 0, cx: 5, cy: b.groups[0].formation.cy, fx: 1, fy: -1, frontage: 2 }, 0);
    expect(shape(b, 0)).not.toEqual(before);
    expect(undo(b, h, 0, 1)).toBe(true);
    expect(shape(b, 0)).toEqual(before);
    expect(positions(b, 0)).toEqual(men);
  });

  it('goes back up to 10 steps, oldest first out', () => {
    const b = new Battle(setup(4));
    const h = new UndoHistory(DEPLOY_UNDO_DEPTH);
    const states = [shape(b, 0)];
    const cy = b.groups[0].formation.cy;
    for (let i = 0; i < 12; i++) {
      issueWithUndo(b, h, 0, { kind: 'form', group: 0, cx: 4 + i, cy, fx: 0, fy: -1, frontage: 3 }, i);
      states.push(shape(b, 0));
    }
    expect(h.size).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(undo(b, h, 0, 100)).toBe(true);
      expect(shape(b, 0)).toEqual(states[11 - i]);
    }
    expect(undo(b, h, 0, 100)).toBe(false); // the two oldest steps fell off
  });

  it('undoes a shape preset and a group assignment (both groups get their shape back)', () => {
    const b = new Battle(setup(5));
    const h = new UndoHistory(DEPLOY_UNDO_DEPTH);
    const g0 = shape(b, 0);
    issueWithUndo(b, h, 0, { kind: 'preset', group: 0, type: 'column' }, 0);
    expect(b.groups[0].formation.type).toBe('column');
    undo(b, h, 0, 1);
    expect(shape(b, 0)).toEqual(g0);

    const a = b.groups[0];
    const c = b.groups.find((g) => g.side === 0 && !g.individual && g.id !== a.id)!;
    expect(c).toBeTruthy();
    const sa = shape(b, a.id);
    const sc = shape(b, c.id);
    const unit = b.members(a.id)[0];
    issueWithUndo(b, h, 0, { kind: 'assign', unit: unit.id, group: c.id }, 2);
    expect(b.units[unit.id].group).toBe(c.id);
    undo(b, h, 0, 3);
    expect(b.units[unit.id].group).toBe(a.id);
    expect(shape(b, a.id)).toEqual(sa);
    if (b.members(c.id).length > 0 || sc.f.frontage === 1) expect(shape(b, c.id)).toEqual(sc);
    else expect({ ...shape(b, c.id).f, frontage: 0 }).toEqual({ ...sc.f, frontage: 0 }); // an empty group keeps its place
  });
});

describe('deployment undo between two manned groups', () => {
  it('moving a man to another group and back restores both formations exactly', () => {
    const rng = new Rng(21);
    const ids = { nextId: 1 };
    const mine = [...classSquad(rng, ids, 'hoplite', 5, 3, 0), ...classSquad(rng, ids, 'peltast', 4, 3, 1)];
    const b = new Battle({ seed: 21, armies: [armySpec(mine, false), armySpec(classSquad(rng, ids, 'hoplite', 6, 3, 0), false)] });
    const h = new UndoHistory(DEPLOY_UNDO_DEPTH);
    const [a, c] = [0, 1].map((gi) => b.units.find((u) => u.side === 0 && b.groups[u.group].name === b.groups.filter((g) => g.side === 0)[gi].name)!.group);
    expect(a).not.toBe(c);
    expect(b.members(c).length).toBeGreaterThan(0);
    const fc = b.groups[c].formation;
    issueWithUndo(b, h, 0, { kind: 'form', group: c, cx: fc.cx, cy: fc.cy, fx: fc.fx, fy: fc.fy, frontage: 1 }, 0); // a hand-set frontage
    const sa = shape(b, a);
    const sc = shape(b, c);
    const unit = b.members(a)[0];
    issueWithUndo(b, h, 0, { kind: 'assign', unit: unit.id, group: c }, 1);
    expect(shape(b, c)).not.toEqual(sc);
    undo(b, h, 0, 2);
    expect(b.units[unit.id].group).toBe(a);
    expect(shape(b, a)).toEqual(sa);
    expect(shape(b, c)).toEqual(sc);
  });
});

describe('battle undo (controls.md R4.1)', () => {
  function started(): Battle {
    const b = new Battle(setup(7));
    b.startBattle();
    for (let i = 0; i < 3; i++) b.step();
    return b;
  }

  it('restores the previous formation and order after a move that reset a charge', () => {
    const b = started();
    const h = new UndoHistory(1, UNDO_S * 1000);
    b.issue(0, { kind: 'order', group: 0, order: 'charge' });
    const before = shape(b, 0);
    const f = b.groups[0].formation;
    issueWithUndo(b, h, 0, { kind: 'form', group: 0, cx: f.cx + 6, cy: f.cy + 2, fx: 1, fy: 0, frontage: 2 }, 0);
    expect(b.groups[0].order).toBe('hold'); // a big move resets the order
    expect(undo(b, h, 0, 2000)).toBe(true);
    expect(shape(b, 0).f).toEqual(before.f);
    expect(b.groups[0].order).toBe('charge');
  });

  it('restores the previous order, shooting, focus and facing', () => {
    const b = started();
    const h = new UndoHistory(1, UNDO_S * 1000);
    const before = shape(b, 0);
    issueWithUndo(b, h, 0, { kind: 'order', group: 0, order: 'advance' }, 0);
    undo(b, h, 0, 10);
    expect(shape(b, 0)).toEqual(before);

    issueWithUndo(b, h, 0, { kind: 'loose', group: 0 }, 20);
    expect(b.groups[0].fireAtWill).toBe(!before.fire);
    undo(b, h, 0, 30);
    expect(b.groups[0].fireAtWill).toBe(before.fire);

    const foe = b.groups.find((g) => g.side === 1)!.id;
    issueWithUndo(b, h, 0, { kind: 'focus', group: 0, target: foe }, 40);
    expect(b.groups[0].focus).toBe(foe);
    undo(b, h, 0, 50);
    expect(b.groups[0].focus ?? -1).toBe(-1);

    issueWithUndo(b, h, 0, { kind: 'face', group: 0, fx: 1, fy: 0 }, 60);
    undo(b, h, 0, 70);
    expect(b.groups[0].formation.fx).toBeCloseTo(before.f.fx, 9);
    expect(b.groups[0].formation.fy).toBeCloseTo(before.f.fy, 9);
  });

  it('only the last order, and only for 3 s', () => {
    const h = new UndoHistory(1, UNDO_S * 1000);
    h.push([{ kind: 'order', group: 0, order: 'hold' }], [0], 0);
    h.push([{ kind: 'order', group: 0, order: 'advance' }], [0], 500);
    expect(h.size).toBe(1);
    expect(h.peek(3400)?.orders[0]).toEqual({ kind: 'order', group: 0, order: 'advance' });
    expect(h.left(3000)).toBe(500);
    expect(h.peek(3500)).toBeNull();
    expect(h.pop(3600)).toBeNull();
  });

  it('one gesture with two orders (tap an enemy: form, then charge) undoes as one step', () => {
    const b = started();
    const h = new UndoHistory(1, UNDO_S * 1000);
    const before = shape(b, 0);
    const f = b.groups[0].formation;
    issueWithUndo(b, h, 0, { kind: 'form', group: 0, cx: f.cx, cy: f.cy - 6, fx: 0, fy: -1, frontage: f.frontage }, 0);
    issueWithUndo(b, h, 0, { kind: 'order', group: 0, order: 'charge' }, 0, true);
    expect(h.size).toBe(1);
    undo(b, h, 0, 100);
    expect(shape(b, 0)).toEqual(before);
  });

  it('abilities, retreat, horn and detach are not undoable', () => {
    const b = started();
    expect(inverseOf({ kind: 'retreat' }, b)).toBeNull();
    expect(inverseOf({ kind: 'horn' }, b)).toBeNull();
    expect(inverseOf({ kind: 'ability', unit: 0, ability: 'volley' }, b)).toBeNull();
    expect(inverseOf({ kind: 'detach', unit: 0 }, b)).toBeNull();
  });

  it('an undone order is just orders in the log: a replay reproduces the battle (online-safe)', () => {
    const run = (withUndo: boolean) => {
      const b = new Battle(setup(9));
      const h = new UndoHistory(DEPLOY_UNDO_DEPTH);
      const cy = b.groups[0].formation.cy;
      issueWithUndo(b, h, 0, { kind: 'form', group: 0, cx: 6, cy, fx: 0, fy: -1, frontage: 3 }, 0);
      if (withUndo) undo(b, h, 0, 1);
      const nDeploy = b.orderLog.length;
      b.startBattle();
      const bh = new UndoHistory(1, UNDO_S * 1000);
      for (let i = 0; i < 400 && b.phase !== 'ended'; i++) {
        if (i === 20) issueWithUndo(b, bh, 0, { kind: 'order', group: 0, order: 'charge' }, i * 50);
        if (i === 40 && withUndo) undo(b, bh, 0, i * 50);
        b.step();
      }
      return { b, log: b.orderLog.slice(), nDeploy };
    };
    for (const withUndo of [false, true]) {
      const { b, log, nDeploy } = run(withUndo);
      // the server's replay protocol (server/src/battle.ts replayBattle)
      const r = new Battle(setup(9));
      for (const o of log.slice(0, nDeploy)) r.issue(o.side, o.order);
      r.startBattle();
      const rest = log.slice(nDeploy);
      let k = 0;
      while (r.tick < b.tick && r.phase !== 'ended') {
        while (k < rest.length && rest[k].tick === r.tick) r.issue(rest[k].side, rest[k++].order);
        r.step();
      }
      expect(r.hash()).toBe(b.hash());
    }
  });
});
