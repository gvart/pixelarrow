/**
 * S1-1 (QA-03): a scroll area's rows outside its viewport take no taps. The mask only hides them, so the
 * kit drops hits on them (src/ui/kit.ts clippedOut); a row scrolled under the tab bar never wins a tab tap.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C }, Scene: C, Loader: { Events: {} } } };
});
const { clippedOut } = await import('../src/ui/kit');

describe('clippedOut', () => {
  const view = { x: 10, y: 100, w: 200, h: 300 };
  const content = { __scrollClip: view, parentContainer: null };
  const row = { parentContainer: { parentContainer: content } };

  it('keeps a hit inside the viewport', () => {
    expect(clippedOut(row, 50, 150)).toBe(false);
  });

  it('drops a hit below, above or beside the viewport (a row under the tab bar)', () => {
    expect(clippedOut(row, 50, 420)).toBe(true);
    expect(clippedOut(row, 50, 90)).toBe(true);
    expect(clippedOut(row, 5, 150)).toBe(true);
  });

  it('leaves objects outside any scroll area alone', () => {
    expect(clippedOut({ parentContainer: null }, 50, 999)).toBe(false);
  });

  it('honours every scroll area on the way up (a list inside a scrolled sheet)', () => {
    const outer = { __scrollClip: { x: 0, y: 0, w: 400, h: 200 }, parentContainer: null };
    const inner = { __scrollClip: { x: 0, y: 0, w: 400, h: 800 }, parentContainer: outer };
    expect(clippedOut({ parentContainer: inner }, 50, 300)).toBe(true);
  });
});
