/**
 * The action map (ADR-0012 Decision 1): every key-driven thing the game does,
 * named independently of devices, with its context, kind and default keys.
 * Data only. The defaults are the table in design/ux/input-v6.md §1.1; game
 * code refers to actions by ActionId and never reads a key.
 *
 * Two contexts beyond the ADR's list make the spec's conflict rules exact:
 * `focus` (a control has keyboard focus: Enter, Space and the arrows act on it,
 * §5.4) and `camera` (a pannable battlefield or map, §1.1 "battle and map").
 */
import type { TKey } from '../../i18n';
import type { Binding } from './bindings';

export const CONTEXTS = ['global', 'menu', 'focus', 'map', 'camera', 'battle', 'battle.deploy', 'battle.fight', 'capture'] as const;
export type Context = (typeof CONTEXTS)[number];

/**
 * Which contexts can be active at the same time; conflict detection checks only
 * these pairs (§5.3). Symmetric. `capture` (a rebinding capture) suspends every
 * action, so it overlaps nothing.
 */
const LIVE: readonly Context[] = CONTEXTS.filter((c) => c !== 'capture');
const BATTLE: readonly Context[] = ['battle', 'battle.deploy', 'battle.fight'];
export const OVERLAPS: Readonly<Record<Context, readonly Context[]>> = {
  global: LIVE,
  menu: LIVE,
  focus: ['global', 'menu', 'focus'],
  map: ['global', 'menu', 'map', 'camera'],
  camera: ['global', 'menu', 'map', 'camera', ...BATTLE],
  battle: ['global', 'menu', 'camera', ...BATTLE],
  'battle.deploy': ['global', 'menu', 'camera', 'battle', 'battle.deploy'],
  'battle.fight': ['global', 'menu', 'camera', 'battle', 'battle.fight'],
  capture: [],
};

export function overlaps(a: Context, b: Context): boolean {
  return OVERLAPS[a].includes(b);
}

/** press: once per key down; repeat: also on OS auto-repeat; hold: a level read each frame. */
type ActionKind = 'press' | 'repeat' | 'hold';

const GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Table order is the order of the Controls page (§5.2). */
export const ACTION_IDS = [
  // global and menus: fixed (§5.4)
  'back',
  'focus.next',
  'focus.prev',
  'focus.up',
  'focus.down',
  'focus.left',
  'focus.right',
  'activate',
  'scroll.pageUp',
  'scroll.pageDown',
  'scroll.home',
  'scroll.end',
  'help.keys',
  // battle: orders and groups
  'order.advance',
  'order.charge',
  'order.hold',
  'order.shoot',
  'order.fifth',
  'order.then',
  'order.undo',
  'turn.left',
  'turn.right',
  'group.1',
  'group.2',
  'group.3',
  'group.4',
  'group.5',
  'group.6',
  'group.7',
  'group.8',
  'group.9',
  'ability.1',
  'ability.2',
  'ability.3',
  'ability.more',
  // battle: time and camera
  'time.pause',
  'time.faster',
  'time.slower',
  'cam.pan.up',
  'cam.pan.down',
  'cam.pan.left',
  'cam.pan.right',
  'cam.zoom.in',
  'cam.zoom.out',
  'cam.follow',
  'menu.battle',
  // battle: deployment
  'deploy.fight',
  'deploy.shape',
  'deploy.groups',
  'deploy.works',
  'deploy.inspect',
  // menu-only flows with a confirmation: no default key, bindable by choice (§1.1)
  'deploy.resetAll',
  'deploy.leave',
  'battle.retreat',
  'hero.dismiss',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

interface ActionDef {
  id: ActionId;
  context: Context;
  kind: ActionKind;
  rebindable: boolean;
  label: TKey;
  defaults: readonly Binding[];
}

const k = (code: string): Binding => ({ code });

function def(id: ActionId, context: Context, defaults: Binding[], kind: ActionKind = 'press', rebindable = true): ActionDef {
  return { id, context, kind, rebindable, label: `input.action.${id}` as TKey, defaults };
}

/** A fixed (not rebindable) action. */
function fixed(id: ActionId, context: Context, defaults: Binding[], kind: ActionKind = 'press'): ActionDef {
  return def(id, context, defaults, kind, false);
}

const DEFS: ActionDef[] = [
  fixed('back', 'global', [k('Escape')]),
  fixed('focus.next', 'menu', [k('Tab')]),
  fixed('focus.prev', 'menu', [{ code: 'Tab', shift: true }]),
  fixed('focus.up', 'focus', [k('ArrowUp')], 'repeat'),
  fixed('focus.down', 'focus', [k('ArrowDown')], 'repeat'),
  fixed('focus.left', 'focus', [k('ArrowLeft')], 'repeat'),
  fixed('focus.right', 'focus', [k('ArrowRight')], 'repeat'),
  fixed('activate', 'focus', [k('Enter'), k('Space')]),
  fixed('scroll.pageUp', 'focus', [k('PageUp')], 'repeat'),
  fixed('scroll.pageDown', 'focus', [k('PageDown')], 'repeat'),
  fixed('scroll.home', 'focus', [k('Home')]),
  fixed('scroll.end', 'focus', [k('End')]),
  fixed('help.keys', 'global', [k('Slash'), k('F1')]),

  def('order.advance', 'battle.fight', [k('KeyQ')]),
  def('order.charge', 'battle.fight', [k('KeyW')]),
  def('order.hold', 'battle.fight', [k('KeyE')]),
  def('order.shoot', 'battle.fight', [k('KeyR')]),
  def('order.fifth', 'battle.fight', [k('KeyT')]),
  def('order.then', 'battle.fight', [k('KeyF')]),
  def('order.undo', 'battle', [k('KeyU'), { code: 'KeyZ', mod: true }]),
  def('turn.left', 'battle', [k('Comma')]),
  def('turn.right', 'battle', [k('Period')]),
  ...GROUPS.map((n) => def(`group.${n}`, 'battle', [k(`Digit${n}`), k(`Numpad${n}`)])),
  def('ability.1', 'battle.fight', [k('KeyZ')]),
  def('ability.2', 'battle.fight', [k('KeyX')]),
  def('ability.3', 'battle.fight', [k('KeyC')]),
  def('ability.more', 'battle.fight', [k('KeyV')]),

  def('time.pause', 'battle.fight', [k('Space'), k('KeyP')]),
  def('time.faster', 'battle', [k('BracketRight')]),
  def('time.slower', 'battle', [k('BracketLeft')]),
  def('cam.pan.up', 'camera', [k('ArrowUp')], 'hold'),
  def('cam.pan.down', 'camera', [k('ArrowDown')], 'hold'),
  def('cam.pan.left', 'camera', [k('ArrowLeft')], 'hold'),
  def('cam.pan.right', 'camera', [k('ArrowRight')], 'hold'),
  def('cam.zoom.in', 'camera', [k('Equal'), k('NumpadAdd')]),
  def('cam.zoom.out', 'camera', [k('Minus'), k('NumpadSubtract')]),
  def('cam.follow', 'battle', [k('KeyG')]),
  def('menu.battle', 'battle', [k('KeyM')]),

  def('deploy.fight', 'battle.deploy', [k('Enter')]),
  def('deploy.shape', 'battle', [k('KeyS')]),
  def('deploy.groups', 'battle.deploy', [k('KeyA')]),
  def('deploy.works', 'battle.deploy', [k('KeyB')]),
  def('deploy.inspect', 'battle.deploy', [k('KeyI')]),

  def('deploy.resetAll', 'battle.deploy', []),
  def('deploy.leave', 'battle.deploy', []),
  def('battle.retreat', 'battle.fight', []),
  def('hero.dismiss', 'menu', []),
];

export const ACTIONS: Readonly<Record<ActionId, ActionDef>> = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<ActionId, ActionDef>;
