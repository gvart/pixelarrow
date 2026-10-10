/**
 * AR-01: the 8-man opening (design/gdd/campaign-arc.md R1, V5-020).
 * A new campaign starts with 8 men in groups I, II and IV and 40 rations;
 * bandits come at least 5 strong; a destroyed army gets 5 volunteers; under 5
 * men the starting town and villages offer cheap volunteers. Old saves keep
 * their army and their stores.
 */
import { describe, expect, it } from 'vitest';
import { Campaign, START_GOLD } from '../src/game/campaign';
import { deserialize, migrate, type SaveData } from '../src/game/save';
import { openingParty, starterParty, toClass } from '../src/game/heroes';
import { starterOnlineArmy } from '../src/online/rules';
import { FOOD_RULES } from '../src/world/camp';
import { BANDIT_MIN, VOLUNTEER_RULES, World } from '../src/world/world';
import type { Outcome } from '../src/game/loot';
import { Rng } from '../src/sim/rng';

const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const count = (heroes: { group: number; arch?: string; cls?: string }[], group: number) => heroes.filter((h) => h.group === group).length;

describe('the 8-man opening (R1.1, R1.2)', () => {
  it('a new campaign starts with 8 men: 4 hoplites in I, 2 slingers in II, 2 peltasts in IV', () => {
    for (const seed of [1, 7, 42, 9001]) {
      const c = Campaign.fresh(seed);
      const hs = c.data.heroes;
      expect(hs).toHaveLength(8);
      const cls = (g: number) => hs.filter((h) => h.group === g).map((h) => toClass(h.cls ?? h.arch));
      expect(cls(0)).toEqual(['hoplite', 'hoplite', 'hoplite', 'hoplite']);
      expect(cls(1)).toEqual(['slinger', 'slinger']);
      expect(cls(2)).toEqual([]); // III Reserve stays empty
      expect(cls(3)).toEqual(['peltast', 'peltast']);
      // one level-2 veteran hoplite, the rest raw recruits at level 1
      expect(hs.filter((h) => h.level === 2)).toHaveLength(1);
      expect(hs[0].traits).toEqual(['veteran']);
      expect(hs[0].points).toBe(2);
      expect(new Set(hs.map((h) => h.name)).size).toBe(8);
      expect(new Set(hs.map((h) => h.id)).size).toBe(8);
    }
  });

  it('starts with 40 rations, 60 gold and the pilos and owl amulet in the stash', () => {
    const c = Campaign.fresh(11);
    expect(FOOD_RULES.openingFood).toBe(40);
    expect(c.world.food).toBe(40);
    expect(c.sync().world.food).toBe(40);
    expect(c.data.gold).toBe(START_GOLD);
    expect(START_GOLD).toBe(60);
    expect(c.data.stash.map((i) => i.def)).toEqual(['pilos', 'owl_amulet']);
  });

  it('the hoplites share the lambda paint field', () => {
    const hs = openingParty(new Rng(5), { nextId: 1 });
    const fields = new Set(hs.filter((h) => h.group === 0 && h.equip.shield?.paint).map((h) => h.equip.shield!.paint!.field));
    expect(fields.size).toBe(1);
  });

  it('the online starter army is untouched (starterParty is still three men)', () => {
    expect(starterParty(new Rng(3), { nextId: 1 })).toHaveLength(3);
    expect(starterOnlineArmy(3, { nextId: 1 }, 'a_')).toHaveLength(5);
  });
});

describe('old saves keep their army (V5-020)', () => {
  for (const [file, raw] of Object.entries(FIXTURES)) {
    it(`${file.split('/').pop()} keeps every hero and its rations`, () => {
      const before = JSON.parse(raw) as SaveData;
      const loaded = deserialize(raw)!;
      expect(loaded).not.toBeNull();
      expect(loaded.heroes.map((h) => h.id)).toEqual(before.heroes.map((h) => h.id));
      expect(loaded.heroes.map((h) => h.name)).toEqual(before.heroes.map((h) => h.name));
      const c = new Campaign(loaded);
      expect(c.data.heroes).toHaveLength(before.heroes.length);
      // rations: kept when saved; a save from before provisions is stocked as before (24), not with the opening's 40
      const food = before.world?.food;
      expect(c.world.food).toBe(typeof food === 'number' ? food : FOOD_RULES.startFood);
      expect(FOOD_RULES.startFood).toBe(24);
    });
  }

  it('migrating a v6 save leaves the heroes byte-identical', () => {
    const raw = Object.entries(FIXTURES).find(([f]) => f.includes('v6-'))![1];
    const before = JSON.parse(raw) as SaveData;
    const after = migrate(clone(before))!;
    expect(after.heroes).toEqual(before.heroes);
  });
});

describe('bandits near the start (R1.3)', () => {
  it(`bandit bands are at least BANDIT_MIN (${BANDIT_MIN}) strong`, () => {
    expect(BANDIT_MIN).toBe(5);
    let bandits = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World(World.fresh(seed));
      for (let i = 0; i < 40; i++) w.spawnParty('lair');
      for (const p of w.s.parties.filter((q) => q.kind === 'bandits')) {
        bandits++;
        expect(p.size).toBeGreaterThanOrEqual(BANDIT_MIN);
        expect(p.size).toBeLessThanOrEqual(18);
      }
    }
    expect(bandits).toBeGreaterThan(20);
  });
});

const lost: Outcome = { victory: false, draw: false, gold: 0, picks: 0, loot: [], heroes: [], enemyKilled: 0, enemyTotal: 5, lost: 8 };

describe('a destroyed army (R1.4)', () => {
  it('gets 5 volunteers at the starting town: 3 spearmen in I, 2 skirmishers in II', () => {
    const c = Campaign.fresh(21);
    const p = c.world.s.parties[0];
    c.data.heroes = [];
    c.afterPartyBattle(p.id, lost);
    const hs = c.data.heroes;
    expect(hs).toHaveLength(VOLUNTEER_RULES.destroyed);
    expect(VOLUNTEER_RULES.destroyed).toBe(5);
    expect(count(hs, 0)).toBe(3);
    expect(count(hs, 1)).toBe(2);
    expect(hs.every((h) => h.level === 1 && toClass(h.cls ?? h.arch) === 'militia')).toBe(true);
    const st = c.world.settlement(c.world.map.start)!;
    expect(c.world.s.x).toBe(st.x + 0.5);
    expect(c.world.s.y).toBe(st.y + 0.5);
  });
});

describe('the volunteer floor (R1.5)', () => {
  const floorOffers = (c: Campaign, id: number) => c.world.recruits(id, c.data.heroes).filter((r) => r.index >= VOLUNTEER_RULES.floorIndex);

  it('under 5 men, the starting town and every village offer 3 raw volunteers at 20 g on top of their stock', () => {
    const c = Campaign.fresh(31);
    const w = c.world;
    const village = w.map.settlements.find((s) => s.kind === 'village')!;
    const otherTown = w.map.settlements.find((s) => s.kind === 'town' && s.id !== w.map.start);
    // 8 men: no floor offers anywhere
    expect(floorOffers(c, w.map.start)).toHaveLength(0);
    expect(floorOffers(c, village.id)).toHaveLength(0);
    const normal = w.recruits(village.id, c.data.heroes).length;
    c.data.heroes = c.data.heroes.slice(0, 4);
    for (const id of [w.map.start, village.id]) {
      const offers = floorOffers(c, id);
      expect(offers).toHaveLength(VOLUNTEER_RULES.floorOffer);
      expect(offers.every((r) => r.price === VOLUNTEER_RULES.floorCost && r.hero.level === 1 && toClass(r.hero.cls ?? r.hero.arch) === 'militia')).toBe(true);
    }
    // on top of the normal stock
    expect(w.recruits(village.id, c.data.heroes).length).toBe(normal + VOLUNTEER_RULES.floorOffer);
    // other towns and lairs: none
    if (otherTown) expect(floorOffers(c, otherTown.id)).toHaveLength(0);
    const lair = w.map.settlements.find((s) => s.kind === 'lair')!;
    expect(w.recruits(lair.id, c.data.heroes)).toHaveLength(0);
    // the offer is the same on every look (deterministic)
    expect(floorOffers(c, village.id).map((r) => r.hero.name)).toEqual(floorOffers(c, village.id).map((r) => r.hero.name));
  });

  it('hiring one costs 20 g; offers stop once the army is 5 strong again', () => {
    const c = Campaign.fresh(32);
    const w = c.world;
    c.data.heroes = c.data.heroes.slice(0, 3);
    c.data.gold = 100;
    const offers = floorOffers(c, w.map.start);
    const shown = offers[0].hero.name;
    const h = c.hire(w.map.start, offers[0].index)!;
    expect(h).not.toBeNull();
    expect(h.name).toBe(shown);
    expect(c.data.gold).toBe(80);
    expect(c.data.heroes).toHaveLength(4);
    expect(new Set(c.data.heroes.map((x) => x.id)).size).toBe(4);
    // the same one cannot be hired twice
    expect(c.hire(w.map.start, offers[0].index)).toBeNull();
    expect(floorOffers(c, w.map.start)).toHaveLength(2);
    expect(c.hire(w.map.start, offers[1].index)).not.toBeNull();
    expect(c.data.heroes).toHaveLength(5);
    expect(floorOffers(c, w.map.start)).toHaveLength(0);
    expect(c.hire(w.map.start, offers[2].index)).toBeNull();
    expect(c.data.gold).toBe(60);
  });

  it('cannot be hired without the gold', () => {
    const c = Campaign.fresh(33);
    c.data.heroes = c.data.heroes.slice(0, 2);
    c.data.gold = 19;
    const o = floorOffers(c, c.world.map.start)[0];
    expect(c.hire(c.world.map.start, o.index)).toBeNull();
    expect(c.data.heroes).toHaveLength(2);
  });
});
