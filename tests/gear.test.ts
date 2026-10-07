import { describe, expect, it } from 'vitest';
import { makeHero } from '../src/game/heroes';
import { Rng } from '../src/sim/rng';
import { computeStats } from '../src/sim/stats';
import {
  changedDeltas, compareItem, cycle, fmtStat, heroStars, isUpgrade, itemModLines, powerRating, previewAttrs, previewEquip, queryRoster, queryStash,
  sheetStats, statDeltas, STASH_SORTS,
} from '../src/game/gear';
import { ITEM_LIST, type Item } from '../src/data/items';
import type { Hero } from '../src/data/units';
import { CLASSES } from '../src/data/classes';
import { ABILITY_IDS, AURA_IDS, PERK_LIST } from '../src/data/perks';
import { CONSUMABLE_IDS } from '../src/data/consumables';
import { TRAIT_IDS } from '../src/data/traits';
import { dataTable, setLang, tOr } from '../src/i18n';
import { missingGlyphs } from '../src/ui/textfit';

const hero = (arch: 'hoplite' | 'archer' | 'peltast' = 'hoplite', level = 3, seed = 5): Hero => makeHero(new Rng(seed), { nextId: 1 }, 'greek', arch, level, 1, 0);
const item = (uid: string, def: string, rarity: Item['rarity'] = 'common', cond = 100): Item => ({ uid, def, rarity, cond });

describe('compare deltas', () => {
  it('a better helmet shows armour going up in green, nothing else changing', () => {
    const h = hero();
    h.equip.helmet = item('h0', 'cap');
    const c = compareItem(h, item('h1', 'corinthian', 'rare'));
    const armor = c.deltas.find((d) => d.id === 'armor')!;
    expect(armor.delta).toBeGreaterThan(0);
    expect(armor.better).toBe(true);
    expect(c.equipped?.uid).toBe('h0');
    expect(c.power[1]).toBeGreaterThan(c.power[0]);
    // the Corinthian helm costs aim: shown red
    const aim = c.deltas.find((d) => d.id === 'accuracy')!;
    expect(aim.better).toBe(false);
  });

  it('lower is better for blow time', () => {
    const h = hero();
    const cur = computeStats(h);
    const slow = { ...cur, atkTime: cur.atkTime + 0.3 };
    const d = statDeltas(cur, slow, ['atkTime'])[0];
    expect(d.delta).toBeCloseTo(0.3);
    expect(d.better).toBe(false);
    expect(statDeltas(slow, cur, ['atkTime'])[0].better).toBe(true);
  });

  it('a two-handed weapon also takes off the shield', () => {
    const h = hero();
    h.equip.shield = item('s0', 'hoplon');
    const c = compareItem(h, item('w1', 'rhomphaia'));
    expect(c.displaced.map((i) => i.uid)).toEqual(['s0']);
    expect(previewEquip(h, item('w1', 'rhomphaia')).equip.shield).toBeUndefined();
    // and the original is untouched
    expect(h.equip.shield?.uid).toBe('s0');
  });

  it('unchanged stats are not listed as changes; attribute previews change derived stats', () => {
    const h = hero();
    expect(changedDeltas(computeStats(h), computeStats(h))).toEqual([]);
    const next = previewAttrs(h, { str: 2 });
    expect(next.attrs.str).toBe(h.attrs.str + 2);
    const ch = changedDeltas(computeStats(h), computeStats(next));
    expect(ch.find((d) => d.id === 'dmg')?.better).toBe(true);
    expect(ch.find((d) => d.id === 'hp')?.better).toBe(true);
  });

  it('missile troops list missile damage and range', () => {
    const ids = sheetStats(computeStats(hero('archer')));
    expect(ids).toContain('ranged');
    expect(ids).toContain('range');
    expect(sheetStats(computeStats(hero('hoplite')))).toContain('reach');
  });

  it('item stat lines carry rarity and condition, with signs and percentages', () => {
    const lines = itemModLines(item('a', 'aspis', 'epic', 100));
    const block = lines.find((l) => l.key === 'block')!;
    expect(block.text).toMatch(/^\+\d+%$/);
    const speed = lines.find((l) => l.key === 'speed')!;
    expect(speed.good).toBe(false);
    expect(speed.text.startsWith('-')).toBe(true);
    const worn = itemModLines(item('b', 'aspis', 'epic', 0)).find((l) => l.key === 'block')!;
    expect(worn.value).toBeLessThan(block.value);
    expect(fmtStat('block', 45)).toBe('45%');
    expect(fmtStat('speed', 1.8)).toBe('1.8');
  });

  it('upgrade arrows mark only items that raise power', () => {
    const h = hero();
    h.equip.armor = item('a0', 'cuirass', 'epic');
    expect(isUpgrade(h, item('a1', 'leather'))).toBe(false);
    h.equip.armor = item('a0', 'leather');
    expect(isUpgrade(h, item('a2', 'mail', 'rare'))).toBe(true);
  });
});

describe('stash filters and sorting', () => {
  const stash = [item('1', 'xiphos', 'common', 40), item('2', 'aspis', 'legendary', 90), item('3', 'cap', 'rare', 100), item('4', 'falcata', 'epic', 70), item('5', 'owl_amulet', 'uncommon', 100), item('6', 'pilos', 'fine' as Item['rarity'], 10)];
  it('filters by slot and rarity (legacy rarities map to the new tiers)', () => {
    expect(queryStash(stash, { slot: 'weapon' }).map((i) => i.uid).sort()).toEqual(['1', '4']);
    expect(queryStash(stash, { rarity: 'uncommon' }).map((i) => i.uid).sort()).toEqual(['5', '6']);
    expect(queryStash(stash, { slot: 'helmet', rarity: 'rare' }).map((i) => i.uid)).toEqual(['3']);
    expect(queryStash(stash, { slot: 'shield', rarity: 'common' })).toEqual([]);
  });
  it('sorts by rarity, type, value and wear', () => {
    expect(queryStash(stash, { sort: 'rarity' })[0].uid).toBe('2');
    expect(queryStash(stash, { sort: 'slot' }).map((i) => i.uid).slice(0, 2)).toEqual(['4', '1']);
    expect(queryStash(stash, { sort: 'cond' })[0].uid).toBe('6');
    const byValue = queryStash(stash, { sort: 'value' });
    expect(byValue[0].uid).toBe('2');
    // every sort keeps every item and does not touch the input
    for (const s of STASH_SORTS) expect(queryStash(stash, { sort: s }).length).toBe(stash.length);
    expect(stash[0].uid).toBe('1');
  });
  it('cycle buttons wrap around', () => {
    expect(cycle(['a', 'b', 'c'], 'c')).toBe('a');
    expect(cycle(['a', 'b', 'c'], 'a')).toBe('b');
  });
});

describe('roster', () => {
  it('stars follow the level, power rates gear', () => {
    expect([1, 2, 3, 6, 9, 10].map((level) => heroStars({ level }))).toEqual([1, 1, 2, 3, 5, 5]);
    const a = hero('hoplite', 3, 1);
    const b = { ...a, equip: { ...a.equip, armor: item('x', 'cuirass', 'legendary') } };
    expect(powerRating(b)).toBeGreaterThan(powerRating({ ...a, equip: { ...a.equip, armor: undefined } }));
  });
  it('sorts by power, level and group; filters groups and wounds', () => {
    const hs = [hero('hoplite', 2, 1), hero('archer', 6, 2), hero('peltast', 4, 3)];
    hs[0].group = 1;
    hs[1].group = 0;
    hs[2].group = 1;
    hs[2].wound = 5;
    expect(queryRoster(hs, 'level').map((h) => h.level)).toEqual([6, 4, 2]);
    expect(queryRoster(hs, 'group').map((h) => h.group)).toEqual([0, 1, 1]);
    expect(queryRoster(hs, 'power', 1).length).toBe(2);
    expect(queryRoster(hs, 'power', 'wounded').map((h) => h.id)).toEqual([hs[2].id]);
    expect(queryRoster(hs, 'power', 'ready').length).toBe(2);
    const pw = queryRoster(hs, 'power').map(powerRating);
    expect([...pw].sort((x, y) => y - x)).toEqual(pw);
  });
});

describe('data translations (src/i18n/data.ru.ts)', () => {
  it('cover every item, class, perk, ability, aura, consumable and trait, and draw in the pixel font', () => {
    const ru = dataTable('ru');
    const want = [
      ...ITEM_LIST.flatMap((d) => [`item.${d.id}.name`, `item.${d.id}.desc`]),
      ...Object.keys(CLASSES).flatMap((id) => [`class.${id}.name`, `class.${id}.desc`]),
      ...PERK_LIST.flatMap((p) => [`perk.${p.id}.name`, `perk.${p.id}.desc`]),
      ...ABILITY_IDS.flatMap((id) => [`ability.${id}.name`, `ability.${id}.desc`]),
      ...AURA_IDS.flatMap((id) => [`aura.${id}.name`, `aura.${id}.desc`]),
      ...CONSUMABLE_IDS.flatMap((id) => [`consumable.${id}.name`, `consumable.${id}.desc`]),
      ...TRAIT_IDS.flatMap((id) => [`trait.${id}.name`, `trait.${id}.desc`]),
    ];
    for (const k of want) expect(ru[k], k).toBeTruthy();
    for (const [k, v] of Object.entries(ru)) expect(missingGlyphs(v), k).toEqual([]);
    setLang('ru');
    expect(tOr('item.dory.name', 'Dory spear')).toBe('Копьё дори');
    setLang('en');
    expect(tOr('item.dory.name', 'Dory spear')).toBe('Dory spear');
  });
});
