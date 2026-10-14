/**
 * RFND-04: the wheel scrolls only the scroll area under the pointer (docs/v6/audit/UI.md: every live
 * area used to scroll at once). `wheelOwner` walks up from the top hit object; the innermost area
 * that can scroll wins. kit.ts's ScrollArea asks it on every wheel event.
 */
import { describe, expect, it } from 'vitest';
import { wheelOwner, type WheelNode } from '../src/ui/input/wheel';
import kitSrc from '../src/ui/kit.ts?raw';

type Area = { name: string; max: number; canScroll(): boolean };
const area = (name: string, max = 100): Area => ({
  name,
  max,
  canScroll() {
    return this.max > 0;
  },
});
const node = (parent: WheelNode | null = null): WheelNode => ({ parentContainer: parent });

/** A page (outer area) holding a list (inner area); a second list beside them; and a button outside both. */
function scene() {
  const root = node();
  const page = area('page');
  const list = area('list');
  const side = area('side');
  const pageContent = node(root);
  const pageZone = node(root);
  const listContent = node(pageContent);
  const listZone = node(pageContent);
  const sideContent = node(root);
  const sideZone = node(root);
  const owner = new Map<WheelNode, Area>([
    [pageContent, page],
    [pageZone, page],
    [listContent, list],
    [listZone, list],
    [sideContent, side],
    [sideZone, side],
  ]);
  const of = (n: WheelNode) => owner.get(n);
  return { root, page, list, side, pageContent, pageZone, listContent, listZone, sideContent, sideZone, of };
}

describe('the wheel scrolls only the area under the pointer', () => {
  it('a row of the side list scrolls the side list, not the page', () => {
    const s = scene();
    expect(wheelOwner(node(s.sideContent), s.of)).toBe(s.side);
  });

  it('the bare zone of an area (between rows) scrolls that area', () => {
    const s = scene();
    expect(wheelOwner(s.sideZone, s.of)).toBe(s.side);
    expect(wheelOwner(s.pageZone, s.of)).toBe(s.page);
  });

  it('nested: a row of the inner list scrolls the inner list (innermost wins)', () => {
    const s = scene();
    expect(wheelOwner(node(node(s.listContent)), s.of)).toBe(s.list);
    expect(wheelOwner(s.listZone, s.of)).toBe(s.list);
  });

  it('an inner list with nothing to scroll hands the wheel to the page round it', () => {
    const s = scene();
    s.list.max = 0;
    expect(wheelOwner(node(s.listContent), s.of)).toBe(s.page);
  });

  it('over a button outside every area, or over nothing, no area scrolls', () => {
    const s = scene();
    expect(wheelOwner(node(s.root), s.of)).toBeUndefined();
    expect(wheelOwner(undefined, s.of)).toBeUndefined();
  });

  it('ScrollArea.onWheel asks wheelOwner with the top object under the pointer', () => {
    const onWheel = kitSrc.slice(kitSrc.indexOf('const onWheel'));
    const body = onWheel.slice(0, onWheel.indexOf('};'));
    expect(body).toMatch(/wheelOwner\(\s*over\[0\]/);
    expect(body).toMatch(/!==\s*this\)\s*return/);
  });
});
