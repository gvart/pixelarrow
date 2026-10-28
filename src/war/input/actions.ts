/**
 * The war's action map (moved from the campaign's src/ui/input/actions.ts, ADR-0012 Decision 1): every key-driven
 * thing the war pages do, named independently of devices, with its context, kind, label and default keys. Game code
 * asks ./keys.ts for the action of a key event (or whether a hold action is down) and never reads a key itself.
 *
 * Contexts: `global` (every war page), `camera` and `region` (a live region), `build` (build mode is on: its keys
 * win over the region's, so F flips a wall there and fires the squad active elsewhere), `building` (one of your
 * buildings is selected: its keys win over the region's, so R repairs it there and opens the roster elsewhere), `world` (the world map),
 * `capture` (the controls page is waiting for a key: nothing else runs).
 */
import type { Binding } from './bindings';

export const CONTEXTS = ['global', 'camera', 'region', 'build', 'building', 'world', 'capture'] as const;
export type Context = (typeof CONTEXTS)[number];

/**
 * Which contexts can be active at the same time; conflict detection checks only these pairs (§5.3). Symmetric. `build`
 * does not overlap `region`: build mode's keys shadow the region's while it is on (the resolver tries build first);
 * `building` likewise while one of your buildings is selected.
 */
const LIVE: readonly Context[] = CONTEXTS.filter((c) => c !== 'capture');
export const OVERLAPS: Readonly<Record<Context, readonly Context[]>> = {
  global: LIVE,
  camera: ['global', 'camera', 'region', 'build', 'building'],
  region: ['global', 'camera', 'region'],
  build: ['global', 'camera', 'build'],
  building: ['global', 'camera', 'building'],
  world: ['global', 'world'],
  capture: [],
};

export function overlaps(a: Context, b: Context): boolean {
  return OVERLAPS[a].includes(b);
}

/** press: once per key down; repeat: also on OS auto-repeat; hold: a level read each frame. */
type ActionKind = 'press' | 'repeat' | 'hold';

/** The sections of the controls page, in order. */
export const SECTIONS = ['Camera', 'Selection', 'Orders', 'Formations', 'Build mode', 'Buildings', 'View and panels', 'World map', 'Chat', 'General'] as const;
export type Section = (typeof SECTIONS)[number];

const N = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
type G = (typeof N)[number];

/** Table order is the order of the controls page. */
export const ACTION_IDS = [
  'cam.up', 'cam.down', 'cam.left', 'cam.right', 'cam.grab',
  'sel.all', ...N.map((n) => `group.${n}` as `group.${G}`), ...N.map((n) => `group.set.${n}` as `group.set.${G}`),
  'order.act', 'order.hold', 'order.stop', 'order.active', 'order.fireArrows', 'order.deploy', 'order.fallBack', 'order.rear', 'order.rejoin',
  'form.line', 'form.column', 'form.wedge', 'form.loose',
  'build.mode', 'build.rotate', 'build.confirm', 'build.undo', 'build.flip', 'build.narrower', 'build.wider', 'build.gate', 'build.tower',
  'bld.upgrade', 'bld.repair', 'bld.demolish',
  'view.cutaway', 'view.map', 'view.normal', 'view.altitude', 'view.movement', 'view.ownership', 'view.biomes', 'view.resources', 'view.bossCam',
  'panel.roster', 'panel.chest', 'panel.market', 'panel.guardian', 'panel.sound', 'panel.tasks', 'panel.crown', 'panel.holdings', 'panel.works', 'panel.favour', 'replay.open', 'go.world',
  'world.enter', 'world.routes', 'world.haul', 'world.fit', 'world.zoomIn', 'world.zoomOut',
  'chat.open', 'chat.mark', 'map.pin',
  'back', 'menu.settings', 'help.keys', 'dev.panel',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export interface ActionDef {
  id: ActionId;
  context: Context;
  kind: ActionKind;
  rebindable: boolean;
  label: string;
  section: Section;
  defaults: readonly Binding[];
}

const k = (code: string, o: Omit<Binding, 'code'> = {}): Binding => ({ code, ...o });

function def(id: ActionId, context: Context, section: Section, label: string, defaults: Binding[], kind: ActionKind = 'press', rebindable = true): ActionDef {
  return { id, context, kind, rebindable, label, section, defaults };
}

const DEFS: ActionDef[] = [
  def('cam.up', 'camera', 'Camera', 'Pan up', [k('KeyW'), k('ArrowUp')], 'hold'),
  def('cam.down', 'camera', 'Camera', 'Pan down', [k('KeyS'), k('ArrowDown')], 'hold'),
  def('cam.left', 'camera', 'Camera', 'Pan left', [k('KeyA'), k('ArrowLeft')], 'hold'),
  def('cam.right', 'camera', 'Camera', 'Pan right', [k('KeyD'), k('ArrowRight')], 'hold'),
  def('cam.grab', 'camera', 'Camera', 'Hold to drag the map', [k('Space')], 'hold'),

  def('sel.all', 'region', 'Selection', 'Select all your men', [k('KeyA', { mod: true })]),
  ...N.map((n) => def(`group.${n}`, 'region', 'Selection', `Select group ${n} (twice: go there)`, [k(`Digit${n}`), k(`Numpad${n}`)])),
  ...N.map((n) => def(`group.set.${n}`, 'region', 'Selection', `Store selection as group ${n}`, [k(`Digit${n}`, { mod: true })])),

  def('order.act', 'region', 'Orders', 'Context action (hold: all actions)', [k('KeyE')]),
  def('order.hold', 'region', 'Orders', 'Hold position', [k('KeyH')]),
  def('order.stop', 'region', 'Orders', 'Stop work', [k('KeyX')]),
  def('order.active', 'region', 'Orders', 'Squad active skill', [k('KeyF')]),
  def('order.fireArrows', 'region', 'Orders', 'Fire arrows on or off', [k('KeyQ')]),
  def('order.deploy', 'region', 'Orders', 'Deploy or pack an engine', [k('KeyY')]),
  // micro (src/war/view/micro.ts): the one man picked out of his block
  def('order.fallBack', 'region', 'Orders', 'Picked man: fall back out of the fight', [k('KeyZ')]),
  def('order.rejoin', 'region', 'Orders', 'Picked man: rejoin his slot', [k('KeyZ', { shift: true })]),
  def('order.rear', 'region', 'Orders', 'Picked man: to the rear rank', [k('KeyZ', { mod: true })]),

  def('form.line', 'region', 'Formations', 'Line', [k('Digit1', { alt: true })]),
  def('form.column', 'region', 'Formations', 'Column', [k('Digit2', { alt: true })]),
  def('form.wedge', 'region', 'Formations', 'Wedge', [k('Digit3', { alt: true })]),
  def('form.loose', 'region', 'Formations', 'Loose', [k('Digit4', { alt: true })]),

  def('build.mode', 'region', 'Build mode', 'Build mode on or off', [k('KeyB')]),
  def('build.rotate', 'build', 'Build mode', 'Rotate', [k('KeyR')]),
  def('build.confirm', 'build', 'Build mode', 'Lay out the wall', [k('Enter')]),
  def('build.undo', 'build', 'Build mode', 'Remove the last wall line', [k('Backspace')]),
  def('build.flip', 'build', 'Build mode', 'Flip the wall\'s inside', [k('KeyF')]),
  def('build.narrower', 'build', 'Build mode', 'Bridge narrower', [k('BracketLeft')]),
  def('build.wider', 'build', 'Build mode', 'Bridge wider', [k('BracketRight')]),
  def('build.gate', 'build', 'Build mode', 'Put a gate in the wall', [k('KeyG')]),
  def('build.tower', 'build', 'Build mode', 'Put a tower in the wall', [k('KeyT')]),

  def('bld.upgrade', 'building', 'Buildings', 'Upgrade the selected building', [k('KeyU')]),
  def('bld.repair', 'building', 'Buildings', 'Repair the selected building', [k('KeyR')]),
  def('bld.demolish', 'building', 'Buildings', 'Demolish the selected building (again: confirm)', [k('Delete')]),

  def('view.cutaway', 'region', 'View and panels', 'Cut walls and peaks down', [k('KeyV')]),
  def('view.map', 'region', 'View and panels', 'Full map', [k('KeyM')]),
  def('view.normal', 'region', 'View and panels', 'Map mode: normal', [k('F2')]),
  def('view.altitude', 'region', 'View and panels', 'Map mode: altitude', [k('F3')]),
  def('view.movement', 'region', 'View and panels', 'Map mode: movement', [k('F4')]),
  def('view.ownership', 'region', 'View and panels', 'Map mode: ownership', [k('F5')]),
  def('view.biomes', 'region', 'View and panels', 'Map mode: biomes', [k('F6')]),
  def('view.resources', 'region', 'View and panels', 'Map mode: resources', [k('F7')]),
  def('view.bossCam', 'region', 'View and panels', 'Boss camera on or off', [k('KeyG')]),
  def('panel.roster', 'region', 'View and panels', 'Roster', [k('KeyR')]),
  def('panel.chest', 'region', 'View and panels', 'Squad chest: what your men carry, the town store', [k('KeyI')]),
  def('panel.market', 'region', 'View and panels', 'Market', [k('KeyK')]),
  def('panel.guardian', 'region', 'View and panels', 'Landmark panel', [k('KeyL')]),
  def('panel.tasks', 'region', 'View and panels', 'Daily and weekly tasks', [k('KeyT')]),
  def('panel.crown', 'region', 'View and panels', 'The crown and council', [k('KeyC')]),
  def('panel.holdings', 'region', 'View and panels', 'Holdings: your settlements', [k('KeyO')]),
  def('panel.works', 'region', 'View and panels', 'Alliance works and titles', [k('KeyU')]),
  def('panel.favour', 'region', 'View and panels', 'Divine favour', [k('KeyF', { shift: true })]),
  def('replay.open', 'region', 'View and panels', 'Replay the last 3 minutes', [k('KeyR', { shift: true })]),
  def('go.world', 'region', 'View and panels', 'Back to the world map', [k('KeyW', { shift: true })]),

  def('world.enter', 'world', 'World map', 'Enter the region (or send the squad)', [k('Enter')]),
  def('world.routes', 'world', 'World map', 'Trade routes', [k('KeyT')]),
  def('world.haul', 'world', 'World map', 'Haul planner', [k('KeyH')]),
  def('world.fit', 'world', 'World map', 'Fit the map', [k('KeyF')]),
  def('world.zoomIn', 'world', 'World map', 'Zoom in', [k('Equal'), k('NumpadAdd')]),
  def('world.zoomOut', 'world', 'World map', 'Zoom out', [k('Minus'), k('NumpadSubtract')]),

  // W-62 E6 alliance chat (src/war/view/hud/chat.ts): on the world map Enter opens it when there is nothing to enter
  def('chat.open', 'region', 'Chat', 'Open the alliance chat', [k('Enter')]),
  def('chat.mark', 'global', 'Chat', 'Place a map mark (again: the next kind; then click)', [k('KeyP')]),
  // personal markers (src/war/view/hud/pins.ts): a mouse button, so fixed (bindings are keys); never sent to anyone
  def('map.pin', 'global', 'Chat', 'Your own marker, seen by you only (on one: remove it; Shift: clear all)', [k('MouseMiddle')], 'press', false),

  def('back', 'global', 'General', 'Back, close, cancel; the menu', [k('Escape')], 'press', false),
  def('menu.settings', 'global', 'General', 'Settings', [k('F10')]),
  def('panel.sound', 'global', 'General', 'Sound settings', [k('KeyN')]),
  def('help.keys', 'global', 'General', 'Controls', [k('Slash', { shift: true }), k('Slash')]),
  def('dev.panel', 'global', 'General', 'Dev panel', [k('F1')]),
];

export const ACTIONS: Readonly<Record<ActionId, ActionDef>> = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<ActionId, ActionDef>;
