/**
 * W-65 roaming life (src/war/sim/roam.ts): seeded scenarios on open grass. Bandit patrols ambush the weak and let the
 * strong pass; a caravan escorted to its road's end pays coin, one robbed turns on the robbers and its wagon changes
 * hands; packs flee or attack by nature; travellers run from a fight; a group with no player near sleeps; a region's
 * roaming life comes up by depth and survives a save.
 */
import { describe, expect, it } from 'vitest';
import kyreneN from '../../src/war/regions/kyrene-n.json';
import dodona from '../../src/war/regions/dodona.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { MOB_TEAM } from '../../src/war/sim/mobs';
import { NEUTRAL_TEAM } from '../../src/war/sim/economy';
import { DENSITY, ROAM, ROAM_OWNER } from '../../src/war/sim/roam';
import type { RegionData, RoamSnap, WarBuildSim, WarEvent } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean, each?: (t: number) => void): number => {
  for (let t = 0; t < n; t++) {
    each?.(t);
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const group = (sim: WarBuildSim, id: number): RoamSnap => sim.snapshot().roam!.find((g) => g.id === id)!;
const alive = (sim: WarBuildSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead');
const centre = (sim: WarBuildSim, squad: number): [number, number] => {
  const us = alive(sim, squad);
  return [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length];
};
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cart = (sim: WarBuildSim, id: number) => sim.snapshot().sieges!.find((e) => e.id === id)!;

describe('W-65 bandit patrols', () => {
  it('ambush a weak squad by the road and let a strong one pass', () => {
    const sim = createSim(flat(160), 3);
    const g = sim.addRoamer({ kind: 'patrol', route: [[16, 80], [52, 80], [88, 80], [124, 80], [144, 80]], count: 5 });
    const patrol = group(sim, g).squads[0];
    expect(sim.snapshot().squads[patrol].team).toBe(MOB_TEAM);
    // a strong squad stands beside the road: the patrol walks by
    const strong = sim.spawnSquad('p:1', 0, 'hoplite', 12, 60, 92); // out of reach of its men, within the patrol's sight
    let attacked = false;
    run(sim, 900, () => centre(sim, patrol)[0] > 100, () => (attacked ||= group(sim, g).state === 'ambush'));
    expect(attacked).toBe(false);
    expect(centre(sim, patrol)[0]).toBeGreaterThan(100);
    expect(alive(sim, strong)).toHaveLength(12);
    // a weak one further on: ambushed
    const weak = sim.spawnSquad('p:2', 1, 'militia', 3, 136, 88);
    run(sim, 600, () => group(sim, g).state === 'ambush');
    expect(group(sim, g).state).toBe('ambush');
    run(sim, 1200, () => alive(sim, weak).length === 0);
    expect(alive(sim, weak)).toHaveLength(0);
    // then back to the road
    run(sim, 900, () => group(sim, g).state === 'walk' || group(sim, g).state === 'rest');
    expect(['walk', 'rest']).toContain(group(sim, g).state);
  });
});

describe('W-65 merchant caravans', () => {
  const road: [number, number][] = [[14, 80], [50, 80], [86, 80], [122, 80], [146, 80]];

  it('an escorted caravan that arrives whole pays its escort in coin, his alone', () => {
    const sim = createSim(flat(160), 5);
    const g = sim.addRoamer({ kind: 'caravan', route: road });
    const c = group(sim, g);
    expect(c.squads).toHaveLength(2);
    expect(cart(sim, c.cart!)).toMatchObject({ type: 'wagon', team: NEUTRAL_TEAM, owner: ROAM_OWNER });
    // the escort walks beside the wagon; another player's squad off the road earns nothing
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 6, 14, 86);
    sim.spawnSquad('p:2', 1, 'hoplite', 6, 100, 120);
    const events: WarEvent[] = [];
    run(sim, 4000, () => group(sim, g).state === 'rest', (t) => {
      if (t % 20 === 0) {
        const e = cart(sim, c.cart!);
        sim.order({ kind: 'move', squad: me, x: e.x, y: e.y + 4 });
      }
      events.push(...sim.events());
    });
    events.push(...sim.events());
    expect(group(sim, g).state).toBe('rest');
    expect(cart(sim, c.cart!).x).toBeGreaterThan(130);
    const paid = events.filter((e) => e.kind === 'caravanPaid');
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ owner: 'p:1', team: 0, coin: ROAM.pay.base + ROAM.pay.per * 1 });
    const pile = sim.snapshot().piles!.find((p) => p.claim?.owner === 'p:1');
    expect(pile?.goods.coin).toBe(ROAM.pay.base + ROAM.pay.per);
    // no fight with the escort on the way: nobody of either side fell
    expect(alive(sim, me)).toHaveLength(6);
    expect(alive(sim, c.squads[1]).length).toBeGreaterThan(0);
  });

  it('robbed: its guards turn on the robbers, the wagon and its goods change hands', () => {
    const sim = createSim(flat(160), 7);
    const g = sim.addRoamer({ kind: 'caravan', route: road, guards: 3 });
    const c = group(sim, g), [driver, guards] = c.squads;
    const goods = sim.cargo({ cart: c.cart! })!;
    expect(goods.slots[0].hold.lots.length).toBeGreaterThan(0);
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 12, 40, 86);
    run(sim, 200);
    // walking beside it, nobody fights
    expect(alive(sim, guards)).toHaveLength(3);
    sim.order({ kind: 'attack', squad: me, target: guards });
    let fought = false;
    run(sim, 2000, () => alive(sim, guards).length === 0, () => (fought ||= alive(sim, guards).some((u) => u.state === 'attack')));
    expect(fought).toBe(true); // they fought back
    expect(alive(sim, guards)).toHaveLength(0);
    // the driver too (he is angry at us now, so our men see him), then stand by the wagon until it is ours
    if (alive(sim, driver).length) {
      sim.order({ kind: 'attack', squad: me, target: driver });
      run(sim, 1500, () => alive(sim, driver).length === 0);
    }
    const events: WarEvent[] = [];
    run(sim, 1500, () => cart(sim, c.cart!).team === 0, (t) => {
      if (t % 20 === 0) sim.order({ kind: 'move', squad: me, x: cart(sim, c.cart!).x, y: cart(sim, c.cart!).y + 1.5 });
      events.push(...sim.events());
    });
    run(sim, ROAM.think + 1, undefined, () => events.push(...sim.events()));
    expect(cart(sim, c.cart!)).toMatchObject({ team: 0, owner: 'p:1' });
    expect(events.some((e) => e.kind === 'caravanRobbed' && e.by === 0)).toBe(true);
    expect(sim.cargo({ cart: c.cart! })!.slots[0].hold.lots.length).toBeGreaterThan(0); // the goods came with it
    // the caravan is gone; it comes back later at the start of its road
    expect(sim.snapshot().roam!.some((x) => x.id === g)).toBe(false);
  });
});

describe('W-65 beast packs', () => {
  it('ibex run from men; bears go for them', () => {
    const sim = createSim(flat(160), 9);
    const ibex = sim.addRoamer({ kind: 'pack', mob: 'ibex', route: [[60, 80]] });
    const bear = sim.addRoamer({ kind: 'pack', mob: 'bear', route: [[120, 80]], count: 1 });
    run(sim, 50);
    const herd = group(sim, ibex).squads[0], bears = group(sim, bear).squads[0];
    const at = centre(sim, herd);
    const a = sim.spawnSquad('p:1', 0, 'hoplite', 6, at[0] + 10, at[1]);
    run(sim, 200, () => group(sim, ibex).state === 'flee');
    expect(group(sim, ibex).state).toBe('flee');
    run(sim, 120);
    expect(dist(centre(sim, herd), centre(sim, a))).toBeGreaterThan(14);
    const b = sim.spawnSquad('p:2', 1, 'hoplite', 6, centre(sim, bears)[0] - 7, centre(sim, bears)[1]);
    run(sim, 200, () => group(sim, bear).state === 'chase');
    expect(group(sim, bear).state).toBe('chase');
    run(sim, 200);
    expect(alive(sim, b).some((u) => u.hp < u.maxHp) || alive(sim, b).length < 6).toBe(true);
  });

  it('a wolf pack hunts a squad it outnumbers and keeps away from a big one', () => {
    const sim = createSim(flat(200), 11);
    const w = sim.addRoamer({ kind: 'pack', mob: 'wolf', route: [[100, 100]], count: 4 });
    run(sim, 30);
    const wolves = group(sim, w).squads[0], at = centre(sim, wolves);
    // twelve men walk up: the pack backs off
    const big = sim.spawnSquad('p:1', 0, 'hoplite', 12, at[0] + 11, at[1]);
    run(sim, 100, () => group(sim, w).state === 'flee');
    expect(group(sim, w).state).toBe('flee');
    sim.order({ kind: 'move', squad: big, x: 190, y: 190 });
    run(sim, 1200, () => dist(centre(sim, big), centre(sim, wolves)) > 60 && group(sim, w).state !== 'flee' && group(sim, w).state !== 'return');
    // two men alone: stalked, then attacked
    const at2 = centre(sim, wolves);
    const lone = sim.spawnSquad('p:2', 1, 'militia', 2, at2[0] - 18, at2[1]);
    const states = new Set<string>();
    run(sim, 600, () => group(sim, w).state === 'chase', () => states.add(group(sim, w).state));
    expect(group(sim, w).state).toBe('chase');
    run(sim, 600, () => alive(sim, lone).length === 0);
    expect(alive(sim, lone)).toHaveLength(0);
  });

  it('idles, grazes and roams its territory when nothing is near', () => {
    const sim = createSim(flat(160), 13);
    sim.spawnSquad('p:1', 0, 'hoplite', 1, 110, 110); // a watcher off its territory keeps it awake
    const g = sim.addRoamer({ kind: 'pack', mob: 'boar', route: [[60, 60]] });
    const seen = new Set<string>(), spots: [number, number][] = [];
    run(sim, 3000, undefined, (t) => {
      seen.add(group(sim, g).state);
      if (t % 300 === 0) spots.push(centre(sim, group(sim, g).squads[0]));
    });
    expect(seen.has('graze') || seen.has('roam')).toBe(true);
    expect(seen.has('idle')).toBe(true);
    const far = Math.max(...spots.map((p) => dist(p, [60, 60])));
    expect(far).toBeGreaterThan(5); // it moves about
    expect(far).toBeLessThan(ROAM.territory + 12); // within its territory
  });
});

describe('W-65 travellers and sleep', () => {
  it('travellers run from a fight near the road, then walk on', () => {
    const sim = createSim(flat(160), 15);
    const g = sim.addRoamer({ kind: 'traveller', route: [[14, 80], [50, 80], [86, 80], [122, 80]], count: 2 });
    const folk = group(sim, g).squads[0];
    expect(sim.snapshot().squads[folk].team).toBe(NEUTRAL_TEAM);
    run(sim, 150);
    const at = centre(sim, folk);
    // two players' squads fight a little ahead of them
    const a = sim.spawnSquad('p:1', 0, 'hoplite', 6, at[0] + 12, at[1] + 6), b = sim.spawnSquad('p:2', 1, 'hoplite', 6, at[0] + 14, at[1] + 8);
    sim.order({ kind: 'attack', squad: a, target: b });
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 200, () => group(sim, g).state === 'flee');
    expect(group(sim, g).state).toBe('flee');
    // nobody touched them
    expect(alive(sim, folk)).toHaveLength(2);
  });

  it('a group with no player near sleeps (holds, no thinking) and wakes when one comes', () => {
    const sim = createSim(flat(256), 17);
    const g = sim.addRoamer({ kind: 'traveller', route: [[20, 20], [56, 20], [92, 20]], count: 2 });
    run(sim, 2 * ROAM.think);
    expect(group(sim, g).asleep).toBe(true);
    const folk = group(sim, g).squads[0], at = centre(sim, folk);
    run(sim, 300);
    expect(dist(centre(sim, folk), at)).toBeLessThan(2);
    sim.spawnSquad('p:1', 0, 'hoplite', 1, at[0] + 60, at[1] + 60);
    run(sim, 300);
    expect(group(sim, g).asleep).toBeUndefined();
    expect(dist(centre(sim, folk), at)).toBeGreaterThan(5);
  });
});

describe('W-65 a region comes alive', () => {
  it('by depth: an entry gets packs, a patrol, a caravan and travellers; a home caravans and travellers only', () => {
    const entry = createSim(parseRegion(kyreneN) as RegionData, 1);
    entry.spawnMobs();
    entry.spawnRoam();
    const kinds = (sim: WarBuildSim) => sim.snapshot().roam!.map((g) => g.kind);
    const e = kinds(entry);
    expect(e.filter((k) => k === 'pack')).toHaveLength(DENSITY[1].packs);
    expect(e.filter((k) => k === 'caravan')).toHaveLength(DENSITY[1].caravans);
    expect(e.filter((k) => k === 'traveller').length).toBeGreaterThan(0);
    expect(entry.snapshot().roam!.filter((g) => g.kind === 'pack').every((g) => g.mob === 'jackal' || g.mob === 'lion')).toBe(true); // its fauna (W-67: lions and scorpions)
    const home = createSim(parseRegion(dodona) as RegionData, 1);
    home.spawnRoam();
    const h = kinds(home);
    expect(h.filter((k) => k === 'pack' || k === 'patrol')).toHaveLength(0);
    expect(h.filter((k) => k === 'traveller').length).toBeGreaterThan(0);
  });

  it('is deterministic and survives a save', () => {
    const region = parseRegion(kyreneN) as RegionData;
    const make = () => {
      const s = createSim(region, 4);
      s.spawnMobs();
      s.spawnRoam();
      s.spawnSquad('p:1', 0, 'hoplite', 12, 256, 60);
      return s;
    };
    const a = make(), b = make();
    run(a, 600);
    run(b, 600);
    expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
    const c = createSim(region, 4);
    c.importState(JSON.parse(JSON.stringify(a.exportState())));
    run(a, 600);
    run(c, 600);
    expect(JSON.stringify(c.snapshot())).toBe(JSON.stringify(a.snapshot()));
  });
});
