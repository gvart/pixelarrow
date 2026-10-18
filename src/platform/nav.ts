/**
 * Back navigation shared by the game and Telegram's native header button.
 *
 * A stack of screens (normally one per running scene; a scene launched on top
 * of another pushes a second entry) and, per screen, a stack of layers
 * (dialogs, modals). Back closes the top layer first, else calls the top
 * screen's `back`. A screen without `back` is a root: Telegram's BackButton is
 * hidden so it shows Close instead. Exactly one BackButton handler is
 * registered with Telegram at any time (a single dispatcher, set or cleared).
 *
 * Scenes call `registerScreen(this, { back })` in create() (BaseScene does it
 * via `this.screen({...})`) and `navLayer(container, close)` for each modal.
 * Both clean up on scene shutdown / container destroy.
 */
import type { BackButton } from './core/back';
import { platform } from './index';
import type { TabId } from '../ui/mosaic/tabLayout';

export interface ScreenOpts {
  /** Go back one level. Omitted / null: root screen (Telegram shows Close). */
  back?: (() => void) | null;
  /** Ask before Telegram closes the app while this screen is on top (battles). */
  confirmClose?: boolean;
  /** The ⋯ menu's Settings item. Omitted: the Settings item is hidden. */
  settings?: (() => void) | null;
}

/** What the stack drives: the platform's Back control plus a feedback cue; a mock in tests. */
interface NavHost extends Omit<BackButton, 'native'> {
  feedback(): void;
}

/** Closes a layer; returning false keeps it open (e.g. a dialog Back must not dodge). */
export type LayerClose = () => void | false;

interface Layer {
  close: LayerClose;
  /** What the layer is on screen (its container): the focus scope of the controls inside it. */
  key?: object;
}
interface Entry {
  owner: object;
  opts: ScreenOpts;
  layers: Layer[];
}

/** Which way the next screen enters: set by Back, read (and reset) by the screen that opens. */
export const navMotion = { back: false };

export class NavStack {
  private entries: Entry[] = [];
  private unsaved = false;
  private readonly subs = new Set<() => void>();
  private readonly dispatch = (): void => {
    this.host.feedback();
    this.back();
  };
  private readonly openSettings = (): void => {
    this.top()?.opts.settings?.();
  };

  constructor(private readonly host: NavHost) {}

  /** Push (or replace) the screen owned by `owner`. Returns a token for `release`. */
  register(owner: object, opts: ScreenOpts): object {
    const i = this.entries.findIndex((e) => e.owner === owner);
    if (i >= 0) this.entries.splice(i, 1);
    const entry: Entry = { owner, opts: { ...opts }, layers: [] };
    this.entries.push(entry);
    this.sync();
    return entry;
  }

  /** Remove `owner`'s screen unless it has registered again since `token` (a restart). */
  release(owner: object, token: object): void {
    if (this.entries.some((e) => e === token)) this.unregister(owner);
  }

  /** Change some options of a registered screen (e.g. deployment -> battle). */
  update(owner: object, opts: Partial<ScreenOpts>): void {
    const e = this.entries.find((x) => x.owner === owner);
    if (!e) return;
    Object.assign(e.opts, opts);
    this.sync();
  }

  unregister(owner: object): void {
    const i = this.entries.findIndex((e) => e.owner === owner);
    if (i < 0) return;
    this.entries.splice(i, 1);
    this.sync();
  }

  /** A dialog on top of `owner`'s screen (default: the top screen). `key`: what it is on screen (a focus scope). Returns a remover. */
  pushLayer(close: LayerClose, owner?: object, key?: object): () => void {
    const e = owner ? this.entries.find((x) => x.owner === owner) : this.top();
    if (!e) return () => {};
    const layer: Layer = { close, key };
    e.layers.push(layer);
    this.sync();
    return () => {
      const i = e.layers.indexOf(layer);
      if (i < 0) return;
      e.layers.splice(i, 1);
      this.sync();
    };
  }

  /** Go back one level. Returns false at a root with nothing open. */
  back(): boolean {
    const e = this.top();
    if (!e) return false;
    const layer = e.layers.pop();
    if (layer) {
      if (layer.close() === false) e.layers.push(layer);
      this.sync();
      return true;
    }
    if (!e.opts.back) return false;
    // the next screen slides in from the left (src/scenes/BaseScene.ts)
    navMotion.back = true;
    e.opts.back();
    return true;
  }

  /** Unsaved / unsynced progress: Telegram asks before closing. */
  setUnsaved(on: boolean): void {
    if (on === this.unsaved) return;
    this.unsaved = on;
    this.sync();
  }

  canGoBack(): boolean {
    const e = this.top();
    return !!e && (e.layers.length > 0 || !!e.opts.back);
  }

  depth(): number {
    return this.entries.length;
  }

  layers(): number {
    return this.top()?.layers.length ?? 0;
  }

  /** The keys of the top screen's layers, bottom to top (layers pushed without a key are left out). */
  layerKeys(): object[] {
    return (this.top()?.layers ?? []).flatMap((l) => (l.key ? [l.key] : []));
  }

  /** The owner of the top screen (a scene), or null with none. */
  topOwner(): object | null {
    return this.top()?.owner ?? null;
  }

  /** Called after every change of the stack (a screen or a layer came or went); returns an unsubscribe. */
  subscribe(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private top(): Entry | undefined {
    return this.entries[this.entries.length - 1];
  }

  private sync(): void {
    const e = this.top();
    this.subs.forEach((cb) => cb());
    this.host.setBack(this.canGoBack() ? this.dispatch : null);
    this.host.setSettings(e?.opts.settings ? this.openSettings : null);
    this.host.setClosingConfirmation(this.unsaved || !!e?.opts.confirmClose);
  }
}

/** The game's navigation, wired to `platform.back` (read per call: the platform is selected after this module loads). */
export const nav = new NavStack({
  setBack: (cb) => platform.back.setBack(cb),
  setSettings: (cb) => platform.back.setSettings(cb),
  setClosingConfirmation: (on) => platform.back.setClosingConfirmation(on),
  feedback: () => platform.haptics.select(),
});

interface SceneLike {
  events: { once(ev: string, fn: () => void): unknown };
}

/**
 * Register a scene as a screen; removed again when the scene shuts down.
 * The removal waits for a microtask: a scene switch or restart shuts the old
 * scene down and creates the next in the same step, so the stack goes straight
 * to the new state instead of flashing Close in between (each Telegram header
 * change makes it re-report the viewport and safe areas).
 */
export function registerScreen(scene: SceneLike, opts: ScreenOpts): void {
  const token = nav.register(scene, opts);
  scene.events.once('shutdown', () => queueMicrotask(() => nav.release(scene, token)));
}

/**
 * Make a modal container closable with Back. `close` must close the modal
 * (usually destroying `container`); the layer goes away with the container.
 */
export function navLayer(container: { once(ev: 'destroy', fn: () => void): unknown }, close: LayerClose, owner?: object): () => void {
  const remove = nav.pushLayer(close, owner, container);
  container.once('destroy', remove);
  return remove;
}

/**
 * Whether scenes should draw their own back arrow: not when the platform's own
 * Back control (Telegram's header button) does the job (avoids two back buttons).
 */
export function showInGameBack(): boolean {
  return !platform.back.native;
}

// ------------------------------------------------------------------ the Back contract (HUB-01, ia.md §2 §6, screen-flow.md §3)

/** The five tab roots (ia.md §2): the hub scene of each mode tab. */
export const TAB_ROOTS: Readonly<Record<string, TabId>> = { Menu: 'campaign', Duel: 'duels', Online: 'war', Codex: 'codex', Shop: 'shop' };

/** The tab whose hub `sceneKey` is, or null for any other screen. */
export function tabOfScene(sceneKey: string): TabId | null {
  return Object.prototype.hasOwnProperty.call(TAB_ROOTS, sceneKey) ? TAB_ROOTS[sceneKey] : null;
}

/** Where a door came from: the screen Back returns to on a multi-door screen (`back: { scene, data }`). */
export interface BackTarget {
  scene: string;
  data?: object;
}

/**
 * What Back does on each screen (screen-flow.md §3):
 * - `root`: a tab hub. No back, ever, even when a door switched to it; Telegram shows Close. Back only closes what is open on it.
 * - `parent`: a single-parent screen. Back goes to `to`.
 * - `origin`: a multi-door screen. Back goes to the screen that opened it, else `fallback`.
 * - `battle`: Back opens the battle menu (⋯).
 * - `none`: nothing to go back to (Boot).
 */
type BackRule = { kind: 'root' } | { kind: 'parent'; to: string } | { kind: 'origin'; fallback: string } | { kind: 'battle' } | { kind: 'none' };

/** The Back rule of every screen, by scene key. Camp is the field camp's (`parent` World); the War camp is `origin` (screen-flow S05). */
export const BACK_RULES: Readonly<Record<string, BackRule>> = {
  Boot: { kind: 'none' },
  // the offer and resume steps are roots; reward and modes go to the Campaign hub
  FirstRun: { kind: 'parent', to: 'Menu' },
  Menu: { kind: 'root' },
  World: { kind: 'parent', to: 'Menu' },
  Camp: { kind: 'parent', to: 'World' },
  Settlement: { kind: 'parent', to: 'World' },
  Army: { kind: 'origin', fallback: 'World' },
  Hero: { kind: 'origin', fallback: 'Army' },
  Battle: { kind: 'battle' },
  Results: { kind: 'origin', fallback: 'World' },
  Codex: { kind: 'root' },
  // the Duels hub views (Ladder, Arena) are the root; its sub-views (Team, Armoury, Board, Raids) go back to the hub view (`hubView`)
  Duel: { kind: 'root' },
  Online: { kind: 'root' },
  OnlineArmy: { kind: 'origin', fallback: 'Online' },
  OnlineClan: { kind: 'parent', to: 'Online' },
  // single-parent (ia.md §1.3); the War hub reopens on the merchant's hex ({ focus, select }), which the scene passes
  Merchant: { kind: 'parent', to: 'Online' },
  Market: { kind: 'origin', fallback: 'Shop' },
  Shop: { kind: 'root' },
  Kit: { kind: 'parent', to: 'Menu' },
  // retired by CDX-01 (merged into the Codex); until then it returns to the Codex that opened it
  BeastTrial: { kind: 'origin', fallback: 'Codex' },
};

/**
 * Where Back goes from `sceneKey` opened through `origin`: the origin on a multi-door screen (the fallback
 * when none was passed or it is the screen itself), the parent on a single-parent screen. Null where Back
 * leaves no screen (a hub, Battle, Boot).
 */
export function resolveBack(sceneKey: string, origin?: BackTarget | null): BackTarget | null {
  const rule = BACK_RULES[sceneKey];
  if (!rule) return null;
  if (rule.kind === 'parent') return { scene: rule.to, data: {} };
  if (rule.kind !== 'origin') return null;
  if (origin?.scene && origin.scene !== sceneKey) return { scene: origin.scene, data: origin.data ?? {} };
  return { scene: rule.fallback, data: {} };
}

/**
 * The options a scene registers with: a tab hub is a root whatever it asks for (ia.md §1.2: a door into a hub
 * switches tabs and never pushes it, so its Back would only lead to another tab, D12). What is open on the
 * hub (a sheet, the hex panel) still closes with Back: those are layers.
 */
export function screenOpts(sceneKey: string, opts: ScreenOpts): ScreenOpts {
  return tabOfScene(sceneKey) ? { ...opts, back: null } : opts;
}

interface KeyedScene {
  sys: { settings: { key: string } };
}

/**
 * A hub scene that shows sub-views in place (Duels: Team, Armoury, Board, Raid picks) declares each view as
 * it builds it: `back` for a sub-view (Back returns to the hub view), null for a hub view (a root again).
 * The shells call it (addSubShell, the TabBar); other scenes are untouched.
 */
export function hubView(scene: KeyedScene, back: (() => void) | null): void {
  if (!tabOfScene(scene.sys.settings.key)) return;
  nav.update(scene, { back });
}
