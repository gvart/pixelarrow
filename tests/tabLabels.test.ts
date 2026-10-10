/**
 * HUB-01 (F-02 decision 2, interaction-patterns P7, MENU-3): the tab bar abbreviates through the i18n short
 * forms before it leaves Cinzel, so English keeps Cinzel capitals on 360 and 320 px phones.
 */
import { describe, expect, it } from 'vitest';
import { LANGS, setLang, t } from '../src/i18n';
import { MODE_TABS, fitTabLabels } from '../src/ui/mosaic/tabLayout';
import { TEXT_MIN } from '../src/ui/tokens';
import { measureText } from '../src/ui/textfit';

const measure = (s: string, face: 'roman' | 'body', size: number) => measureText(s, true, size, face);
const full = () => MODE_TABS.map((tab) => t(tab.key));
const short = () => MODE_TABS.map((tab) => t(tab.short ?? tab.key));
/** 390, 360 and 320 CSS px phones, in UI px. */
const PHONES = [195, 180, 160];

describe('tab labels: short forms (P7)', () => {
  it('Cinzel capitals at 390, 360 and 320 px in English, 390 and 360 in Russian, all five in one style', () => {
    for (const lang of LANGS) {
      setLang(lang);
      // Russian has no short forms: its five words in Cinzel need 360 px (F-02); at 320 they are Inter, as before
      for (const VW of lang === 'ru' ? PHONES.slice(0, 2) : PHONES) {
        const f = fitTabLabels(VW, full(), measure, short());
        const where = `${lang} VW ${VW}`;
        expect(f.slots, where).not.toBeNull();
        expect(f.style.face, where).toBe('roman');
        expect(f.style.size, where).toBeGreaterThanOrEqual(TEXT_MIN);
        // capitals of either the full labels or the short ones, never a mix of the two
        const fullCaps = full().map((l) => l.toUpperCase());
        const shortCaps = short().map((l) => l.toUpperCase());
        expect([fullCaps, shortCaps], where).toContainEqual(f.texts);
      }
    }
    setLang('en');
  });

  it('the full labels win whenever they fit: the 390 px phone reads CAMPAIGN', () => {
    setLang('en');
    expect(fitTabLabels(195, full(), measure, short()).texts[0]).toBe('CAMPAIGN');
    expect(t('nav.tab.campaign.short')).toBe('March');
  });

  it('without short forms the bar behaves as before (Inter in sentence case when Cinzel does not fit)', () => {
    setLang('en');
    const f = fitTabLabels(160, full(), measure);
    expect(f.style.face).toBe('body');
    expect(f.texts).toEqual(full());
  });
});
