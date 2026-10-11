/**
 * FW-02: the works allowance and supplies (field-works.md R4), garrison works
 * (R4.4), bot placement (R6), the stand-off (ai-doctrines.md R5), and no
 * works online (V5-022).
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { hillGrid } from '../src/dev/balance';
import { Campaign, canAffordWork, worksAllowance, worksCost } from '../src/game/campaign';
import { garrisonWorks, generateEnemyArmy, buildArmy } from '../src/game/enemy';
import { standardArmy } from '../src/game/heroes';
import { LADDER, ladderFloor, ladderSetup } from '../src/duel/ladder';
import { asyncSetup } from '../src/duel/season';
import { onlineBattleSetup } from '../src/online/battle';
import { placeWorks, STAND_OFF_S } from '../src/sim/ai';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { flatGrid, type TerrainGrid } from '../src/sim/terrain';
import { TERRAIN, WORKS } from '../src/data/terrain';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, DoctrineId, Order, Side, WorksAllowance } from '../src/sim/types';

const NONE: WorksAllowance = { stakes: 0, ditch: 0, laager: 0 };

/** Each entry is [class, count, group]. */
function sideOf(rng: Rng, ids: { nextId: number }, spec: [ClassId, number, number][], bot: boolean) {
  return armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), bot);
}

/** A matched battle (balance.ts): the standard army against a generated line. */
function matched(seed: number, works?: [WorksAllowance?, WorksAllowance?], doctrine?: DoctrineId): BattleSetup {
  const ids = { nextId: 1 };
  const heroes = standardArmy(new Rng(seed), ids);
  const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), ids, heroes, 0).heroes;
  const s: BattleSetup = { seed, armies: [armySpec(heroes, true), armySpec(enemy, true)] };
  if (works?.[0]) s.armies[0].works = works[0];
  if (works?.[1]) s.armies[1].works = works[1];
  if (doctrine) s.armies[1].doctrine = doctrine;
  return s;
}

const workOrders = (b: Battle, side?: Side) => b.orderLog.filter((o) => o.order.kind === 'work' && (side === undefined || o.side === side));

function run(b: Battle, seconds = 300): void {
  b.startBattle();
  for (let i = 0; i < seconds * 20 && b.phase !== 'ended'; i++) b.step();
}

/** Grid cells (x, y) of a segment. */
function cellsOf(b: Battle, cells: readonly number[]): { x: number; y: number }[] {
  const t = b.terrain!;
  return cells.map((i) => ({ x: i % t.w, y: Math.floor(i / t.w) }));
}

describe('works allowance and supplies (R4)', () => {
  it('buys each type with the supplies on hand, up to WORKS_MAX, or WORKS_CAUGHT when caught', () => {
    expect(worksAllowance(0)).toEqual(NONE);
    expect(worksAllowance(20)).toEqual({ stakes: 3, ditch: 2, laager: 1 });
    expect(worksAllowance(100)).toEqual({ stakes: WORKS.max, ditch: WORKS.max, laager: WORKS.max });
    expect(worksAllowance(100, true)).toEqual({ stakes: WORKS.caught, ditch: WORKS.caught, laager: WORKS.caught });
    expect(worksAllowance(Number.NaN)).toEqual(NONE);
  });

  it('a segment goes down only while the purse covers everything placed so far and the cap allows', () => {
    expect(worksCost([{ type: 'stakes' }, { type: 'ditch' }, { type: 'laager' }])).toBe(6 + 8 + 15);
    expect(canAffordWork(14, [{ type: 'stakes' }], 'ditch')).toBe(true);
    expect(canAffordWork(13, [{ type: 'stakes' }], 'ditch')).toBe(false);
    expect(canAffordWork(100, [{ type: 'stakes' }, { type: 'stakes' }, { type: 'stakes' }], 'stakes')).toBe(false);
    expect(canAffordWork(100, [{ type: 'stakes' }], 'stakes', true)).toBe(false);
  });

  it('supplies are spent only for the segments on the field at battle start; an undone one is refunded', () => {
    const c = Campaign.fresh(11);
    c.world.addSupplies(-c.world.supplies + 30);
    const s = matched(3, [c.worksAllowance(), undefined]);
    s.armies[0].bot = false;
    const b = new Battle(s);
    const main = b.sideGroups(0)[0].formation;
    b.issue(0, { kind: 'work', type: 'ditch', x: main.cx, y: main.cy - 2, fx: 0, fy: -1 });
    b.issue(0, { kind: 'work', type: 'stakes', x: main.cx + 5, y: main.cy - 2, fx: 0, fy: -1 });
    expect(b.works()).toHaveLength(2);
    expect(c.worksLeft(b.works())).toBe(30 - 8 - 6);
    b.issue(0, { kind: 'unwork', x: main.cx + 5, y: main.cy - 2 });
    expect(b.works()).toHaveLength(1);
    expect(c.worksLeft(b.works())).toBe(30 - 8);
    b.startBattle();
    expect(c.payWorks(b.works())).toBe(8);
    expect(c.world.supplies).toBe(22);
  });

  it('never takes more than the supplies hold, and the enemy side pays nothing', () => {
    const c = Campaign.fresh(12);
    c.world.addSupplies(-c.world.supplies + 10);
    expect(c.payWorks([{ side: 1, type: 'laager' }])).toBe(0);
    expect(c.payWorks([{ side: 0, type: 'stakes' }, { side: 0, type: 'ditch' }])).toBe(10);
    expect(c.world.supplies).toBe(0);
  });

  it('time to dig: only a band that chased the player down on the march catches him (R4.2)', () => {
    const c = Campaign.fresh(13);
    const p = c.world.s.parties[0];
    p.mode = 'chase';
    expect(c.wasCaught(p.id, false)).toBe(true);
    expect(c.wasCaught(p.id, true)).toBe(false);
    p.mode = 'wander';
    expect(c.wasCaught(p.id, false)).toBe(false);
  });
});

describe('garrison works (R4.4)', () => {
  it('a lair garrison gets GARRISON_STAKES stakes, free; a field band gets none whatever its doctrine', () => {
    expect(garrisonWorks()).toEqual({ stakes: WORKS.garrisonStakes, ditch: 0, laager: 0 });
    for (const mix of ['bandits', 'raiders', 'mercs', 'line'] as const) {
      const a = buildArmy(new Rng(5), { nextId: 1 }, { count: 8, level: 3, tier: 2, targetPower: 500, mix });
      expect(a.works).toBeUndefined();
    }
  });
});

describe('bot placement (R6)', () => {
  it('a bot without an allowance lays nothing and issues no work order', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const b = new Battle(matched(seed));
      expect(workOrders(b)).toHaveLength(0);
      expect(b.works()).toHaveLength(0);
    }
  });

  it('garrison stakes: one segment in front of each palisade gate gap, facing the attacker', () => {
    // a palisade on row 11 of side 1's half, with gates at x 4-6 and 16-18
    const g: TerrainGrid = flatGrid(24, 36);
    const cells = g.cells.split('');
    for (let x = 0; x < 24; x++) if (!(x >= 4 && x <= 6) && !(x >= 16 && x <= 18)) cells[11 * 24 + x] = TERRAIN.palisade.code;
    const rng = new Rng(7);
    const ids = { nextId: 1 };
    const s: BattleSetup = { seed: 7, armies: [sideOf(rng, ids, [['hoplite', 8, 0]], false), sideOf(rng, ids, [['hoplite', 8, 0], ['archer', 3, 1]], true)], terrain: { ...g, cells: cells.join('') } };
    s.armies[1].works = garrisonWorks();
    const b = new Battle(s);
    const segs = b.works().filter((w) => w.side === 1);
    expect(segs).toHaveLength(2);
    const centres = segs.map((w) => {
      const cs = cellsOf(b, w.cells);
      expect(w.type).toBe('stakes');
      // laid across the attacker's approach (one row), in front of the palisade (toward side 0)
      expect(new Set(cs.map((c) => c.y)).size).toBe(1);
      expect(cs[0].y).toBeGreaterThan(11);
      return cs.reduce((a, c) => a + c.x, 0) / cs.length;
    });
    expect(centres.sort((p, q) => p - q)).toEqual([5, 17]);
  });

  it('ditch: along the main line front, two paces ahead', () => {
    const s = matched(21, [undefined, { stakes: 0, ditch: 1, laager: 0 }]);
    const b = new Battle(s);
    const segs = b.works().filter((w) => w.side === 1);
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('ditch');
    const f = b.sideGroups(1)[0].formation;
    const cs = cellsOf(b, segs[0].cells);
    const cx = cs.reduce((a, c) => a + c.x + 0.5, 0) / cs.length;
    expect(Math.abs(cx - f.cx)).toBeLessThanOrEqual(1);
    // side 1 faces +y: the ditch lies in front of the front rank
    expect(cs[0].y + 0.5).toBeGreaterThan(f.cy);
    expect(cs[0].y + 0.5 - f.cy).toBeLessThanOrEqual(2.5);
  });

  it('field stakes go on the flank facing the enemy horse', () => {
    const rng = new Rng(8);
    const ids = { nextId: 1 };
    // side 0 builds first, so side 1's bot sees the riders (group IV, deployed on a wing)
    const s: BattleSetup = { seed: 8, armies: [sideOf(rng, ids, [['hoplite', 6, 0], ['companion', 2, 3]], false), sideOf(rng, ids, [['hoplite', 8, 0]], true)] };
    s.armies[1].works = { stakes: 1, ditch: 0, laager: 0 };
    const b = new Battle(s);
    const segs = b.works().filter((w) => w.side === 1);
    expect(segs).toHaveLength(1);
    const main = b.sideGroups(1)[0].formation;
    const horse = b.sideGroups(0).find((g) => b.activeMembers(g.id).some((u) => u.stats.mount))!.formation;
    expect(Math.abs(horse.cx - main.cx)).toBeGreaterThan(0.5);
    const cs = cellsOf(b, segs[0].cells);
    const sx = cs.reduce((a, c) => a + c.x + 0.5, 0) / cs.length;
    expect(Math.sign(sx - main.cx)).toBe(Math.sign(horse.cx - main.cx));
  });

  it('a battle with bot-laid works is deterministic', () => {
    const play = () => {
      const b = new Battle(matched(31, [{ stakes: 1, ditch: 1, laager: 0 }, garrisonWorks()]));
      run(b, 120);
      return b.hash();
    };
    expect(play()).toBe(play());
  });
});

describe('no works online (V5-022)', () => {
  it('no ladder floor carries works on either side, and its bot lays none', () => {
    for (let f = 1; f <= LADDER.floors; f++) {
      const floor = ladderFloor(f);
      const s = ladderSetup(100 + f, JSON.parse(JSON.stringify(ladderFloor(Math.max(1, f - 1)).heroes)), floor.formations, floor);
      expect(s.armies[0].works).toBeUndefined();
      expect(s.armies[1].works).toBeUndefined();
      const b = new Battle(s);
      expect(workOrders(b)).toHaveLength(0);
    }
  });

  it('duel, async and war setups (onlineBattleSetup) carry no works, and a work order in them is refused', () => {
    const team = ladderFloor(5).heroes;
    const foes = ladderFloor(6).heroes;
    const setups = [
      onlineBattleSetup(9, { heroes: team, formations: ['line', 'skirmish', 'line', 'column'], bot: false }, { heroes: foes, formations: ['line', 'skirmish', 'line', 'column'], bot: false }, null),
      onlineBattleSetup(10, { heroes: team, formations: ['line', 'skirmish', 'line', 'column'], bot: false }, { heroes: foes, formations: ['line', 'skirmish', 'line', 'column'], bot: true }, null),
      asyncSetup(11, team, ['line', 'skirmish', 'line', 'column'], foes, ['line', 'skirmish', 'line', 'column']),
    ];
    for (const s of setups) {
      expect(s.armies.every((a) => a.works === undefined)).toBe(true);
      const b = new Battle(s);
      const f = b.sideGroups(0)[0].formation;
      const o: Order = { kind: 'work', type: 'stakes', x: f.cx, y: f.cy - 2, fx: 0, fy: -1 };
      b.issue(0, o);
      expect(b.works()).toHaveLength(0);
      expect(b.worksLog.at(-1)?.reason).toBe('allowance');
    }
  });
});

describe('stand-off (ai-doctrines.md R5)', () => {
  /**
   * A human side holding still on a ridge in an orb behind works (the turtle) against a
   * bot with missile-men. Returns the bot's main group order and whether it
   * has met the turtle by `seconds`.
   */
  function turtle(doctrine: DoctrineId, seconds: number, orb = true, works = true) {
    const rng = new Rng(4);
    const ids = { nextId: 1 };
    const s: BattleSetup = {
      seed: 4,
      armies: [sideOf(rng, ids, [['hoplite', 8, 0]], false), sideOf(rng, ids, [['hoplite', 8, 0], ['slinger', 4, 1]], true)],
      terrain: hillGrid(0), // the turtle holds a ridge: hillFlank doctrines won't climb into it at once
    };
    if (orb) s.armies[0].groups[0] = { ...s.armies[0].groups[0], formation: 'orb' };
    if (works) s.armies[0].works = { stakes: 2, ditch: 1, laager: 0 };
    s.armies[1].doctrine = doctrine;
    const b = new Battle(s);
    if (works) placeWorks(b, 0);
    b.startBattle();
    let met = false;
    let focus = false;
    for (let i = 0; i < seconds * 20 && b.phase !== 'ended'; i++) {
      b.step();
      if (b.sideGroups(1)[0].contact) met = true;
    }
    for (const o of b.orderLog) if (o.side === 1 && o.order.kind === 'focus' && o.order.target === 0 && o.tick > STAND_OFF_S * 20) focus = true;
    return { order: b.sideGroups(1)[0].order, met, focus, b };
  }

  it('swarm and hammer hold off a still turtle and shoot at it, where steady closes in', () => {
    for (const d of ['swarm', 'hammer'] as DoctrineId[]) {
      const r = turtle(d, 40);
      expect(r.met).toBe(false);
      expect(r.order).toBe('hold');
      expect(r.focus).toBe(true);
    }
    expect(turtle('steady', 40).met).toBe(true);
  });

  it('once the missiles are spent the stand-off ends and the bot presses', () => {
    const r = turtle('swarm', 300);
    expect(r.met).toBe(true);
  });

  it('no stand-off against a side that holds without works or an orb', () => {
    const r = turtle('swarm', 40, false, false);
    expect(r.focus).toBe(false);
  });
});
