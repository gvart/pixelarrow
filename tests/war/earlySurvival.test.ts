/**
 * W-79 proposal, early survival (docs/WAR.md "Lifecycle" › Early mercy, "Food and hunger", "Rival warlords"): seeded
 * scenarios on flat maps. Before W-79 a new player's mixed level-1 squad lost 3-8 of 12 to a depth-1 bandit lair for
 * good, starved 26 minutes in with nothing in the packs, 12 level-3 hoplites lost 4-5 taking a fresh warlord hall
 * (~110 s), the lord alone held 7 of them 140-180 s, and a 4-man raid died to 6 guards without felling one.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { createWarlords } from '../../src/war/sim/warlords';
import { EARLY } from '../../src/war/sim/depth';
import { HUNGER, hungerStage } from '../../src/war/sim/food';
import { put } from '../../src/war/sim/holders';
import { makePerson } from '../../src/war/sim/roster';
import { WARLORD, WARLORDS } from '../../src/data/warWarlords';
import { flat } from './flatRegion';
import type { FightReport, MobKind, RegionData, WarBuildSim } from '../../src/war/types';

/** A start squad: the menu's mix of level-1 men (4 classes), one squad. */
const MIX: [string, number][] = [['hoplite', 4], ['archer', 3], ['slinger', 3], ['javelineer', 2]];
function startSquad(sim: WarBuildSim, x: number, y: number): number {
  const ids = MIX.map(([c, n]) => sim.spawnSquad('p:1', 0, c, n, x, y, Array.from({ length: n }, (_, k) => makePerson(`${c}${k}`, c))));
  sim.step();
  for (const q of ids.slice(1)) sim.order({ kind: 'merge', squad: q, into: ids[0] });
  sim.step();
  return ids[0];
}
const standing = (sim: WarBuildSim, sq: number) => {
  const s = sim.snapshot();
  return s.squads[sq].units.filter((u) => s.units[u].state !== 'dead').length;
};

/** 12 men attack-move on a lair of `n` `kind` at `depth`; run until it is cleared, then `after` ticks more. */
function lairFight(kind: MobKind, n: number, depth: number, seed: number, after = 0) {
  const r = flat(96);
  r.depth = depth;
  const sim = createSim(r, seed) as WarBuildSim;
  const sq = startSquad(sim, 48, 70);
  sim.addLair({ kind, x: 48, y: 40, count: n });
  sim.step();
  sim.order({ kind: 'attackMove', squad: sq, x: 48, y: 40 });
  const falls: { down?: true }[] = [];
  const reports: FightReport[] = [];
  let t = 0;
  for (; t < 4000 && sim.snapshot().lairs![0].state !== 'cleared'; t++) {
    sim.step();
    for (const e of sim.events()) if (e.kind === 'fall' && sim.snapshot().units.find((u) => u.id === e.unit)?.squad === sq) falls.push(e);
  }
  const atClear = standing(sim, sq);
  reports.push(sim.endFight());
  for (let k = 0; k < after; k++) sim.step();
  reports.push(sim.endFight());
  return { sim, sq, t, falls, atClear, men: standing(sim, sq), reports, lost: reports.flatMap((x) => x.persons).filter((p) => p.state !== 'fit') };
}

describe('W-79 early mercy: the wild only knocks men down at home and in the entries', () => {
  it('a depth-1 bandit lair of 8: men fall, get up once the fight is over, nobody is lost', () => {
    for (const seed of [1, 2, 3, 4]) {
      const f = lairFight('bandit', 8, 1, seed, EARLY.rise + 40);
      expect(f.falls.length, `seed ${seed}`).toBeGreaterThan(0); // a real fight
      expect(f.falls.every((e) => e.down), `seed ${seed}`).toBe(true);
      expect(f.men, `seed ${seed}`).toBe(12);
      expect(f.lost, `seed ${seed}`).toEqual([]);
      // they rise hurt
      const s = f.sim.snapshot();
      expect(s.squads[f.sq].units.some((u) => s.units[u].hp < s.units[u].maxHp * 0.5)).toBe(true);
    }
  });

  it('deeper (depth 2) the same fight costs men for good', () => {
    for (const seed of [1, 2, 3, 4]) {
      const f = lairFight('bandit', 8, 2, seed, EARLY.rise + 40);
      expect(f.falls.some((e) => e.down), `seed ${seed}`).toBe(false);
      expect(f.men, `seed ${seed}`).toBe(12 - f.lost.length);
      expect(f.lost.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('a man down keeps his pack and is not reported; up, he fights again', () => {
    const r = flat(64);
    r.depth = 0;
    const sim = createSim(r, 3) as WarBuildSim;
    const me = sim.spawnSquad('p:1', 0, 'archer', 1, 32, 32);
    sim.step();
    const pack = sim.cargo({ squad: me })!.slots[0].hold;
    put(pack, 'ration', 3, 't');
    sim.addLair({ kind: 'wolf', x: 32, y: 26, count: 6 });
    let down = -1;
    for (let t = 0; t < 1200 && down < 0; t++) {
      sim.step();
      if (sim.events().some((e) => e.kind === 'fall' && e.down)) down = t;
    }
    expect(down).toBeGreaterThanOrEqual(0);
    const u = sim.snapshot().units.find((x) => x.squad === me)!;
    expect(u).toMatchObject({ state: 'dead', wounded: true, down: true });
    expect(sim.snapshot().piles ?? []).toEqual([]); // nothing dropped
    expect(sim.endFight().persons).toEqual([]);
  });

  it('left beside the lair that beat him: he gets up, is felled again, and that fall is real', () => {
    const r = flat(64);
    r.depth = 1;
    const sim = createSim(r, 4) as WarBuildSim;
    const me = sim.spawnSquad('p:1', 0, 'militia', 1, 32, 30, [makePerson('p0', 'militia')]);
    sim.addLair({ kind: 'bear', x: 32, y: 28, count: 2 }); // they stay home beside him
    const seen: string[] = [];
    for (let t = 0; t < EARLY.giveUp + 200; t++) {
      sim.step();
      for (const e of sim.events()) if (e.kind === 'rise' || (e.kind === 'fall' && e.unit === sim.snapshot().squads[me].units[0])) seen.push(e.kind === 'rise' ? 'rise' : e.down ? 'down' : 'fall');
    }
    expect(seen).toEqual(['down', 'rise', 'fall']);
    const u = sim.snapshot().units.find((x) => x.squad === me)!;
    expect(u.state).toBe('dead');
    expect(u.down).toBeUndefined();
    expect(sim.endFight().persons).toEqual([expect.objectContaining({ pid: 'p0', state: expect.stringMatching(/wounded|dead/) })]);
  });

  it("another player's blow is a fall, even at home", () => {
    const r = flat(64);
    r.depth = 0;
    const sim = createSim(r, 5) as WarBuildSim;
    const a = sim.spawnSquad('p:1', 0, 'militia', 2, 30, 32), b = sim.spawnSquad('p:2', 1, 'hoplite', 8, 36, 32);
    sim.step();
    sim.order({ kind: 'attack', squad: b, target: a });
    const falls: { down?: true }[] = [];
    for (let t = 0; t < 1200 && standing(sim, a) > 0; t++) {
      sim.step();
      for (const e of sim.events()) if (e.kind === 'fall') falls.push(e);
    }
    expect(falls.length).toBeGreaterThan(0);
    expect(falls.some((e) => e.down)).toBe(false);
  });
});

describe('W-79 march rations', () => {
  it('HUNGER.kit rations keep a man out of Starving for two hours (none: starving in under half an hour), and do not make him laden', () => {
    const run = (rations: number) => {
      const sim = createSim(flat(32), 1) as WarBuildSim;
      const sq = sim.spawnSquad('p:1', 0, 'hoplite', 1, 16, 16);
      sim.step();
      if (rations) put(sim.cargo({ squad: sq })!.slots[0].hold, 'ration', rations, 't');
      let starving = -1, hungry = -1;
      for (let t = 0; t < 72000 && starving < 0; t++) {
        sim.step();
        if (t % 100) continue;
        const u = sim.snapshot().units[0], st = hungerStage(u.sat ?? HUNGER.max);
        if (st >= 1 && hungry < 0) hungry = t;
        if (st === 2) starving = t;
      }
      return { starving, hungry, laden: sim.snapshot().squads[sq] };
    };
    const none = run(0), kit = run(HUNGER.kit);
    expect(none.starving).toBeGreaterThan(0);
    expect(none.starving).toBeLessThan(1800 * 10); // under 30 min
    expect(kit.starving).toBe(-1); // never within 2 h
    expect(kit.hungry).toBeGreaterThan(100 * 60 * 10); // fed for over 100 min
  }, 60_000);

  it('a full kit is no load', () => {
    const sim = createSim(flat(32), 1) as WarBuildSim;
    const sq = sim.spawnSquad('p:1', 0, 'hoplite', 2, 16, 16);
    sim.step();
    for (const s of sim.cargo({ squad: sq })!.slots) put(s.hold, 'ration', HUNGER.kit, 't');
    sim.order({ kind: 'move', squad: sq, x: 28, y: 28 });
    const t0 = (() => { let t = 0; for (; t < 600; t++) { sim.step(); const u = sim.snapshot().units[0]; if (Math.hypot(u.x - 28, u.y - 28) < 2) break; } return t; })();
    const sim2 = createSim(flat(32), 1) as WarBuildSim;
    const sq2 = sim2.spawnSquad('p:1', 0, 'hoplite', 2, 16, 16);
    sim2.step();
    sim2.order({ kind: 'move', squad: sq2, x: 28, y: 28 });
    let t1 = 0;
    for (; t1 < 600; t1++) { sim2.step(); const u = sim2.snapshot().units[0]; if (Math.hypot(u.x - 28, u.y - 28) < 2) break; }
    expect(t0).toBe(t1);
  });
});

describe('W-79 warlord hall and raids', () => {
  const W = WARLORDS[0];
  function seat(points: [number, number][], n = 160): RegionData {
    return {
      id: W.seat, name: W.seat, w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
      entries: (['N', 'E', 'S', 'W'] as const).map((side) => ({ side, x: side === 'W' ? 0 : side === 'E' ? n - 4 : n / 2 - 2, y: side === 'N' ? 0 : side === 'S' ? n - 4 : n / 2 - 2, w: 4, h: 4 })),
      noBuild: [], objects: [], lairs: [], claimPoints: points.map(([x, y]) => ({ x, y, lairs: [] })),
    };
  }
  /** `men` hoplites of level 3 (the hall's depth 2, as chiefs: W-73) on his hall at `age` days; lord alone: his garrison struck down first. */
  function hall(seed: number, age: number, men: number, alone: boolean) {
    const r = seat([[80, 60]]);
    const sim = createSim(r, seed) as WarBuildSim, bots = createBots(sim), lords = createWarlords(r, sim, bots, seed)!;
    lords.setAge(age);
    lords.setPlayers(1);
    const step = () => (sim.step(), bots.tick(), lords.tick(sim.snapshot()));
    for (let t = 0; t < WARLORD.think * 2; t++) step();
    const lord = lords.snaps()[0].lord, lsq = sim.snapshot().units.find((u) => u.id === lord)!.squad;
    if (alone) sim.devUnits(sim.snapshot().units.filter((u) => u.squad === lsq && u.id !== lord).map((u) => u.id), 'kill');
    const me = sim.spawnSquad('p:1', 0, 'hoplite', men, 80, 100, Array.from({ length: men }, (_, k) => makePerson(`p${k}`, 'hoplite', { level: 3 })));
    sim.order({ kind: 'attackMove', squad: me, x: 80, y: 60 });
    let hit = -1, t = 0;
    for (; t < 3000; t++) {
      step();
      const l = sim.snapshot().units.find((u) => u.id === lord)!;
      if (hit < 0 && l.hp < l.maxHp) hit = t;
      if (l.state === 'dead') break;
    }
    return { lost: men - standing(sim, me), secs: t / 10, lordSecs: (t - hit) / 10 };
  }

  it('12 men of the depth take his hall (a 9-man garrison) in under 90 s, losing 2-4 on average', () => {
    const runs = [1, 2, 3, 4, 5].map((seed) => hall(seed, 2, 12, false));
    for (const x of runs) expect(x.secs).toBeLessThan(90);
    const mean = runs.reduce((a, x) => a + x.lost, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(2);
    expect(mean).toBeLessThanOrEqual(4);
  }, 60_000);

  it('the lord alone does not out-tank 7 men for a minute', () => {
    for (const seed of [1, 2, 3]) expect(hall(seed, 0, 7, true).lordSecs).toBeLessThan(50);
  }, 60_000);

  it('a garrison stops growing at 9 at depth 2', () => {
    expect(WARLORD.garrison.max[2]).toBe(9);
  });

  it('a raid is led by his lieutenant and fells a guard or two of 6 at depth 1, none of a full 12', () => {
    const raid = (guards: number, seed: number) => {
      const r = flat(96);
      r.depth = 1;
      const sim = createSim(r, seed) as WarBuildSim;
      const me = sim.spawnSquad('p:1', 0, 'hoplite', guards, 48, 60, Array.from({ length: guards }, (_, k) => makePerson(`p${k}`, 'hoplite', { level: 2 })));
      const sq = sim.spawnWild('warlord:x', 'bandit', WARLORD.raid.men[1], 48, 30, { hp: 1, dmg: 1, lead: WARLORD.lieutenant });
      sim.step();
      sim.order({ kind: 'attackMove', squad: sq, x: 48, y: 60 });
      let felled = 0;
      for (let t = 0; t < 3000 && standing(sim, sq) > 0; t++) {
        sim.step();
        for (const e of sim.events()) if (e.kind === 'fall' && sim.snapshot().units.find((u) => u.id === e.unit)?.squad === me) felled++;
      }
      return felled;
    };
    const six = [1, 2, 3, 4].map((s) => raid(6, s)), twelve = [1, 2, 3, 4].map((s) => raid(12, s));
    expect(Math.min(...six)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...six)).toBeLessThanOrEqual(3);
    expect(Math.max(...twelve)).toBeLessThanOrEqual(1);
  }, 60_000);
});
