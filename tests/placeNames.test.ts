import { describe, expect, it } from 'vitest';
import { TOWN_NAMES, VILLAGE_NAMES } from '../src/world/map';
import { SITE_NAMES, siteName, type BattleSite } from '../src/world/battlefield';
import { placeName } from '../src/i18n/places';
import { foeName } from '../src/i18n/names';
import { setLang } from '../src/i18n';
import { BODY_METRICS } from '../src/art/fontMetrics';

const drawn = (s: string) => [...s].every((ch) => BODY_METRICS.adv[ch] !== undefined);

/** Every name of a map has a Russian form in Cyrillic, and no two places share one. */
function checkMap(names: string[]): void {
  const ru = names.map((n) => placeName(n, 'ru'));
  names.forEach((n, i) => {
    expect(ru[i], n).not.toBe(n);
    expect(ru[i].replace(/ [IVX]+$/, ''), n).not.toMatch(/[A-Za-z]{2,}/);
    expect(drawn(ru[i]), ru[i]).toBe(true);
  });
  expect(new Set(ru).size).toBe(new Set(names).size);
}

describe('place names in Russian (LOC-01)', () => {
  it('the campaign map: towns and villages', () => checkMap([...TOWN_NAMES, ...VILLAGE_NAMES]));

  it('battle sites', () => {
    const sites = [...Object.values(SITE_NAMES)];
    const s = (o: Partial<BattleSite>) => siteName({ base: 'plain', woods: 0, ...o } as BattleSite);
    sites.push(s({ river: true }), s({ river: true, base: 'forest' }), s({ river: true, base: 'hills' }), s({ coast: true }), s({ coast: true, base: 'hills' }), s({ base: 'hills', woods: 0.5 }), s({ base: 'hills', rocky: true }));
    checkMap([...new Set(sites)]);
  });

  it('generated regions agree with their noun and keep the numeral', () => {
    expect(placeName('Gaetulian Meadows', 'ru')).toBe('Гетульские луга');
    expect(placeName('Gaetulian Meadows II', 'ru')).toBe('Гетульские луга II');
    expect(placeName('Lucanian Grove', 'ru')).toBe('Луканская роща');
    expect(placeName('Ciminian Wood', 'ru')).toBe('Циминийский лес');
    expect(placeName('Rhegion', 'ru')).toBe('Регий');
  });

  it('English and unknown names stay as stored', () => {
    expect(placeName('Rhegion', 'en')).toBe('Rhegion');
    expect(placeName('Vlad’s keep', 'ru')).toBe('Vlad’s keep');
  });

  it('whom a campaign battle is against', () => {
    setLang('ru');
    expect(foeName('Bandits')).toBe('Разбойники');
    expect(foeName('Bandit camp')).toBe('Лагерь разбойников');
    expect(foeName('The Tyrant')).toBe('Тиран');
    setLang('en');
    expect(foeName('Bandits')).toBe('Bandits');
  });
});
