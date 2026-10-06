import { describe, expect, it } from 'vitest';
import { generateMap, passable, travelCost, T, isWater } from '../src/world/map';
import { findPath } from '../src/world/path';
import { World, partyArmy, threatLevel } from '../src/world/world';
import { Campaign } from '../src/game/campaign';
import { chunk, deserialize, migrate, readSave, serialize, writeSave, SAVE_VERSION, type KV } from '../src/game/save';
import { MAX_ARMY } from '../src/data/units';
import type { Outcome } from '../src/game/loot';

function memoryKV(limit = 4096): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async set(k, v) { if (v.length > limit) throw new Error('value too long'); store.set(k, v); },
    async remove(k) { store.delete(k); },
  };
}

describe('world map generation', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = generateMap(5);
    const b = generateMap(5);
    const c = generateMap(6);
    expect(String(a.terrain) === String(b.terrain)).toBe(true);
    expect(String(a.road) === String(b.road)).toBe(true);
    expect(a.settlements).toEqual(b.settlements);
    expect(String(a.terrain) === String(c.terrain)).toBe(false);
  });

  it('has sea, land, mountains, rivers, roads and every kind of settlement, all reachable', () => {
    for (const seed of [1, 2, 3, 4]) {
      const m = generateMap(seed);
      const count = (t: number) => m.terrain.filter((x) => x === t).length;
      expect(count(T.sea) + count(T.deep)).toBeGreaterThan(m.w * m.h * 0.2);
      expect(count(T.mountain)).toBeGreaterThan(0);
      expect(count(T.forest)).toBeGreaterThan(0);
      expect(m.river.some((x) => x === 1)).toBe(true);
      expect(m.road.some((x) => x === 1)).toBe(true);
      const kinds = new Set(m.settlements.map((s) => s.kind));
      expect([...kinds].sort()).toEqual(['lair', 'town', 'village']);
      const st = m.settlements[m.start];
      expect(st.kind).toBe('town');
      for (const s of m.settlements) {
        expect(passable(m, s.x, s.y)).toBe(true);
        const p = findPath(m.w, m.h, (x, y) => travelCost(m, x, y), st.x, st.y, s.x, s.y, 0.55);
        expect(p, `${s.name} reachable`).not.toBeNull();
      }
    }
  });

  it('paths avoid water and mountains; roads are cheaper than forests', () => {
    const m = generateMap(3);
    const towns = m.settlements.filter((s) => s.kind !== 'lair');
    const p = findPath(m.w, m.h, (x, y) => travelCost(m, x, y), towns[0].x, towns[0].y, towns[1].x, towns[1].y, 0.55)!;
    for (const q of p) {
      const t = m.terrain[q.y * m.w + q.x];
      expect(isWater(t)).toBe(false);
      expect(t).not.toBe(T.mountain);
    }
    const roadTile = m.road.findIndex((r) => r === 1);
    const forestTile = m.terrain.findIndex((t, i) => t === T.forest && !m.road[i] && !m.river[i]);
    expect(travelCost(m, roadTile % m.w, Math.floor(roadTile / m.w))).toBeLessThan(travelCost(m, forestTile % m.w, Math.floor(forestTile / m.w)));
  });
});

describe('world simulation', () => {
  it('the party travels to a village and time passes only while moving', () => {
    const w = new World(World.fresh(21));
    const v = w.map.settlements.find((s) => s.kind === 'village')!;
    const t0 = w.s.time;
    w.s.safeUntil = 1e9; // no ambushes for this test
    expect(w.setDestination(v.x, v.y, v.id)).toBe(true);
    let arrived = false;
    for (let i = 0; i < 2000 && !arrived; i++) {
      const r = w.advance(0.1, { power: 1000, size: 3 });
      if (r.events.some((e) => e.type === 'arrive' && e.settlement === v.id)) arrived = true;
    }
    expect(arrived).toBe(true);
    expect(Math.floor(w.s.x)).toBe(v.x);
    expect(Math.floor(w.s.y)).toBe(v.y);
    expect(w.s.time).toBeGreaterThan(t0);
    expect(w.moving).toBe(false);
  });

  it('a stronger band chases the party and forces an encounter; a weak one flees', () => {
    const w = new World(World.fresh(22));
    w.s.parties = [];
    const strong = w.spawnParty('lair')!;
    strong.power = 1e6;
    strong.idle = 0;
    strong.x = w.s.x + 4;
    strong.y = w.s.y;
    const tile = w.nearestPassable(Math.floor(strong.x), Math.floor(strong.y))!;
    strong.x = tile.x + 0.5;
    strong.y = tile.y + 0.5;
    let met = false;
    for (let i = 0; i < 400 && !met; i++) {
      const r = w.advance(0.05, { power: 100, size: 3 }, true);
      if (r.events.some((e) => e.type === 'encounter' && e.party === strong.id && !e.byPlayer)) met = true;
    }
    expect(met).toBe(true);

    const w2 = new World(World.fresh(22));
    w2.s.parties = [];
    const weak = w2.spawnParty('lair')!;
    weak.power = 1;
    weak.idle = 0;
    weak.x = tile.x + 0.5;
    weak.y = tile.y + 0.5;
    const d0 = Math.hypot(weak.x - w2.s.x, weak.y - w2.s.y);
    for (let i = 0; i < 40; i++) w2.advance(0.05, { power: 100, size: 3 }, true);
    expect(weak.mode).toBe('flee');
    expect(Math.hypot(weak.x - w2.s.x, weak.y - w2.s.y)).toBeGreaterThan(d0);
  });

  it('band armies regenerate identically from their seed', () => {
    const w = new World(World.fresh(23));
    const p = w.s.parties[0];
    const a = partyArmy(p, { nextId: 1 });
    const b = partyArmy(p, { nextId: 1 });
    expect(a.heroes.map((h) => h.name)).toEqual(b.heroes.map((h) => h.name));
    expect(a.power).toBeCloseTo(p.power, 6);
    expect(a.heroes.length).toBe(p.size);
    expect(threatLevel(0.3)).toBe(0);
    expect(threatLevel(3)).toBe(4);
  });

  it('settlement pools: villages offer 1-3 raw recruits, towns sell gear; stock refreshes with time', () => {
    const c = Campaign.fresh(31);
    const w = c.world;
    const v = w.map.settlements.find((s) => s.kind === 'village')!;
    const town = w.map.settlements.find((s) => s.kind === 'town')!;
    const pool = w.recruits(v.id, c.data.heroes);
    expect(pool.length).toBeGreaterThanOrEqual(1);
    expect(pool.length).toBeLessThanOrEqual(3);
    expect(w.recruits(v.id, c.data.heroes).map((r) => r.hero.name)).toEqual(pool.map((r) => r.hero.name));
    c.data.gold = 1000;
    const n = c.data.heroes.length;
    const hired = c.hire(v.id, pool[0].index)!;
    expect(hired.name).toBe(pool[0].hero.name);
    expect(c.data.heroes.length).toBe(n + 1);
    expect(c.data.gold).toBe(1000 - pool[0].price);
    expect(w.recruits(v.id, c.data.heroes).length).toBe(pool.length - 1);
    expect(c.hire(v.id, pool[0].index)).toBeNull();
    const wares = w.wares(town.id);
    expect(wares.length).toBe(10);
    const item = c.buy(town.id, wares[0].index)!;
    expect(c.data.stash.some((i) => i.uid === item.uid)).toBe(true);
    expect(w.wares(town.id).length).toBe(9);
    // After the refresh period the village has a new pool.
    w.s.time += 73;
    expect(w.recruits(v.id, c.data.heroes).length).toBeGreaterThanOrEqual(1);
    expect(w.wares(town.id).length).toBe(10);
    expect(w.wares(v.id).length).toBe(0);
  });
});

describe('campaign on the map', () => {
  it('starts with three heroes and little gold, capped at 20', () => {
    const c = Campaign.fresh(40);
    expect(c.data.heroes.length).toBe(3);
    expect(c.data.gold).toBeLessThanOrEqual(80);
    c.data.gold = 1e6;
    while (c.recruit()) { /* fill */ }
    expect(c.data.heroes.length).toBe(MAX_ARMY);
  });

  it('wounded heroes sit out, heal with rest and can be treated for gold', () => {
    const c = Campaign.fresh(41);
    c.data.heroes[0].wound = 36;
    expect(c.fitHeroes().map((h) => h.id)).not.toContain(c.data.heroes[0].id);
    c.world.s.inside = c.world.map.start;
    c.rest(8);
    expect(c.data.heroes[0].wound).toBeCloseTo(36 - 8 * 3, 5);
    const cost = c.healCost();
    expect(cost).toBeGreaterThan(0);
    c.data.gold = cost;
    expect(c.healAll()).toBe(true);
    expect(c.data.heroes[0].wound).toBe(0);
    expect(c.data.gold).toBe(0);
  });

  it('spending attribute points and taking perks', () => {
    const c = Campaign.fresh(42);
    const h = c.data.heroes[0];
    expect(h.points).toBe(2);
    const str = h.attrs.str;
    expect(c.spendPoint(h.id, 'str')).toBe(true);
    expect(h.attrs.str).toBe(str + 1);
    expect(c.takePerk(h.id, 'shield_drill')).toBe(true);
    expect(c.takePerk(h.id, 'fleet')).toBe(false); // one perk point at level 2
  });

  it('a won battle destroys the band; a lost one weakens it and both break off', () => {
    const c = Campaign.fresh(43);
    const [p1, p2] = c.world.s.parties;
    const base: Outcome = { victory: true, draw: false, gold: 0, picks: 0, loot: [], heroes: [], enemyKilled: 1, enemyTotal: p1.size, lost: 0 };
    c.afterPartyBattle(p1.id, base);
    expect(c.world.party(p1.id)).toBeUndefined();
    const size = p2.size;
    c.afterPartyBattle(p2.id, { ...base, victory: false, enemyKilled: 1 });
    if (size > 1) expect(c.world.party(p2.id)!.size).toBe(size - 1);
    expect(c.world.s.safeUntil).toBeGreaterThan(c.world.s.time);
  });

  it('surrender only for hopelessly weak bands; flee chance is bounded', () => {
    const c = Campaign.fresh(44);
    const p = c.world.s.parties[0];
    p.power = 1;
    expect(c.canSurrender(p.id)).toBe(true);
    const g = c.data.gold;
    expect(c.acceptSurrender(p.id)).toBeGreaterThan(0);
    expect(c.data.gold).toBeGreaterThan(g);
    const q = c.world.s.parties[0];
    q.power = 1e6;
    expect(c.canSurrender(q.id)).toBe(false);
    const f = c.fleeChance(q.id);
    expect(f).toBeGreaterThanOrEqual(0.15);
    expect(f).toBeLessThanOrEqual(0.9);
  });
});

describe('save v3', () => {
  it('round-trips the world state and keeps the world on reload', async () => {
    const c = Campaign.fresh(50);
    c.world.setDestination(c.world.map.settlements[1].x, c.world.map.settlements[1].y);
    c.world.advance(3, c.playerInfo());
    const text = serialize(c.sync());
    const back = deserialize(text)!;
    expect(back.v).toBe(SAVE_VERSION);
    expect(back.world).toEqual(c.data.world);
    const again = new Campaign(back);
    expect(again.world.s.x).toBeCloseTo(c.world.s.x, 9);
    expect(again.world.s.parties.length).toBe(c.world.s.parties.length);
    // big campaign still fits CloudStorage chunks
    c.data.gold = 1e6;
    while (c.recruit()) { /* fill */ }
    const parts = chunk(serialize(c.sync()));
    expect(parts.every((p) => p.length <= 4096)).toBe(true);
    const kv = memoryKV();
    await writeSave(kv, c.data);
    expect(await readSave(kv)).toEqual(JSON.parse(serialize(c.data)));
  });

  it('migrates a v2 save: heroes get attributes and points, a world is generated', () => {
    const c = Campaign.fresh(51);
    const v2 = JSON.parse(serialize(c.sync()));
    v2.v = 2;
    delete v2.world;
    v2.heroes = v2.heroes.map((h: Record<string, unknown>) => {
      const { attrs: _a, points: _p, perks: _k, wound: _w, ...rest } = h;
      return { ...rest, level: 3 };
    });
    const m = migrate(v2)!;
    expect(m.v).toBe(SAVE_VERSION);
    expect(m.world.parties.length).toBeGreaterThan(0);
    expect(m.heroes.every((h) => h.attrs.str === 5 && h.points === 4 && h.perks.length === 0 && h.wound === 0)).toBe(true);
  });
});
