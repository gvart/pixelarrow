import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtAgoText, fmtClock, fmtDuration, fmtNum, fmtSigned } from '../src/util/format';
import { setLang } from '../src/i18n';

describe('format', () => {
  it('fmtClock: m:ss, rounded, never negative', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtClock(41.6)).toBe('0:42');
    expect(fmtClock(-5)).toBe('0:00');
  });

  it('fmtAgo: short wallet-history times', () => {
    expect(fmtAgo(0, 0)).toBe('0m');
    expect(fmtAgo(0, 59 * 60_000)).toBe('59m');
    expect(fmtAgo(0, 5 * 3_600_000)).toBe('5h');
    expect(fmtAgo(0, 72 * 3_600_000)).toBe('3d');
  });

  it('fmtNum: 999, 1.2K, 12K', () => {
    expect(fmtNum(999.9)).toBe('999');
    expect(fmtNum(1250)).toBe('1.2K');
    expect(fmtNum(12_999)).toBe('12K');
  });

  it('localized durations', () => {
    setLang('en');
    expect(fmtDuration(30_000)).toMatch(/30/);
    expect(fmtDuration(3 * 3_600_000)).toMatch(/3/);
    expect(fmtAgoText(0)).toBe(fmtAgoText(60_000));
  });
});

describe('fmtSigned (reward copy reads "Win +15 · Loss +5", P0)', () => {
  it('always carries the sign', () => {
    expect(fmtSigned(15)).toBe('+15');
    expect(fmtSigned(5)).toBe('+5');
    expect(fmtSigned(-5)).toBe('-5');
    expect(fmtSigned(0)).toBe('0');
  });
});
