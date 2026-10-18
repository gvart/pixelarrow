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
import type { Insets } from './core/safeArea';
import { platform } from './index';

const SIDES = ['top', 'bottom', 'left', 'right'] as const;

/** Writes --pa-safe-* (device) and --pa-content-* (Telegram controls) on <html>. */
function applyInsetVars(device: Insets, content: Insets, root: HTMLElement = document.documentElement): void {
  for (const s of SIDES) {
    root.style.setProperty(`--pa-safe-${s}`, `${Math.round(device[s])}px`);
    root.style.setProperty(`--pa-content-${s}`, `${Math.round(content[s])}px`);
  }
}

/** Track the platform's insets; `relayout` runs after each change (e.g. game.scale.refresh()). */
export function trackSafeArea(relayout: () => void): () => void {
  let last = '';
  return platform.safeArea.onChange((d, c) => {
    // Telegram reports the same insets over and over (every viewportChanged);
    // only an actual change needs a re-layout.
    const key = JSON.stringify([d, c]);
    if (key === last) return;
    last = key;
    applyInsetVars(d, c);
    // Let the style apply before Phaser measures the parent.
    requestAnimationFrame(() => relayout());
  });
}
