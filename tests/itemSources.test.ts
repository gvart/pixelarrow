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
 */
import { describe, expect, it } from 'vitest';
import { ITEM_LIST, ITEMS, SLOTS, type Slot } from '../src/data/items';
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
  return ITEM_LIST.map((d) => d.id).filter((id) => !have.has(id));
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
