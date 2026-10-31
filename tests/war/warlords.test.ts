/**
 * W-72 proposal, rival warlords (docs/WAR.md "Rival warlords"; src/war/sim/warlords.ts, src/data/warWarlords.ts): seeded
 * scenarios on flat maps named after a seat or a march (the director keys on the region id) and on a real seat's JSON.
 * Every expectation derives from WARLORDS, WARLORD and the world graph.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots, type Bots } from '../../src/war/sim/bots';
import { createWarlords, type WarlordNote, type Warlords } from '../../src/war/sim/warlords';
import { domainOf, WARLORD, WARLORDS, warlordsOf } from '../../src/data/warWarlords';
import { MOB_KINDS, MOB_TEAM } from '../../src/war/sim/mobs';
import { REGION_DEPTH } from '../../src/war/sim/depth';
import { WORLD_REGIONS } from '../../src/war/world/regions';
import { edge } from '../../src/war/world/graph';
import { parseRegion } from '../../src/war/region/schema';
import { makePerson } from '../../src/war/sim/roster';
import type { RegionData, WarBuildSim } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const W = WARLORDS[0];
const SEAT = W.seat, MARCH = domainOf(W)[1];

/** Flat grass n x n named `id` (a seat or march), its claim points, entries on every side. */
function flat(id: string, points: [number, number][], n = 160): RegionData {
  return {
    id, name: id, w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: (['N', 'E', 'S', 'W'] as const).map((side) => ({ side, x: side === 'W' ? 0 : side === 'E' ? n - 4 : n / 2 - 2, y: side === 'N' ? 0 : side === 'S' ? n - 4 : n / 2 - 2, w: 4, h: 4 })),
    noBuild: [], objects: [], lairs: [], claimPoints: points.map(([x, y]) => ({ x, y, lairs: [] })),
  };
}

interface Run { sim: WarBuildSim; bots: Bots; lords: Warlords; notes: WarlordNote[] }
function setup(r: RegionData, age: number, players: number, seed = 5): Run {
  const sim = createSim(r, seed), bots = createBots(sim), lords = createWarlords(r, sim, bots, seed)!;
  lords.setAge(age);
  lords.setPlayers(players);
  return { sim, bots, lords, notes: [] };
}
function run(x: Run, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    x.sim.step();
    x.bots.tick();
    x.notes.push(...x.lords.tick(x.sim.snapshot()));
    if (until?.()) return t + 1;
  }
  return ticks;
}
const holds = (x: Run) => x.lords.snaps()[0].holds;
const men = (x: Run, sq: number) => x.sim.snapshot().units.filter((u) => u.squad === sq && u.state !== 'dead').length;

describe('warlords: data', () => {
  it('each sits on a depth-2 region, his marches are depth-1 non-homes facing it, domains never overlap', () => {
    expect(new Set(WARLORDS.map((w) => w.id)).size).toBe(WARLORDS.length);
    const seen = new Set<string>();
    for (const w of WARLORDS) {
      expect(REGION_DEPTH[w.seat], w.id).toBe(2);
      expect(MOB_KINDS, w.id).toContain(w.kind);
      const d = domainOf(w);
      expect(d[0]).toBe(w.seat);
      expect(d.length, w.id).toBeGreaterThanOrEqual(2);
      for (const id of d.slice(1)) {
        expect(REGION_DEPTH[id], id).toBe(1);
        expect(WORLD_REGIONS.find((r) => r.id === id)?.role).not.toBe('home');
        expect(edge(id, w.seat), id).not.toBeNull();
      }
      for (const id of d) expect(seen.has(id), id).toBe(false), seen.add(id);
      expect(w.lines.took).toContain('{place}');
      expect(w.lines.freed).toContain('{place}');
      expect(w.lines.warn).toContain('{what}');
    }
  });

  it('symmetry: each home borders the same number of warlord domains', () => {
    const homes = WORLD_REGIONS.filter((r) => r.role === 'home');
    const touch = homes.map((h) => WARLORDS.filter((w) => domainOf(w).some((id) => h.adj.includes(id))).length);
    expect(new Set(touch).size).toBe(1);
    expect(touch[0]).toBeGreaterThan(0);
  });

  it('every seat region has a claim point for his hall', () => {
    for (const w of WARLORDS) {
      const r = parseRegion(files[`../../src/war/regions/${w.seat}.json`]);
      expect(r.claimPoints?.length ?? 0, w.seat).toBeGreaterThan(0);
    }
  });

  it('a region in no domain has no director', () => {
    const none = WORLD_REGIONS.find((r) => !warlordsOf(r.id).length)!;
    const r = flat(none.id, [[40, 40]]);
    const sim = createSim(r, 1);
    expect(createWarlords(r, sim, createBots(sim), 1)).toBeNull();
  });
});

describe('warlords: holding land', () => {
  it('a fresh seat lays his hall at claim point 0 with the lord, named, stronger than his men', () => {
    const r = parseRegion(files[`../../src/war/regions/${SEAT}.json`]);
    const x = setup(r, 0, 1);
    run(x, WARLORD.think * 2);
    const s = x.lords.snaps()[0], c0 = r.claimPoints![0];
    expect(s).toMatchObject({ id: W.id, name: W.name, seat: true });
    expect(s.holds).toHaveLength(1);
    expect(s.holds[0]).toMatchObject({ place: 'c0', x: c0.x, y: c0.y, state: 'held' });
    expect(s.lord).toBeGreaterThanOrEqual(0);
    const units = x.sim.snapshot().units, lord = units.find((u) => u.id === s.lord)!, man = units.find((u) => u.squad === lord.squad && u.id !== lord.id)!;
    expect(lord.maxHp).toBeCloseTo(man.maxHp * WARLORD.lord.hp * W.lord, 3);
    expect(x.sim.snapshot().squads[lord.squad]).toMatchObject({ team: MOB_TEAM, owner: `warlord:${W.id}` });
    expect(x.notes.some((n) => n.what === 'rise')).toBe(true);
  });

  it('grows with age: a band marches from his hall and takes the next place', () => {
    const x = setup(flat(SEAT, [[40, 40], [100, 60], [120, 120]]), 0, 1);
    run(x, WARLORD.think * 2);
    expect(holds(x)).toHaveLength(1);
    x.lords.setAge(WARLORD.grow.seat);
    run(x, 3000, () => holds(x).length === 2 && holds(x)[1].state === 'held');
    expect(holds(x)[1]).toMatchObject({ place: 'c1', state: 'held' });
    expect(x.notes.filter((n) => n.what === 'took').map((n) => n.place)).toContain('c1');
  });

  it('a fresh room lays out what his age gives, capped by the players present and maxHold', () => {
    const pts: [number, number][] = [[40, 40], [100, 60], [120, 120], [60, 130]];
    const one = setup(flat(SEAT, pts), 10, 1);
    run(one, WARLORD.think);
    expect(holds(one)).toHaveLength(2); // 1 + players
    const busy = setup(flat(SEAT, pts), 10, 5);
    run(busy, WARLORD.think);
    expect(holds(busy)).toHaveLength(WARLORD.maxHold);
  });

  it('marches: nothing before marchDay, then a band over the border facing his seat', () => {
    const early = setup(flat(MARCH, [[80, 80]]), WARLORD.grow.marchDay - 0.5, 1);
    run(early, 200);
    expect(holds(early)).toHaveLength(0);
    const later = setup(flat(MARCH, [[80, 80]]), WARLORD.grow.marchDay, 1);
    run(later, WARLORD.think);
    expect(holds(later)).toHaveLength(1); // laid at once (fresh room)
  });

  it('an empty region: he holds what he has, takes nothing more and never raids', () => {
    const x = setup(flat(SEAT, [[40, 40], [100, 60], [120, 120]]), 0, 0);
    x.sim.claim(0, 130, 30, 12);
    x.sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 130, y: 30 });
    run(x, 20);
    x.notes.length = 0;
    x.lords.setAge(8);
    run(x, WARLORD.raid.every + WARLORD.raid.warn + 600);
    expect(holds(x)).toHaveLength(1);
    expect(x.notes.some((n) => n.what === 'warn' || n.what === 'took')).toBe(false);
  });

  it('pressure: more players, bigger garrisons (never over the cap)', () => {
    const a = setup(flat(SEAT, [[40, 40], [100, 60]]), 0, 1), b = setup(flat(SEAT, [[40, 40], [100, 60]]), 0, 4);
    run(a, WARLORD.think * 2), run(b, WARLORD.think * 2);
    expect(holds(b)[0].men).toBeGreaterThan(holds(a)[0].men);
    expect(holds(b)[0].men).toBeLessThanOrEqual(WARLORD.garrison.cap);
  });

  it('is deterministic for a seed', () => {
    const go = () => {
      const x = setup(flat(SEAT, [[40, 40], [100, 60], [120, 120]]), 4, 2, 9);
      run(x, 2500);
      return JSON.stringify([x.notes, x.lords.snaps()]);
    };
    expect(go()).toBe(go());
  });
});

describe('warlords: beaten piece by piece', () => {
  it('12 men free a march holding: a pile, a freed note naming them, and the point is theirs to claim', () => {
    const x = setup(flat(MARCH, [[80, 80]]), WARLORD.grow.marchDay, 1);
    run(x, WARLORD.think);
    const h = holds(x)[0];
    const me = x.sim.spawnSquad('p:1', 0, 'hoplite', 12, 80, 100);
    x.sim.order({ kind: 'attackMove', squad: me, x: 80, y: 80 });
    run(x, 4000, () => holds(x).length === 0);
    expect(holds(x)).toHaveLength(0);
    const freed = x.notes.find((n) => n.what === 'freed')!;
    expect(freed).toMatchObject({ place: h.place, warlord: W.id });
    expect(freed.near).toContain('p:1');
    expect(men(x, me)).toBeGreaterThanOrEqual(6);
    expect((x.sim.snapshot().piles ?? []).length).toBeGreaterThan(0);
    x.sim.order({ kind: 'claimRegion', squad: me, point: 0 });
    run(x, 1200, () => x.sim.snapshot().claims![0].state === 'claimed');
    expect(x.sim.snapshot().claims![0]).toMatchObject({ state: 'claimed', team: 0 });
  });

  it('a freed place is not retaken while it is fresh, nor once an alliance holds it', () => {
    const x = setup(flat(MARCH, [[80, 80]]), WARLORD.grow.marchDay + WARLORD.grow.march * 3, 1);
    run(x, WARLORD.think);
    const me = x.sim.spawnSquad('p:1', 0, 'hoplite', 12, 80, 100);
    x.sim.order({ kind: 'attackMove', squad: me, x: 80, y: 80 });
    run(x, 4000, () => holds(x).length === 0);
    x.sim.order({ kind: 'move', squad: me, x: 150, y: 150 });
    run(x, WARLORD.reinforce + 200);
    expect(holds(x)).toHaveLength(0);
  });

  it('12 men break a depth-2 outer holding in the seat', () => {
    const x = setup(flat(SEAT, [[30, 30], [110, 110]]), WARLORD.grow.seat, 2);
    run(x, WARLORD.think);
    expect(holds(x)).toHaveLength(2);
    const me = x.sim.spawnSquad('p:1', 0, 'hoplite', 12, 110, 135);
    x.sim.order({ kind: 'attackMove', squad: me, x: 110, y: 110 });
    run(x, 5000, () => holds(x).length === 1);
    expect(holds(x).map((h) => h.place)).toEqual(['c0']);
  });

  it('W-81: 12 level-3 hoplites take each lord\'s hall in 60-80 s for 1-5 men', () => {
    for (const w of WARLORDS) {
      const x = setup(flat(w.seat, [[80, 80]]), 0, 1);
      run(x, WARLORD.think * 2);
      const me = x.sim.spawnSquad('p:1', 0, 'hoplite', 12, 80, 98, Array.from({ length: 12 }, (_, k) => makePerson(`p${k}`, 'hoplite', { level: 3 })));
      x.sim.order({ kind: 'attackMove', squad: me, x: 80, y: 80 });
      const lordOf = () => x.lords.snaps().find((s) => s.id === w.id)!;
      const t = run(x, 1200, () => !!lordOf().fallen || men(x, me) === 0);
      expect(lordOf().fallen, w.id).toBe(true);
      expect(t / 10, w.id).toBeGreaterThanOrEqual(60);
      expect(t / 10, w.id).toBeLessThanOrEqual(80);
      expect(12 - men(x, me), w.id).toBeGreaterThanOrEqual(1);
      expect(12 - men(x, me), w.id).toBeLessThanOrEqual(5);
    }
  });

  it('the lord falls: his spoils (an item among them), a fallen note; back after WARLORD.back days, grown from nothing', () => {
    const x = setup(flat(SEAT, [[40, 40]]), 0, 1);
    run(x, WARLORD.think * 2);
    const lord = x.lords.snaps()[0].lord;
    x.sim.devUnits([lord], 'kill');
    run(x, WARLORD.think * 2);
    const s = x.lords.snaps()[0];
    expect(s.fallen).toBe(true);
    expect(x.notes.find((n) => n.what === 'fallen')).toMatchObject({ warlord: W.id });
    expect((x.sim.snapshot().piles ?? []).some((p) => (p.items ?? 0) > 0)).toBe(true);
    // the memory keeps him fallen in a fresh room
    const fresh = setup(flat(SEAT, [[40, 40]]), 0.5, 1);
    fresh.lords.recall(x.lords.memory());
    run(fresh, WARLORD.think * 2);
    expect(fresh.lords.snaps()[0]).toMatchObject({ fallen: true, holds: [] });
    fresh.lords.setAge(WARLORD.back + 0.01);
    run(fresh, WARLORD.think * 2);
    expect(fresh.lords.snaps()[0].fallen).toBeUndefined();
    expect(fresh.lords.snaps()[0].holds).toHaveLength(1);
  });

  it('his fall recalls his bands: they walk off and leave, the places free without spoils', () => {
    const x = setup(flat(MARCH, [[80, 80]]), WARLORD.grow.marchDay, 1);
    run(x, WARLORD.think * 2);
    const sq = x.sim.snapshot().squads.find((s) => s.owner.startsWith('warlord:'))!;
    expect(holds(x)).toHaveLength(1);
    const piles = (x.sim.snapshot().piles ?? []).length;
    x.notes.length = 0;
    x.lords.fell(W.id, WARLORD.grow.marchDay); // the seat's room tells: he fell
    run(x, WARLORD.think * 2);
    expect(holds(x)).toHaveLength(0);
    expect(x.lords.snaps()[0].fallen).toBe(true);
    expect(x.notes.find((n) => n.what === 'recall')).toMatchObject({ warlord: W.id, place: 'c0' });
    expect(x.notes.some((n) => n.what === 'freed')).toBe(false);
    run(x, WARLORD.recall.leave + WARLORD.think);
    expect(men(x, sq.id)).toBe(0);
    expect((x.sim.snapshot().piles ?? []).length).toBe(piles);
    // an older fall heard again changes nothing; a fall past his return is ignored
    x.lords.fell(W.id, -WARLORD.back - 1);
    expect(x.lords.memory().fallen[W.id]).toBe(WARLORD.grow.marchDay);
  });
});

describe('warlords: raids', () => {
  /** A march with his holding at (60,80) and team 0's storehouse at (110,80) on its own ground. */
  function raided(guard: number | boolean) {
    const x = setup(flat(MARCH, [[60, 80]]), WARLORD.grow.marchDay, 1);
    x.sim.claim(0, 112, 80, 14);
    x.sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 112, y: 80 });
    run(x, 2);
    const site = x.sim.snapshot().buildings!.find((b) => b.type === 'storehouse')!;
    x.sim.finishSite(site.id);
    if (guard) x.sim.spawnSquad('p:1', 0, 'hoplite', guard === true ? 6 : guard, 112, 86);
    run(x, WARLORD.raid.every + WARLORD.raid.warn * 2 + 1200);
    return { x, site: x.sim.snapshot().buildings!.find((b) => b.id === site.id)! };
  }

  it('an undefended building is warned of 60 s ahead, then raided', () => {
    const { x, site } = raided(false);
    const warn = x.notes.find((n) => n.what === 'warn')!;
    expect(warn).toMatchObject({ team: 0, in: WARLORD.raid.warn, warlord: W.id });
    expect(warn.text).toContain('storehouse');
    const raid = x.notes.find((n) => n.what === 'raid')!;
    expect(raid.t - warn.t).toBeGreaterThanOrEqual(WARLORD.raid.warn);
    expect(site.hp).toBeLessThan(site.maxHp);
  });

  it('W-81: a lightly guarded building (fewer than raid.guarded men) is raided and hurt', () => {
    const { x, site } = raided(WARLORD.raid.guarded - 1);
    expect(x.notes.some((n) => n.what === 'raid')).toBe(true);
    expect(site.hp).toBeLessThan(site.maxHp);
  });

  it('a guarded building is left alone', () => {
    const { x, site } = raided(true);
    expect(x.notes.some((n) => n.what === 'warn')).toBe(false);
    expect(site.hp).toBe(site.maxHp);
  });

  it('his men never pass the region cap', () => {
    const x = setup(flat(SEAT, [[40, 40], [100, 60], [120, 120]]), 30, 8);
    run(x, 3000);
    expect(x.lords.men()).toBeLessThanOrEqual(WARLORD.cap);
  });
});
