import { describe, expect, it } from 'vitest';
import { DeltaDecoder } from '../../../src/war/net/codec';
import { CELL } from '../../../src/war/net/interest';
import { NET_VERSION, VISION, type JoinMsg } from '../../../src/war/net/protocol';
import { createSim } from '../../../src/war/sim';
import { CORPSE_TICKS, WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('test-ridge')!;
const join = (pid: number, team: number, count = 20, cls = 'hoplite', squads = 1): JoinMsg => ({
  t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: Array.from({ length: squads }, () => ({ cls, count })),
});
const room = (cap = 600) => new WarRoom({ region, seed: 1, cap });
const steps = (r: WarRoom, n: number) => {
  let last: ReturnType<WarRoom['tick']> | null = null;
  for (let i = 0; i < n; i++) last = r.tick();
  return last!;
};

describe('WarRoom joins and quotas', () => {
  it('welcomes a player with squads on its alliance entry', () => {
    const r = room();
    const res = r.join(1, join(1, 0, 20, 'hoplite', 2));
    expect(res.msg).toMatchObject({ t: 'welcome', you: { id: 1, team: 0 }, squads: [0, 1] });
    steps(r, 1);
    const north = r.region.entries.find((e) => e.side === 'N')!;
    for (const u of r.snapshot().units) expect(u.y).toBeLessThan(north.y + north.h + 4);
    expect(r.quota().live).toEqual([40, 0, 0, 0]);
  });

  it('refuses joins that do not fit the rules', () => {
    const r = room();
    expect(r.join(1, join(2, 0)).msg).toMatchObject({ t: 'refused', reason: 'player' });
    expect(r.join(1, { ...join(1, 0), v: 99 }).msg).toMatchObject({ reason: 'version' });
    expect(r.join(1, { ...join(1, 0), region: 'elsewhere' }).msg).toMatchObject({ reason: 'region' });
    expect(r.join(1, join(1, 0, 20, 'dragonrider')).msg).toMatchObject({ reason: 'army' });
    r.join(1, join(1, 0, 20, 'hoplite', 3));
    expect(r.join(1, join(1, 0)).msg).toMatchObject({ reason: 'squads' });
    expect(r.join(1, join(1, 2)).msg).toMatchObject({ reason: 'team' });
  });

  it('queues joins over the alliance quota and lets them in when men fall', () => {
    const r = room(160); // 40 per alliance
    expect(r.join(1, join(1, 0)).admitted).toBe(true);
    expect(r.join(2, join(2, 0)).admitted).toBe(true);
    const q = r.join(3, join(3, 0, 10));
    expect(q.msg).toMatchObject({ t: 'queued', reason: 'quota', pos: 1, need: 10 });
    expect(r.join(4, join(4, 1)).admitted).toBe(true); // other alliances are not held up
    expect(r.join(5, join(5, 0, 50)).msg).toMatchObject({ t: 'refused', reason: 'quota' }); // never fits
    steps(r, 1);
    expect(r.quota().live).toEqual([40, 20, 0, 0]);
    // player 4's army hunts player 1's squad down until there is room
    let admitted = false;
    const enemyOf1 = r.squadsOf(4)[0];
    r.sim.spawnSquad('bot', 1, 'hoplite', 20, 190, 12);
    r.sim.order({ kind: 'attack', squad: 3, target: 0 });
    r.order(4, { kind: 'attack', squad: enemyOf1, target: 0 });
    for (let t = 0; t < 3000 && !admitted; t++) admitted = r.tick().admitted.get(3)?.t === 'welcome';
    expect(admitted).toBe(true);
    expect(r.squadsOf(3)).toHaveLength(1);
  });
});

describe('WarRoom orders', () => {
  it('takes orders only for the player own squads', () => {
    const r = room();
    r.join(1, join(1, 0));
    r.join(2, join(2, 1));
    steps(r, 1);
    expect(r.order(1, { kind: 'move', squad: 0, x: 200, y: 40 })).toBeNull();
    expect(r.order(1, { kind: 'move', squad: 1, x: 200, y: 40 })).toBe('notOwner');
    expect(r.order(1, { kind: 'hold', squad: 7 })).toBe('notOwner');
    expect(r.order(1, { kind: 'attack', squad: 0, target: 1 })).toBeNull();
    expect(r.order(1, { kind: 'attack', squad: 0, target: 0 })).toBe('badTarget');
    expect(r.order(1, { kind: 'merge', squad: 0, into: 1 })).toBe('notOwner');
    expect(r.order(1, { kind: 'move', squad: 0, x: -5, y: 40 })).toBe('bad');
    expect(r.order(9, { kind: 'hold', squad: 0 })).toBe('notJoined');
    // a detached squad belongs to the player too
    expect(r.order(1, { kind: 'detach', squad: 0, count: 5 })).toBeNull();
    steps(r, 1);
    expect(r.squadsOf(1)).toEqual([0, 2]);
    expect(r.order(1, { kind: 'hold', squad: 2 })).toBeNull();
  });

  it('offline squads stay, hold with the bot AI and are handed back on rejoin', () => {
    const r = room();
    r.join(1, join(1, 0));
    steps(r, 1);
    r.order(1, { kind: 'move', squad: 0, x: 192, y: 60 });
    steps(r, 30);
    r.leave(1);
    expect(r.online()).toBe(0);
    expect(r.active()).toBe(true); // armies present: the region keeps running
    const t = steps(r, 20);
    expect(t.frames.size).toBe(0);
    expect(r.bots.phase(0)).toBeDefined();
    expect(r.snapshot().squads[0].order).toBe('hold');
    expect(r.quota().live[0]).toBe(20);
    const back = r.join(1, join(1, 0));
    expect(back.msg).toMatchObject({ t: 'welcome', squads: [0] });
    expect(r.squadsOf(1)).toEqual([0]); // no second army
    expect(r.bots.phase(0)).toBeUndefined();
  });
});

describe('WarRoom interest management', () => {
  it('sends each client its own units, and foes only within vision and camera', () => {
    const r = room();
    r.join(1, join(1, 0)); // north entry
    r.join(2, join(2, 1)); // east entry, far away
    const decs = new Map([[1, new DeltaDecoder()], [2, new DeltaDecoder()]]);
    const apply = (n: number) => {
      for (let i = 0; i < n; i++) for (const [pid, f] of r.tick().frames) decs.get(pid)!.apply(f);
    };
    apply(2);
    const squadsSeen = (pid: number) => new Set([...decs.get(pid)!.units.values()].map((u) => u.squad));
    expect(squadsSeen(1)).toEqual(new Set([0]));
    expect(squadsSeen(2)).toEqual(new Set([1]));
    // both march on the ford: the foe is seen once within vision
    r.order(1, { kind: 'move', squad: 0, x: 262, y: 110 });
    r.order(2, { kind: 'move', squad: 1, x: 290, y: 124 });
    let met = false;
    for (let t = 0; t < 3000 && !met; t++) {
      apply(1);
      met = squadsSeen(1).has(1);
    }
    expect(met).toBe(true);
    // nearest pair within the vision radius (plus the cell slack of the coarse mask)
    const us = [...decs.get(1)!.units.values()], foes = us.filter((u) => u.squad === 1), mine = us.filter((u) => u.squad === 0 && u.state !== 'dead');
    const near = Math.min(...foes.flatMap((f) => mine.map((m) => Math.hypot(f.x - m.x, f.y - m.y))));
    expect(near).toBeLessThan(VISION + 2 * CELL * Math.SQRT2);
    // a camera far away: the foe drops out, own units stay
    r.view(1, { x0: 400, y0: 400, x1: 440, y1: 430 });
    apply(1);
    expect(squadsSeen(1)).toEqual(new Set([0]));
  });

  it('keeps per-client bandwidth low once squads stand still', () => {
    const r = room();
    for (let p = 1; p <= 8; p++) r.join(p, join(p, p % 4));
    steps(r, 60);
    const before = r.bytesSent();
    steps(r, 10);
    for (const [pid, b] of r.bytesSent()) expect(b - before.get(pid)!).toBeLessThan(10 * 400);
  });
});

describe('WarRoom corpses', () => {
  it('stops sending the fallen after CORPSE_TICKS', () => {
    const r = room();
    r.join(1, join(1, 0, 20, 'militia'));
    steps(r, 1);
    const foe = r.sim.spawnSquad('bot', 1, 'hoplite', 20, 192, 12);
    r.sim.order({ kind: 'attack', squad: foe, target: 0 });
    const dec = new DeltaDecoder();
    for (let t = 0; t < 400 + CORPSE_TICKS; t++) for (const f of r.tick().frames.values()) dec.apply(f);
    const deadSim = r.snapshot().units.filter((u) => u.state === 'dead').length;
    const deadWire = [...dec.units.values()].filter((u) => u.state === 'dead').length;
    expect(deadSim).toBeGreaterThan(0);
    expect(deadWire).toBeLessThan(deadSim);
  });
});

describe('WarRoom determinism', () => {
  it('replays the same joins and orders to the same world, the same as a bare sim', () => {
    const run = () => {
      const r = room();
      r.join(1, join(1, 0, 20, 'hoplite'));
      r.join(2, join(2, 1, 20, 'archer'));
      steps(r, 1);
      r.order(1, { kind: 'move', squad: 0, x: 300, y: 120 });
      r.order(2, { kind: 'move', squad: 1, x: 300, y: 125 });
      steps(r, 150);
      r.order(1, { kind: 'attack', squad: 0, target: 1 });
      steps(r, 150);
      return r;
    };
    const a = run(), b = run();
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    // the room only adds orders: a bare sim fed the same spawns and logged orders at the same ticks matches
    const sim = createSim(region, 1);
    const s0 = a.snapshot().units;
    sim.spawnSquad('p:1', 0, 'hoplite', 20, ...spawnAt(a, 0));
    sim.spawnSquad('p:2', 1, 'archer', 20, ...spawnAt(a, 1));
    expect(s0.length).toBe(40);
    let i = 0;
    while (sim.snapshot().tick < a.currentTick) {
      while (i < a.log.length && a.log[i].tick === sim.snapshot().tick) sim.order(a.log[i++].o);
      sim.step();
    }
    expect(JSON.stringify(sim.snapshot())).toBe(JSON.stringify(a.snapshot()));
  });
});

/** Where the room asked the sim to spawn squad k (its entry grid; see WarRoom.spawn). */
function spawnAt(r: WarRoom, k: number): [number, number] {
  const e = r.region.entries.find((x) => x.side === ['N', 'E', 'S', 'W'][k])!;
  const ox = ((k % 5) - 2) * 6, oy = ((Math.floor(k / 5) % 5) - 2) * 6;
  return [Math.min(e.x + e.w - 1, Math.max(e.x + 1, e.x + e.w / 2 + ox)), Math.min(e.y + e.h - 1, Math.max(e.y + 1, e.y + e.h / 2 + oy))];
}
