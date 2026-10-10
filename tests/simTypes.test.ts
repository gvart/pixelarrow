/**
 * ST-03: the sim train 2 declarations (src/sim/types.ts) change nothing until
 * their stories land. New order kinds are logged and ignored, new setup
 * fields are inert, and the new harness modules have no rows yet.
 */
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import {
  DEFAULT_DOCTRINE,
  DOCTRINE_IDS,
  GROUP_ORDERS,
  WORK_TYPES,
  WORKS_MAX,
  type BattleSetup,
  type Order,
  type SimEvent,
} from '../src/sim/types';
import { doctrineRows } from '../src/dev/doctrineBalance';
import { worksRows } from '../src/dev/worksBalance';
import { arcRows } from '../src/dev/arcBalance';
import { standardSetup } from './helpers';

/** Plays seed 99 with side 0 human: `deploy` orders before the start, `battle` orders at tick 10. */
function play(setup: BattleSetup, deploy: Order[] = [], battle: Order[] = []): Battle {
  const b = new Battle(setup);
  for (const o of deploy) b.issue(0, o);
  b.startBattle();
  for (let t = 0; t < 20 * 400 && b.phase !== 'ended'; t++) {
    if (b.tick === 10) for (const o of battle) b.issue(0, o);
    b.step();
  }
  return b;
}

const base = () => standardSetup(99, false).setup;

describe('sim train 2 declarations', () => {
  const reference = play(base());

  it('declares the doctrine, group order and works enums', () => {
    expect(DOCTRINE_IDS).toEqual(['steady', 'rush', 'hammer', 'swarm', 'fury']);
    expect(DEFAULT_DOCTRINE).toBe('steady');
    expect(GROUP_ORDERS).toContain('feint');
    expect(WORK_TYPES).toEqual(['stakes', 'ditch', 'laager']);
    expect(WORKS_MAX).toBe(3);
  });

  it.each<[string, Order]>([
    // face and focus landed in FO-01 (tests/orders.test.ts); a focus on an own group is still a no-op.
    ['focus on an own group', { kind: 'focus', group: 0, target: 3 }],
    ['work', { kind: 'work', type: 'stakes', x: 5, y: 5, fx: 0, fy: 1 }],
    ['unwork', { kind: 'unwork', x: 5, y: 5 }],
  ])('logs and ignores a %s order in battle (hash unchanged)', (_name, order) => {
    const b = play(base(), [], [order]);
    expect(b.orderLog.some((o) => o.side === 0 && o.order === order)).toBe(true);
    expect(b.hash()).toBe(reference.hash());
    expect(b.tick).toBe(reference.tick);
  });

  it('logs and ignores work and unwork in deployment (hash unchanged)', () => {
    const deploy: Order[] = [
      { kind: 'work', type: 'ditch', x: 4, y: 30, fx: 0, fy: -1 },
      { kind: 'unwork', x: 4, y: 30 },
    ];
    const b = play(base(), deploy);
    expect(b.orderLog.filter((o) => o.tick === 0 && o.side === 0).map((o) => o.order.kind)).toEqual(['work', 'unwork']);
    expect(b.hash()).toBe(reference.hash());
  });

  it('plays a setup with doctrine, works and a captain exactly like one without', () => {
    const setup = base();
    setup.armies[1].doctrine = 'fury';
    setup.armies[0].works = { stakes: 2, ditch: 1, laager: 0 };
    setup.armies[1].units[0].captain = true;
    const b = play(setup);
    expect(b.hash()).toBe(reference.hash());
    expect(b.result()).toEqual(reference.result());
  });

  it('declares the train 2 events as SimEvents', () => {
    const events = [
      { type: 'cohesion', tick: 1, side: 0, group: 2, targets: [4, 5] },
      { type: 'disordered', tick: 1, group: 3, untilTick: 61 },
      { type: 'armyBreak', tick: 1, side: 1 },
      { type: 'stakesBreak', tick: 1, unit: 7, x: 3, y: 9 },
      { type: 'standardLost', tick: 1, side: 1, unit: 8 },
    ] satisfies SimEvent[];
    expect(events.map((e) => e.type)).toEqual(['cohesion', 'disordered', 'armyBreak', 'stakesBreak', 'standardLost']);
  });

  it('the train 2 harness modules have no rows until their stories land (orders: FO-01, tests/orders.test.ts)', () => {
    expect(doctrineRows(4)).toEqual([]);
    expect(worksRows(4)).toEqual([]);
    expect(arcRows(4)).toEqual([]);
  });
});
