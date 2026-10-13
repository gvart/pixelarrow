/**
 * The overlay rules of the kit as pure functions (no Phaser; tested in tests/overlays.test.ts; story F-03,
 * ADR-0005): which open sheets and confirms are on screen (V5-029: at most one sheet plus one confirm),
 * the one close affordance of a sheet (G5), where a destructive action sits next to the primary (A11Y-08,
 * P4), where a toast goes (never over the top bar or a primary CTA, P14) and how a sheet moves (A11Y-12).
 */

/** A sheet (optional or decision, P11/P12) or a yes/no confirm (P12) on top of it. */
export type OverlayKind = 'sheet' | 'confirm';

/**
 * Which overlays of a stack (bottom first) are on screen: the top one, and when the top one is a confirm,
 * the topmost sheet under it. Everything else waits hidden until what covers it closes, so a second sheet
 * replaces the first (G6, MENU-8) and nothing is lost: Back closes the top one and the one under it returns.
 */
export function visibleOverlays(kinds: readonly OverlayKind[]): boolean[] {
  const out = kinds.map(() => false);
  const top = kinds.length - 1;
  if (top < 0) return out;
  out[top] = true;
  if (kinds[top] === 'confirm' && top > 0) {
    const sheet = kinds.lastIndexOf('sheet', top - 1);
    if (sheet >= 0) out[sheet] = true;
  }
  return out;
}

/** The scrim under every sheet and confirm (P25, art bible 7.3): the basalt page at 45%. */
export const SCRIM_ALPHA = 0.45;

/**
 * Which close affordances a sheet keeps (G5: one, never two). A footer "Close" button that the content
 * already has stays (it is the thumb's way out, and removing it would leave a hole in a screen's own
 * footer); the X is drawn only when there is no footer Close. A decision sheet (the shade does not close it)
 * has neither: its own choices are the way out (P12).
 */
export function closeAffordance(o: { closable: boolean; footerClose: boolean }): { x: boolean; footer: boolean } {
  if (!o.closable) return { x: false, footer: o.footerClose };
  return { x: !o.footerClose, footer: o.footerClose };
}

/** Sheet motion (interaction-patterns "Animation Standards"): in 200 ms ease-out, out 150 ms ease-in, instant under Reduce motion (A11Y-12). */
export function sheetMotion(reduced: boolean): { in: number; out: number; rise: number } {
  return reduced ? { in: 0, out: 0, rise: 0 } : { in: 200, out: 150, rise: 8 };
}

/** The role of a button in a row of actions. */
export type ActionRole = 'primary' | 'destructive' | 'other';

/** Space between a destructive action and the primary when they must share a row: 8 UI px = 16 pt (P4). */
export const DESTRUCTIVE_GAP = 8;

/**
 * A row of actions in its on-screen order (A11Y-08, P4): a destructive action is never next to the primary.
 * Destructive actions go to the left end and the primary to the right (under the thumb), the others between
 * them, each group in its given order. Returns the order (indices into `roles`) and the gap before each
 * button after the first: `gap`, or DESTRUCTIVE_GAP where a destructive one still touches the primary.
 */
export function arrangeActions(roles: readonly ActionRole[], gap: number): { order: number[]; gaps: number[] } {
  const idx = roles.map((_, i) => i);
  const order = [...idx.filter((i) => roles[i] === 'destructive'), ...idx.filter((i) => roles[i] === 'other'), ...idx.filter((i) => roles[i] === 'primary')];
  const gaps = order.slice(1).map((i, k) => {
    const pair = [roles[order[k]], roles[i]];
    return pair.includes('primary') && pair.includes('destructive') ? Math.max(gap, DESTRUCTIVE_GAP) : gap;
  });
  return { order, gaps };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The y of a toast `h` tall spanning [x, x + w] (P14, story F-03 AC4). `top` is the lower edge of the top
 * bar, `bottom` the upper edge of the bottom bar (tab bar, command strip), `avoid` the primary CTAs on screen.
 * `at: 'top'` starts under the top bar and steps below any CTA in the way; `'bottom'` starts above the bottom
 * bar and steps above them. When that side has no room the other side is tried; with no room anywhere the
 * toast sits under the top bar: it never covers the top bar.
 */
export function toastY(o: { h: number; x: number; w: number; at: 'top' | 'bottom'; top: number; bottom: number; avoid: readonly Rect[]; gap?: number }): number {
  const gap = o.gap ?? 4;
  const blocker = (y: number) => o.avoid.find((r) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < y + o.h + gap && r.y + r.h > y - gap);
  const down = (): number | null => {
    let y = o.top + gap;
    for (let b = blocker(y); b; b = blocker(y)) y = b.y + b.h + gap;
    return y + o.h <= o.bottom - gap ? y : null;
  };
  const up = (): number | null => {
    let y = o.bottom - gap - o.h;
    for (let b = blocker(y); b; b = blocker(y)) y = b.y - gap - o.h;
    return y >= o.top + gap ? y : null;
  };
  const first = o.at === 'top' ? down() ?? up() : up() ?? down();
  return Math.round(first ?? o.top + gap);
}
