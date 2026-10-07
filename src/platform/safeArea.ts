/**
 * Keeps the game canvas inside the safe area. In Telegram full screen the
 * status bar / notch (`safeAreaInset`) and Telegram's floating Close/Back and
 * ⋯ pills (`contentSafeAreaInset`) cover the top of the webview, and the home
 * indicator the bottom. Rather than teaching every scene about insets, the
 * `#game` element itself is inset (index.html reads the CSS variables set
 * here, taking the max with the browser's `env(safe-area-inset-*)`): Phaser's
 * RESIZE scale mode then sizes the canvas to the safe rect, so every scene's
 * top bar and bottom bar land inside it. The strip around it shows the page
 * background. Outside Telegram the Telegram insets are zero.
 *
 * Values are CSS pixels, the unit the canvas parent is laid out in, so no
 * devicePixelRatio / game-scale conversion is needed.
 */
import { onInsetsChanged, type Insets } from './telegram';

const SIDES = ['top', 'bottom', 'left', 'right'] as const;

/** Writes --pa-safe-* (device) and --pa-content-* (Telegram controls) on <html>. */
export function applyInsetVars(device: Insets, content: Insets, root: HTMLElement = document.documentElement): void {
  for (const s of SIDES) {
    root.style.setProperty(`--pa-safe-${s}`, `${Math.round(device[s])}px`);
    root.style.setProperty(`--pa-content-${s}`, `${Math.round(content[s])}px`);
  }
}

/** The #game rect's insets as laid out (CSS px), e.g. for tests and debugging. */
export function gameInsets(): Insets {
  const el = document.getElementById('game');
  if (!el) return { top: 0, bottom: 0, left: 0, right: 0 };
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: window.innerHeight - r.bottom, left: r.left, right: window.innerWidth - r.right };
}

/** Track Telegram's insets; `relayout` runs after each change (e.g. game.scale.refresh()). */
export function trackSafeArea(relayout: () => void): void {
  onInsetsChanged((d, c) => {
    applyInsetVars(d, c);
    // Let the style apply before Phaser measures the parent.
    requestAnimationFrame(() => relayout());
  });
}
