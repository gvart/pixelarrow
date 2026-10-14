/**
 * Hover tips for a mouse (A11Y-15, IN-02 AC2). On Telegram Desktop and in a desktop browser, resting the
 * mouse on a control shows the same tip its long-press shows on a phone, so no information is reachable only
 * by long-press. A finger never hovers: a touch starts the long-press instead, exactly as before.
 *
 * The kit wires it in one place each (`tappable` and `Button` in src/ui/kit.ts), with the tip they already
 * pass to the long-press, so every screen gets it for free. No Phaser import: tests drive it with fakes.
 */

/** How long the mouse rests on a control before its tip shows (a desktop tooltip delay). */
export const HOVER_MS = 500;

/** The pointer fields hover reads (a Phaser.Input.Pointer has them). */
export interface HoverPointer {
  /** The last input came from a touch screen. */
  wasTouch: boolean;
  /** A button or finger is down. */
  isDown: boolean;
}

/** A mouse resting on a control, not pressing it: a finger, or a press on its way to a long-press, never is. */
export function canHover(p: HoverPointer): boolean {
  return !p.wasTouch && !p.isDown;
}

/** The parts of a Phaser game object hover uses. */
export interface HoverTarget {
  scene: { time: { delayedCall(ms: number, cb: () => void): { remove(dispatchCallback?: boolean): void } } } | null | undefined;
  input?: { enabled: boolean } | null;
  on(event: string, fn: (p: HoverPointer) => void): unknown;
  once(event: string, fn: () => void): unknown;
}

/** A tooltip shown by `show`; it is closed when the mouse leaves (if it is still open). */
interface Shown {
  active?: boolean;
  destroy(): void;
}

/** The key a control's tip names, "Charge (W)" (set by the keycap layer, src/ui/keycap.ts; input-v6.md §6.1). */
export const tipKeys: { of: (obj: object) => string | null } = { of: () => null };

const isShown = (v: unknown): v is Shown => !!v && typeof (v as Shown).destroy === 'function';

/**
 * Shows `tip` (or what it returns now: a disabled reason can change) through `show` after the mouse rests on
 * `obj` for HOVER_MS, and closes it when the mouse leaves. A press cancels a pending tip (the tap acts).
 * `show` is the long-press path (`longPress.show`); a returned tooltip object is closed on leave.
 */
export function hoverTip(obj: HoverTarget, tip: string | (() => string | undefined), show: (text: string) => unknown): void {
  let timer: { remove(dispatchCallback?: boolean): void } | null = null;
  let shown: Shown | null = null;
  const cancel = () => {
    timer?.remove(false);
    timer = null;
  };
  const hide = () => {
    if (shown && shown.active !== false) shown.destroy();
    shown = null;
  };
  obj.on('pointerover', (p) => {
    cancel();
    if (!canHover(p) || !obj.scene) return;
    timer = obj.scene.time.delayedCall(HOVER_MS, () => {
      timer = null;
      const said = typeof tip === 'function' ? tip() : tip;
      if (!said || !obj.scene || obj.input?.enabled === false) return;
      const key = tipKeys.of(obj);
      const text = key ? `${said} (${key})` : said;
      const r = show(text);
      shown = isShown(r) ? r : null;
    });
  });
  obj.on('pointerout', () => {
    cancel();
    hide();
  });
  obj.on('pointerdown', cancel);
  obj.once('destroy', cancel);
}
