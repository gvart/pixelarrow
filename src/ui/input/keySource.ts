/**
 * The one keyboard source (ADR-0012 Decision 3): a single window listener for
 * keydown, keyup, blur and visibilitychange, installed once at boot, feeding
 * the KeyRouter. Phaser's KeyboardPlugin is off (`input.keyboard: false` in
 * main.ts): its captures are per scene, and this router outlives scene
 * switches and sees DOM overlays. Nothing outside src/ui/input/ and the
 * platform adapters reads a KeyboardEvent.
 */
import type { Context } from './actions';
import type { KeyInput, KeyRouter } from './keys';

/** The parts of a DOM KeyboardEvent this reads. */
interface DomKey {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
  keyCode?: number;
  target: unknown;
  preventDefault(): void;
}

/** The parts of `window` this listens to. */
interface KeyWindow {
  addEventListener(type: string, fn: (e: KeyboardEvent) => void): void;
  document: { visibilityState: string; addEventListener(type: string, fn: () => void): void };
}

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** A DOM key event as the router reads it: typing in a text field and IME composition are marked (and then ignored). */
export function toKeyInput(e: DomKey): KeyInput {
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  return {
    code: e.code,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    repeat: e.repeat,
    editable: !!t && (EDITABLE.has(t.tagName ?? '') || !!t.isContentEditable),
    composing: !!e.isComposing || e.keyCode === 229,
  };
}

/**
 * Feed `router` from `win`. `contexts` is read at every key (the top screen,
 * its layers, the battle's phase), so it is never stale. preventDefault only
 * for keys the router handled: browser shortcuts and Tab keep working.
 */
export function installKeySource(win: KeyWindow, router: KeyRouter, contexts: () => readonly Context[]): void {
  win.addEventListener('keydown', (e: DomKey) => {
    router.setContexts(contexts());
    if (router.down(toKeyInput(e))) e.preventDefault();
  });
  win.addEventListener('keyup', (e: DomKey) => router.up(e));
  win.addEventListener('blur', () => router.clear());
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') router.clear();
  });
}
