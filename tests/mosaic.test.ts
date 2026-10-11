import { describe, expect, it } from 'vitest';
import { advance } from '../src/art/vectorFont';
import { ROMAN_METRICS } from '../src/art/fontMetrics';
import { LANGS, t, setLang } from '../src/i18n';
import { MEDALLION_RISE, MODE_TABS, TAB_GAP, TAB_H, TAB_LABEL_STYLES, fitTabLabels, tabLayout, tabSlotWidths } from '../src/ui/mosaic/tabLayout';
import { badgeText, buttonLabelSizes, chipText, scrollCue, switchLabelStyle, wrapWords } from '../src/ui/mosaic/policy';
import { buttonLook } from '../src/art/mosaicUi';
import { DISPLAY_MIN, MOSAIC, TEXT_MIN, contrast } from '../src/ui/tokens';
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

// ------------------------------------------------------------------ F-02: kit controls (ADR-0005)

const W = (face: 'roman' | 'body', size: number) => (s: string) => measureText(s, true, size, face);
const measure = (s: string, face: 'roman' | 'body', size: number) => measureText(s, true, size, face);
const GREYS: number[] = [MOSAIC.off, MOSAIC.offHi, MOSAIC.slab, MOSAIC.slabHi, MOSAIC.slabLo];
const PHONES = [160, 170, 180, 187, 195, 215];

describe('tab bar labels (art bible 7.2: one face, one case, one size)', () => {
  it('all five share a style; Cinzel only in capitals, Inter only as written; never under 6.5; icon-only (V5-068) only below 340 px', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const labels = MODE_TABS.map((tab) => t(tab.key));
      for (const VW of PHONES) {
        const f = fitTabLabels(VW, labels, measure);
        const where = `${lang} VW ${VW}`;
        // V5-068: no style at 6.5 or more fits only on the narrowest bars; then the bar goes icon-only
        if (!f.slots) {
          expect(VW, where).toBeLessThan(170);
          continue;
        }
        if (f.style.face === 'roman') {
          expect(f.texts, where).toEqual(labels.map((l) => l.toUpperCase()));
          expect(f.style.size, where).toBeGreaterThanOrEqual(TEXT_MIN);
        } else expect(f.texts, where).toEqual(labels);
        // the 390 reference phone keeps Cinzel capitals (P19) in both languages
        if (VW >= 195) expect(f.style.face, where).toBe('roman');
        expect(f.style.size, where).toBeGreaterThanOrEqual(TEXT_MIN);
      }
    }
    setLang('en');
  });

  it('slots hold their labels, keep touch areas >= 22 UI px and apart, and the medallion stays centred', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const labels = MODE_TABS.map((tab) => t(tab.key));
      for (const VW of PHONES) {
        const f = fitTabLabels(VW, labels, measure);
        const { slots, medallionD, medallionX } = tabLayout(VW, 5, f.slots ?? undefined);
        const where = `${lang} VW ${VW}`;
        expect(slots[4].x + slots[4].w, where).toBe(VW);
        expect(Math.abs(medallionX + medallionD / 2 - VW / 2), where).toBeLessThanOrEqual(1);
        expect(medallionD, where).toBeGreaterThanOrEqual(30);
        slots.forEach((s, i) => {
          // a label stays inside the selected block (1 UI px in from the slot) with 1 UI px to spare
          if (f.slots) expect(f.widths[i], `${where} label ${i}`).toBeLessThanOrEqual(s.w - 4);
          expect(s.hitW, `${where} hit ${i}`).toBeGreaterThanOrEqual(22);
          if (i > 0) expect(s.hitX - (slots[i - 1].hitX + slots[i - 1].hitW), `${where} gap ${i}`).toBeGreaterThanOrEqual(TAB_GAP - 0.01);
        });
        // the middle area is the medallion's whole diameter
        expect(slots[2].hitX, where).toBeLessThanOrEqual(medallionX + 2);
        expect(slots[2].hitX + slots[2].hitW, where).toBeGreaterThanOrEqual(medallionX + medallionD - 2);
      }
    }
    setLang('en');
  });

  it('a 274 px Telegram canvas (VW 137) has no style at 6.5: icon-only but for the active tab (V5-068)', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const f = fitTabLabels(137, MODE_TABS.map((tab) => t(tab.key)), measure);
      expect(f.slots, lang).toBeNull();
      expect(f.style.size, lang).toBeGreaterThanOrEqual(TEXT_MIN);
      // the active label always fits the bar, even the longest
      for (const w of f.widths) expect(w + 4, lang).toBeLessThanOrEqual(137);
    }
    setLang('en');
  });

  it('a bar wide enough for equal slots keeps them (the old geometry)', () => {
    expect(tabSlotWidths(215, [20, 20, 20, 20, 20])!.map((w) => Math.round(w))).toEqual([43, 43, 43, 43, 43]);
    expect(tabSlotWidths(100, [60, 60, 20, 60, 60])).toBeNull();
    expect(TAB_LABEL_STYLES[0]).toEqual({ face: 'roman', size: DISPLAY_MIN });
  });
});

describe('row labels (segmented switch)', () => {
  it('Cinzel capitals when all fit, else Inter for every segment', () => {
    expect(switchLabelStyle([{ label: 'Gear', room: 60 }, { label: 'Stats', room: 60 }], measure)).toEqual({ face: 'roman', size: 7, icons: true });
    // a label matters more than its icon: the icons go before the capitals do (ru shop: "ПРОПУСК")
    expect(switchLabelStyle([{ label: 'Лавка', room: 31, bare: 45 }, { label: 'Пропуск', room: 31, bare: 45 }], measure)).toMatchObject({ face: 'roman', icons: false });
    const s = switchLabelStyle([{ label: 'Gear', room: 60 }, { label: 'Controls', room: 30 }], measure);
    expect(s.face).toBe('body');
    expect(s.size).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

describe('colour roles of the controls (art bible 4.2 / 7.3, audit G2)', () => {
  it('no enabled button face is grey, and cream reads on every one', () => {
    for (const style of ['btnPrimary', 'btnHero', 'btnBronze', 'btnNeutral', 'btnDanger', 'btnBuy'] as const) {
      const look = buttonLook(style)!;
      for (const c of [look.hi, look.mid, look.lo]) expect(GREYS, `${style} ${c.toString(16)}`).not.toContain(c);
      expect(contrast(MOSAIC.cream, look.mid), style).toBeGreaterThanOrEqual(4.5);
    }
    // the neutral (Close, Flee, Dismiss) is the bronze family, darker than the secondary
    expect(buttonLook('btnNeutral')!.mid).toBe(MOSAIC.bronzeLo);
    // the lit toggle carries ink
    expect(contrast(MOSAIC.ink, buttonLook('btnBronzeOn')!.mid)).toBeGreaterThanOrEqual(4.5);
    // the disabled face is the flat grey one: no raised look at all
    expect(buttonLook('btnStone')).toBeNull();
  });
});

describe('badges (G11)', () => {
  it('count only what there is to act on', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-2)).toBeNull();
    expect(badgeText(undefined)).toBeNull();
    expect(badgeText('')).toBeNull();
    expect(badgeText('0')).toBeNull();
    expect(badgeText(3)).toBe('3');
    expect(badgeText('7')).toBe('7');
    expect(badgeText(120)).toBe('99+');
    // the old "!" is a plain dot
    expect(badgeText('!')).toBe('');
  });
});

describe('overflow policy (G14) and text size floor (A11Y-09)', () => {
  it('wraps a must-show fact without breaking or cutting a word', () => {
    const w = W('body', TEXT_MIN);
    const str = 'Pitch camp on the map before the night falls';
    const lines = wrapWords(str, 60, w);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(str);
    lines.forEach((l) => expect(w(l)).toBeLessThanOrEqual(60));
    // a word wider than the line gets its own line, whole
    expect(wrapWords('Thureophoros of Athens', 20, w)).toEqual(['Thureophoros', 'of', 'Athens']);
  });

  it('a chip never cuts a number: it shrinks to 6.5, then writes it short', () => {
    const width = (s: string, z: number) => measureText(s, false, z, 'body');
    expect(chipText('240', 40, 7, width)).toEqual({ text: '240', size: 7 });
    const k = chipText('12345', 18, 7, width);
    expect(k.text).toBe('12K');
    expect(k.text).not.toContain('…');
    // a short number that does not fit stays whole at the smallest size
    expect(chipText('240', 5, 7, width)).toEqual({ text: '240', size: TEXT_MIN });
    // a word is the only thing that may be shortened
    expect(chipText('Legendary', 20, 7, width).text.endsWith('…')).toBe(true);
  });

  it('button labels never go under TEXT_MIN', () => {
    for (let h = 22; h <= 40; h++) {
      const sizes = buttonLabelSizes(h);
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBe(TEXT_MIN);
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    }
  });
});

describe('scroll cue (G9)', () => {
  it('shows an edge only while content hides behind it', () => {
    expect(scrollCue(0, 0)).toEqual({ above: false, below: false });
    expect(scrollCue(0, 0.6)).toEqual({ above: false, below: false });
    expect(scrollCue(0, 120)).toEqual({ above: false, below: true });
    expect(scrollCue(60, 120)).toEqual({ above: true, below: true });
    expect(scrollCue(120, 120)).toEqual({ above: true, below: false });
  });
});
