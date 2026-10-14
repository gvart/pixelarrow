/**
 * Keycaps (design/ux/input-v6.md §6.1, ADR-0012 Decision 6): a small basalt chip with the key's label,
 * in a control's top-right corner, over its rim, so it never takes layout width or shrinks a label.
 *
 * - Shown only while InputHints.keyboard() is true and Show key hints is on (glyphs.ts capShown): a
 *   touch device never shows one, a keyboard shows them after its first key (the HUD is rebuilt then).
 * - The label is the action's current binding on this layout (glyphs.ts), the shortest of its two, so
 *   Pause reads "P" rather than "Space".
 * - Every tagged control names its key in its hover tip ("Charge (W)"), keycaps on or off.
 */
import Phaser from 'phaser';
import { addText } from './kit';
import { MOSAIC } from './tokens';
import { measureText } from './textfit';
import { uiFrame } from './layout';
import { tipKeys } from './hover';
import { keys } from './input/keys';
import { bindingLabel, capShown } from './input/glyphs';
import type { ActionId } from './input/actions';
import type { Binding } from './input/bindings';
import { platform } from '../platform';
import { state } from '../state';

/** The keycap's text size (the A11Y text floor, 6.5 UI px) and its padding. */
export const CAP_TEXT = 6.5;
const PAD = 2;
const CAP_H = 9;
/** How far the keycap reaches out over the control's rim, UI px. */
const RIM_OUT = 4;

type Host = Phaser.GameObjects.Container & { w?: number; h?: number; __keyAction?: ActionId };

/** The label a keycap shows for `id`: the shorter of its bindings' labels ("" with none). */
export function capLabel(id: ActionId): string {
  const labels = keys.bindings[id].filter((b): b is Binding => !!b).map(bindingLabel);
  return labels.reduce((a, b) => (!a || measureText(b, false, CAP_TEXT) < measureText(a, false, CAP_TEXT) ? b : a), '');
}

/** Show key hints (Settings → Controls, §5.1; missing = on). */
export function keyHintsOn(): boolean {
  return state.campaign?.data.settings.keyHints !== false;
}

/** Keycaps are shown now (a keyboard, the hints on); `w`: the control's width, `phone`: a compact portrait screen. */
export function keycapsShown(w: number, phone: boolean): boolean {
  return capShown({ keyboard: platform.input.keyboard(), hints: keyHintsOn(), w, phone });
}

// the hover tip of a tagged control names its key
tipKeys.of = (obj) => {
  const id = (obj as Host).__keyAction;
  return id ? capLabel(id) || null : null;
};

/**
 * Tag `host` as the control of `action` (its tip names the key) and, when keycaps are shown, put the chip
 * on its top-right corner. `host` is a container whose box is `w` x `h` from its origin.
 */
export function addKeycap(scene: Phaser.Scene, host: Host, action: ActionId, phone: boolean): void {
  host.__keyAction = action;
  const w = host.w ?? host.width;
  const h = host.h ?? host.height;
  if (!w || !h || !keycapsShown(w, phone)) return;
  if (host.list.some((c) => c.name === `keycap.${action}`)) return;
  const label = capLabel(action);
  if (!label) return;
  const cw = Math.min(w, Math.ceil(measureText(label, false, CAP_TEXT)) + PAD * 2);
  const ch = Math.min(h, CAP_H);
  // straddling the top-right rim (half out), kept on screen: a bar's key at the screen's edge stays inside
  const m = host.getWorldTransformMatrix();
  const k = Math.abs(m.scaleX) || 1;
  const x = Math.min(w - cw + RIM_OUT, (scene.scale.width - m.tx) / k - cw);
  const y = Math.max(-RIM_OUT, -m.ty / k);
  const cap = scene.add.container(x, y);
  cap.name = `keycap.${action}`;
  cap.add(scene.add.rectangle(0, 0, cw, ch, MOSAIC.page, 0.92).setOrigin(0, 0).setStrokeStyle(0.6, MOSAIC.cream, 0.55));
  const txt = addText(scene, cw / 2, 0.5, label, 'onAccent', 0.5).setFontSize(CAP_TEXT);
  uiFrame(txt, cap, cw, ch);
  cap.add(txt);
  host.add(cap);
}
