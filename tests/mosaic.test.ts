import { describe, expect, it } from 'vitest';
import { advance } from '../src/art/vectorFont';
import { ROMAN_METRICS } from '../src/art/fontMetrics';
import { LANGS, t, setLang } from '../src/i18n';
import { MEDALLION_RISE, MODE_TABS, TAB_GAP, TAB_H, tabLayout } from '../src/ui/mosaic/tabLayout';
import { ellipsize, measureText } from '../src/ui/textfit';

describe('Cinzel (roman face)', () => {
  it('measures capitals and falls back for Cyrillic', () => {
    expect(measureText('CAMPAIGN', true, 7, 'roman')).toBeGreaterThan(measureText('CAMPAIGN', true, 7, 'body') * 0.7);
    expect(advance('Ж', 'roman')).toBeGreaterThan(0);
    expect(ROMAN_METRICS.cap).toBeGreaterThan(600);
  });

  it('ellipsizes to a width', () => {
    const s = ellipsize('CONTINUE THE MARCH', 60, true, 7, 'roman');
    expect(s.endsWith('…')).toBe(true);
    expect(measureText(s, true, 7, 'roman')).toBeLessThanOrEqual(60);
  });

  it('every tab label exists in both languages and has glyphs', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const tab of MODE_TABS) {
        const label = t(tab.key).toUpperCase();
        expect(label.length).toBeGreaterThan(0);
        expect(measureText(label, true, 5, 'roman'), `${lang} ${tab.id}`).toBeGreaterThan(0);
      }
    }
    setLang('en');
  });
});

describe('tab bar layout', () => {
  it('keeps touch areas >= 22 UI px, apart, and clear of the medallion, at every phone width', () => {
    for (const VW of [160, 170, 187, 195, 215]) {
      const { slots, medallionD, medallionX } = tabLayout(VW);
      expect(slots).toHaveLength(5);
      slots.forEach((s, i) => {
        expect(s.hitW, `VW ${VW} slot ${i}`).toBeGreaterThanOrEqual(22);
        if (i > 0) expect(s.hitX - (slots[i - 1].hitX + slots[i - 1].hitW), `VW ${VW} gap ${i}`).toBeGreaterThanOrEqual(TAB_GAP - 0.01);
      });
      // the middle area is the medallion's whole diameter
      expect(slots[2].hitX).toBeLessThanOrEqual(medallionX + 2);
      expect(slots[2].hitX + slots[2].hitW).toBeGreaterThanOrEqual(medallionX + medallionD - 2);
      expect(slots[4].hitX + slots[4].hitW).toBeLessThanOrEqual(VW);
    }
    expect(TAB_H).toBeGreaterThanOrEqual(22);
    expect(MEDALLION_RISE).toBeGreaterThan(0);
  });
});
