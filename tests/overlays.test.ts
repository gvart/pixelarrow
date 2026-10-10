import { describe, expect, it } from 'vitest';
import { arrangeActions, closeAffordance, DESTRUCTIVE_GAP, sheetMotion, toastY, visibleOverlays, type ActionRole, type OverlayKind, type Rect } from '../src/ui/mosaic/overlays';

const count = (vis: boolean[], kinds: OverlayKind[], k: OverlayKind) => vis.filter((v, i) => v && kinds[i] === k).length;

describe('overlay stack (V5-029: at most one sheet plus one confirm)', () => {
  it('a second sheet replaces the first; closing it brings the first back', () => {
    expect(visibleOverlays(['sheet'])).toEqual([true]);
    expect(visibleOverlays(['sheet', 'sheet'])).toEqual([false, true]);
    // the second closed: the stack is the first alone again
    expect(visibleOverlays(['sheet'])).toEqual([true]);
  });

  it('a confirm sits over the sheet that asked; a second confirm replaces the first', () => {
    expect(visibleOverlays(['sheet', 'confirm'])).toEqual([true, true]);
    expect(visibleOverlays(['sheet', 'confirm', 'confirm'])).toEqual([true, false, true]);
    expect(visibleOverlays(['confirm'])).toEqual([true]);
    expect(visibleOverlays(['sheet', 'sheet', 'confirm'])).toEqual([false, true, true]);
  });

  it('a sheet opened over a confirm hides both', () => {
    expect(visibleOverlays(['sheet', 'confirm', 'sheet'])).toEqual([false, false, true]);
  });

  it('never more than one sheet and one confirm, whatever the order', () => {
    const kinds: OverlayKind[] = ['sheet', 'confirm'];
    // every stack up to 6 deep
    const all = (n: number): OverlayKind[][] => (n === 0 ? [[]] : all(n - 1).flatMap((s) => kinds.map((k) => [...s, k])));
    for (let n = 1; n <= 6; n++)
      for (const st of all(n)) {
        const vis = visibleOverlays(st);
        expect(count(vis, st, 'sheet'), st.join(',')).toBeLessThanOrEqual(1);
        expect(count(vis, st, 'confirm'), st.join(',')).toBeLessThanOrEqual(1);
        expect(vis[st.length - 1], 'the newest is always shown').toBe(true);
      }
    expect(visibleOverlays([])).toEqual([]);
  });
});

describe('close affordance (G5: one per sheet)', () => {
  it('an X unless the content already has a footer Close', () => {
    expect(closeAffordance({ closable: true, footerClose: false })).toEqual({ x: true, footer: false });
    expect(closeAffordance({ closable: true, footerClose: true })).toEqual({ x: false, footer: true });
  });

  it('a decision sheet has no X (its choices are the way out, P12)', () => {
    expect(closeAffordance({ closable: false, footerClose: false })).toEqual({ x: false, footer: false });
  });

  it('never two', () => {
    for (const closable of [true, false])
      for (const footerClose of [true, false]) {
        const a = closeAffordance({ closable, footerClose });
        expect(Number(a.x) + Number(a.footer)).toBeLessThanOrEqual(1);
        if (closable) expect(Number(a.x) + Number(a.footer)).toBe(1);
      }
  });
});

describe('sheet motion (A11Y-12)', () => {
  it('rises in 200 ms and leaves in 150 ms; instant under Reduce motion', () => {
    expect(sheetMotion(false)).toEqual({ in: 200, out: 150, rise: 8 });
    expect(sheetMotion(true)).toEqual({ in: 0, out: 0, rise: 0 });
  });
});

describe('destructive actions (A11Y-08, P4)', () => {
  const touches = (roles: ActionRole[], gap: number) => {
    const { order, gaps } = arrangeActions(roles, gap);
    return order.slice(1).some((i, k) => {
      const pair = [roles[order[k]], roles[i]];
      return pair.includes('primary') && pair.includes('destructive') && gaps[k] < DESTRUCTIVE_GAP;
    });
  };

  it('the primary goes right, a destructive action left, with something between them when there is', () => {
    expect(arrangeActions(['other', 'destructive', 'primary'], 4)).toEqual({ order: [1, 0, 2], gaps: [4, 4] });
    expect(arrangeActions(['primary', 'other'], 4)).toEqual({ order: [1, 0], gaps: [4] });
  });

  it('a destructive action alone with the primary keeps 16 pt away from it', () => {
    expect(arrangeActions(['primary', 'destructive'], 4)).toEqual({ order: [1, 0], gaps: [DESTRUCTIVE_GAP] });
    expect(DESTRUCTIVE_GAP).toBeGreaterThanOrEqual(8);
  });

  it('keeps every action (none lost) and never puts a destructive one against the primary', () => {
    const roles: ActionRole[] = ['primary', 'destructive', 'other'];
    const all = (n: number): ActionRole[][] => (n === 0 ? [[]] : all(n - 1).flatMap((s) => roles.map((r) => [...s, r])));
    for (let n = 1; n <= 4; n++)
      for (const r of all(n)) {
        const { order, gaps } = arrangeActions(r, 3);
        expect([...order].sort()).toEqual(r.map((_, i) => i));
        expect(gaps.length).toBe(r.length - 1);
        expect(touches(r, 3), r.join(',')).toBe(false);
      }
  });
});

describe('toast placement (F-03 AC4: never over the top bar or a primary CTA)', () => {
  const base = { h: 20, x: 50, w: 100, top: 30, bottom: 380 };
  const hit = (y: number, r: Rect) => r.x < base.x + base.w && r.x + r.w > base.x && r.y < y + base.h && r.y + r.h > y;

  it('a top toast sits under the top bar', () => {
    const y = toastY({ ...base, at: 'top', avoid: [] });
    expect(y).toBeGreaterThanOrEqual(base.top);
    expect(y).toBe(34);
  });

  it('a bottom toast sits above the bottom bar', () => {
    const y = toastY({ ...base, at: 'bottom', avoid: [] });
    expect(y + base.h).toBeLessThanOrEqual(base.bottom);
  });

  it('steps past a primary CTA in its way, on either side', () => {
    const cta: Rect = { x: 10, y: 340, w: 180, h: 24 };
    const yb = toastY({ ...base, at: 'bottom', avoid: [cta] });
    expect(hit(yb, cta)).toBe(false);
    expect(yb + base.h).toBeLessThanOrEqual(cta.y);
    const high: Rect = { x: 0, y: 32, w: 200, h: 24 };
    const yt = toastY({ ...base, at: 'top', avoid: [high] });
    expect(hit(yt, high)).toBe(false);
    expect(yt).toBeGreaterThanOrEqual(high.y + high.h);
  });

  it('a CTA beside the toast (not under it) does not move it', () => {
    expect(toastY({ ...base, at: 'top', avoid: [{ x: 160, y: 30, w: 30, h: 30 }] })).toBe(34);
  });

  it('with no room anywhere it still never covers the top bar', () => {
    const wall: Rect = { x: 0, y: 0, w: 400, h: 400 };
    expect(toastY({ ...base, at: 'bottom', avoid: [wall] })).toBeGreaterThanOrEqual(base.top);
    expect(toastY({ ...base, at: 'top', avoid: [wall] })).toBeGreaterThanOrEqual(base.top);
  });
});
