/**
 * DUE-01: the Duels hub's pure rules (design/ux/screens-modes.md M-2 .. M-4). The scene draws with Phaser; tested
 * here: numbers group their thousands (a space in Russian, never a comma), the fresco and the chest tip give way on a
 * short screen, the header keeps chips and buttons on one row, a ladder run past its ticket says it paid nothing, the
 * ladder's battle source names itself a ladder floor with its deadline (an explicit field), and the new strings read
 * in both languages.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LANGS, setLang } from '../src/i18n';
import { DUELS_V5_EN } from '../src/i18n/duels.v5.en';
import { DUELS_V5_RU } from '../src/i18n/duels.v5.ru';
import { FRESCO_MIN_VH, fmtCount, headerLayout, ladderArrival, ladderNotes, showChestTip, showFresco } from '../src/scenes/duel/hubLayout';
import { DemoDuelSource } from '../src/duel/client';
import { LADDER_TICKET_TTL_MS } from '../src/duel/ladder';

afterEach(() => setLang('en'));

describe('numbers (Director: Russian groups with spaces, never commas)', () => {
  it('English groups thousands with commas', () => {
    expect(fmtCount(640, 'en')).toBe('640');
    expect(fmtCount(1500, 'en')).toBe('1,500');
    expect(fmtCount(12400, 'en')).toBe('12,400');
    expect(fmtCount(1234567, 'en')).toBe('1,234,567');
    expect(fmtCount(-2500, 'en')).toBe('-2,500');
  });

  it('Russian groups with a space from five digits and never writes a comma', () => {
    expect(fmtCount(640, 'ru')).toBe('640');
    expect(fmtCount(1500, 'ru')).toBe('1500');
    expect(fmtCount(12400, 'ru')).toBe('12 400');
    expect(fmtCount(1234567, 'ru')).toBe('1 234 567');
    for (const n of [999, 1000, 10_000, 123_456, 9_999_999]) expect(fmtCount(n, 'ru')).not.toContain(',');
  });

  it('follows the current language by default', () => {
    setLang('ru');
    expect(fmtCount(25_000)).toBe('25 000');
    setLang('en');
    expect(fmtCount(25_000)).toBe('25,000');
  });
});

describe('the hub on a short screen (M-2, DUE-1)', () => {
  it('the fresco shows from 700 CSS px tall (350 UI px), the chest tip with it', () => {
    expect(FRESCO_MIN_VH).toBe(350);
    expect(showFresco(422)).toBe(true); // 390x844
    expect(showFresco(390)).toBe(true); // 360x780
    expect(showFresco(320)).toBe(false); // 320x640
    expect(showFresco(284)).toBe(false); // 320x568
    expect(showChestTip(422)).toBe(true);
    expect(showChestTip(320)).toBe(false);
  });

  it('the header keeps Glory, the level, Team and Armoury in order, inside the row, touch-sized', () => {
    for (const w of [114, 138, 150, 185, 215]) {
      for (const fits of [true, false]) {
        const l = headerLayout(w, [44, 46], 2, () => fits);
        const rows = [l.chips, l.rows === 1 ? [] : l.buttons];
        const first = l.rows === 1 ? [...l.chips, ...l.buttons] : l.chips;
        for (const row of [first, ...rows.slice(1)]) {
          for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w);
          if (row.length) expect(row[row.length - 1].x + row[row.length - 1].w).toBeLessThanOrEqual(w);
        }
        for (const b of l.buttons) expect(b.w).toBeGreaterThanOrEqual(22);
      }
    }
  });

  it('one row from 320x640 up (the chips trim their padding); two only at 320x568 in Telegram', () => {
    expect(headerLayout(138, [44, 46], 2, () => false).rows).toBe(1);
    expect(headerLayout(138, [44, 46], 2, () => false).tight).toBe(true);
    expect(headerLayout(185, [44, 46], 2, () => false).tight).toBe(false);
    expect(headerLayout(114, [44, 46], 2, () => false).rows).toBe(2);
  });

  it('labels the buttons only when both fit; else both are icon-only (one style per row)', () => {
    const l = headerLayout(185, [44, 46], 2, (i) => i === 0);
    expect(l.buttons.map((b) => b.label)).toEqual([false, false]);
    const k = headerLayout(260, [44, 46], 2, () => true);
    expect(k.buttons.map((b) => b.label)).toEqual([true, true]);
  });
});

describe('the 30-min ladder ticket on the result (CT-06, Director 2)', () => {
  const run = { firstClear: false, won: true, stars: 3, newBest: false, capped: 0, accountXp: 0, floor: 5 };

  it('a run reported too late says it paid nothing, first, and shows no XP', () => {
    const notes = ladderNotes({ ...run, expired: true });
    expect(notes[0]).toBe('Finished after 30 min: verified, but it paid nothing');
    expect(notes.some((n) => n.includes('duel XP'))).toBe(false);
  });

  it('an in-time run has no expired note', () => {
    const notes = ladderNotes({ ...run, accountXp: 12 });
    expect(notes.some((n) => n.includes('paid nothing'))).toBe(false);
    expect(notes).toContain('+12 duel XP');
  });

  it('the hub toast after an expired run says so', () => {
    expect(ladderArrival({ floor: 5, won: true, glory: 0, stars: 3, expired: true })).toBe('Floor 5: the 30 min ran out, so it paid nothing');
    expect(ladderArrival({ floor: 5, won: true, first: true, glory: 1500, stars: 3 })).toContain('+1,500 Glory');
  });
});

describe('the ladder battle is named, not inferred (Director 1)', () => {
  it('a ladder ticket carries its deadline on this device as a field', async () => {
    const src = new DemoDuelSource({ now: () => 1_000 });
    const tk = await src.ladderStart(1);
    expect(typeof tk.deadline).toBe('number');
    expect(Math.abs(tk.deadline - (Date.now() + LADDER_TICKET_TTL_MS))).toBeLessThan(1000);
  });
});

describe('strings (DUE-01)', () => {
  it('every v5 duel string exists in both languages with the same params', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(DUELS_V5_RU).sort()).toEqual(Object.keys(DUELS_V5_EN).sort());
    for (const [k, en] of Object.entries(DUELS_V5_EN)) expect(params(DUELS_V5_RU[k as keyof typeof DUELS_V5_RU]), k).toEqual(params(en));
    expect(LANGS).toContain('ru');
  });

  it('no Duels screen is titled Shop (M-4): the Armoury', () => {
    expect(DUELS_V5_EN['d5.armoury']).toBe('Armoury');
    expect(DUELS_V5_RU['d5.armoury']).toBe('Арсенал');
  });
});
