import { describe, expect, it } from 'vitest';
import { Battle, RULES } from '../src/sim/battle';
import { formationSlots, assignSlots, presetFrontage } from '../src/sim/formation';
import { Rng } from '../src/sim/rng';
import { duel, runToEnd, standardSetup } from './helpers';

describe('rng', () => {
  it('is deterministic', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('determinism', () => {
  it('same seed and same orders give an identical battle', () => {
    const run = () => {
      const { setup } = standardSetup(777, false);
      const b = new Battle(setup);
      b.startBattle();
      const hashes: string[] = [];
      for (let t = 0; t < 20 * 120 && b.phase !== 'ended'; t++) {
        if (b.tick === 20) b.issue(0, { kind: 'order', group: 0, order: 'advance' });
        if (b.tick === 40) b.issue(0, { kind: 'loose', group: 1, on: true });
        if (b.tick === 200) b.issue(0, { kind: 'order', group: 0, order: 'charge' });
        if (b.tick === 300) b.issue(0, { kind: 'shieldwall', group: 0 });
        b.step();
        if (b.tick % 50 === 0) hashes.push(b.hash());
      }
      return { hashes, result: JSON.stringify(b.result()), log: JSON.stringify(b.orderLog) };
    };
    const r1 = run();
    const r2 = run();
    expect(r1.hashes.length).toBeGreaterThan(5);
    expect(r1.hashes).toEqual(r2.hashes);
    expect(r1.result).toEqual(r2.result);
    expect(r1.log).toEqual(r2.log);
  });

  it('replaying the order log reproduces the outcome', () => {
    const { setup } = standardSetup(99, false);
    const a = new Battle(setup);
    a.startBattle();
    for (let t = 0; t < 1200 && a.phase !== 'ended'; t++) {
      if (a.tick === 10) a.issue(0, { kind: 'order', group: 0, order: 'advance' });
      if (a.tick === 150) a.issue(0, { kind: 'order', group: 2, order: 'charge' });
      a.step();
    }
    const humanOrders = a.orderLog.filter((o) => o.side === 0);
    const b = new Battle(standardSetup(99, false).setup);
    b.startBattle();
    for (let t = 0; t < 1200 && b.phase !== 'ended'; t++) {
      for (const o of humanOrders) if (o.tick === b.tick) b.issue(0, o.order);
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });

  it('different seeds diverge', () => {
    const a = new Battle(standardSetup(1).setup);
    const b = new Battle(standardSetup(2).setup);
    runToEnd(a, 600);
    runToEnd(b, 600);
    expect(a.hash()).not.toBe(b.hash());
  });

  it('bot vs bot battles finish with a winner', () => {
    for (const seed of [3, 4, 5]) {
      const b = new Battle(standardSetup(seed).setup);
      runToEnd(b);
      expect(b.phase).toBe('ended');
      expect(b.winner).not.toBeNull();
    }
  });
});

describe('combat rules', () => {
  it('classifies hit directions by target facing', () => {
    const b = duel(1);
    const t = b.units[1];
    t.x = 10; t.y = 10; t.fx = 0; t.fy = 1; // facing +y
    expect(b.hitDirection(t, 10, 11)).toBe('front');
    expect(b.hitDirection(t, 11, 10)).toBe('side');
    expect(b.hitDirection(t, 10, 9)).toBe('rear');
  });

  it('shields block frontal attacks but not rear ones; shield wall improves the block', () => {
    const b = duel(1);
    const t = b.units[1];
    expect(t.stats.shield).not.toBe('none');
    const front = b.blockChance(t, 'front', 0, false);
    const side = b.blockChance(t, 'side', 0, false);
    expect(front).toBeGreaterThan(0.3);
    expect(side).toBeLessThan(front);
    expect(b.blockChance(t, 'rear', 0, false)).toBe(0);
    b.groups[t.group].shieldWall = true;
    expect(b.blockChance(t, 'front', 0, false)).toBeGreaterThan(front);
  });

  it('rear attacks deal more damage and morale damage than frontal ones', () => {
    const measure = (fromRear: boolean) => {
      let hpLoss = 0;
      let moraleLoss = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const b = duel(seed);
        b.startBattle();
        const [a, t] = b.units;
        t.x = 12; t.y = 18; t.fx = 0; t.fy = 1;
        a.x = 12; a.y = fromRear ? 17 : 19; a.fx = 0; a.fy = fromRear ? 1 : -1;
        t.stats = { ...t.stats, speed: 0 }; // pinned in place, facing +y
        t.hp = 1e6; // never dies, so damage is not capped
        const hp0 = t.hp;
        for (let i = 0; i < 100; i++) {
          t.morale = 500; // never routs, so the duel keeps going
          b.step();
          moraleLoss += 500 - t.morale;
          t.fx = 0; t.fy = 1; // keep the target looking the same way
        }
        hpLoss += hp0 - t.hp;
      }
      return { hpLoss, moraleLoss };
    };
    const front = measure(false);
    const rear = measure(true);
    expect(rear.hpLoss).toBeGreaterThan(front.hpLoss * 1.5);
    expect(rear.moraleLoss).toBeGreaterThan(front.moraleLoss * 2);
    expect(RULES.dirMorale.rear).toBeGreaterThan(RULES.dirMorale.front);
  });

  it('units rout at low morale and nearby allies lose morale (cascade)', () => {
    const { setup } = standardSetup(11);
    const b = new Battle(setup);
    b.startBattle();
    const mine = b.units.filter((u) => u.side === 0);
    const victim = mine[0];
    const neighbour = mine.find((u) => u !== victim && (u.x - victim.x) ** 2 + (u.y - victim.y) ** 2 < 4)!;
    const before = neighbour.morale;
    victim.morale = 5;
    b.step();
    expect(victim.state).toBe('routing');
    expect(neighbour.morale).toBeLessThan(before);
  });

  it('routing units rally when out of danger', () => {
    const { setup } = standardSetup(12);
    const b = new Battle(setup);
    b.startBattle();
    const u = b.units.find((x) => x.side === 0)!;
    u.morale = 5;
    b.step();
    expect(u.state).toBe('routing');
    u.morale = 37;
    let rallied = false;
    for (let i = 0; i < 40; i++) {
      b.step();
      if (u.state === 'ready') rallied = true;
    }
    expect(rallied).toBe(true);
  });
});

describe('formations', () => {
  it('produces one slot per soldier, front rank first', () => {
    const f = { type: 'line' as const, cx: 10, cy: 10, fx: 0, fy: -1, frontage: 4 };
    const s = formationSlots(f, 10);
    expect(s.length).toBe(10);
    expect(s[0].y).toBe(10);
    expect(s[9].y).toBeGreaterThan(10); // rear ranks behind (facing -y)
    const wedge = formationSlots({ ...f, type: 'wedge' }, 6);
    expect(wedge.length).toBe(6);
    expect(presetFrontage('column', 12)).toBe(3);
  });

  it('assigns shielded spearmen to the front rank', () => {
    const f = { type: 'line' as const, cx: 10, cy: 10, fx: 0, fy: -1, frontage: 2 };
    const slots = formationSlots(f, 4);
    const map = assignSlots(f, [
      { id: 0, x: 10, y: 9, priority: 3 },
      { id: 1, x: 10, y: 12, priority: 0 },
      { id: 2, x: 11, y: 12, priority: 0 },
      { id: 3, x: 9, y: 9, priority: 3 },
    ], slots);
    expect(map.get(1)!.y).toBe(10);
    expect(map.get(2)!.y).toBe(10);
    expect(map.get(0)!.y).toBe(11);
  });
});
