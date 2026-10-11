/**
 * FW-01: field works in the sim (design/gdd/field-works.md R1-R3, F1, F2).
 * The new cell kinds, the `work` / `unwork` deploy orders, the ditch factor,
 * the stakes charge reset and the impale hit, and determinism.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle, RULES } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { flatGrid, type TerrainGrid } from '../src/sim/terrain';
import { HEIGHT_RULES, TERRAIN, TERRAIN_LIST, WORKS, terrainByCode } from '../src/data/terrain';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, Order, SimEvent, SimUnit, WorksAllowance } from '../src/sim/types';

const ALL: WorksAllowance = { stakes: 3, ditch: 3, laager: 3 };

/** Two human sides; each entry is [class, count, group]. */
function setupOf(seed: number, a: [ClassId, number, number][], b: [ClassId, number, number][], works?: [WorksAllowance?, WorksAllowance?]): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (spec: [ClassId, number, number][]) => armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), false);
  const s: BattleSetup = { seed, armies: [side(a), side(b)] };
  if (works?.[0]) s.armies[0].works = works[0];
  if (works?.[1]) s.armies[1].works = works[1];
  return s;
}

/** A 24 x 36 grid with some cells rewritten: [x, y, code]. */
function gridWith(cells: [number, number, string][], height?: [number, number, number][]): TerrainGrid {
  const g = flatGrid(24, 36);
  const c = g.cells.split('');
  for (const [x, y, k] of cells) c[y * 24 + x] = k;
  g.cells = c.join('');
  if (height) {
    const h = g.height!.split('');
    for (const [x, y, v] of height) h[y * 24 + x] = String(v);
    g.height = h.join('');
  }
  return g;
}

const kindAt = (b: Battle, x: number, y: number) => b.ground(x + 0.5, y + 0.5).kind;
const work = (type: 'stakes' | 'ditch' | 'laager', x: number, y: number, fx = 0, fy = -1): Order => ({ kind: 'work', type, x, y, fx, fy });

describe('cell kinds (R1)', () => {
  it('the five works have their codes and the R1 multipliers; old kinds keep their indices', () => {
    expect(TERRAIN_LIST.slice(0, 9).map((d) => d.kind)).toEqual(['open', 'scrub', 'forest', 'water', 'ford', 'rough', 'rocks', 'sand', 'sea']);
    expect(['x', 'd', 'L', 'P', 'p'].map((c) => terrainByCode(c).kind)).toEqual(['stakes', 'ditch', 'laager', 'palisade', 'rampart']);
    expect(TERRAIN.stakes).toMatchObject({ speed: 0.7, blocked: false, scatter: 0.15, blockMult: 0.9, noWall: true, braceMult: 0, cavSpeed: 0.3, cavCharge: 0, chariotSpeed: 0.2, chariotDamage: 6 });
    expect(TERRAIN.ditch).toMatchObject({ speed: 0.45, scatter: 0.3, blockMult: 1, noWall: true, cavSpeed: 0.35, cavCharge: 0.2, chariotSpeed: 0.15, chariotDamage: 5 });
    expect(TERRAIN.laager.blocked && TERRAIN.palisade.blocked).toBe(true);
    expect(TERRAIN.rampart).toMatchObject({ speed: 0.9, cover: 0.35, blockMult: 1.1, noWall: false, braceMult: 1.2, cavSpeed: 0.8, cavCharge: 0.6 });
    expect(WORKS).toMatchObject({ ditchMult: 1.05, impaleMult: 0.5, length: { stakes: 3, ditch: 3, laager: 2 }, garrisonStakes: 2 });
  });

  it('laager and palisade block like rocks: nobody walks into them', () => {
    const b = new Battle({ ...setupOf(1, [['hoplite', 1, 0]], [['hoplite', 1, 0]]), terrain: gridWith([[12, 20, 'P'], [13, 20, 'L']]) });
    expect(b.terrain!.blocked(12.5, 20.5) && b.terrain!.blocked(13.5, 20.5)).toBe(true);
    const u = b.units[0];
    u.x = 12.5;
    u.y = 21.6;
    b.moveUnit(u, 0, -1);
    expect(b.terrain!.blocked(u.x, u.y)).toBe(false);
  });
});

describe('the work order (R3)', () => {
  it('places a segment in the deployment zone, across the facing: 3 stakes, 3 ditch, 2 laager', () => {
    const b = new Battle(setupOf(1, [['hoplite', 4, 0]], [['hoplite', 4, 0]], [ALL]));
    b.issue(0, work('stakes', 10.5, 24.5)); // facing north: the segment runs east-west
    b.issue(0, work('ditch', 4.5, 28.5, 1, 0)); // facing east: north-south
    b.issue(0, work('laager', 18.5, 30.5));
    expect([9, 10, 11].map((x) => kindAt(b, x, 24))).toEqual(['stakes', 'stakes', 'stakes']);
    expect([8, 12].map((x) => kindAt(b, x, 24))).toEqual(['open', 'open']);
    expect([27, 28, 29].map((y) => kindAt(b, 4, y))).toEqual(['ditch', 'ditch', 'ditch']);
    expect([18, 19].map((x) => kindAt(b, x, 30))).toEqual(['laager', 'laager']);
    expect(b.works().map((w) => w.type)).toEqual(['stakes', 'ditch', 'laager']);
    expect(b.worksLog).toEqual([]);
  });

  it('a diagonal facing gives a diagonal segment', () => {
    const b = new Battle(setupOf(1, [['hoplite', 2, 0]], [['hoplite', 2, 0]], [ALL]));
    b.issue(0, work('stakes', 12.5, 28.5, 1, -1));
    expect(b.works()[0].cells.map((i) => [i % 24, Math.floor(i / 24)])).toEqual([[11, 27], [12, 28], [13, 29]]);
  });

  it('refuses and logs: outside the deployment phase, outside the zone, over the allowance, on bad ground, over another work', () => {
    const b = new Battle({ ...setupOf(1, [['hoplite', 4, 0]], [['hoplite', 4, 0]], [{ stakes: 1, ditch: 0, laager: 0 }]), terrain: gridWith([[3, 30, 'f']]) });
    b.issue(0, work('stakes', 12.5, 14.5)); // the enemy's half
    b.issue(0, work('ditch', 12.5, 28.5)); // no ditch allowance
    b.issue(0, work('stakes', 3.5, 30.5)); // forest under it
    b.issue(0, work('stakes', 0.5, 30.5)); // off the grid at the west edge
    b.issue(1, work('stakes', 12.5, 6.5)); // side 1 has no allowance
    b.issue(0, work('stakes', 12.5, 28.5)); // valid
    b.issue(0, work('stakes', 15.5, 28.5)); // allowance spent
    expect(b.worksLog.map((l) => `${l.side}:${l.reason}`)).toEqual(['0:zone', '0:allowance', '0:ground', '0:bounds', '1:allowance', '0:allowance']);
    expect(b.works()).toHaveLength(1);
    // every order is still in the log, so a replay refuses the same ones
    expect(b.orderLog.filter((o) => o.order.kind === 'work')).toHaveLength(7);
    const c = new Battle(setupOf(1, [['hoplite', 2, 0]], [['hoplite', 2, 0]], [ALL]));
    c.issue(0, work('stakes', 12.5, 28.5));
    c.issue(0, work('ditch', 13.5, 28.5)); // overlaps the stakes
    c.startBattle();
    c.issue(0, work('ditch', 12.5, 31.5)); // battle phase
    c.issue(0, { kind: 'unwork', x: 12.5, y: 28.5 });
    expect(c.worksLog.map((l) => `${l.kind}:${l.reason}`)).toEqual(['work:occupied', 'work:phase', 'unwork:phase']);
    expect(kindAt(c, 12, 28)).toBe('stakes');
  });

  it('caps a side at WORKS_MAX segments whatever the allowance', () => {
    const b = new Battle(setupOf(1, [['hoplite', 2, 0]], [['hoplite', 2, 0]], [ALL]));
    for (const y of [23, 25, 27, 29]) b.issue(0, work('stakes', 12.5, y + 0.5));
    expect(b.works()).toHaveLength(3);
    expect(b.worksLog.map((l) => l.reason)).toEqual(['allowance']);
  });

  it('unwork removes the segment, restores the ground and frees the allowance', () => {
    const b = new Battle({ ...setupOf(1, [['hoplite', 2, 0]], [['hoplite', 2, 0]], [{ stakes: 1, ditch: 0, laager: 0 }]), terrain: gridWith([[11, 28, ',']]) });
    b.issue(0, work('stakes', 12.5, 28.5));
    expect(kindAt(b, 11, 28)).toBe('stakes');
    b.issue(1, { kind: 'unwork', x: 12.5, y: 28.5 }); // not side 1's
    expect(b.worksLog.map((l) => l.reason)).toEqual(['none']);
    b.issue(0, { kind: 'unwork', x: 13.5, y: 28.5 });
    expect([kindAt(b, 11, 28), kindAt(b, 12, 28), kindAt(b, 13, 28)]).toEqual(['scrub', 'open', 'open']);
    expect(b.works()).toHaveLength(0);
    b.issue(0, work('stakes', 12.5, 30.5));
    expect(b.works()).toHaveLength(1);
  });

  it('a laager under a deployed man moves him off it', () => {
    const b = new Battle(setupOf(1, [['hoplite', 4, 0]], [['hoplite', 2, 0]], [ALL]));
    const u = b.units[0];
    b.issue(0, work('laager', u.x, u.y));
    expect(b.terrain!.blocked(u.x, u.y)).toBe(false);
  });
});

/** Two men, placed after the battle starts; returns the hit event of one blow by a on t. */
function blow(terrain: TerrainGrid, a: [number, number], t: [number, number], seed = 3): number {
  const b = new Battle({ ...setupOf(seed, [['celt_sword', 1, 0]], [['celt_sword', 1, 0]]), terrain });
  b.startBattle();
  const [u, v] = b.units;
  [u.x, u.y] = a;
  [v.x, v.y] = t;
  u.fx = 0;
  u.fy = -1;
  v.fx = 0;
  v.fy = 1;
  v.stats.shield = 'none'; // no block roll changes the stream between the two fields
  for (let i = 0; i < 40; i++) {
    (b as unknown as { meleeAttack(a: SimUnit, t: SimUnit): void }).meleeAttack(u, v);
    const hit = b.drainEvents().find((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit');
    if (hit) return hit.dmg;
  }
  throw new Error('no hit');
}

describe('the ditch factor (R2.1, F1)', () => {
  const lip: [number, number] = [12.5, 20.6];
  const pit: [number, number] = [12.5, 19.6];
  it('a blow from the lip on a man in a ditch does x DITCH_MULT (1.05, V5-065)', () => {
    const open = blow(flatGrid(24, 36), lip, pit);
    const ditch = blow(gridWith([[12, 19, 'd']]), lip, pit);
    expect(ditch / open).toBeCloseTo(WORKS.ditchMult, 6);
  });

  it('no factor when both men are in the ditch, or the striker is', () => {
    const open = blow(flatGrid(24, 36), lip, pit);
    expect(blow(gridWith([[12, 19, 'd'], [12, 20, 'd']]), lip, pit) / open).toBeCloseTo(1, 6);
    expect(blow(gridWith([[12, 20, 'd']]), lip, pit) / open).toBeCloseTo(1, 6);
  });

  it('does not stack with height: the larger applies', () => {
    const open = blow(flatGrid(24, 36), lip, pit);
    // two levels up: 1.5 beats 1.2
    expect(blow(gridWith([[12, 19, 'd']], [[12, 20, 2]]), lip, pit) / open).toBeCloseTo(1 + 2 * HEIGHT_RULES.meleeDown, 6);
    // one level up: 1.25 beats 1.05
    expect(blow(gridWith([[12, 19, 'd']], [[12, 20, 1]]), lip, pit) / open).toBeCloseTo(1 + HEIGHT_RULES.meleeDown, 6);
    // striking uphill into a raised ditch: 1.05 beats 0.8
    expect(blow(gridWith([[12, 19, 'd']], [[12, 19, 1]]), lip, pit) / open).toBeCloseTo(WORKS.ditchMult, 6);
  });
});

/** One rider (or a man) on side 0, run north over a stakes row at y 20. */
function intoStakes(cls: ClassId, seed = 5) {
  const b = new Battle({ ...setupOf(seed, [[cls, 1, 0]], [['hoplite', 1, 0]]), terrain: gridWith([[12, 20, 'x']]) });
  b.startBattle();
  const [u, foe] = b.units;
  foe.x = 2;
  foe.y = 2;
  u.x = 12.5;
  u.y = 21.2;
  u.fx = 0;
  u.fy = -1;
  const events: SimEvent[] = [];
  const at = (y: number, momentum = RULES.chargeMomentumTicks, spd = 0) => {
    u.y = y;
    u.momentum = momentum;
    if (u.stats.mount) u.spd = spd;
    (b as unknown as { crossStakes(): void }).crossStakes();
    events.push(...b.drainEvents());
  };
  return { b, u, events, at };
}

describe('stakes (R2.2, F2)', () => {
  it('a charge entering stakes loses its momentum and sends one stakesBreak per crossing', () => {
    const { u, events, at } = intoStakes('celt_sword');
    at(21.2);
    expect(u.momentum).toBe(RULES.chargeMomentumTicks);
    at(20.5);
    expect(u.momentum).toBe(0);
    at(20.3); // still in them: no momentum, no second event
    expect(u.momentum).toBe(0);
    at(19.4); // out the other side: the charge builds again
    expect(u.momentum).toBe(RULES.chargeMomentumTicks);
    at(20.5); // a second crossing
    const br = events.filter((e) => e.type === 'stakesBreak');
    expect(br).toHaveLength(2);
    expect(br[0]).toMatchObject({ unit: u.id, x: 12.5, y: 20.5 });
  });

  it('a man walking in (no charge) loses what momentum he had but sends no event', () => {
    const { u, events, at } = intoStakes('celt_sword');
    at(20.5, 5);
    expect(u.momentum).toBe(0);
    expect(events.filter((e) => e.type === 'stakesBreak')).toHaveLength(0);
  });

  it('a rider entering is impaled for half his own charge blow, once per crossing, and pulled up', () => {
    const { u, at } = intoStakes('companion');
    const top = u.stats.speed * 2; // any gallop: the blow uses his speed ratio, clamped
    const hp0 = u.hp;
    at(20.5, RULES.chargeMomentumTicks, 99);
    const blowDmg = u.stats.dmg * (RULES.chargeImpact + u.stats.chargeBonus * 0.6 * 1.15);
    const expected = Math.max(0.5, (blowDmg * WORKS.impaleMult * RULES.damageScale * RULES.armorK) / (RULES.armorK + u.stats.armor));
    expect(hp0 - u.hp).toBeCloseTo(expected, 9);
    expect(u.spd).toBeLessThan(top);
    const hp1 = u.hp;
    at(20.3, 0, u.spd);
    expect(u.hp).toBe(hp1);
  });

  it('beasts ignore stakes (no reset, no impale)', () => {
    const { u, events, at } = intoStakes('celt_sword');
    u.stats.kind = 'animal';
    const hp0 = u.hp;
    at(20.5);
    expect(u.momentum).toBe(RULES.chargeMomentumTicks);
    expect(u.hp).toBe(hp0);
    expect(events).toHaveLength(0);
  });
});

/** A whole battle with works placed in deployment by side 0; returns the hash and the events. */
function playWorks(seed: number, orders: Order[]) {
  const s = setupOf(seed, [['hoplite', 6, 0], ['archer', 3, 1]], [['companion', 3, 0], ['celt_sword', 5, 1]], [ALL]);
  s.armies[1].bot = true;
  const b = new Battle(s);
  for (const o of orders) b.issue(0, o);
  b.startBattle();
  const events: SimEvent[] = [];
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    b.step();
    events.push(...b.drainEvents());
  }
  return { hash: b.hash(), winner: b.winner, ticks: b.tick, events };
}

describe('determinism', () => {
  const orders = [work('stakes', 12.5, 24.5), work('ditch', 6.5, 25.5), work('laager', 18.5, 26.5)];
  it('the same works and orders replay to the same hash', () => {
    const a = playWorks(11, orders);
    expect(playWorks(11, orders)).toEqual(a);
  });

  it('works are in the hash; an allowance alone or a refused work order changes nothing', () => {
    const plain = (allow: boolean, refused: boolean) => {
      const s = setupOf(12, [['hoplite', 4, 0]], [['hoplite', 4, 0]], allow ? [ALL] : undefined);
      const b = new Battle(s);
      if (refused) b.issue(0, work('stakes', 12.5, 4.5)); // enemy half
      b.startBattle();
      for (let i = 0; i < 400 && b.phase !== 'ended'; i++) b.step();
      return b.hash();
    };
    const base = plain(false, false);
    expect(plain(true, false)).toBe(base);
    expect(plain(true, true)).toBe(base);
    const placed = (y: number) => {
      const b = new Battle(setupOf(12, [['hoplite', 4, 0]], [['hoplite', 4, 0]], [ALL]));
      b.issue(0, work('stakes', 2.5, y));
      return b.hash();
    };
    expect(placed(30.5)).not.toBe(placed(31.5));
  });

  it('a grid that already holds stakes runs the stakes rules (assault fields)', () => {
    const b = new Battle({ ...setupOf(1, [['celt_sword', 1, 0]], [['hoplite', 1, 0]]), terrain: gridWith([[12, 20, 'x']]) });
    b.startBattle();
    const u = b.units[0];
    u.x = 12.5;
    u.y = 20.5;
    u.momentum = 100; // still a charge after this tick's walk
    b.step();
    expect(b.drainEvents().some((e) => e.type === 'stakesBreak')).toBe(true);
  });
});
