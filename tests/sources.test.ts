/**
 * Item sources of step 3 (docs/ITEMS.md "Where items come from"): loot that
 * follows the army, set pieces and named legendaries from their sources, the
 * bad-luck counter, per-duel spoils, bound items and duel point costs. Rates
 * are checked over many seeds against the documented numbers.
 */
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS, ITEMS, ITEM_LIST, isBound, itemValue, salvageValue, type Item, type Rarity } from '../src/data/items';
import { SETS, setPieces } from '../src/data/sets';
import { classGearBlocker } from '../src/data/gearRules';
import { LAIR_BEASTS, type EncounterId } from '../src/data/beasts';
import type { Hero } from '../src/data/units';
import type { BattleResult } from '../src/sim/types';
import { Rng } from '../src/sim/rng';
import {
  BEAST_NAMED, BOSS_SET, CHAPTER_SET, HOARD_SETS, LADDER_NAMED, SOURCES, armyClasses, armyPick, bandSetPieces, fitsArmy, legendaryHoard, pityChest,
} from '../src/game/sources';
import { hoardItem } from '../src/game/beasts';
import { makeHero } from '../src/game/heroes';
import { buildArmy } from '../src/game/enemy';
import { Campaign } from '../src/game/campaign';
import type { Outcome } from '../src/game/loot';
import { bossChest, bossLoot } from '../src/online/lairs';
import { chestItem, chestReward, ladderFloor, ladderPayout } from '../src/duel/ladder';
import { DemoDuelSource } from '../src/duel/client';
import { NAMED_POINTS, RARITY_POINTS, SPOILS, duelSpoils, heroPoints, itemPoints, sellPrice, setLines } from '../src/duel/rules';
import { seasonReward } from '../src/duel/season';

const WSA = new Set(['weapon', 'shield', 'armor']);
const fits = (id: string, classes: string[]) => classes.some((c) => classGearBlocker(c, ITEMS[id]) === null);

describe('loot follows the army', () => {
  it('70% of weapon, shield and armour picks fit a class of the army; the rest are any item', () => {
    for (const classes of [['archer'], ['hoplite', 'slinger'], ['falx']]) {
      const rng = new Rng(11);
      let wsa = 0;
      let fit = 0;
      for (let i = 0; i < 20_000; i++) {
        const d = armyPick(rng, BASE_ITEMS, classes);
        if (!WSA.has(d.slot)) continue;
        wsa++;
        if (fits(d.id, classes)) fit++;
      }
      // 70% re-picked to fit, plus whatever of the other 30% fits by chance
      const base = BASE_ITEMS.filter((d) => WSA.has(d.slot) && fits(d.id, classes)).length / BASE_ITEMS.filter((d) => WSA.has(d.slot)).length;
      expect(fit / wsa, classes.join()).toBeGreaterThan(SOURCES.armyShare + (1 - SOURCES.armyShare) * base - 0.02);
      expect(fit / wsa, classes.join()).toBeLessThan(SOURCES.armyShare + (1 - SOURCES.armyShare) * base + 0.02);
    }
  });

  it('keeps the slot mix and, without an army, draws exactly as rng.pick', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    for (let i = 0; i < 200; i++) expect(armyPick(a, BASE_ITEMS, []).id).toBe(b.pick(BASE_ITEMS).id);
    const rng = new Rng(9);
    const helmets = Array.from({ length: 10_000 }, () => armyPick(rng, BASE_ITEMS, ['archer'])).filter((d) => d.slot === 'helmet').length;
    expect(helmets / 10_000).toBeCloseTo(BASE_ITEMS.filter((d) => d.slot === 'helmet').length / BASE_ITEMS.length, 1);
    expect(fitsArmy(ITEMS.corinthian, ['archer'])).toBe(true);
    expect(armyClasses([{ cls: 'hoplite' }, { cls: 'archer' }, { cls: 'hoplite' }] as Hero[])).toEqual(['archer', 'hoplite']);
  });

  it('ladder drops, chests, spoils and world-boss hoards follow the army', () => {
    const classes = ['archer'];
    const rate = (items: Item[]) => {
      const w = items.filter((it) => WSA.has(ITEMS[it.def].slot));
      return w.filter((it) => fits(it.def, classes)).length / w.length;
    };
    const floor = ladderFloor(12);
    const drops = Array.from({ length: 3000 }, (_, s) => ladderPayout(floor, won, [], 11, 0, s + 1, { nextId: 1 }, 'p_', { classes }).drop!);
    expect(rate(drops)).toBeGreaterThan(0.7);
    const spoils = Array.from({ length: 3000 }, (_, s) => duelSpoils(s + 1, 0, 'ranked', true, classes, 'x')!);
    expect(rate(spoils)).toBeGreaterThan(0.7);
    const hoard = Array.from({ length: 300 }, (_, p) => bossLoot('kraken', 'k', p, 0.5, 'u', classes)).flat();
    expect(rate(hoard)).toBeGreaterThan(0.7);
  });
});

const won: BattleResult = { winner: 0, ticks: 100, units: [] };

describe('set pieces and named items from beasts', () => {
  it('hoards: 25% of epic drops are an epic set piece, 20% of legendary drops the beast named item', () => {
    for (const enc of ['nemean_lion', 'hydra'] as EncounterId[]) {
      const rng = new Rng(3);
      const n = { epic: 0, set: 0, legendary: 0, named: 0 };
      for (let i = 0; i < 40_000; i++) {
        const it = hoardItem(rng, { nextId: 1 }, enc, 'weapon', ['weapon', 'armor', 'helmet', 'shield', 'trinket'])!;
        const def = ITEMS[it.def];
        if (it.rarity === 'epic') (n.epic++, def.set && n.set++);
        if (it.rarity === 'legendary') (n.legendary++, def.named && n.named++);
        if (def.set) expect(HOARD_SETS).toContain(def.set);
        if (def.named) expect(BEAST_NAMED[enc]).toContain(it.def);
      }
      expect(n.set / n.epic, enc).toBeCloseTo(SOURCES.hoardSet, 1);
      expect(n.named / n.legendary, enc).toBeCloseTo(SOURCES.hoardNamed, 1);
    }
  });

  it('a named item or set piece only goes into a free slot of its kind', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 5000; i++) {
      const it = hoardItem(rng, { nextId: 1 }, 'nemean_lion', 'helmet', ['helmet'])!;
      expect(ITEMS[it.def].slot).toBe('helmet');
    }
  });

  it('tier-3 bands carry a piece of their set in about 4% of the rare slots it has; lower tiers never', () => {
    let rare = 0;
    let swapped = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const army = buildArmy(new Rng(seed), { nextId: 1 }, { culture: 'greek', count: 12, level: 6, tier: 3, targetPower: 0, mix: 'line', tune: false });
      const before = army.heroes.map((h) => ({ ...h.equip }));
      bandSetPieces(army.heroes, 'greek', 3, seed);
      army.heroes.forEach((h, i) => {
        for (const [slot, it] of Object.entries(before[i])) {
          if (!it || it.rarity !== 'rare') continue;
          const now = h.equip[slot as keyof typeof h.equip]!;
          const has = ['agoge', 'cretan', 'peltast'].some((s) => setPieces(s).some((p) => ITEMS[p].slot === slot && classGearBlocker(h.cls!, ITEMS[p]) === null));
          if (!has) continue;
          rare++;
          if (ITEMS[now.def].set) {
            swapped++;
            expect(now.rarity).toBe('rare');
            expect(classGearBlocker(h.cls!, ITEMS[now.def])).toBeNull();
          }
        }
      });
      const again = buildArmy(new Rng(seed), { nextId: 1 }, { culture: 'greek', count: 12, level: 6, tier: 2, targetPower: 0, mix: 'line', tune: false });
      bandSetPieces(again.heroes, 'greek', 2, seed);
      for (const h of again.heroes) for (const it of Object.values(h.equip)) if (it) expect(ITEMS[it.def].set).toBeFalsy();
    }
    expect(rare).toBeGreaterThan(500);
    expect(swapped / rare).toBeGreaterThan(0.02);
    expect(swapped / rare).toBeLessThan(0.065);
  });
});

describe('bad-luck protection', () => {
  const epic = (n: number): Item => ({ uid: `u${n}`, def: 'scale', rarity: 'epic', cond: 100 });
  const up = (it: Item) => ({ ...it, rarity: 'legendary' as Rarity });

  it('8 chests without a legendary, then the next one is legendary and the counter resets', () => {
    let count = 0;
    for (let i = 0; i < SOURCES.pity; i++) {
      const r = pityChest([epic(i)], count, up);
      expect(r.forced).toBe(false);
      count = r.count;
    }
    expect(count).toBe(8);
    const due = pityChest([epic(9), epic(10)], count, up);
    expect(due.forced).toBe(true);
    expect(due.items[0].rarity).toBe('legendary');
    expect(due.items[1].rarity).toBe('epic');
    expect(due.count).toBe(0);
    // a legendary resets it; an empty chest changes nothing
    expect(pityChest([epic(1), { ...epic(2), rarity: 'legendary' }], 5, up)).toMatchObject({ count: 0, forced: false });
    expect(pityChest([], 5, up)).toMatchObject({ count: 5, forced: false });
  });

  it('a pity legendary is the same piece at legendary, the named item 20% of the time, never a set piece', () => {
    let named = 0;
    for (let i = 0; i < 2000; i++) {
      const it = legendaryHoard({ uid: `x${i}`, def: i % 2 ? 'scale' : 'brennus_mail', rarity: 'epic', cond: 100, aff: 'hp:1' }, ['herakles_club'], `s${i}`);
      expect(it.rarity).toBe('legendary');
      expect(it.aff).toBeUndefined();
      expect(ITEMS[it.def].set).toBeFalsy();
      if (it.def === 'herakles_club') named++;
      else if (i % 2) expect(it.def).toBe('scale');
    }
    expect(named / 2000).toBeCloseTo(SOURCES.hoardNamed, 1);
  });

  it('campaign: a won beast battle counts in the save, and the 9th dry chest turns legendary', () => {
    const camp = Campaign.fresh(77);
    const beast = makeHero(new Rng(1), { nextId: 1 }, 'greek', 'nemean_lion' as never, 5, 1);
    const outcome = (): Outcome => ({ victory: true, draw: false, gold: 0, picks: 2, loot: [epic(1), epic(2)], heroes: [], enemyKilled: 1, enemyTotal: 1, lost: 0 });
    for (let i = 0; i < SOURCES.pity; i++) camp.beastPity(outcome(), [beast]);
    expect(camp.data.pity).toBe(8);
    const o = outcome();
    camp.beastPity(o, [beast]);
    expect(o.loot[0].rarity).toBe('legendary');
    expect(camp.data.pity).toBe(0);
    // a battle against men does not count
    camp.beastPity(outcome(), [makeHero(new Rng(2), { nextId: 1 }, 'greek', 'hoplite', 3, 2)]);
    expect(camp.data.pity).toBe(0);
  });

  it('the duel ladder: a boss floor first clear counts; a pity drop is legendary', () => {
    const boss = ladderFloor(20);
    let legendary = 0;
    for (let s = 1; s <= 300; s++) {
      const p = ladderPayout(boss, won, [], 19, 0, s, { nextId: 1 }, 'p_', { pity: 8 });
      expect(p.drop!.rarity).toBe('legendary');
      expect(p.pity).toBe(0);
      const q = ladderPayout(boss, won, [], 19, 0, s, { nextId: 1 }, 'p_', { pity: 3 });
      expect(q.pity).toBe(q.drop!.rarity === 'legendary' ? 0 : 4);
      if (q.drop!.rarity === 'legendary') legendary++;
      // a replay or a common floor leaves the counter alone
      expect(ladderPayout(boss, won, [], 20, 0, s, { nextId: 1 }, 'p_', { pity: 3 }).pity).toBe(3);
      expect(ladderPayout(ladderFloor(19), won, [], 18, 0, s, { nextId: 1 }, 'p_', { pity: 3 }).pity).toBe(3);
    }
    expect(legendary / 300).toBeCloseTo(0.15, 1);
  });
});

describe('world-boss chests', () => {
  const none = { owned: new Set<string>(), namedHad: false, pity: 0 };

  it('40% a missing piece of the boss set, 10% its named item, else an epic', () => {
    for (const boss of ['kraken', 'titan'] as EncounterId[]) {
      const kinds = { set: 0, named: 0, epic: 0, legendary: 0 };
      for (let pid = 1; pid <= 6000; pid++) {
        const c = bossChest(boss, 'k', pid, `u${pid}`, none);
        kinds[c.kind]++;
        if (c.kind === 'set') expect(ITEMS[c.item.def].set).toBe(BOSS_SET[boss]);
        if (c.kind === 'named') expect(c.item.def).toBe(BEAST_NAMED[boss][0]);
        expect(c.item.rarity).toBe(c.kind === 'epic' ? 'epic' : 'legendary');
        expect(c.pity).toBe(c.kind === 'epic' ? 1 : 0);
        expect(c.item.uid).toBe(`u${pid}`);
      }
      expect(kinds.set / 6000).toBeCloseTo(SOURCES.bossChest.set, 1);
      expect(kinds.named / 6000).toBeCloseTo(SOURCES.bossChest.named, 1);
      expect(kinds.legendary).toBe(0);
    }
  });

  it('never a piece the player owns, a second named item becomes an epic, and the counter forces a legendary', () => {
    const set = setPieces('achilles');
    const owned = new Set(set.slice(0, 4));
    for (let pid = 1; pid <= 500; pid++) {
      const c = bossChest('kraken', 'k', pid, 'u', { owned, namedHad: true, pity: 2 });
      if (c.kind === 'set') expect(c.item.def).toBe(set[4]);
      expect(c.kind).not.toBe('named');
      const all = bossChest('kraken', 'k', pid, 'u', { owned: new Set(set), namedHad: true, pity: 0 });
      expect(all.kind).toBe('epic');
      const due = bossChest('kraken', 'k', pid, 'u', { owned: new Set(set), namedHad: false, pity: SOURCES.pity });
      expect(due.kind).toBe('named');
      const due2 = bossChest('kraken', 'k', pid, 'u', { owned: new Set(set), namedHad: true, pity: SOURCES.pity });
      expect(due2).toMatchObject({ kind: 'legendary', pity: 0 });
      expect(due2.item.rarity).toBe('legendary');
    }
    // the same inputs give the same chest (the split is idempotent)
    expect(bossChest('titan', 'k', 4, 'u', none)).toEqual(bossChest('titan', 'k', 4, 'u', none));
  });
});

describe('duel ladder and chests', () => {
  it('floors 30, 40 and 50: their named item on 25% of first clears and 2% of won replays', () => {
    for (const [f, named] of Object.entries(LADDER_NAMED)) {
      const floor = ladderFloor(Number(f));
      let first = 0;
      let replay = 0;
      const n = 4000;
      for (let s = 1; s <= n; s++) {
        if (ladderPayout(floor, won, [], Number(f) - 1, 0, s, { nextId: 1 }, 'p_').drop?.def === named) first++;
        if (ladderPayout(floor, won, [], Number(f), 0, s, { nextId: 1 }, 'p_').drop?.def === named) replay++;
      }
      expect(first / n).toBeCloseTo(SOURCES.ladderNamed.first, 1);
      expect(replay / n).toBeGreaterThan(0.01);
      expect(replay / n).toBeLessThan(0.03);
    }
    // other boss floors never drop a named item
    for (let s = 1; s <= 300; s++) expect(ITEMS[ladderPayout(ladderFloor(10), won, [], 9, 0, s, { nextId: 1 }, 'p_').drop!.def].named).toBeFalsy();
  });

  it("the top chest of each chapter holds a piece of the chapter's set at its rarity", () => {
    for (let ch = 1; ch <= 5; ch++) {
      const set = CHAPTER_SET[ch];
      expect(chestReward(ch, 3).item).toBe(SETS[set].rarity);
      const seen = new Set<string>();
      for (let s = 1; s <= 200; s++) {
        const it = chestItem(s, { nextId: 1 }, 'd1_', ch);
        expect(ITEMS[it.def].set).toBe(set);
        expect(it.rarity).toBe(SETS[set].rarity);
        seen.add(it.def);
      }
      expect([...seen].sort()).toEqual(setPieces(set).sort());
    }
    expect(['agoge', 'peltast', 'cretan'].map((s) => SETS[s].rarity)).toEqual(['rare', 'rare', 'rare']);
    expect(['brennus', 'immortals'].map((s) => SETS[CHAPTER_SET[s === 'brennus' ? 4 : 5]].rarity)).toEqual(['epic', 'epic']);
  });
});

describe('per-duel spoils', () => {
  it('unranked 8%, ranked 12%, raids half; common 50 / uncommon 35 / rare 15', () => {
    const n = 40_000;
    const rate = (mode: 'ranked' | 'unranked' | 'raid') => {
      let hit = 0;
      for (let s = 1; s <= n; s++) if (duelSpoils(s, s % 2, mode, false, [], 'u')) hit++;
      return hit / n;
    };
    expect(rate('unranked')).toBeCloseTo(SPOILS.unranked, 2);
    expect(rate('ranked')).toBeCloseTo(SPOILS.ranked, 2);
    expect(rate('raid')).toBeCloseTo(SPOILS.ranked * SPOILS.raidShare, 2);
    const by: Record<string, number> = {};
    let drops = 0;
    for (let s = 1; s <= n; s++) {
      const it = duelSpoils(s, 0, 'ranked', false, [], 'u');
      if (!it) continue;
      drops++;
      by[it.rarity] = (by[it.rarity] ?? 0) + 1;
      expect(ITEMS[it.def].set || ITEMS[it.def].named).toBeFalsy();
    }
    expect(by.common / drops).toBeCloseTo(0.5, 1);
    expect(by.uncommon / drops).toBeCloseTo(0.35, 1);
    expect(by.rare / drops).toBeCloseTo(0.15, 1);
  });

  it('the first ranked win of a day always drops, at least uncommon; the same seed and side drop the same item', () => {
    for (let s = 1; s <= 2000; s++) {
      const it = duelSpoils(s, 1, 'ranked', true, [], `sp${s}`)!;
      expect(it).toBeTruthy();
      expect(it.rarity).not.toBe('common');
      expect(it.uid).toBe(`sp${s}`);
    }
    expect(duelSpoils(42, 0, 'ranked', true, ['archer'], 'a')).toEqual(duelSpoils(42, 0, 'ranked', true, ['archer'], 'a'));
  });
});

describe('bound items', () => {
  it('named legendaries and legendary set pieces are bound; nothing else', () => {
    for (const d of ITEM_LIST) {
      const want = !!d.named || (!!d.set && SETS[d.set].rarity === 'legendary');
      expect(isBound({ def: d.id }), d.id).toBe(want);
    }
    const it: Item = { uid: 'a', def: 'herakles_club', rarity: 'legendary', cond: 100 };
    expect(salvageValue(it)).toBe(Math.floor(itemValue(it) / 4));
  });

  it('the campaign sells a bound item only for its salvage value', () => {
    const camp = Campaign.fresh(5);
    const it: Item = { uid: 'b1', def: 'pelian_ash', rarity: 'legendary', cond: 100 };
    camp.data.stash.push(it);
    const gold = camp.data.gold;
    camp.sell('b1');
    expect(camp.data.gold - gold).toBe(salvageValue(it));
  });

  it('duels: the shop refuses to buy bound gear; salvage pays the same quarter', async () => {
    const src = new DemoDuelSource();
    const p = await src.profile();
    const named: Item = { uid: 'n1', def: 'golden_fleece', rarity: 'legendary', cond: 100 };
    const plain = p.stash[0] ?? { uid: 'c1', def: 'dory', rarity: 'common', cond: 100 };
    (src as unknown as { p: { stash: Item[] } }).p.stash.push(named, ...(p.stash[0] ? [] : [plain]));
    await expect(src.sell('n1')).rejects.toMatchObject({ code: 'bound_item' });
    await expect(src.salvage(plain.uid)).rejects.toMatchObject({ code: 'not_bound' });
    const r = await src.salvage('n1');
    expect(r.glory).toBe(sellPrice(named));
    expect(r.profile.stash.some((x) => x.uid === 'n1')).toBe(false);
  });
});

describe('duel points', () => {
  const hoplite = (): Hero => {
    const h = makeHero(new Rng(3), { nextId: 1 }, 'greek', 'hoplite', 1, 1);
    h.attrs = { str: 15, agi: 15, end: 15, wil: 15 };
    h.equip = {};
    return h;
  };

  it('a named legendary costs 7, other items by rarity', () => {
    expect(NAMED_POINTS).toBe(7);
    expect(itemPoints({ def: 'aegis_of_zeus', rarity: 'legendary' })).toBe(7);
    expect(itemPoints({ def: 'pelian_ash', rarity: 'legendary' })).toBe(RARITY_POINTS.legendary);
    expect(itemPoints({ rarity: 'epic' })).toBe(4);
  });

  it('each active set bonus line costs 1: a full legendary set on one hero is 5 × 6 + 4 = 34', () => {
    const h = hoplite();
    const base = heroPoints(h);
    for (const id of setPieces('achilles')) h.equip[ITEMS[id].slot] = { uid: id, def: id, rarity: 'legendary', cond: 100 };
    expect(setLines(h)).toBe(4);
    expect(heroPoints(h) - base).toBe(34);
    // one piece: no line
    const one = hoplite();
    one.equip.helmet = { uid: 'h', def: 'agoge_pilos', rarity: 'rare', cond: 100 };
    expect(setLines(one)).toBe(0);
    one.equip.weapon = { uid: 'w', def: 'agoge_dory', rarity: 'rare', cond: 100 };
    expect(setLines(one)).toBe(1);
    expect(heroPoints(one) - base).toBe(2 + 2 + 1);
    // pieces the hero cannot use (class or requirements) count no line
    const weak = hoplite();
    weak.attrs = { str: 4, agi: 4, end: 4, wil: 4 };
    weak.equip = { ...one.equip };
    expect(setLines(weak)).toBe(0);
    const archer = makeHero(new Rng(4), { nextId: 1 }, 'greek', 'archer', 1, 1);
    archer.attrs = { str: 15, agi: 15, end: 15, wil: 15 };
    archer.equip = { weapon: { uid: 'w', def: 'agoge_dory', rarity: 'rare', cond: 100 }, helmet: { uid: 'h', def: 'agoge_pilos', rarity: 'rare', cond: 100 } };
    expect(setLines(archer)).toBe(0);
  });
});

describe('ranked season reward', () => {
  it('Strategos and Legend (live) pick a Sacred Band piece; others and raids do not', () => {
    expect(seasonReward(1850, 'live')?.pick).toBe('sacred_band');
    expect(seasonReward(2100, 'live')?.pick).toBe('sacred_band');
    expect(seasonReward(1650, 'live')?.pick).toBeNull();
    expect(seasonReward(2100, 'async')?.pick).toBeNull();
  });
});

describe('every lair beast has its named items', () => {
  it('in the table, in its own slots', () => {
    for (const enc of LAIR_BEASTS) {
      expect(BEAST_NAMED[enc].length, enc).toBeGreaterThan(0);
      for (const id of BEAST_NAMED[enc]) expect(ITEMS[id].named, id).toBe(true);
    }
  });
});
