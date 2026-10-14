/** V6-066 (b), RSCR-01: a list whose rows render their own controls (Settings) counts every control's id for element-parity, built or not. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C, Sprite: C }, Scene: C, Loader: { Events: {} }, Geom: { Rectangle: C }, Math: { Clamp: (v: number) => v } } };
});
const { scrollListIds } = await import('../src/ui/widgets');
const { checkParity } = await import('../scripts/lib/layoutMatrix.mjs');

/** A settings-like list: a section, a toggle, a stepper, and so on, 12 rows. */
const rows = ['section', 'toggle', 'speed', 'toggle', 'section', 'speed', 'toggle', 'toggle', 'section', 'toggle', 'speed', 'toggle'];
const ids = (i: number) => (rows[i] === 'toggle' ? [`settings.toggle.r${i}`] : rows[i] === 'speed' ? [`settings.s${i}.down`, `settings.s${i}.up`] : []);

describe('scrollListIds', () => {
  it('counts the ids every row renders, the rows a short window never builds included', () => {
    const all = scrollListIds({ count: rows.length, ids });
    expect(all).toHaveLength(rows.filter((r) => r === 'toggle').length + 2 * rows.filter((r) => r === 'speed').length);
    // 390x844 builds rows 0..9; 844x390 builds rows 0..4: with the list's ids both hold every control
    const built = (to: number) => rows.slice(0, to + 1).flatMap((_, i) => ids(i));
    const base = [...new Set([...built(9), ...all])];
    const here = new Set([...built(4), ...all]);
    expect(checkParity(base, here, {})).toEqual([]);
  });

  it('still counts the tap ids of a list of tappable rows, and none for a list that declares nothing', () => {
    expect(scrollListIds({ count: 3, onTap: () => {}, id: (i) => `row${i}` })).toEqual(['row0', 'row1', 'row2']);
    expect(scrollListIds({ count: 3 })).toEqual([]);
  });

  it('a row removed from the list still fails parity', () => {
    const base = scrollListIds({ count: rows.length, ids });
    const here = new Set(scrollListIds({ count: rows.length - 1, ids }));
    expect(checkParity(base, here, {}).map((v: { ids: string[] }) => v.ids[0])).toEqual(['settings.toggle.r11']);
  });
});
