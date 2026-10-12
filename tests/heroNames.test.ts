import { describe, expect, it } from 'vitest';
import { NAMES } from '../src/data/names';
import { NAMES_RU, DEMO_NAMES_RU, demoName, heroName } from '../src/i18n/names';
import { BODY_METRICS } from '../src/art/fontMetrics';

const ALL = Object.values(NAMES).flat();

describe('hero names in Russian (LOC-01)', () => {
  it('every generated name has a Russian form, and the table has no stray entries', () => {
    for (const n of ALL) expect(NAMES_RU[n], n).toBeTruthy();
    expect(Object.keys(NAMES_RU).sort()).toEqual([...ALL].sort());
  });

  it('no two names share a Russian form (heroes are told apart by name)', () => {
    const forms = ALL.map((n) => NAMES_RU[n]);
    expect(new Set(forms).size).toBe(forms.length);
  });

  it('writes only Cyrillic letters the UI fonts carry', () => {
    for (const ru of [...Object.values(NAMES_RU), ...Object.values(DEMO_NAMES_RU)]) {
      expect(ru).toMatch(/^[А-ЯЁ][а-яё]+$/);
      for (const ch of ru) expect(BODY_METRICS.adv[ch], `${ru} ${ch}`).toBeDefined();
    }
  });

  it('maps a stored name at display time and keeps its suffix', () => {
    expect(heroName('Epameinon', 'ru')).toBe('Эпаминонд');
    expect(heroName('Nearchos', 'ru')).toBe('Неарх');
    expect(heroName('Brasidas II', 'ru')).toBe('Брасид II');
    expect(heroName('Hanno 12', 'ru')).toBe('Ганнон 12');
    expect(heroName('Brennos', 'ru')).toBe('Бренн');
  });

  it('English stays as stored', () => {
    for (const n of ['Epameinon', 'Brasidas II', 'The Tyrant', 'Wolf 2']) expect(heroName(n, 'en')).toBe(n);
  });

  it('names given in code: the Tyrant and animals', () => {
    expect(heroName('The Tyrant', 'ru')).toBe('Тиран');
    expect(heroName('Wolf 2', 'ru')).toBe('Волк 2');
    expect(heroName('Boar 1', 'ru')).toBe('Кабан 1');
    expect(heroName('Brown bear', 'ru')).toBe('Бурый медведь');
  });

  it("leaves names it does not know (a player's own) as typed", () => {
    for (const n of ['Vlad', 'xX_Kleon_Xx', 'Клеон', '', 'Alexander the Great']) expect(heroName(n, 'ru')).toBe(n);
  });

  it('demo fixtures get Russian stand-ins', () => {
    expect(demoName('Phormion', 'ru')).toBe('Формион');
    expect(demoName('Kleon', 'ru')).toBe('Клеон');
    expect(demoName('Lysander 2', 'ru')).toBe('Лисандр 2');
    expect(demoName('Phormion', 'en')).toBe('Phormion');
  });
});
