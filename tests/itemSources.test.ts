/**
 * Every item in src/data/items.ts must be obtainable in normal play. The
 * sources of gear are:
 *
 * - class kits (src/data/classes.ts): what enemy armies, garrisons, bandits,
 *   online defenders and recruits carry, so battle loot and hires;
 * - hero charms (HERO_TRINKETS, src/game/heroes.ts): trinkets on bot heroes;
 * - beast hoards and world-boss loot (src/game/beasts.ts, src/online/lairs.ts);
 * - the war-map merchants (src/online/merchants.ts) and town markets (src/world);
 * - the duel shop and ladder drops (src/duel).
 *
 * The first test is the guard: a new item must be written into at least one
 * curated table (kits, charms or merchants), not only reach players through
 * the catch-all pools (markets, hoards, the duel catalogue).
 *
 * Set pieces and named legendaries (docs/ITEMS.md) are outside all of this:
 * they come only from their own sources (bands, beasts, world bosses, ladder
 * bosses and chests, trading posts, the ranked season), sampled below.
 */
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS, ITEM_LIST, ITEMS, SLOTS, type Slot } from '../src/data/items';
import { CLASSES, SOLDIER_CLASSES, type ClassId } from '../src/data/classes';
import type { Culture } from '../src/data/names';
import { HERO_TRINKETS, heroTrinkets, makeHero } from '../src/game/heroes';
import { hoardPool } from '../src/game/beasts';
import { TUTORIAL_REWARD } from '../src/game/tutorial';
import { BASE_GEAR, POST_GOODS, RARE_POOL, SPECIALTIES } from '../src/online/merchants';
import { bossLootPool } from '../src/online/lairs';
import { catalogue } from '../src/duel/rules';
import { marketPool } from '../src/world/world';
import { Rng } from '../src/sim/rng';
import { setPieces } from '../src/data/sets';
import { LAIR_BEASTS, WORLD_BOSSES } from '../src/data/beasts';
import { BEAST_NAMED, LADDER_NAMED, SEASON_SET, bandSetPieces } from '../src/game/sources';
import { hoardItem } from '../src/game/beasts';
import { buildArmy } from '../src/game/enemy';
import { bossChest } from '../src/online/lairs';
import { chestItem, ladderFloor, ladderPayout } from '../src/duel/ladder';
import { merchantStock, tradingPosts } from '../src/online/merchants';
import { getMap } from '../src/online/world';

const CULTURES: Culture[] = ['greek', 'phoenician', 'celtic'];
const KIT_SLOTS = ['weapon', 'shield', 'helmet', 'armor'] as const;

/** Every item id any class kit can hand out, at any tier. */
function kitItems(): Map<string, Slot> {
  const out = new Map<string, Slot>();
  for (const id of SOLDIER_CLASSES) {
    const kit = CLASSES[id].kit;
    for (const slot of KIT_SLOTS) for (const opts of kit[slot] ?? []) for (const def of opts) if (def) out.set(def, slot);
  }
  return out;
}

function charmItems(): Set<string> {
  return new Set(Object.values(HERO_TRINKETS).flat());
}

function merchantItems(): Set<string> {
  return new Set([...BASE_GEAR, ...Object.values(SPECIALTIES).flat(), ...Object.values(POST_GOODS).flat()]);
}

function missing(have: Set<string>): string[] {
  return BASE_ITEMS.map((d) => d.id).filter((id) => !have.has(id));
}

describe('item acquisition: every item can be obtained', () => {
  it('every item is listed in at least one curated source table (kits, hero charms, map merchants)', () => {
    const curated = new Set<string>([...kitItems().keys(), ...charmItems(), ...merchantItems(), TUTORIAL_REWARD.item]);
    expect(missing(curated), 'items with no source: add them to a class kit, HERO_TRINKETS or a merchant table').toEqual([]);
  });

  it('source tables name real items in the right slot', () => {
    for (const [id, slot] of kitItems()) {
      expect(ITEMS[id], id).toBeTruthy();
      expect(ITEMS[id].slot, id).toBe(slot);
    }
    for (const id of charmItems()) expect(ITEMS[id]?.slot, id).toBe('trinket');
    for (const id of merchantItems()) expect(ITEMS[id], id).toBeTruthy();
    // every culture's charms include something a tier-2 hero can wear
    for (const c of CULTURES) expect(heroTrinkets(c, 2).length, c).toBeGreaterThan(2);
  });

  it('campaign: bot heroes really carry every kit item and charm (sampled makeHero); beast hoards and town markets hold the rest', () => {
    const seen = new Set<string>();
    let seed = 1;
    for (const cls of SOLDIER_CLASSES as ClassId[]) {
      for (const culture of CULTURES) {
        for (let tier = 1; tier <= 3; tier++) {
          for (let i = 0; i < 70; i++) {
            const h = makeHero(new Rng(seed++), { nextId: 1 }, culture, cls, 1, tier);
            for (const s of SLOTS) if (h.equip[s]) seen.add(h.equip[s]!.def);
          }
        }
      }
    }
    // the generator hands out exactly the enumerated tables, nothing else
    const want = new Set([...kitItems().keys(), ...charmItems()]);
    expect([...want].filter((id) => !seen.has(id)), 'kit/charm items never generated').toEqual([]);
    expect([...seen].filter((id) => !want.has(id)), 'generated items not in a table').toEqual([]);
    // battle loot, beast hoards (tier 2+) and town markets (over a few stock epochs) cover the whole pool
    const markets = Array.from({ length: 20 }, (_, k) => marketPool(new Rng(k + 1)).map((d) => d.id)).flat();
    const campaign = new Set([...seen, ...SLOTS.flatMap((s) => hoardPool(s)), ...markets]);
    expect(missing(campaign)).toEqual([]);
    // tier-1 gear is never left to the markets alone: it drops from enemies or sells on the war map
    const t1 = ITEM_LIST.filter((d) => d.tier === 1 && !seen.has(d.id)).map((d) => d.id);
    expect(t1.filter((id) => !merchantItems().has(id))).toEqual([]);
  });

  it('online war map: defenders, merchants and world bosses cover every item', () => {
    const online = new Set<string>([...kitItems().keys(), ...charmItems(), ...merchantItems(), ...RARE_POOL, ...bossLootPool()]);
    expect(missing(online)).toEqual([]);
  });

  it('duels: the shop catalogue sells every item', () => {
    const sold = new Set(catalogue().map((o) => o.def));
    expect(missing(sold)).toEqual([]);
  });
});

describe('set pieces and named legendaries', () => {
  const special = () => ITEM_LIST.filter((d) => d.set || d.named).map((d) => d.id);

  it('stay out of the shops, markets and random drop pools (they have their own sources)', () => {
    expect(special().length).toBe(43);
    const pools = new Set<string>([...catalogue().map((o) => o.def), ...BASE_ITEMS.map((d) => d.id), ...RARE_POOL, ...bossLootPool()]);
    for (const id of special()) expect(pools.has(id), id).toBe(false);
    for (const id of special()) expect(ITEMS[id].named ? ITEMS[id].bound && ITEMS[id].power : ITEMS[id].set).toBeTruthy();
  });

  it('every one has at least one real source (sampled from the sources themselves)', () => {
    const got = new Map<string, Set<string>>();
    const note = (src: string, id: string) => {
      if (!ITEMS[id].set && !ITEMS[id].named) return;
      if (!got.has(id)) got.set(id, new Set());
      got.get(id)!.add(src);
    };
    // campaign: tier-3 bands (Greek line, javelin men, archers)
    for (let seed = 1; seed <= 600; seed++) {
      for (const culture of CULTURES) {
        const army = buildArmy(new Rng(seed), { nextId: 1 }, { culture, count: 14, level: 7, tier: 3, targetPower: 0, mix: seed % 2 ? 'line' : 'bandits', tune: false });
        bandSetPieces(army.heroes, culture, 3, seed);
        for (const h of army.heroes) for (const it of Object.values(h.equip)) if (it) note('band', it.def);
      }
    }
    // beast hoards (campaign, the Beast trial, war-map lairs)
    const rng = new Rng(1);
    for (const enc of LAIR_BEASTS) for (let i = 0; i < 3000; i++) note('hoard', hoardItem(rng, { nextId: 1 }, enc, 'weapon', SLOTS)!.def);
    // world-boss chests
    for (const boss of WORLD_BOSSES) for (let pid = 1; pid <= 400; pid++) note('boss', bossChest(boss, 'k', pid, 'u', { owned: new Set(), namedHad: false, pity: 0 }).item.def);
    // the duel ladder: chapter chests and the named boss floors
    for (let ch = 1; ch <= 5; ch++) for (let s = 1; s <= 60; s++) note('chest', chestItem(s, { nextId: 1 }, 'd_', ch).def);
    for (const f of [30, 40, 50]) for (let s = 1; s <= 200; s++) {
      const drop = ladderPayout(ladderFloor(f), { winner: 0, ticks: 1, units: [] }, [], f - 1, 0, s, { nextId: 1 }, 'd_').drop;
      if (drop) note('ladder', drop.def);
    }
    // war-map trading posts over a few months
    const world = getMap();
    for (const p of tradingPosts(world)) for (let d = 0; d < 60; d++) {
      const day = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
      for (const o of merchantStock(world, 42, p.loc, p.kind, day)) if (o.kind === 'item') note('post', o.ref);
    }
    // the ranked season reward (a piece of choice)
    for (const id of setPieces(SEASON_SET)) note('season', id);
    expect(special().filter((id) => !got.has(id)), 'set pieces or named items with no source').toEqual([]);
    // the documented sources (docs/ITEMS.md "Where items come from")
    for (const s of ['agoge', 'peltast', 'cretan']) for (const id of setPieces(s)) expect([...got.get(id)!], id).toEqual(expect.arrayContaining(['band', 'chest', 'post']));
    for (const s of ['brennus', 'immortals']) for (const id of setPieces(s)) expect([...got.get(id)!], id).toEqual(expect.arrayContaining(['hoard', 'chest', 'post']));
    for (const id of setPieces('sacred_band')) expect([...got.get(id)!], id).toEqual(expect.arrayContaining(['hoard', 'post', 'season']));
    for (const s of ['achilles', 'alexander']) for (const id of setPieces(s)) expect([...got.get(id)!], id).toEqual(['boss']);
    for (const ids of Object.values(BEAST_NAMED)) for (const id of ids) expect(got.get(id)!.has('hoard') || got.get(id)!.has('boss'), id).toBe(true);
    for (const id of Object.values(LADDER_NAMED)) expect([...got.get(id)!], id).toEqual(['ladder']);
  });
});
