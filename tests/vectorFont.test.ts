/**
 * The Cinzel word split (art bible OI-1, audit G1: "Strat egos", "Duel s").
 *
 * The bitmap-font atlas (src/art/vectorFont.ts) places every glyph at an
 * advance from the bundled font's metric table. When the bundled face is not
 * loaded when the atlas is drawn, the canvas draws a fallback serif instead,
 * whose letters are much narrower than Cinzel's: each one then sits in a
 * Cinzel-wide slot and the words fall apart. These tests draw the atlas on a
 * fake canvas whose glyph widths are either Cinzel's or the fallback's and
 * measure the ink gap after every letter of the audit's words.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ROMAN_METRICS } from '../src/art/fontMetrics';
import { advance, loadUiFonts, renderVectorAtlas, type Face } from '../src/art/vectorFont';

/** Bold fallback serif (Times New Roman Bold) advances, per mille of the em. */
const FALLBACK: Record<string, number> = {
  a: 500, b: 556, c: 444, d: 556, e: 444, f: 333, g: 500, h: 556, i: 278, j: 333, k: 556, l: 278, m: 833,
  n: 556, o: 500, p: 556, q: 556, r: 444, s: 389, t: 333, u: 556, v: 500, w: 722, x: 500, y: 500, z: 444,
  A: 722, C: 722, D: 722, F: 611, S: 556, T: 667, ' ': 250,
};

interface FakeFace { family: string; weight: string; status: string }

/** A DOM stand-in: a canvas whose text is `drawn` (Cinzel's real widths or the fallback's), and a font set. */
function fakeDom(drawn: 'cinzel' | 'fallback', faces: FakeFace[] = [], load: () => Promise<unknown> = async () => []) {
  const width = (ch: string, px: number) => ((drawn === 'cinzel' ? ROMAN_METRICS.adv[ch] : FALLBACK[ch]) ?? 500) * px / 1000;
  const ctx = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    measureText(s: string) {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
      return { width: [...s].reduce((w, ch) => w + width(ch, px), 0) };
    },
    fillText() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
  };
  const loaded = () => faces.some((f) => f.status === 'loaded');
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    fonts: { check: () => drawn === 'cinzel' && loaded(), load, [Symbol.iterator]: () => faces[Symbol.iterator]() },
  };
  return { width };
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

/** Widest ink gap inside a word (between two letters), in em, as the bitmap text lays it out. */
function widestGap(word: string, drawnWidth: (ch: string, px: number) => number, face: Face = 'roman'): number {
  const K = 4;
  const { glyphs } = renderVectorAtlas(0x3a2414, undefined, K, face);
  const em = 8.4 * K; // the roman face's em in atlas px
  let worst = 0;
  const chars = [...word];
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i] === ' ' || chars[i + 1] === ' ') continue;
    const g = glyphs.find((x) => x.ch === chars[i])!;
    worst = Math.max(worst, (g.xAdvance - drawnWidth(chars[i], em)) / em);
  }
  return worst;
}

const WORDS = ['Strategos', 'First steps', 'Duels', 'Available', 'Cyclops', 'Spoils', 'Titan'];

describe('Cinzel bitmap atlas: words never split (OI-1)', () => {
  it('with the bundled face loaded, letters sit at the metric advances the layout measures', () => {
    const { width } = fakeDom('cinzel', [{ family: 'Cinzel', weight: '700', status: 'loaded' }]);
    for (const w of WORDS) expect(widestGap(w, width), w).toBeLessThan(0.02);
    const { glyphs } = renderVectorAtlas(0x3a2414, undefined, 4, 'roman');
    for (const ch of 'Strategos') expect(glyphs.find((g) => g.ch === ch)!.xAdvance).toBeCloseTo(advance(ch, 'roman') * 4, 1);
  });

  it('when the canvas draws a fallback face, no gap inside a word is wider than 0.15 em', () => {
    const { width } = fakeDom('fallback', [{ family: 'Cinzel', weight: '700', status: 'error' }]);
    for (const w of WORDS) expect(widestGap(w, width), w).toBeLessThanOrEqual(0.15);
  });

  it('a fallback glyph never advances further than the layout measured (text never outgrows its box)', () => {
    fakeDom('fallback');
    const { glyphs } = renderVectorAtlas(0x3a2414, undefined, 4, 'roman');
    for (const g of glyphs) if (advance(g.ch, 'roman') >= 0) expect(g.xAdvance).toBeLessThanOrEqual(advance(g.ch, 'roman') * 4 + 1e-6);
  });

  it('word spaces and tabular digits keep their metric advance in a fallback', () => {
    fakeDom('fallback');
    const { glyphs } = renderVectorAtlas(0x3a2414, undefined, 4, 'roman');
    for (const ch of ' 0123456789') expect(glyphs.find((g) => g.ch === ch)!.xAdvance).toBeCloseTo(advance(ch, 'roman') * 4, 6);
  });
});

describe('loadUiFonts', () => {
  it('reports the faces that did not load instead of drawing them silently', async () => {
    fakeDom('fallback', [{ family: 'Cinzel', weight: '700', status: 'error' }], async () => {
      throw new Error('network');
    });
    expect(await loadUiFonts({ timeoutMs: 50 })).toContain('roman');
  });

  it('reports nothing when every bundled face is loaded', async () => {
    fakeDom('cinzel', [
      { family: 'Inter', weight: '500', status: 'loaded' },
      { family: 'Cormorant SC', weight: '700', status: 'loaded' },
      { family: 'Cinzel', weight: '700', status: 'loaded' },
    ]);
    expect(await loadUiFonts({ timeoutMs: 50 })).toEqual([]);
  });
});
