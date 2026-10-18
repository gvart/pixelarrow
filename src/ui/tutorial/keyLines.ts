/**
 * The tutorial's words by device (design/ux/input-v6.md §10): a fine pointer reads "click" where a
 * finger reads "tap" (the `.mouse` variant of a line), and a keyboard adds one short line naming the
 * step's hotkey by its current binding (the `.kb` line), so a rebound key shows correctly. Touch
 * devices keep the v5 lines word for word. No step logic changes.
 */
import type { TutStepId } from '../../game/tutorial';
import type { ActionId } from '../input/actions';
import { hasKey, t, type Params, type TKey } from '../../i18n';

/** What the device offers (InputHints.keyboard() and finePointer()). */
export interface TutDevice {
  keyboard: boolean;
  fine: boolean;
}

/** The hotkeys each step's keyboard line names, as the line's params. */
const KB_KEYS: Partial<Record<TutStepId, Record<string, ActionId>>> = {
  select: { key: 'group.1' },
  zoom: { in: 'cam.zoom.in', out: 'cam.zoom.out' },
  undo: { key: 'order.undo' },
  fight: { key: 'deploy.fight' },
  loose: { group: 'group.2', key: 'order.shoot' },
  play: { key: 'time.pause' },
  then: { thenKey: 'order.then', chargeKey: 'order.charge' },
  ability: { key: 'ability.1' },
};

/** The step's line for this device; `keyOf` gives an action's current key label. */
export function tutorialLine(step: TutStepId, text: TKey, params: Params | undefined, dev: TutDevice, keyOf: (a: ActionId) => string): string {
  const mouse = `${text}.mouse`;
  let line = t(dev.fine && hasKey(mouse) ? mouse : text, params);
  const kb = `${text}.kb`;
  if (dev.keyboard && hasKey(kb)) {
    const keys: Params = {};
    for (const [k, a] of Object.entries(KB_KEYS[step] ?? {})) keys[k] = keyOf(a);
    line += ` ${t(kb, keys)}`;
  }
  return line;
}
