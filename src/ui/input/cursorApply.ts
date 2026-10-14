/**
 * Puts the cursor of cursor.ts on the canvas, and keeps the browser's context
 * menu off it (ADR-0012 Decision 5, input-v6.md §2.2, §2.4).
 *
 * - Only a mouse sets the cursor: a finger never does (`pointer.wasTouch`, per
 *   event, so a touch laptop's mouse still gets cursors).
 * - The cursor goes through Phaser's default cursor, so an object with its own
 *   `cursor` (the side panel's shade) sets and then restores ours.
 * - The context menu is suppressed on the canvas only; DOM text fields (the
 *   clan-name prompt) keep theirs.
 */
import type Phaser from 'phaser';
import { CURSOR_CSS, cursorFor, type CursorKind, type HoverHit } from './cursor';

/** The CSS to write for `kind`, or null: a finger (never), or the cursor is already right. */
export function cursorUpdate(current: string, p: { wasTouch: boolean }, kind: CursorKind): string | null {
  if (p.wasTouch) return null;
  const css = CURSOR_CSS[kind];
  return css === current ? null : css;
}

/** Set the canvas cursor for a mouse `p` (nothing for a finger). */
export function setCursor(scene: Phaser.Scene, p: { wasTouch: boolean }, kind: CursorKind): void {
  const m = scene.input.manager;
  const css = cursorUpdate(m.defaultCursor || 'default', p, kind);
  if (css !== null) scene.input.setDefaultCursor(css);
}

/** What the topmost object under the mouse is for the cursor: a control (enabled or not), or nothing. */
export function overControl(over: readonly Phaser.GameObjects.GameObject[]): { hit: HoverHit; disabled: boolean } {
  const top = over[0] as (Phaser.GameObjects.GameObject & { enabled?: boolean }) | undefined;
  if (!top || top.listenerCount('pointerup') + top.listenerCount('pointerdown') === 0) return { hit: 'none', disabled: false };
  return { hit: 'control', disabled: top.enabled === false };
}

const quiet = new WeakSet<object>();

/** No browser context menu on the game canvas (once per canvas; the listener is the canvas's own). */
export function noContextMenu(scene: Phaser.Scene): void {
  const mouse = scene.input.mouse;
  if (!mouse || quiet.has(mouse)) return;
  quiet.add(mouse);
  mouse.disableContextMenu();
}

/**
 * The cursor on a map (World, War, Camp): a hand over controls, the stone bar
 * over a disabled one, the four-way arrow while `panning()`, else the arrow.
 * The context menu is suppressed, and the arrow is restored when the scene ends.
 */
export function mapCursor(scene: Phaser.Scene, panning: () => boolean): void {
  noContextMenu(scene);
  const update = (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    const c = overControl(over);
    setCursor(scene, p, cursorFor({ hit: c.hit, disabled: c.disabled, drag: panning() ? 'pan' : null, busy: false }));
  };
  scene.input.on('pointermove', update);
  scene.input.on('pointerup', update);
  scene.events.once('shutdown', () => resetCursor(scene));
}

/** Back to the plain arrow (a scene that set cursors is ending). */
export function resetCursor(scene: Phaser.Scene): void {
  scene.input?.manager?.setDefaultCursor('');
}
