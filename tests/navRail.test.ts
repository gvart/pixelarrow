import { describe, expect, it } from 'vitest';
import { LANGS, t, setLang } from '../src/i18n';
import { MODE_TABS, TAB_GAP, fitRailLabels, railLayout } from '../src/ui/mosaic/tabLayout';
import { RAIL_W, RAIL_W_COMPACT } from '../src/ui/sizeClass';
import { TEXT_MIN } from '../src/ui/tokens';
import { measureText } from '../src/ui/textfit';

const measure = (s: string, face: 'roman' | 'body', size: number) => measureText(s, true, size, face);

describe('nav rail (landscape-v6 §3.1)', () => {
  it('is 84 wide with 30-tall items at compact landscape and 72 wide with 48-tall items at expanded', () => {
    const c = railLayout(195, true);
    expect(c.w).toBe(RAIL_W_COMPACT);
    expect(c.items.every((i) => i.h === 30)).toBe(true);
    expect(c.medallionD).toBe(26);
    const e = railLayout(400, false);
    expect(e.w).toBe(RAIL_W);
    expect(e.items.every((i) => i.h === 48)).toBe(true);
    expect(e.medallionD).toBe(40);
  });

  it('keeps five touch areas >= 22 UI px tall, apart and on screen, down to the Telegram 844x390 height', () => {
    for (const [VH, compact] of [[161, true], [175, true], [195, true], [360, false], [384, false], [400, false], [450, false]] as const) {
      const { items } = railLayout(VH, compact);
      expect(items).toHaveLength(MODE_TABS.length);
      items.forEach((it, i) => {
        expect(it.hitH, `${VH} ${i}`).toBeGreaterThanOrEqual(22);
        expect(it.hitY, `${VH} ${i}`).toBeGreaterThanOrEqual(0);
        expect(it.hitY + it.hitH, `${VH} ${i}`).toBeLessThanOrEqual(VH);
        if (i) expect(it.hitY - (items[i - 1].hitY + items[i - 1].hitH), `${VH} gap ${i}`).toBeGreaterThanOrEqual(TAB_GAP - 1);
      });
    }
  });

  it('shows all five labels in both languages, never cut (nav-labels)', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const compact of [true, false]) {
        const f = fitRailLabels(compact, MODE_TABS.map((tab) => t(tab.key)), measure);
        expect(f.fits, `${lang} ${compact}`).toBe(true);
        expect(f.style.size).toBeGreaterThanOrEqual(TEXT_MIN);
        for (const w of f.widths) expect(w, `${lang} ${compact}`).toBeLessThanOrEqual(railLayout(195, compact).labelW);
      }
    }
    setLang('en');
  });
});
