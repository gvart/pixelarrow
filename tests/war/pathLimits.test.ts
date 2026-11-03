// W-85, W-86, W-101..W-104: who may join a player, by path. The table is src/war/world/start.ts; nothing here hardcodes it.
import { describe, expect, it } from 'vitest';
import { isCivClass } from '../../src/data/classes';
import { createSim } from '../../src/war/sim';
import { promotesTo } from '../../src/war/sim/roster';
import { FAMILY_OF } from '../../src/war/sim/skills';
import { SOUL_CLASSES } from '../../src/war/sim/souls';
import { ARMY_MAX, SQUAD_MAX } from '../../src/war/sim/soldiers';
import { settleTunnel, TUNNEL } from '../../src/war/sim/tunnel';
import type { WarBuildSim, WarEvent } from '../../src/war/types';
import {
  cartCap, FAMILY_IDS, mayHold, manRefusal, menRefusal, NO_PATH, PATH_IDS, PATHS, pathStart, raiseClass, soldierCap, START_CLASSES, workerCap,
  type PathId, type PlayerPath, type StartFamily,
} from '../../src/war/world/start';
import { flat } from './flatRegion';

const family = (cls: string) => FAMILY_OF[cls as keyof typeof FAMILY_OF];
const RIDERS = Object.keys(FAMILY_OF).filter((c) => family(c) === 'rider');
const warrior = (f: StartFamily): PlayerPath => ({ path: 'warrior', family: f });
/** Every path a player can be on, a warrior once per family. */
const ALL: PlayerPath[] = PATH_IDS.flatMap((path): PlayerPath[] => (path === 'warrior' ? FAMILY_IDS.map(warrior) : [{ path, family: null }]));
const soldierOf = (p: PlayerPath) => pathStart(p.path as PathId, p.family).find((c) => !isCivClass(c))!;
const name = (p: PlayerPath) => `${p.path}${p.family ? ` ${p.family}` : ''}`;

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): void {
  for (let i = 0; i < ticks; i++) {
    sim.step();
    if (until?.()) return;
  }
}
const alive = (sim: WarBuildSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead').length;

/** A sim whose owners stand on these paths. */
function simOf(paths: Record<string, PlayerPath>) {
  const sim = createSim(flat(), 1);
  sim.setPaths((owner) => paths[owner] ?? NO_PATH);
  return sim;
}
function claim(sim: WarBuildSim, squad: number, soul: number): WarEvent[] {
  sim.order({ kind: 'claimSoul', squad, soul });
  const ev: WarEvent[] = [];
  run(sim, 600, () => (ev.push(...sim.events()), ev.some((e) => (e.kind === 'soulClaimed' || e.kind === 'soulRefused') && e.soul === soul)));
  return ev;
}

describe('the table', () => {
  it('W-103 workers, W-104 carts, W-85 soldiers are read per path, with a pathless player (sandbox, dev) at the most of each', () => {
    for (const p of PATH_IDS) {
      expect(soldierCap(p)).toBe(PATHS[p].cap);
      expect(workerCap(p)).toBe(PATHS[p].workers);
      expect(cartCap(p)).toBe(PATHS[p].carts);
    }
    expect(soldierCap(null)).toBe(Math.max(...PATH_IDS.map((p) => PATHS[p].cap)));
    expect(workerCap(null)).toBe(Math.max(...PATH_IDS.map((p) => PATHS[p].workers)));
    expect(cartCap(null)).toBe(Math.max(...PATH_IDS.map((p) => PATHS[p].carts)));
  });

  it('ARMY_MAX and SQUAD_MAX are the biggest path\'s cap, not a limit of their own', () => {
    expect(ARMY_MAX).toBe(soldierCap(null));
    expect(SQUAD_MAX).toBe(soldierCap(null));
  });

  it('every path\'s first men pass the one check, one by one', () => {
    for (const p of ALL) expect(menRefusal(p, pathStart(p.path as PathId, p.family)), name(p)).toBeNull();
  });
});

describe('W-101 who may join', () => {
  it('a warrior holds only his family; the rest stay out, riders among them', () => {
    for (const f of FAMILY_IDS)
      for (const c of Object.keys(FAMILY_OF)) expect(mayHold({ ...warrior(f), level: 12 }, c), `${f} ${c}`).toBe(family(c) === f);
  });

  it('a builder or trader holds any soldier but a rider', () => {
    for (const path of ['builder', 'trader'] as const)
      for (const c of Object.keys(FAMILY_OF)) expect(mayHold({ path, family: null }, c), `${path} ${c}`).toBe(family(c) !== 'rider');
  });

  it('every path may hold a worker, and every soul a site wakes has someone to go to', () => {
    for (const p of ALL) expect(mayHold(p, 'civ_cook'), name(p)).toBe(true);
    for (const cls of Object.values(SOUL_CLASSES).flat()) expect(ALL.some((p) => p.path === 'warrior' && mayHold({ ...p, level: 12 }, cls)), cls).toBe(true);
    expect(RIDERS.length).toBeGreaterThan(0);
  });

  it('a promotion never leaves a family: every elite a man may become is of his', () => {
    for (const c of Object.keys(FAMILY_OF)) for (const e of promotesTo(c)) expect(family(e), `${c} > ${e}`).toBe(family(c));
  });

  it('the one check: family first, then the cap of his kind', () => {
    const line = warrior('line');
    expect(manRefusal(line, 'archer', { soldiers: 0, workers: 0 })).toBe('family');
    expect(manRefusal(line, 'hoplite', { soldiers: PATHS.warrior.cap - 1, workers: 0 })).toBeNull();
    expect(manRefusal(line, 'hoplite', { soldiers: PATHS.warrior.cap, workers: 0 })).toBe('full');
    expect(manRefusal(line, 'civ_cook', { soldiers: PATHS.warrior.cap, workers: PATHS.warrior.workers - 1 })).toBeNull();
    expect(manRefusal(line, 'civ_cook', { soldiers: 0, workers: PATHS.warrior.workers })).toBe('household');
  });
});

describe('claiming a soul in the sim', () => {
  for (const p of ALL) {
    it(`${name(p)}: the man who fills the cap joins, the next is refused and waits on`, () => {
      const sim = simOf({ 'p:1': p });
      const cap = soldierCap(p.path), cls = soldierOf(p);
      const s = sim.spawnSquad('p:1', 0, cls, cap - 1, 26, 30);
      const first = sim.spawnSoul(28, 30, cls);
      expect(claim(sim, s, first).some((e) => e.kind === 'soulClaimed')).toBe(true);
      expect(alive(sim, s)).toBe(cap);
      const next = sim.spawnSoul(28, 30, cls);
      expect(claim(sim, s, next).find((e) => e.kind === 'soulRefused')).toMatchObject({ soul: next, owner: 'p:1', have: cap, why: 'full' });
      expect(alive(sim, s)).toBe(cap);
      expect(sim.snapshot().souls?.map((x) => x.id)).toEqual([next]);
    });
  }

  it('an out-of-family soul is refused a warrior and left there for another player of his people', () => {
    for (const f of FAMILY_IDS) {
      const other = START_CLASSES.find((c) => family(c) !== f)!, mine = warrior(f), theirs = warrior(family(other) as StartFamily);
      const sim = simOf({ 'p:1': mine, 'p:2': theirs });
      const a = sim.spawnSquad('p:1', 0, soldierOf(mine), 2, 26, 30);
      const soul = sim.spawnSoul(28, 30, other);
      expect(claim(sim, a, soul).find((e) => e.kind === 'soulRefused'), f).toMatchObject({ soul, owner: 'p:1', why: 'family' });
      expect(alive(sim, a)).toBe(2);
      expect(sim.snapshot().souls?.map((x) => x.id)).toEqual([soul]);
      // the warrior's claim is dropped: he does not contest the next man who comes for him
      const b = sim.spawnSquad('p:2', 0, other, 2, 30, 30);
      expect(claim(sim, b, soul).find((e) => e.kind === 'soulClaimed'), f).toMatchObject({ soul, owner: 'p:2' });
      expect(alive(sim, b)).toBe(3);
    }
  });

  it('a builder and a trader take any non-rider soul as a guard', () => {
    for (const path of ['builder', 'trader'] as const)
      for (const cls of START_CLASSES) {
        const sim = simOf({ 'p:1': { path, family: null } });
        const s = sim.spawnSquad('p:1', 0, 'hoplite', 1, 26, 30);
        expect(claim(sim, s, sim.spawnSoul(28, 30, cls)).some((e) => e.kind === 'soulClaimed'), `${path} ${cls}`).toBe(true);
      }
  });

  it('a player with no path (the sandbox, dev tools) takes anyone up to the biggest cap', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('you', 0, 'hoplite', 1, 26, 30);
    for (const cls of START_CLASSES.slice(0, 2)) expect(claim(sim, s, sim.spawnSoul(28, 30, cls)).some((e) => e.kind === 'soulClaimed'), cls).toBe(true);
  });
});

describe('W-102 the Tunnel under the cap', () => {
  it('a floor never pushes him over: room 1 raises one man, then the clock stops', () => {
    expect(settleTunnel({ alive: 3, nextAt: 0, room: 1, floor: TUNNEL.floor }, 60 * 60_000)).toMatchObject({ raise: 1, alive: 4, nextAt: null });
    expect(settleTunnel({ alive: 0, nextAt: null, room: 0, floor: TUNNEL.floor }, 0)).toMatchObject({ raise: 0, nextAt: null, pending: 0 });
  });

  it('a small path\'s floor is his cap: he never waits on men who could not join', () => {
    expect(settleTunnel({ alive: 0, nextAt: 0, room: 4, floor: 4 }, 60 * 60_000)).toMatchObject({ raise: 4, alive: 4, nextAt: null, pending: 0 });
    expect(settleTunnel({ alive: 4, nextAt: null, room: 0, floor: 4 }, 0)).toMatchObject({ raise: 0, nextAt: null, pending: 0 });
  });

  it('with none of his fallen to raise, the tunnel still gives a man he may hold', () => {
    for (const p of [...ALL, NO_PATH]) expect(mayHold(p, raiseClass(p)), name(p)).toBe(true);
    expect(raiseClass(NO_PATH)).toBe('militia');
  });
});
