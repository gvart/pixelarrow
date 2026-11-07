/**
 * The war's controls for the Godot input layer (docs/impl/godot-port.md P10, godot/src/input): the action table
 * (src/war/input/actions.ts: id, context, kind, default keys), key events resolved through src/war/input/bindings.ts
 * resolve in the region's contexts, and the selection rule for a click (src/war/view/select.ts clickPick), so the Godot
 * side keeps the same keys and picks as the Phaser client.
 */
import { ACTIONS, ACTION_IDS, type Context } from '../../war/input/actions';
import { defaultBindings, resolve, type KeyEvent } from '../../war/input/bindings';
import { clickPick } from '../../war/view/select';
import { Rng } from '../../sim/rng';

const CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyH', 'KeyX', 'KeyF', 'KeyQ', 'KeyB', 'KeyR', 'KeyG', 'KeyT', 'KeyM', 'KeyZ', 'Space', 'Escape', 'Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowLeft',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit9', 'Numpad3', 'Slash', 'F1', 'F2', 'F10'];
/** The contexts live in a region, most specific first, as ../../war/view resolves them: build mode or a selected building over the region. */
const STACKS: Context[][] = [['region', 'camera', 'global'], ['build', 'camera', 'global'], ['building', 'camera', 'global']];

function keyCases() {
  const map = defaultBindings(), out: unknown[] = [];
  for (const ctx of STACKS)
    for (const code of CODES)
      for (let m = 0; m < 8; m++) {
        const ev: KeyEvent = { code, ctrlKey: !!(m & 1), metaKey: false, altKey: !!(m & 2), shiftKey: !!(m & 4) };
        out.push({ ctx, code, mod: !!(m & 1), alt: !!(m & 2), shift: !!(m & 4), act: resolve(map, ev, ctx) });
      }
  return out;
}

function pickCases() {
  const r = new Rng(5), out: unknown[] = [];
  for (let i = 0; i < 200; i++) {
    const ids = Array.from({ length: 30 }, (_, k) => k + 1);
    const sel = ids.filter(() => r.chance(0.3)), before = ids.filter(() => r.chance(0.3));
    const start = r.int(0, 20), squad = ids.slice(start, start + r.int(1, 10));
    const man = r.chance(0.8) ? squad[r.int(0, squad.length - 1)] : r.int(1, 30);
    const shift = r.chance(0.5), twice = r.chance(0.4);
    out.push({ sel, before, squad, man, shift, twice, pick: clickPick(sel, before, squad, man, shift, twice) });
  }
  return out;
}

export const vectors = () => ({
  actions: ACTION_IDS.map((id) => ({ id, context: ACTIONS[id].context, kind: ACTIONS[id].kind, label: ACTIONS[id].label, defaults: ACTIONS[id].defaults })),
  keys: keyCases(),
  picks: pickCases(),
});
