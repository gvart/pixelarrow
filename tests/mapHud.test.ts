/**
 * V6-RSCR-07: the World and Camp map HUD per layout variant (design/ux/landscape-v6.md §12.2) and the
 * camera's framing rect and deadzone follow (§12.3), at every size of the v6 matrix.
 */
import { describe, expect, it } from 'vitest';
import { metricsFor, type UIMetrics } from '../src/ui/sizeClass';
import { followStep, mapHudLayout, stackKeys, type MapHudSpec } from '../src/ui/mapHud';
import type { Box } from '../src/ui/mosaic/layout/geometry';

const at = (size: string): UIMetrics => {
  const [w, h] = size.split('x').map(Number);
  return metricsFor(w, h, 1, false);
};
const MATRIX = ['390x844', '360x780', '320x693', '844x390', '768x1024', '820x1180', '1024x768', '1280x800', '1440x900', '1920x1080'];
/** SituationLine's height: padding, the sentence lines, the chip row. */
const cardH = (lines: 1 | 2) => 4 + lines * 10 + 3 + 18 + 4;
const WORLD: MapHudSpec = { top: 24, cardH, under: 27, keys: 3, keyW: 80, kind: 'world' };
const CAMP: MapHudSpec = { top: 24, cardH, under: 28, keys: 5, keyW: 92, kind: 'camp' };

const inside = (a: Box, b: Box) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('map HUD (§12.2)', () => {
  it('keeps the v5 HUD in compact portrait: the card across the screen, the strip across the bottom', () => {
    for (const size of ['390x844', '360x780', '320x693']) {
      const m = at(size);
      const l = mapHudLayout(m, WORLD);
      expect(l.variant).toBe('compactPortrait');
      expect(l.card).toEqual({ x: 4, y: 26, w: m.VW - 8, h: cardH(2), lines: 2 });
      expect(l.commands).toEqual({ mode: 'bar', x: 0, w: m.VW });
    }
  });

  it('puts a one-line card top-left and the keys in a stack at the right foot at 844x390', () => {
    const m = at('844x390');
    for (const spec of [WORLD, CAMP]) {
      const l = mapHudLayout(m, spec);
      expect(l.variant).toBe('compactLandscape');
      expect(l.card.lines).toBe(1);
      expect(l.card.w).toBeLessThanOrEqual(260);
      expect(l.card.x).toBe(6);
      if (l.commands.mode !== 'stack') throw new Error('a stack');
      const keys = stackKeys(l.commands, spec.keys);
      expect(keys).toHaveLength(spec.keys);
      expect(keys[0].h).toBe(spec.kind === 'world' ? 30 : 28);
      // the foot of the stack sits on the screen's lower edge (thumbs), the stack at the right edge
      expect(keys.at(-1)!.y + keys.at(-1)!.h).toBe(m.VH - 6);
      expect(l.commands.rect.x + l.commands.rect.w).toBe(m.VW - 6);
      // never under the top bar, never over the card
      expect(keys[0].y).toBeGreaterThanOrEqual(24);
      expect(overlap(l.commands.rect, l.card)).toBe(false);
    }
  });

  it('caps the strip at 360 and centres it at medium, with the v5 card', () => {
    for (const size of ['768x1024', '820x1180']) {
      const m = at(size);
      const l = mapHudLayout(m, CAMP);
      expect(l.variant).toBe('medium');
      expect(l.card).toMatchObject({ x: 4, w: m.VW - 8, lines: 2 });
      expect(l.commands).toEqual({ mode: 'bar', x: Math.round((m.VW - 360) / 2), w: 360 });
    }
  });

  it('gives expanded a two-line card up to 320 and 120 x 30 keys at the bottom-right', () => {
    for (const size of ['1024x768', '1280x800', '1440x900', '1920x1080']) {
      const m = at(size);
      const l = mapHudLayout(m, WORLD);
      expect(l.variant).toBe('expanded');
      expect(l.card.lines).toBe(2);
      expect(l.card.w).toBe(320);
      if (l.commands.mode !== 'stack') throw new Error('a stack');
      expect(stackKeys(l.commands, 3).every((k) => k.w === 120 && k.h === 30)).toBe(true);
      expect(l.commands.rect.y + l.commands.rect.h).toBe(m.VH - 6);
    }
  });
});

describe('framing rect (§12.3)', () => {
  it('lies over the map and clear of the card, its row and the keys, at every size', () => {
    for (const size of MATRIX)
      for (const spec of [WORLD, CAMP]) {
        const m = at(size);
        const l = mapHudLayout(m, spec);
        const map: Box = { x: 0, y: spec.top, w: m.VW, h: m.VH - spec.top };
        expect(inside(l.framing, map), `${size} ${spec.kind}`).toBe(true);
        expect(overlap(l.framing, l.card), `${size} ${spec.kind} card`).toBe(false);
        if (l.commands.mode === 'stack') {
          expect(overlap(l.framing, l.commands.rect), `${size} ${spec.kind} keys`).toBe(false);
          const row: Box = { x: l.card.x, y: l.card.y + l.card.h, w: l.card.w, h: spec.under };
          expect(overlap(l.framing, row), `${size} ${spec.kind} row`).toBe(false);
          // a usable view: at least a third of the map
          expect(l.framing.w * l.framing.h).toBeGreaterThan((map.w * map.h) / 3);
        }
      }
  });
});

describe('deadzone follow (camera-systems)', () => {
  it('stays still while the target is inside the deadzone', () => {
    expect(followStep(9, -9, 20, 20, 16)).toEqual({ x: 0, y: 0 });
  });

  it('chases only the overflow past the deadzone, towards the target', () => {
    const s = followStep(30, -50, 20, 20, 16);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(20);
    expect(s.y).toBeLessThan(0);
    expect(s.y).toBeGreaterThan(-40);
  });

  it('is frame-rate independent: two 8 ms steps land where one 16 ms step does', () => {
    const one = followStep(100, 0, 20, 20, 16).x;
    const a = followStep(100, 0, 20, 20, 8).x;
    const b = followStep(100 - a, 0, 20, 20, 8).x;
    expect(a + b).toBeCloseTo(one, 9);
  });
});
