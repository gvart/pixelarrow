/**
 * Settings → Keyboard shortcuts (story V6-INP-05, design/ux/input-v6.md §5): a page of the settings
 * sheet listing every action with its two key chips, a reset per changed row and Reset all.
 *
 * - Enter (or a click) on a chip opens the capture sheet: the next key is taken (input-v6.md §5.3).
 *   A modifier alone waits, auto-repeat is ignored, Esc cancels, Tab and browser keys are refused
 *   with the reason (Tab then moves focus to the sheet's buttons), and a key another live action
 *   holds asks Swap (default) or Replace.
 * - Every change applies at once (the router's bindings) and is saved on this device only, as the
 *   differences from the defaults (bindingStore.ts, §5.5).
 * - Labels come from glyphs.ts: the layout map (InputHints.keyLabels) or a US table, ⌘ or Ctrl by platform (§6.2).
 *
 * The pure parts (SECTIONS, captureKey, changed) are tested in tests/settingsControls.test.ts.
 */
import Phaser from 'phaser';
import { Button, addText, mosaicPanelImage, type UIMetrics } from '../kit';
import { ScrollList, confirmDialog, toast } from '../widgets';
import { MIconButton } from '../mosaic/iconButton';
import { openParchmentSheet } from '../mosaic/ParchmentSheet';
import { focus, focusRole } from '../focusRing';
import { openSettingsPage, settingsSheetW } from '../notifySettings';
import { LINE_H, ellipsize, measureText, wrapText } from '../textfit';
import { SURFACE, TEXT_MIN } from '../tokens';
import { SIZE } from '../theme';
import { ACTIONS, type ActionId } from '../input/actions';
import { assign, conflictsWith, defaultBindings, refused, resetAction, resetAll, sameBinding, type Binding, type BindingMap, type KeyEvent, type Slot } from '../input/bindings';
import { keys } from '../input/keys';
import { saveBindings } from '../input/bindingStore';
import { bindingLabel, loadGlyphs } from '../input/glyphs';
import { platform } from '../../platform';
import { t, type TKey } from '../../i18n';

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

/** The page's sections in the order of input-v6.md §1.1; the fixed actions (§5.4) last, read-only. */
export const SECTIONS: readonly { label: TKey; actions: readonly ActionId[] }[] = [
  { label: 'controls.sec.orders', actions: ['order.advance', 'order.charge', 'order.hold', 'order.shoot', 'order.fifth', 'order.then', 'order.undo', 'turn.left', 'turn.right'] },
  { label: 'controls.sec.groups', actions: ['group.1', 'group.2', 'group.3', 'group.4', 'group.5', 'group.6', 'group.7', 'group.8', 'group.9'] },
  { label: 'controls.sec.abilities', actions: ['ability.1', 'ability.2', 'ability.3', 'ability.more'] },
  { label: 'controls.sec.time', actions: ['time.pause', 'time.faster', 'time.slower'] },
  { label: 'controls.sec.camera', actions: ['cam.pan.up', 'cam.pan.down', 'cam.pan.left', 'cam.pan.right', 'cam.zoom.in', 'cam.zoom.out', 'cam.follow', 'menu.battle'] },
  { label: 'controls.sec.deploy', actions: ['deploy.fight', 'deploy.shape', 'deploy.groups', 'deploy.works', 'deploy.inspect'] },
  { label: 'controls.sec.confirm', actions: ['deploy.resetAll', 'deploy.leave', 'battle.retreat', 'hero.dismiss'] },
  {
    label: 'controls.sec.menus',
    actions: ['back', 'focus.next', 'focus.prev', 'focus.up', 'focus.down', 'focus.left', 'focus.right', 'activate', 'scroll.pageUp', 'scroll.pageDown', 'scroll.home', 'scroll.end', 'help.keys'],
  },
];

// ------------------------------------------------------------------ pure: capture and labels

const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight']);

/** What a key pressed during a capture does (input-v6.md §5.3). */
export type CaptureResult =
  | { kind: 'wait' }
  | { kind: 'cancel' }
  | { kind: 'refused'; why: 'reserved' | 'browser' | 'fixed'; binding: Binding; other?: ActionId }
  | { kind: 'conflict'; binding: Binding; other: ActionId; leavesNone: boolean; swap: BindingMap; replace: BindingMap }
  | { kind: 'done'; binding: Binding; map: BindingMap };

/** The binding a key down makes (Ctrl and ⌘ are one `mod`). */
function bindingOf(ev: KeyEvent): Binding {
  const b: Binding = { code: ev.code };
  if (ev.ctrlKey || ev.metaKey) b.mod = true;
  if (ev.altKey) b.alt = true;
  if (ev.shiftKey) b.shift = true;
  return b;
}

/** A key pressed while capturing a key for `slot` of `action`. */
export function captureKey(map: BindingMap, action: ActionId, slot: Slot, ev: KeyEvent & { repeat?: boolean }): CaptureResult {
  if (ev.repeat || MODIFIER_CODES.has(ev.code)) return { kind: 'wait' };
  if (ev.code === 'Escape') return { kind: 'cancel' };
  const binding = bindingOf(ev);
  const why = refused(binding);
  if (why === 'modifier') return { kind: 'wait' };
  if (why) return { kind: 'refused', why, binding };
  if (same(map[action][slot], binding)) return { kind: 'done', binding, map };
  const other = conflictsWith(map, action, binding);
  if (other && !ACTIONS[other].rebindable) return { kind: 'refused', why: 'fixed', binding, other };
  if (!other) return { kind: 'done', binding, map: assign(map, action, slot, binding, 'swap') };
  const replace = assign(map, action, slot, binding, 'replace');
  return { kind: 'conflict', binding, other, leavesNone: !replace[other].some(Boolean), swap: assign(map, action, slot, binding, 'swap'), replace };
}

const same = (a: Binding | null, b: Binding | null) => (a && b ? sameBinding(a, b) : a === b);

/** The row differs from its default (it shows its reset). */
export function changed(map: BindingMap, id: ActionId): boolean {
  const d = defaultBindings()[id];
  return !same(map[id][0], d[0]) || !same(map[id][1], d[1]);
}

// ------------------------------------------------------------------ the page

type PageRow = { kind: 'section'; label: TKey } | { kind: 'action'; id: ActionId };

const PAGE_ROWS: readonly PageRow[] = SECTIONS.flatMap((s): PageRow[] => [{ kind: 'section', label: s.label }, ...s.actions.map((id): PageRow => ({ kind: 'action', id }))]);

const label = (b: Binding | null) => (b ? bindingLabel(b) : t('controls.none'));

/** Apply and save a new map; `msg` is the toast that confirms it. */
function apply(scene: Phaser.Scene, next: BindingMap, msg: string): void {
  if (next !== keys.bindings) {
    keys.setBindings(next);
    void saveBindings(next);
  }
  toast(scene, msg, 'good');
}

/** Opens Settings → Keyboard shortcuts. */
export function openControls(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  const { VW, VH } = scene.m;
  const rowH = SIZE.btnH;
  const step = rowH + SIZE.gap;
  const w = settingsSheetW(VW);
  const want = 26 + PAGE_ROWS.length * step + step + 12;
  const m = openSettingsPage(scene, { title: t('controls.title'), h: Math.min(want, VH - 12), id: 'controls', onClose });
  const { c, x, y, h } = m;
  const iw = w - 16;
  let list: ScrollList | null = null;
  const refresh = () => c.active && list?.refresh();
  const changedTo = (id: ActionId, next: BindingMap, before: Binding | null, after: Binding | null) => {
    apply(scene, next, t('controls.toast', { action: t(ACTIONS[id].label), from: label(before), to: label(after) }));
    refresh();
  };
  // Reset all stays in view under the list (a virtual list would not build it for Tab, past the fixed rows)
  const footY = y + h - 10 - rowH;
  c.add(
    new Button(scene, x + 8, footY, iw - 4, rowH, {
      label: t('controls.resetAll'),
      variant: 'destructive',
      small: true,
      id: 'controls.resetAll',
      onClick: () =>
        confirmDialog(scene, {
          title: t('controls.resetAllTitle'),
          body: t('controls.resetAllBody'),
          cancel: t('common.cancel'),
          ok: t('controls.resetAllOk'),
          destructive: true,
          onOk: () => {
            apply(scene, resetAll(), t('controls.resetAllDone'));
            refresh();
          },
        }),
    }),
  );
  list = new ScrollList(scene, c, x + 8, y + 26, iw, footY - SIZE.gap - (y + 26), {
    count: PAGE_ROWS.length,
    rowH,
    gap: SIZE.gap,
    render: (i, row, rw) => {
      const r = PAGE_ROWS[i];
      if (r.kind === 'section') {
        row.add(addText(scene, 2, 10, ellipsize(t(r.label), rw - 4, false, 7, 'head'), 'hInk'));
        row.add(scene.add.rectangle(0, 21, rw - 4, 1, SURFACE.line).setOrigin(0, 0));
        return;
      }
      const id = r.id;
      const def = ACTIONS[id];
      const name = t(def.label);
      const map = keys.bindings;
      row.add(mosaicPanelImage(scene, 0, 0, rw - 4, rowH - 1, 'parchmentWell'));
      // right to left: reset (only on a changed row), the second chip, the first chip
      const chipW = Math.min(46, Math.floor((rw - 4) / 4.2));
      const resetX = rw - 4 - 22;
      const chip2X = resetX - 2 - chipW;
      const chip1X = chip2X - 2 - chipW;
      const room = (def.rebindable ? chip1X : rw - 4 - 70) - 8;
      if (measureText(name) <= room) row.add(addText(scene, 6, 8, name, 'pInk'));
      else {
        const lines = wrapText(name, room, 2, false, TEXT_MIN).lines;
        row.add(addText(scene, 6, lines.length > 1 ? 3 : 8, lines.join('\n'), 'pInk').setFontSize(TEXT_MIN).setLineSpacing(-1.5));
      }
      if (!def.rebindable) {
        // fixed (§5.4): shown so the player knows them, never edited
        const keysText = map[id].filter((b): b is Binding => !!b).map(label).join(' · ');
        row.add(addText(scene, rw - 10, 8, ellipsize(keysText, 66), 'pMuted', 1));
        return;
      }
      ([0, 1] as const).forEach((slot) => {
        const b = map[id][slot];
        const text = b ? label(b) : '+';
        row.add(
          new Button(scene, slot === 0 ? chip1X : chip2X, 1, chipW, rowH - 2, {
            label: measureText(text) <= chipW - 6 ? text : ellipsize(text, chipW - 6),
            small: true,
            variant: 'secondary',
            id: `controls.${id}.${slot}`,
            tip: `${t(b ? 'controls.chipTip' : 'controls.addTip', { action: name })}${b ? ` (${text})` : ''}`,
            onClick: () =>
              openCapture(scene, id, slot, (next, after) => {
                changedTo(id, next, b, after);
              }),
          }),
        );
      });
      if (changed(map, id))
        row.add(
          new MIconButton(scene, resetX, 0, 22, 22, {
            icon: 'back',
            label: t('controls.resetRow', { action: name }),
            id: `controls.${id}.reset`,
            onClick: () => {
              const before = keys.bindings[id][0];
              const next = resetAction(keys.bindings, id);
              changedTo(id, next, before, next[id][0]);
            },
          }),
        );
    },
  });
  // labels from the player's layout (Й on a Russian layout in Chromium), once the browser answers
  void loadGlyphs(platform.input).then(refresh);
  c.once('destroy', () => {
    list?.destroy();
    list = null;
  });
  return c;
}

/**
 * The capture sheet (input-v6.md §5.3): "Press a key for Charge", Clear and Cancel. Keys go to the
 * capture until Tab moves focus to the buttons or a conflict asks Swap / Replace / Cancel.
 * `done` gets the new map and the slot's new binding.
 */
function openCapture(scene: UiScene, id: ActionId, slot: Slot, done: (next: BindingMap, after: Binding | null) => void): Phaser.GameObjects.Container {
  const action = t(ACTIONS[id].label);
  const w = Math.min(scene.m.VW - 24, 200);
  const iw = w - 20;
  const h = 26 + 2 * LINE_H + 2 + LINE_H + 4 + 3 * LINE_H + 6 + 2 * SIZE.btnH + SIZE.gap + 12;
  let end = () => {};
  const m = openParchmentSheet(scene, { title: t('controls.capture.title'), w, h, dock: 'center', closeButton: false, id: 'controls.capture', onClose: () => end() });
  const { c, x, y } = m;
  const cx = x + w / 2;
  const prompt = wrapText(t('controls.capture.prompt', { action }), iw, 2);
  c.add(addText(scene, cx, y + 26, prompt.lines.join('\n'), 'pInk', 0.5).setCenterAlign());
  const hintY = y + 26 + 2 * LINE_H + 2;
  c.add(addText(scene, cx, hintY, t('controls.capture.hint'), 'pMuted', 0.5).setFontSize(TEXT_MIN));
  const statusY = hintY + LINE_H + 4;
  let status: Phaser.GameObjects.BitmapText | null = null;
  const say = (text: string, font: 'pInk' | 'pBad' = 'pBad') => {
    status?.destroy();
    status = addText(scene, cx, statusY, wrapText(text, iw, 3).lines.join('\n'), font, 0.5).setCenterAlign();
    c.add(status);
  };
  let buttons: Phaser.GameObjects.GameObject[] = [];
  const by = y + h - 12 - 2 * SIZE.btnH - SIZE.gap;
  const half = Math.floor((iw - SIZE.gap) / 2);
  const setButtons = (make: () => Phaser.GameObjects.GameObject[]) => {
    buttons.forEach((b) => b.destroy());
    buttons = make();
    c.add(buttons);
  };
  const finish = (next: BindingMap, after: Binding | null) => {
    end();
    m.close();
    done(next, after);
  };
  const cancel = () => new Button(scene, x + 10 + half + SIZE.gap, by + SIZE.btnH + SIZE.gap, half, SIZE.btnH, { label: t('common.cancel'), variant: 'secondary', id: 'controls.capture.cancel', onClick: () => m.close() });
  // listening: Clear (when the slot has a key) and Cancel
  setButtons(() => {
    const has = !!keys.bindings[id][slot];
    const clear = new Button(scene, x + 10, by + SIZE.btnH + SIZE.gap, half, SIZE.btnH, {
      label: t('controls.capture.clear'),
      variant: 'secondary',
      id: 'controls.capture.clear',
      onClick: () => finish(assign(keys.bindings, id, slot, null, 'replace'), null),
    });
    if (!has) clear.setEnabled(false, t('controls.none'));
    return [clear, cancel()];
  });
  let listening = true;
  end = keys.capture((ev) => {
    if (!listening) return false;
    const r = captureKey(keys.bindings, id, slot, ev);
    if (r.kind === 'wait') return true;
    if (r.kind === 'cancel') {
      m.close();
      return true;
    }
    if (r.kind === 'done') {
      finish(r.map, r.binding);
      return true;
    }
    const key = bindingLabel(r.binding);
    if (r.kind === 'refused') {
      say(r.why === 'fixed' ? t('controls.refused.fixed', { key, action: t(ACTIONS[r.other!].label) }) : t(`controls.refused.${r.why}`, { key }));
      // Tab does what it says: it moves focus to the buttons (Clear, Cancel), and the capture stops
      if (r.binding.code !== 'Tab') return true;
      listening = false;
      return false;
    }
    // a conflict: Swap (the default), Replace, Cancel
    listening = false;
    const other = t(ACTIONS[r.other].label);
    say(`${t('controls.conflict', { key, action: other })}${r.leavesNone ? `\n${t('controls.noKey', { action: other })}` : ''}`, 'pInk');
    setButtons(() => {
      const swap = new Button(scene, x + 10, by, iw, SIZE.btnH, { label: t('controls.swap'), variant: 'primary', id: 'controls.capture.swap', onClick: () => finish(r.swap, r.binding) });
      focusRole(swap, 'primary');
      const replace = new Button(scene, x + 10, by + SIZE.btnH + SIZE.gap, half, SIZE.btnH, { label: t('controls.replace'), variant: 'secondary', id: 'controls.capture.replace', onClick: () => finish(r.replace, r.binding) });
      return [swap, replace, cancel()];
    });
    // the key came from the keyboard: show the ring on Swap
    focus.visible = true;
    return true;
  });
  // while listening the ring hides (Enter is a key to capture here, not a press of Clear); it comes back on the chip after
  const ring = focus.visible;
  focus.visible = false;
  c.once('destroy', () => {
    end();
    if (ring) focus.visible = true;
  });
  return c;
}
