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
import { hapticSelect, hasNativeBack, setBackButton, setClosingConfirmation, setSettingsButton } from './telegram';

export interface ScreenOpts {
  /** Go back one level. Omitted / null: root screen (Telegram shows Close). */
  back?: (() => void) | null;
  /** Ask before Telegram closes the app while this screen is on top (battles). */
  confirmClose?: boolean;
  /** The ⋯ menu's Settings item. Omitted: the Settings item is hidden. */
  settings?: (() => void) | null;
}

/** What the stack drives; Telegram in the game, a mock in tests. */
export interface NavHost {
  setBack(cb: (() => void) | null): void;
  setSettings(cb: (() => void) | null): void;
  setClosingConfirmation(on: boolean): void;
  feedback(): void;
}

/** Closes a layer; returning false keeps it open (e.g. a dialog Back must not dodge). */
export type LayerClose = () => void | false;

interface Layer {
  close: LayerClose;
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

  /** A dialog on top of `owner`'s screen (default: the top screen). Returns a remover. */
  pushLayer(close: LayerClose, owner?: object): () => void {
    const e = owner ? this.entries.find((x) => x.owner === owner) : this.top();
    if (!e) return () => {};
    const layer: Layer = { close };
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

  private top(): Entry | undefined {
    return this.entries[this.entries.length - 1];
  }

  private sync(): void {
    const e = this.top();
    this.host.setBack(this.canGoBack() ? this.dispatch : null);
    this.host.setSettings(e?.opts.settings ? this.openSettings : null);
    this.host.setClosingConfirmation(this.unsaved || !!e?.opts.confirmClose);
  }
}

/** The game's navigation, wired to Telegram (no-ops outside it). */
export const nav = new NavStack({
  setBack: setBackButton,
  setSettings: setSettingsButton,
  setClosingConfirmation,
  feedback: hapticSelect,
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
  const remove = nav.pushLayer(close, owner);
  container.once('destroy', remove);
  return remove;
}

/**
 * Whether scenes should draw their own back arrow: not when Telegram's header
 * Back button does the job (avoids two back buttons).
 */
export function showInGameBack(): boolean {
  return !hasNativeBack();
}
