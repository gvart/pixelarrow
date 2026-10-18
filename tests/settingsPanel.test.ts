/**
 * Where Settings and its pages open (V6-RSCR-10, design/ux/landscape-v6.md §3.4 and §13.3): the v5
 * bottom sheet on phones upright, a 60% side panel on a phone sideways, a bottom sheet at most 280
 * wide on a tablet, and a centred panel at most 320 wide and 80% tall on a laptop. The pages take
 * the same place, and their content is laid out for the width the panel gets.
 */
import { describe, expect, it, vi } from 'vitest';
import { metricsFor } from '../src/ui/sizeClass';

vi.mock('phaser', () => {
  class C {}
  const go = { Container: C, Image: C, Sprite: C, Text: C, BitmapText: C, Graphics: C, Rectangle: C, Zone: C, TileSprite: C, RenderTexture: C };
  return { default: { GameObjects: go, Scene: C, Geom: { Rectangle: C }, Events: { EventEmitter: C } } };
});
const { sheetBox, setSheetArea } = await import('../src/ui/mosaic/ParchmentSheet');
const { settingsSheetH, settingsSheetW, settingsSheetOpts } = await import('../src/ui/notifySettings');

/** A scene at a W x H CSS px safe area (only its metrics are read). */
const sceneAt = (size: string) => {
  const [w, h] = size.split('x').map(Number);
  return { m: metricsFor(w, h, 1, false), events: { once: () => undefined } } as unknown as Parameters<typeof sheetBox>[0];
};
const settingsBox = (size: string, h = 999) => {
  const s = sceneAt(size);
  return { s, box: sheetBox(s, { ...settingsSheetOpts(s), h }) };
};

describe('Settings opens per §3.4 in every class', () => {
  it('phones upright keep the v5 bottom sheet, 240 wide', () => {
    for (const size of ['390x844', '360x780', '320x693']) {
      const { s, box } = settingsBox(size, 300);
      expect(box.presentation, size).toBe('bottom');
      expect(box.w, size).toBe(Math.min(s.m.VW - 8, 240));
      expect(box.y + box.h, size).toBe(s.m.VH);
    }
  });

  it('a phone sideways: a right side panel 60% of the width, full height', () => {
    const { s, box } = settingsBox('844x390');
    expect(box.presentation).toBe('side');
    expect(box.w).toBe(Math.round(0.6 * s.m.VW));
    expect(box.x + box.w).toBe(s.m.VW);
  });

  it('a tablet: a bottom sheet at most 280 wide, centred', () => {
    for (const size of ['768x1024', '820x1180']) {
      const { s, box } = settingsBox(size, 300);
      expect(box.presentation, size).toBe('bottom');
      expect(box.w, size).toBe(280);
      expect(box.x, size).toBe(Math.round((s.m.VW - 280) / 2));
    }
  });

  it('a laptop: a centred panel 320 wide and at most 80% tall', () => {
    for (const size of ['1024x768', '1280x800', '1440x900', '1920x1080']) {
      const { s, box } = settingsBox(size);
      expect(box.presentation, size).toBe('dialog');
      expect(box.w, size).toBe(320);
      expect(box.h, size).toBe(Math.round(0.8 * s.m.VH));
      expect(box.x, size).toBe(Math.round((s.m.VW - 320) / 2));
      expect(box.y, size).toBe(Math.round((s.m.VH - box.h) / 2));
    }
  });

  it('a short page (About) at a laptop is as wide as Settings and only as tall as its content', () => {
    const { box } = settingsBox('1280x800', 120);
    expect(box).toMatchObject({ presentation: 'dialog', w: 320, h: 120 });
  });

  it('settingsSheetW gives the content the width of the panel it opens in', () => {
    for (const size of ['390x844', '320x693', '844x390', '768x1024', '1024x768', '1280x800', '1920x1080']) {
      const { s, box } = settingsBox(size);
      expect(settingsSheetW(s), size).toBe(box.w);
    }
  });

  it('a bare width keeps the v5 rule for callers that pass VW', () => {
    expect(settingsSheetW(195)).toBe(187);
    expect(settingsSheetW(640)).toBe(240);
  });

  it('a side panel stays under the top bar: Settings asks for no more than the content area (§3.4), a phone upright as v5', () => {
    const s = sceneAt('844x390');
    setSheetArea(s, { x: 42, y: 15, w: s.m.VW - 42, h: s.m.VH - 15 });
    expect(settingsSheetH(s, 999)).toBe(s.m.VH - 15);
    const box = sheetBox(s, { ...settingsSheetOpts(s), h: settingsSheetH(s, 999) });
    expect(box).toMatchObject({ presentation: 'side', y: 15 });
    const p = sceneAt('390x844');
    expect(settingsSheetH(p, 999)).toBe(p.m.VH - 12);
    expect(settingsSheetH(p, 300)).toBe(300);
  });
});
