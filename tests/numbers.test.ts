import { describe, expect, it } from 'vitest';
import { fmtDecimal, localDecimals } from '../src/i18n/numbers';
import { BODY_METRICS } from '../src/art/fontMetrics';

describe('fmtDecimal (LOC-01)', () => {
  it('English: a decimal point, no trailing zeros', () => {
    expect(fmtDecimal(10.5, 1, 'en')).toBe('10.5');
    expect(fmtDecimal(0.05, 2, 'en')).toBe('0.05');
    expect(fmtDecimal(8, 2, 'en')).toBe('8');
    expect(fmtDecimal(1.2, 2, 'en')).toBe('1.2');
    expect(fmtDecimal(-0.05, 2, 'en')).toBe('-0.05');
    expect(fmtDecimal(12.345, 0, 'en')).toBe('12');
  });

  it('Russian: a decimal comma', () => {
    expect(fmtDecimal(10.5, 1, 'ru')).toBe('10,5');
    expect(fmtDecimal(0.05, 2, 'ru')).toBe('0,05');
    expect(fmtDecimal(-0.05, 2, 'ru')).toBe('-0,05');
    expect(fmtDecimal(8, 1, 'ru')).toBe('8');
  });

  it('rounds to the places asked and never writes -0', () => {
    expect(fmtDecimal(2.349, 2, 'en')).toBe('2.35');
    expect(fmtDecimal(-0.001, 2, 'en')).toBe('0');
    expect(fmtDecimal(-0.4, 0, 'ru')).toBe('0');
    expect(fmtDecimal(100.5, 1, 'ru')).toBe('100,5');
  });

  it('writes only characters the UI fonts draw', () => {
    for (const l of ['en', 'ru'] as const) for (const ch of fmtDecimal(-1234.56, 2, l)) expect(BODY_METRICS.adv[ch]).toBeDefined();
  });
});

describe('localDecimals', () => {
  it('turns points between digits into commas in Russian only', () => {
    expect(localDecimals('+0.05 с', 'ru')).toBe('+0,05 с');
    expect(localDecimals('10.5 > 8.5', 'ru')).toBe('10,5 > 8,5');
    expect(localDecimals('Готово. 3 шт.', 'ru')).toBe('Готово. 3 шт.');
    expect(localDecimals('10.5 > 8.5', 'en')).toBe('10.5 > 8.5');
  });
});

describe('fmtNum in Russian (LOC-01)', () => {
  it('short thousands with a decimal comma and a Cyrillic К', async () => {
    const { setLang } = await import('../src/i18n');
    const { fmtNum } = await import('../src/util/format');
    setLang('ru');
    expect(fmtNum(1234)).toBe('1,2К');
    expect(fmtNum(12_400)).toBe('12К');
    expect(fmtNum(640)).toBe('640');
    setLang('en');
    expect(fmtNum(1234)).toBe('1.2K');
  });
});
