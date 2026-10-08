import { describe, expect, it } from 'vitest';
import { World, decodeBits, encodeBits, WORLD_RULES } from '../src/world/world';
import { CAMP_RULES, FOOD_RULES, STRUCTURES, campBlocker, campEffects, freeSpot, placeCheck } from '../src/world/camp';
import { Campaign } from '../src/game/campaign';
import { passable } from '../src/world/map';
import { deserialize, serialize } from '../src/game/save';

const info = { power: 100, size: 3, mouths: 3 };

/** A world with the party moved to the first tile where it may camp. */
function campable(seed: number | World = 7): World {
  const w = typeof seed === 'number' ? new World(World.fresh(seed)) : seed;
  const m = w.map;
  const st = m.settlements[m.start];
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (campBlocker(m, x, y)) continue;
      const d = Math.hypot(x - st.x, y - st.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  w.s.x = best!.x + 0.5;
  w.s.y = best!.y + 0.5;
  return w;
}

describe('fog of war', () => {
  it('starts with the home country explored and reveals around the march', () => {
    const w = new World(World.fresh(3));
    const st = w.map.settlements[w.map.start];
    expect(w.isExplored(st.x, st.y)).toBe(true);
    expect(w.s.found).toContain(st.id);
    const known = w.explored.reduce((a, b) => a + b, 0);
    expect(known).toBeGreaterThan(40);
    expect(known).toBeLessThan(w.map.w * w.map.h * 0.1);
    // march somewhere far: more is explored, and the log reports it
    const far = w.map.settlements.filter((s) => s.kind !== 'lair').sort((a, b) => Math.hypot(b.x - st.x, b.y - st.y) - Math.hypot(a.x - st.x, a.y - st.y))[0];
    expect(w.setDestination(far.x, far.y, far.id)).toBe(true);
    w.s.safeUntil = 1e9;
    for (let i = 0; i < 400 && w.moving; i++) w.advance(0.5, info);
    expect(w.explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(known + 50);
    expect(w.revealLog.length).toBeGreaterThan(50);
    expect(w.s.found).toContain(far.id);
    expect(w.discoveries).toContain(far.id);
  });

  it('survives a save round trip and old saves without fog', () => {
    const c = Campaign.fresh(11);
    const w = c.world;
    w.reveal(10, 10, 4);
    c.sync();
    const back = deserialize(serialize(c.data))!;
    const w2 = new World(back.world);
    expect(String(w2.explored)).toBe(String(w.explored));
    // an old save: no fog, no provisions -> regenerated around the party, stocked
    const old = { ...back.world, fog: undefined, food: undefined, supplies: undefined, found: undefined };
    const w3 = new World(old);
    expect(w3.isExplored(Math.floor(old.x), Math.floor(old.y))).toBe(true);
    expect(w3.food).toBe(FOOD_RULES.startFood);
    expect(w3.supplies).toBe(FOOD_RULES.startSupplies);
  });

  it('bitset codec round-trips', () => {
    const a = new Uint8Array(1000).map((_, i) => (i * 7919) % 3 === 0 ? 1 : 0);
    const b = new Uint8Array(1000);
    expect(decodeBits(encodeBits(a), b)).toBe(true);
    expect(String(a)).toBe(String(b));
    expect(decodeBits('xx', b)).toBe(false);
  });
});

describe('provisions', () => {
  it('the party eats one ration per hero per day; starving slows and stops most healing', () => {
    const w = new World(World.fresh(5));
    w.s.safeUntil = 1e9;
    const food0 = w.food;
    w.advance(24, { power: 100, size: 4, mouths: 6 }, true);
    expect(food0 - w.food).toBeCloseTo(6, 1);
    w.s.food = 0;
    expect(w.starving).toBe(true);
    expect(w.healRate()).toBeLessThan(WORLD_RULES.healRoad);
  });

  it('villages and towns sell rations and supplies', () => {
    const c = Campaign.fresh(9);
    const w = c.world;
    const town = w.map.start;
    const g = c.data.gold;
    const f = w.food;
    expect(c.buyProvisions('food', town)).toBe(true);
    expect(w.food).toBe(f + 10);
    expect(c.data.gold).toBe(g - FOOD_RULES.foodPrice.town);
    c.data.gold = 0;
    expect(c.buyProvisions('supplies', town)).toBe(false);
  });
});

describe('field camp', () => {
  it('cannot camp in or next to a settlement, can on open land', () => {
    const w = new World(World.fresh(7));
    expect(w.campBlocker()).toMatch(/close/i);
    const w2 = campable(7);
    expect(w2.campBlocker()).toBeNull();
    expect(w2.makeCamp()).toBeNull();
    const c = w2.camp!;
    expect(c.zone.length).toBeGreaterThanOrEqual(CAMP_RULES.minTiles);
    for (const i of c.zone) expect(passable(w2.map, i % w2.map.w, Math.floor(i / w2.map.w))).toBe(true);
    // camped: no marching until the camp is struck
    expect(w2.setDestination(c.x + 6, c.y)).toBe(false);
  });

  it('structures go inside the zone on free ground, cost supplies and improve the camp', () => {
    const w = campable(7);
    w.makeCamp();
    const c = w.camp!;
    const base = campEffects(w.map, c);
    expect(base.heal).toBe(CAMP_RULES.heal);
    expect(base.heal).toBeGreaterThan(1.5); // faster than the old camp rate
    w.s.supplies = 60;
    // the party's own tile and tiles outside the zone are refused
    expect(placeCheck(w.map, c, 'tent', c.x, c.y).ok).toBe(false);
    expect(placeCheck(w.map, c, 'tent', c.x + 20, c.y).ok).toBe(false);
    for (const id of ['tent', 'tent', 'fire', 'palisade', 'forge', 'training'] as const) {
      const at = freeSpot(w.map, c, id);
      expect(at, id).not.toBeNull();
      expect(w.build(id, at!.x, at!.y)).toBeNull();
    }
    expect(w.supplies).toBe(60 - 4 - 4 - 2 - 8 - 10 - 8);
    // no overlap, fire is unique
    const at = freeSpot(w.map, c, 'fire');
    if (at) expect(w.build('fire', at.x, at.y)).toMatch(/has a/);
    const fx = campEffects(w.map, c);
    expect(fx.heal).toBeCloseTo(CAMP_RULES.heal + 2 * CAMP_RULES.healTent + CAMP_RULES.healFire);
    expect(fx.heal).toBeLessThanOrEqual(WORLD_RULES.healTown + 0.5);
    expect(fx.fortified && fx.forge && fx.drill).toBe(true);
    expect(fx.forage).toBeGreaterThan(base.forage);
    // striking camp gives half the supplies back
    const s0 = w.supplies;
    expect(w.breakCamp()).toBe(Math.floor((4 + 4 + 2 + 8 + 10 + 8) / 2));
    expect(w.supplies).toBe(s0 + 18);
    expect(w.camp).toBeNull();
  });

  it('a camp heals, mends gear and drills novices; a palisade keeps bands off', () => {
    const c = Campaign.fresh(7);
    const w = c.world;
    campable(w);
    expect(w.makeCamp()).toBeNull();
    w.s.supplies = 60;
    for (const id of ['tent', 'fire', 'forge', 'training', 'palisade'] as const) {
      const at = freeSpot(w.map, w.camp!, id)!;
      expect(w.build(id, at.x, at.y)).toBeNull();
    }
    const [a, b] = c.data.heroes;
    a.wound = 20;
    const item = Object.values(b.equip).find(Boolean)!;
    item.cond = 50;
    const xp0 = b.xp + b.level * 1000;
    // a strong band right next to the camp
    const p = w.spawnParty('lair')!;
    p.power = 1e6;
    p.x = w.s.x + 0.3;
    p.y = w.s.y;
    p.idle = 0;
    w.s.safeUntil = 0;
    const r = w.advance(6, c.playerInfo(), true);
    expect(r.events.length).toBe(0);
    c.tickWorld(6);
    expect(a.wound).toBeLessThan(20 - 6 * 2);
    expect(item.cond).toBeGreaterThan(70);
    expect(b.xp + b.level * 1000).toBeGreaterThan(xp0);
  });

  it('the forge tempers gear for supplies and gold', () => {
    const c = Campaign.fresh(7);
    const w = c.world;
    campable(w);
    w.makeCamp();
    w.s.supplies = 40;
    c.data.gold = 500;
    const item = c.data.stash[0];
    expect(c.temper(item)).toBe(false); // no forge yet
    const at = freeSpot(w.map, w.camp!, 'forge')!;
    w.build('forge', at.x, at.y);
    const r0 = item.rarity;
    expect(c.temperCost(item)).not.toBeNull();
    expect(c.temper(item)).toBe(true);
    expect(item.rarity).not.toBe(r0);
  });

  it('structure catalogue is sane', () => {
    for (const d of Object.values(STRUCTURES)) {
      expect(d.cost).toBeGreaterThan(0);
      expect(d.w * d.h).toBeLessThanOrEqual(4);
    }
  });
});
