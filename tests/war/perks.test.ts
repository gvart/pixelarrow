// W-84, W-110, W-112, W-113: the perk tables, each effect through men, sites and carts in the sim, and classes opening by level.
import { describe, expect, it } from 'vitest';
import { PERKS, perkFx, type PerkFx, type PerkPath } from '../../src/data/warPerks';
import { CLASSES, isClassId } from '../../src/data/classes';
import { FAVOUR_MAX, FAVOUR_REASON, favourView, HOUR_CAP, PAYS, perkRows, type FavourReason } from '../../src/war/net/favour';
import { createSim } from '../../src/war/sim';
import { warStatsOf, withPerks } from '../../src/war/sim/classes';
import { makePerson, promotesTo } from '../../src/war/sim/roster';
import { FAMILY_OF } from '../../src/war/sim/skills';
import { SOUL_CLASSES } from '../../src/war/sim/souls';
import { CART_LOADS } from '../../src/war/sim/trade';
import { BUILDINGS } from '../../src/war/sim/economy';
import { FAMILIES, FAMILY_IDS, manRefusal, mayHold, PATH_IDS, PATHS, pathStart, raiseClass, unlockLevel, type PlayerPath } from '../../src/war/world/start';
import { flat } from './flatRegion';

const FX_KEYS: (keyof PerkFx)[] = ['hp', 'dmg', 'armor', 'wounded', 'work', 'siteCost', 'siteHp', 'cartLoads', 'cartSpeed', 'cartHp'];
const way = (path: PerkPath, level: number, family: PlayerPath['family'] = null): PlayerPath => ({ path, family, level });

describe('the tables', () => {
  it('each path has one short table: at most one perk a level, levels 2 to 12, one plain sentence, a real effect', () => {
    for (const path of PATH_IDS) {
      const rows = PERKS[path];
      expect(rows.length, path).toBeGreaterThanOrEqual(5);
      expect(rows.length, path).toBeLessThan(FAVOUR_MAX);
      expect(new Set(rows.map((r) => r.level)).size, path).toBe(rows.length);
      for (const r of rows) {
        expect(r.level, r.name).toBeGreaterThanOrEqual(2);
        expect(r.level, r.name).toBeLessThanOrEqual(FAVOUR_MAX);
        expect(r.text, r.name).toMatch(/^[A-Z0-9][^.]*\.$/);
        expect(r.text.length, r.name).toBeLessThanOrEqual(60);
        const keys = Object.keys(r.fx) as (keyof PerkFx)[];
        expect(keys.length, r.name).toBe(1);
        expect(FX_KEYS, r.name).toContain(keys[0]);
      }
    }
  });

  it('the panel lists a warrior\'s new classes among his perks, never two on a level', () => {
    for (const family of FAMILY_IDS) {
      const rows = perkRows('warrior', family);
      expect(rows.map((r) => r.level)).toEqual([...rows.map((r) => r.level)].sort((a, b) => a - b));
      for (const [cls, level] of Object.entries(FAMILIES[family].unlocks)) expect(rows.find((r) => r.level === level && r.text.includes(CLASSES[cls as keyof typeof CLASSES].name)), cls).toBeDefined();
      expect(new Set(rows.map((r) => r.level)).size, family).toBe(rows.length);
    }
    expect(perkRows(null)).toEqual([]);
  });

  it('adds up by level; nothing before level 2; no path, nothing', () => {
    expect(perkFx('warrior', 1)).toEqual({});
    expect(perkFx(null, 12)).toEqual({});
    const top = perkFx('warrior', FAVOUR_MAX), want = PERKS.warrior.reduce((a, p) => a + (p.fx.hp ?? 0), 0);
    expect(top.hp).toBeCloseTo(want);
  });

  it('every reason pays someone and each work one path; capped reasons are real reasons', () => {
    const reasons = Object.keys(FAVOUR_REASON) as FavourReason[];
    for (const r of Object.keys(PAYS) as FavourReason[]) expect(reasons).toContain(r);
    for (const r of Object.keys(HOUR_CAP) as FavourReason[]) expect(reasons).toContain(r);
    for (const path of PATH_IDS) expect(Object.values(PAYS), path).toContain(path);
    expect(favourView(0, [], 'trader')).toMatchObject({ path: 'trader', level: 1 });
  });
});

describe('through his men', () => {
  it('a warrior\'s men are healthier and hit harder by his level, past the man\'s own clamp', () => {
    const p = makePerson('a', 'hoplite');
    const base = warStatsOf(p);
    const fx = perkFx('warrior', 3), up = withPerks(base, fx);
    expect(up.maxHp).toBe(Math.round(base.maxHp * (1 + fx.hp!)));
    expect(up.dmg).toBeCloseTo(base.dmg * (1 + fx.dmg!));
    expect(withPerks(base, {})).toBe(base);
    const later = withPerks(base, perkFx('warrior', FAVOUR_MAX));
    expect(later.armor).toBeGreaterThan(base.armor);
    expect(later.ws).toBeGreaterThan(base.ws);
  });

  it('the sim bakes them on, and a level gained reaches his living men', () => {
    let level = 1;
    const sim = createSim(flat(), 1);
    sim.setPaths(() => way('warrior', level, 'line'));
    const q = sim.spawnSquad('p:1', 0, 'hoplite', 1, 20, 20, [makePerson('a', 'hoplite')]);
    const hp = () => sim.snapshot().units.find((u) => u.squad === q)!.maxHp;
    const was = hp();
    level = 2;
    sim.refreshPerks('p:1');
    expect(hp()).toBe(Math.round(was * (1 + PERKS.warrior[0].fx.hp!)));
  });

  it('another owner\'s men do not take them', () => {
    const sim = createSim(flat(), 1);
    sim.setPaths((o) => (o === 'p:1' ? way('warrior', 12, 'line') : way('warrior', 1, 'line')));
    const a = sim.spawnSquad('p:1', 0, 'hoplite', 1, 20, 20, [makePerson('a', 'hoplite')]);
    const b = sim.spawnSquad('p:2', 0, 'hoplite', 1, 22, 20, [makePerson('b', 'hoplite')]);
    const s = sim.snapshot();
    expect(s.units.find((u) => u.squad === a)!.maxHp).toBeGreaterThan(s.units.find((u) => u.squad === b)!.maxHp);
  });
});

describe('through his buildings', () => {
  /** A storehouse placed by his men with 30 wood in stock, once it has taken what it can: its hp cap, its share delivered. */
  const site = (level: number) => {
    const sim = createSim(flat(), 1);
    sim.setPaths(() => way('builder', level));
    sim.claim(0, 30, 30, 30);
    const q = sim.spawnSquad('p:1', 0, 'militia', 4, 34, 34, [0, 1, 2, 3].map((k) => makePerson(`m${k}`, 'militia')));
    sim.order({ kind: 'placeBuilding', squad: q, type: 'camp', x: 30, y: 30 });
    for (let t = 0; t < 1500 && sim.snapshot().buildings!.find((b) => b.type === 'camp')?.state !== 'done'; t++) sim.step();
    sim.addStock(0, 'wood', 30);
    sim.order({ kind: 'placeBuilding', squad: q, type: 'storehouse', x: 22, y: 30 });
    for (let t = 0; t < 800; t++) sim.step();
    return sim.snapshot().buildings!.find((b) => b.type === 'storehouse')!;
  };

  it('what a builder places costs fewer goods and stands stronger, by his level', () => {
    const plain = site(1), top = site(FAVOUR_MAX), fx = perkFx('builder', FAVOUR_MAX);
    expect(plain.maxHp).toBe(BUILDINGS.storehouse.hp);
    expect(top.maxHp).toBeCloseTo(plain.maxHp * (1 + fx.siteHp!));
    expect(plain.delivered).toBeCloseTo(0.5, 1);
    expect(top.delivered).toBeCloseTo(0.5 / (1 - fx.siteCost!), 1);
  });

  it('his own house too: a private house costs less and stands stronger', () => {
    const house = (level: number) => {
      const sim = createSim(flat(), 1);
      sim.setPaths(() => way('builder', level));
      sim.claim(0, 30, 30, 30);
      const q = sim.spawnSquad('p:1', 0, 'militia', 4, 34, 34, [0, 1, 2, 3].map((k) => makePerson(`m${k}`, 'militia')));
      sim.order({ kind: 'placeBuilding', squad: q, type: 'camp', x: 30, y: 30 });
      for (let t = 0; t < 1500 && sim.snapshot().buildings!.find((b) => b.type === 'camp')?.state !== 'done'; t++) sim.step();
      sim.addStock(0, 'wood', 25); // half its 40 wood and 10 stone
      sim.order({ kind: 'placeBuilding', squad: q, type: 'privateHouse', x: 22, y: 30 });
      for (let t = 0; t < 800; t++) sim.step();
      return sim.snapshot().buildings!.find((b) => b.type === 'privateHouse')!;
    };
    const plain = house(1), top = house(FAVOUR_MAX), fx = perkFx('builder', FAVOUR_MAX);
    expect(plain.maxHp).toBe(BUILDINGS.privateHouse.hp);
    expect(top.maxHp).toBeCloseTo(plain.maxHp * (1 + fx.siteHp!));
    expect(plain.delivered).toBeCloseTo(0.5, 1);
    expect(top.delivered).toBeCloseTo(0.5 / (1 - fx.siteCost!), 1);
  });

  it('a warrior\'s level gives no such thing', () => {
    expect(perkFx('warrior', FAVOUR_MAX).siteCost).toBeUndefined();
    expect(perkFx('warrior', FAVOUR_MAX).siteHp).toBeUndefined();
  });

  it('his men raise a site faster by his level', () => {
    const ticks = (level: number) => {
      const sim = createSim(flat(), 1);
      sim.setPaths(() => way('builder', level));
      sim.claim(0, 30, 30, 30);
      const q = sim.spawnSquad('p:1', 0, 'militia', 4, 34, 34, [0, 1, 2, 3].map((k) => makePerson(`m${k}`, 'militia')));
      sim.order({ kind: 'placeBuilding', squad: q, type: 'camp', x: 30, y: 30 });
      let t = 0;
      for (; t < 3000 && sim.snapshot().buildings!.find((b) => b.type === 'camp')?.state !== 'done'; t++) sim.step();
      return t;
    };
    const a = ticks(1), b = ticks(FAVOUR_MAX);
    expect(a).toBeLessThan(3000);
    expect(b).toBeLessThan(a * 0.9);
  });
});

describe('through his carts', () => {
  it('a trader\'s carts hold more by his level, others\' do not', () => {
    const sim = createSim(flat(), 1);
    sim.setPaths((o) => (o === 'p:1' ? way('trader', FAVOUR_MAX) : way('trader', 1)));
    const a = sim.spawnCart(0, 'p:1', 'wagon', 20, 20), b = sim.spawnCart(0, 'p:2', 'wagon', 30, 20);
    const s = sim.snapshot().sieges!;
    const fx = perkFx('trader', FAVOUR_MAX);
    expect(s.find((c) => c.id === a)!.cap).toBe(CART_LOADS.wagon + fx.cartLoads!);
    expect(s.find((c) => c.id === b)!.cap).toBe(CART_LOADS.wagon);
    expect(s.find((c) => c.id === a)!.maxHp).toBeCloseTo(s.find((c) => c.id === b)!.maxHp * (1 + fx.cartHp!));
  });
});

describe('nothing acts unattended (W-87, W-88)', () => {
  it('no perk places, moves or pays anything on its own: the effects are numbers on men, sites and carts', () => {
    for (const path of PATH_IDS) for (const p of PERKS[path]) for (const k of Object.keys(p.fx)) expect(FX_KEYS).toContain(k);
  });
});

describe('classes by level (W-86, W-112, W-113)', () => {
  it('a warrior\'s first men need no level, and each family has a class that opens later', () => {
    for (const family of FAMILY_IDS) {
      for (const c of pathStart('warrior', family)) expect(unlockLevel(family, c), c).toBe(1);
      expect(mayHold(way('warrior', 1, family), raiseClass(way('warrior', 1, family)))).toBe(true);
      const later = Object.keys(FAMILIES[family].unlocks);
      expect(later.length, family).toBeGreaterThan(0);
      for (const c of later) {
        expect(isClassId(c), c).toBe(true);
        expect(FAMILY_OF[c as keyof typeof FAMILY_OF], c).toBe(family);
      }
    }
  });

  it('a stronger class is refused until the level, as locked, not as a stranger', () => {
    for (const family of FAMILY_IDS) for (const [cls, at] of Object.entries(FAMILIES[family].unlocks)) {
      const have = { soldiers: 0, workers: 0 };
      expect(manRefusal(way('warrior', (at as number) - 1, family), cls, have), cls).toBe('locked');
      expect(manRefusal(way('warrior', at as number, family), cls, have), cls).toBeNull();
      const other = FAMILY_IDS.find((f) => f !== family)!;
      expect(manRefusal(way('warrior', FAVOUR_MAX, other), cls, have), cls).toBe('family');
    }
  });

  it('no level gate on a builder or trader: W-101 stands', () => {
    for (const family of FAMILY_IDS) for (const cls of Object.keys(FAMILIES[family].unlocks)) {
      expect(mayHold(way('builder', 1), cls), cls).toBe(true);
      expect(mayHold(way('trader', 1), cls), cls).toBe(true);
    }
  });

  it('every family wakes souls at every site (W-113), and at level 1 can claim one there', () => {
    for (const [site, pool] of Object.entries(SOUL_CLASSES)) for (const family of FAMILY_IDS) {
      expect(pool.some((c) => mayHold(way('warrior', 1, family), c)), `${family} at ${site}`).toBe(true);
    }
  });

  it('souls and starts name only classes on a path\'s table of holdable men', () => {
    for (const c of Object.values(SOUL_CLASSES).flat()) expect(FAMILY_OF[c as keyof typeof FAMILY_OF], c).toBeDefined();
    expect(PATHS.warrior.cap).toBe(12);
    expect(promotesTo('hoplite').every((e) => FAMILY_OF[e] === 'line')).toBe(true);
  });
});
