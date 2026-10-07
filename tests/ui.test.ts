import { describe, expect, it } from 'vitest';
import { ITEM_LIST, normalizeRarity, RARITIES, itemMods, itemValue, normalizeItem, type Item } from '../src/data/items';
import { renderItemIcon } from '../src/art/itemIcons';
import { renderGoodsIcon, CONSUMABLE_ICON_IDS, RESOURCE_ICON_IDS } from '../src/art/goodsIcons';
import { CONSUMABLE_IDS } from '../src/data/consumables';
import { RESOURCE_KEYS } from '../src/online/rules';
import type { Pix } from '../src/art/pixels';
import { migrate, SAVE_VERSION } from '../src/game/save';
import { Campaign } from '../src/game/campaign';
import { rollRarity } from '../src/game/heroes';
import { Rng } from '../src/sim/rng';
import { allStrings, detectLang, langFromTag, LANGS, pluralForm, setLang, t, table, keyOfText, type Lang } from '../src/i18n';
import { EN } from '../src/i18n/en';
import { ellipsize, measureText, missingGlyphs, wrapText } from '../src/ui/textfit';
import { checkLayout, type UiElement } from '../src/ui/layoutCheck';

const hash = (p: Pix) => {
  let h = 2166136261;
  for (let i = 0; i < p.data.length; i++) h = Math.imul(h ^ p.data[i], 16777619);
  return h >>> 0;
};

describe('item icons', () => {
  it('every item, consumable and resource has its own distinct, non-empty icon', () => {
    const seen = new Map<number, string>();
    const add = (name: string, p: Pix) => {
      let opaque = 0;
      for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 0) opaque++;
      expect(opaque, name).toBeGreaterThan(20);
      const h = hash(p);
      expect(seen.get(h), `${name} looks like ${seen.get(h)}`).toBeUndefined();
      seen.set(h, name);
    };
    for (const d of ITEM_LIST) add(d.id, renderItemIcon({ uid: 'x', def: d.id, rarity: 'common', cond: 100 }));
    for (const id of CONSUMABLE_ICON_IDS) add(id, renderGoodsIcon('consumable', id));
    for (const id of RESOURCE_ICON_IDS) add(id, renderGoodsIcon('resource', id));
    expect([...CONSUMABLE_ICON_IDS].sort()).toEqual([...CONSUMABLE_IDS].sort());
    for (const k of RESOURCE_KEYS) expect(RESOURCE_ICON_IDS).toContain(k);
  });
});

describe('five rarity tiers', () => {
  it('maps the old four tiers and junk', () => {
    expect(RARITIES).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary']);
    expect(normalizeRarity('fine')).toBe('uncommon');
    expect(normalizeRarity('heroic')).toBe('epic');
    expect(normalizeRarity('rare')).toBe('rare');
    expect(normalizeRarity('legendary')).toBe('legendary');
    expect(normalizeRarity('bogus')).toBe('common');
    expect(normalizeRarity(undefined)).toBe('common');
  });

  it('legacy items keep their stats and value', () => {
    const old = { uid: 'a', def: 'kopis', rarity: 'heroic', cond: 80 } as unknown as Item;
    const now: Item = { uid: 'a', def: 'kopis', rarity: 'epic', cond: 80 };
    expect(itemMods(old)).toEqual(itemMods(now));
    expect(itemValue(old)).toBe(itemValue(now));
    expect(normalizeItem(old).rarity).toBe('epic');
    const leg: Item = { uid: 'b', def: 'kopis', rarity: 'legendary', cond: 100 };
    expect(itemMods(leg).dmg!).toBeGreaterThan(itemMods({ ...leg, rarity: 'epic' }).dmg!);
  });

  it('rollRarity keeps its odds (same draws as the four-tier table)', () => {
    const rng = new Rng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const r = rollRarity(rng, 3);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(['common', 'epic', 'rare', 'uncommon']);
  });

  it('a v3 save migrates to v4 with mapped rarities', () => {
    const d = Campaign.fresh(42).sync() as unknown as Record<string, unknown>;
    d.v = 3;
    const heroes = d.heroes as { equip: Record<string, { rarity: string }> }[];
    heroes[0].equip.weapon!.rarity = 'fine';
    (d.stash as { rarity: string }[]).push({ uid: 'z1', def: 'xiphos', rarity: 'heroic', cond: 50 } as never);
    const m = migrate(JSON.parse(JSON.stringify(d)))!;
    expect(m).not.toBeNull();
    expect(m.v).toBe(SAVE_VERSION);
    expect(m.heroes[0].equip.weapon!.rarity).toBe('uncommon');
    expect(m.stash.find((i) => i.uid === 'z1')!.rarity).toBe('epic');
    expect(m.settings.lang).toBe('auto');
  });
});

describe('i18n', () => {
  it('every language has every key, the same parameters and plural forms', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    for (const l of LANGS) {
      const tb = table(l) as Record<string, unknown>;
      for (const [k, v] of Object.entries(EN)) {
        expect(tb[k], `${l}: ${k}`).toBeDefined();
        const a = typeof v === 'string' ? v : (v as { other: string }).other;
        const bv = tb[k] as string | Record<string, string>;
        const b = typeof bv === 'string' ? bv : bv.other;
        expect(params(b), `${l}: ${k} params`).toBe(params(a));
        if (typeof v !== 'string' && l === 'ru') for (const f of ['one', 'few', 'many']) expect((bv as Record<string, string>)[f], `${k}.${f}`).toBeDefined();
      }
      expect(Object.keys(tb).length).toBe(Object.keys(EN).length);
    }
  });

  it('the pixel font draws every character of every string', () => {
    for (const l of LANGS) for (const { key, text } of allStrings(l)) expect(missingGlyphs(text.replace(/\{\w+\}/g, '')), `${l}: ${key}`).toEqual([]);
  });

  it('Russian plurals', () => {
    const f = (n: number) => pluralForm('ru', n);
    expect([1, 21, 101].map(f)).toEqual(['one', 'one', 'one']);
    expect([2, 3, 4, 22, 34].map(f)).toEqual(['few', 'few', 'few', 'few', 'few']);
    expect([0, 5, 11, 12, 14, 25, 111].map(f)).toEqual(['many', 'many', 'many', 'many', 'many', 'many', 'many']);
    expect(pluralForm('en', 1)).toBe('one');
    expect(pluralForm('en', 2)).toBe('other');
    setLang('ru');
    expect(t('common.heroes', { n: 1 })).toBe('1 герой');
    expect(t('common.heroes', { n: 3 })).toBe('3 героя');
    expect(t('common.heroes', { n: 5 })).toBe('5 героев');
    expect(t('common.day', { n: 7 })).toBe('День 7');
    setLang('en');
    expect(t('common.heroes', { n: 1 })).toBe('1 hero');
    expect(t('common.heroes', { n: 12 })).toBe('12 heroes');
  });

  it('language detection: URL > setting > Telegram > browser', () => {
    expect(langFromTag('ru-RU')).toBe('ru');
    expect(langFromTag('be')).toBe('ru');
    expect(langFromTag('de')).toBeNull();
    expect(detectLang({ telegram: 'ru' })).toBe('ru');
    expect(detectLang({ telegram: 'ru', setting: 'en' })).toBe('en');
    expect(detectLang({ telegram: 'en', setting: 'auto', browser: ['ru'] })).toBe('en');
    expect(detectLang({ browser: ['de-DE', 'ru'] })).toBe('ru');
    expect(detectLang({ url: 'ru', setting: 'en' })).toBe('ru');
    expect(detectLang({})).toBe('en');
  });

  it('reverse lookup names on-screen text by key in both languages', () => {
    expect(keyOfText('CONTINUE')).toBe('menu.continue');
    expect(keyOfText('ПРОДОЛЖИТЬ')).toBe('menu.continue');
  });
});

describe('text fitting', () => {
  it('measures like the bitmap font and fits with an ellipsis', () => {
    expect(measureText('A')).toBe(4);
    expect(measureText('AA')).toBe(9);
    expect(measureText('A', true)).toBe(5);
    expect(measureText('Щ')).toBe(6);
    const s = ellipsize('Пауза при первом контакте', 60);
    expect(s.endsWith('…')).toBe(true);
    expect(measureText(s)).toBeLessThanOrEqual(60);
    const w = wrapText('Ваше войско, склад и карта будут потеряны навсегда.', 80, 2);
    expect(w.lines.length).toBe(2);
    expect(w.truncated).toBe(true);
    for (const line of w.lines) expect(measureText(line)).toBeLessThanOrEqual(80);
    const all = wrapText('Ваше войско, склад и карта будут потеряны навсегда.', 80);
    expect(all.truncated).toBe(false);
    expect(all.lines.join(' ')).toBe('Ваше войско, склад и карта будут потеряны навсегда.');
  });

  it('Russian menu labels fit the menu buttons', () => {
    for (const l of ['en', 'ru'] as Lang[]) {
      setLang(l);
      for (const k of ['menu.continue', 'menu.newCampaign', 'menu.online', 'menu.shop', 'menu.settings'] as const) expect(measureText(t(k)), `${l} ${k}`).toBeLessThanOrEqual(150 - 6 - 15);
    }
    setLang('en');
  });
});

describe('layout check', () => {
  const el = (id: string, kind: UiElement['kind'], x: number, y: number, w: number, h: number, extra: Partial<UiElement> = {}): UiElement => ({
    id,
    kind,
    rect: { x, y, w, h },
    visible: { x, y, w, h },
    scene: 'S',
    path: id,
    ...extra,
  });
  it('flags overlap, spacing, small targets, overflow, text overlap and the safe area', () => {
    const v = checkLayout(
      [
        el('a', 'interactive', 10, 10, 50, 50),
        el('b', 'interactive', 40, 40, 50, 50), // overlaps a
        el('c', 'interactive', 10, 100, 50, 50),
        el('d', 'interactive', 62, 100, 50, 50), // 2 px from c
        el('e', 'interactive', 200, 10, 30, 30), // too small
        el('f', 'interactive', 300, 300, 100, 50), // outside 320 wide
        el('t1', 'text', 10, 200, 80, 9, { frame: { x: 10, y: 195, w: 60, h: 20 } }),
        el('t2', 'text', 10, 300, 40, 9),
        el('t3', 'text', 20, 302, 40, 9),
      ],
      { width: 320, height: 568 },
    );
    const kinds = v.map((x) => `${x.check}:${x.ids.join('+')}`).sort();
    expect(kinds).toEqual(['outside-safe-area:f', 'overlap:a+b', 'spacing:c+d', 'text-overflow:t1', 'text-overlap:t2+t3', 'touch-size:e'].sort());
  });
  it('scrolled-out parts do not count', () => {
    const v = checkLayout([el('a', 'interactive', 10, 500, 50, 50, { visible: { x: 10, y: 500, w: 50, h: 40 } }), el('b', 'interactive', 10, 548, 50, 50, { visible: { x: 0, y: 0, w: 0, h: 0 } })], { width: 320, height: 568 });
    expect(v).toEqual([]);
  });
});
