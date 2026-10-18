/**
 * Keyboard focus and mouse hover for every kit control (ADR-0012 Decision 4, input-v6.md §2.1, §4,
 * landscape-v6.md §4). The Phaser side of the pure FocusManager (src/ui/input/focus.ts):
 *
 * - `focusable(obj, …)` registers a control. The kit calls it in the same two places that wire the
 *   long-press and hover tips (`tappable` and `Button` in src/ui/kit.ts), so every control built with
 *   the kit (MButton, KeyButton, Toggle, Stepper, SegmentedSwitch, TabBar, rows, cells) is focusable
 *   and hoverable with no per-screen code. Mosaic components add one line for a group or a role.
 * - Scopes follow the NavStack: the top screen (its scene), then each `navLayer` container. A control
 *   belongs to the outermost layer container among its parents, else to its scene.
 * - The ring (two-tone, 2 UI px outside the control) and the hover rim are drawn on one Graphics per
 *   scene, at the top of the scene's UI root, only while there is something to draw. The ring slides
 *   in 80 ms (it jumps under Reduce motion).
 * - Hover and the hand / not-allowed cursor are for a mouse only (`canHover`); a finger never hovers,
 *   and the ring shows only after a key, so a touch-only device looks exactly as before.
 */
import Phaser from 'phaser';
import { nav } from '../platform/nav';
import { FocusManager, outermostLayer, scopeStack, type Dir, type Focusable, type FocusRole, type Nested, type Rect } from './input/focus';
import { keys, screenContexts } from './input/keys';
import { HOVER_MS, canHover, type HoverPointer } from './hover';
import { motion } from './motion';
import { FOCUS } from './tokens';

/** The game's focus manager. */
export const focus = new FocusManager();

type GO = Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.Transform> & {
  visible?: boolean;
  alpha?: number;
  displayOriginX?: number;
  displayOriginY?: number;
  __uiId?: string;
};

/** A scroll area as the focus manager drives it (kit.ts ScrollArea). World px. */
export interface FocusScroll {
  /** Scroll so the world-px span top..bottom is in view, clear of the scroll cue. */
  revealSpan(top: number, bottom: number): void;
  /** A sideways track: scroll the world-px span left..right into view. */
  revealX?(left: number, right: number): void;
  /** PageUp / PageDown / Home / End. */
  page(kind: 'up' | 'down' | 'home' | 'end'): void;
  /** The visible window, world px. */
  viewWorld(): Rect;
}

interface FocusOpts {
  /** What Enter / Space do: exactly what a tap does (a disabled control says why). */
  activate(): void;
  enabled(): boolean;
  role?: FocusRole;
  /** The tip a resting focus shows (as hover and long-press do). */
  tip?: () => string | undefined;
  showTip?: (text: string) => unknown;
  /** The innermost scroll area holding the control, if any. */
  area?: () => FocusScroll | null;
}

interface Reg {
  obj: GO;
  f: Focusable;
  o: FocusOpts;
  group?: unknown | (() => unknown);
}

const regs = new WeakMap<object, Reg>();
const byF = new WeakMap<Focusable, Reg>();
const layerSet = new WeakSet<object>();

/** The UI scale of a scene (its UI root's scale; 1 without one). */
function scaleOf(scene: Phaser.Scene | undefined): number {
  return (scene as { ui?: Phaser.GameObjects.Container } | undefined)?.ui?.scaleX || 1;
}

/** The scope a control belongs to now: the outermost navLayer container above it, else its scene. */
function scopeOf(obj: GO): object | null {
  return outermostLayer(obj as Nested, layerSet) ?? obj.scene ?? null;
}

const scrollClipOf = (o: unknown) => (o as { __scrollClip?: { x: number; y: number; w: number; h: number; at?: () => { x: number; y: number } } }).__scrollClip;

/** The window of every scroll area holding `obj`, intersected (world px), or null when none does. */
function clipOf(obj: GO): Rect | null {
  let r: Rect | null = null;
  for (let o: unknown = obj; o; o = (o as GO).parentContainer) {
    const c = scrollClipOf(o);
    if (!c) continue;
    const d = c.at?.() ?? { x: 0, y: 0 };
    const w = { x: c.x + d.x, y: c.y + d.y, w: c.w, h: c.h };
    r = r ? intersect(r, w) : w;
  }
  return r;
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

// made on first use (a unit test's Phaser stub has no TransformMatrix)
let mats: [Phaser.GameObjects.Components.TransformMatrix, Phaser.GameObjects.Components.TransformMatrix] | null = null;

/** The control's touch area in world (canvas) px: its rectangular hit area, else its bounds. */
function worldRect(obj: GO): Rect | null {
  const input = obj.input as (Phaser.Types.Input.InteractiveObject & { hitArea?: { x?: number; y?: number; width?: number; height?: number } }) | null | undefined;
  const ha = input?.hitArea;
  if (ha && typeof ha.width === 'number' && typeof ha.height === 'number' && obj.getWorldTransformMatrix) {
    mats ??= [new Phaser.GameObjects.Components.TransformMatrix(), new Phaser.GameObjects.Components.TransformMatrix()];
    const m = obj.getWorldTransformMatrix(mats[0], mats[1]);
    const lx = (ha.x ?? 0) - (obj.displayOriginX ?? 0);
    const ly = (ha.y ?? 0) - (obj.displayOriginY ?? 0);
    const a = m.transformPoint(lx, ly, { x: 0, y: 0 });
    const b = m.transformPoint(lx + ha.width, ly + ha.height, { x: 0, y: 0 });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  const gb = (obj as { getBounds?: () => Phaser.Geom.Rectangle }).getBounds?.();
  return gb ? { x: gb.x, y: gb.y, w: gb.width, h: gb.height } : null;
}

/** Shown on screen now: alive, enabled for input, every parent visible, and on the canvas (or in a scroll area). */
function shownWorld(obj: GO): Rect | null {
  const scene = obj.scene;
  if (!scene || !obj.active || !scene.sys.isActive()) return null;
  if (obj.input && obj.input.enabled === false) return null;
  for (let o: GO | null = obj; o; o = o.parentContainer as GO | null) if (o.visible === false || o.alpha === 0) return null;
  const r = worldRect(obj);
  if (!r || r.w <= 0 || r.h <= 0) return null;
  const W = scene.scale.width;
  const H = scene.scale.height;
  if ((r.x >= W || r.y >= H || r.x + r.w <= 0 || r.y + r.h <= 0) && !clipOf(obj)) return null;
  return r;
}

function uiRect(obj: GO): Rect | null {
  const r = shownWorld(obj);
  if (!r) return null;
  const S = scaleOf(obj.scene);
  return { x: r.x / S, y: r.y / S, w: r.w / S, h: r.h / S };
}

/** A real pointer (Phaser's), not the hotkey's synthetic press (hotkeyPress.ts). */
const realPointer = (p: unknown) => typeof (p as { id?: unknown })?.id === 'number';

let hovered: Reg | null = null;

/**
 * Make `obj` focusable and hoverable. Called by the kit (`tappable`, `Button`); a hand-built control
 * calls it where it calls `setInteractive` (ADR-0012 implementation guidelines).
 */
export function focusable(obj: Phaser.GameObjects.GameObject, o: FocusOpts): void {
  const g = obj as GO;
  if (regs.has(g)) return;
  const reg: Reg = { obj: g, o, f: null as unknown as Focusable };
  const f: Focusable = {
    get key() {
      return g.__uiId;
    },
    get group() {
      const v = reg.group;
      return typeof v === 'function' ? (v as () => unknown)() : v;
    },
    get role() {
      return reg.o.role;
    },
    scope: () => scopeOf(g),
    rect: () => uiRect(g),
    enabled: () => o.enabled(),
    onActivate: () => o.activate(),
  };
  reg.f = f;
  regs.set(g, reg);
  byF.set(f, reg);
  const off = focus.add(f);
  g.on('pointerover', (p: HoverPointer) => {
    if (!canHover(p)) return;
    hovered = reg;
    const cursor = o.enabled() ? 'pointer' : 'not-allowed';
    // Phaser sets `input.cursor` on over and resets it on out; set it now (a disabled state can change)
    if (g.input) g.input.cursor = cursor;
    const canvas = g.scene?.sys.game.canvas;
    if (canvas) canvas.style.cursor = cursor;
  });
  g.on('pointerout', () => {
    if (hovered === reg) hovered = null;
  });
  g.on('pointerdown', (p: unknown) => {
    if (realPointer(p)) focus.pointerFocus(f);
  });
  const canvas = g.scene?.sys.game.canvas;
  g.once('destroy', () => {
    // a control gone from under the mouse (its screen closed) leaves no hand cursor behind
    if (hovered === reg && canvas?.style.cursor === g.input?.cursor) canvas.style.cursor = '';
    if (hovered === reg) hovered = null;
    off();
  });
}

/** Put a control in a group: arrows stay inside it and Tab leaves it as one stop. `onAdjust` takes arrows itself (a stepper). */
export function focusGroup(obj: Phaser.GameObjects.GameObject, group: unknown | (() => unknown), onAdjust?: ((d: Dir) => boolean) | null, current?: () => boolean): void {
  const reg = regs.get(obj);
  if (!reg) return;
  reg.group = group;
  if (onAdjust) reg.f.onAdjust = onAdjust;
  if (current) reg.f.current = current;
}

/** The control comes after every other in reading order (a nav rail down the left edge: nav last, landscape-v6 §4). */
export function focusTail(obj: Phaser.GameObjects.GameObject): void {
  const reg = regs.get(obj);
  if (reg) reg.f.tail = true;
}

/** The pane a control sits in (0 is the first): Tab reads panes left to right, each top to bottom (landscape-v6 §4). */
export function focusPane(obj: Phaser.GameObjects.GameObject, pane: number): void {
  const reg = regs.get(obj);
  if (reg) reg.f.pane = pane;
}

/** The control's role for the default focus (a decision's primary; a destructive dialog's danger button). */
export function focusRole(obj: Phaser.GameObjects.GameObject, role: FocusRole): void {
  const reg = regs.get(obj);
  if (reg) reg.o.role = role;
}

// ------------------------------------------------------------------ scopes from the NavStack

/** A screen whose own keys pan a camera (the battle, the maps) starts in field mode: nothing focused. */
const isField = (s: object) => !layerSet.has(s) && !!screenContexts(s)?.some((c) => c === 'camera' || c === 'map');

function sync(): void {
  const ks = nav.layerKeys();
  ks.forEach((k) => layerSet.add(k));
  focus.setStack(scopeStack(nav.topOwner(), ks, layerSet), isField);
}

// ------------------------------------------------------------------ keys

interface Shown {
  active?: boolean;
  destroy(): void;
}
let tipTimer: ReturnType<typeof setTimeout> | null = null;
let tip: Shown | null = null;

function hideTip(): void {
  if (tipTimer) clearTimeout(tipTimer);
  tipTimer = null;
  if (tip && tip.active !== false) tip.destroy();
  tip = null;
}

/** After a keyboard focus move: scroll the control into view, and show its tip once focus rests for HOVER_MS. */
function afterKey(): void {
  hideTip();
  const f = focus.visible ? focus.focused : null;
  const reg = f && byF.get(f);
  if (!reg) return;
  const area = reg.o.area?.();
  const r = area && shownWorld(reg.obj);
  if (area && r) {
    area.revealSpan(r.y, r.y + r.h);
    area.revealX?.(r.x, r.x + r.w);
  }
  if (!reg.o.tip || !reg.o.showTip) return;
  tipTimer = setTimeout(() => {
    tipTimer = null;
    if (focus.focused !== f || !focus.visible || !reg.obj.scene) return;
    const text = reg.o.tip?.();
    const shown = text ? reg.o.showTip?.(text) : null;
    tip = shown && typeof (shown as Shown).destroy === 'function' ? (shown as Shown) : null;
  }, HOVER_MS);
}

/** PageUp / PageDown / Home / End: scroll the focused control's area, and focus the first control fully in view. */
function page(kind: 'up' | 'down' | 'home' | 'end'): boolean {
  const f = focus.focused;
  const reg = f && byF.get(f);
  const area = reg?.o.area?.();
  if (!area) return false;
  area.page(kind);
  const v = area.viewWorld();
  const inside = (r: Rect | null) => !!r && r.y >= v.y - 0.5 && r.y + r.h <= v.y + v.h + 0.5;
  const pick = focus.order().find((m) => {
    const rg = byF.get(m);
    return !!rg && rg.o.area?.() === area && inside(shownWorld(rg.obj));
  });
  if (pick) focus.keyFocus(pick);
  return true;
}

/**
 * Tab / Shift+Tab. A virtual list (ScrollList) builds only the rows near its view, so Tab wrapping
 * from the last control to the first scrolls the first one's list home (and Shift+Tab's wrap, the
 * last one's list to its end) before focusing it: the real first row, not the first one built.
 */
function tab(by: 1 | -1): boolean {
  const list = focus.order();
  const cur = focus.visible ? focus.focused : null;
  const wraps = !!cur && list.length > 1 && list.indexOf(cur) === (by > 0 ? list.length - 1 : 0) && cur.group === undefined;
  if (!wraps) return by > 0 ? focus.next() : focus.prev();
  const edge = (l: Focusable[]) => (by > 0 ? l[0] : l[l.length - 1]);
  edge(list) && byF.get(edge(list))?.o.area?.()?.page(by > 0 ? 'home' : 'end');
  const to = edge(focus.order());
  if (to) focus.keyFocus(focus.entryOf(to));
  return true;
}

// ------------------------------------------------------------------ drawing

const RING_MS = 80;
const rings = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics>();
let drawn: Phaser.GameObjects.Graphics[] = [];
let slide: { f: Focusable; from: Rect | null; to: Rect | null; t0: number } | null = null;

function graphicsFor(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  let g = rings.get(scene);
  const ui = (scene as { ui?: Phaser.GameObjects.Container }).ui;
  if (!g || !g.scene || (ui && g.parentContainer !== ui)) {
    g?.destroy();
    g = scene.add.graphics();
    if (ui) ui.add(g);
    else g.setDepth(1e6);
    rings.set(scene, g);
  }
  // above the scope's content (a sheet added after it)
  if (ui && ui.list[ui.list.length - 1] !== g) ui.bringToTop(g);
  return g;
}

/** A world rect in the graphics' own space (the scene's UI root, scaled by S). */
function local(g: Phaser.GameObjects.Graphics, r: Rect): Rect {
  const ui = g.parentContainer;
  if (!ui) return r;
  const S = ui.scaleX || 1;
  return { x: (r.x - ui.x) / S, y: (r.y - ui.y) / S, w: r.w / S, h: r.h / S };
}

/**
 * The two-tone focus ring around `r` (UI px): a 2 px cream line 2 px outside, a 1 px basalt line
 * outside that. `limit` (the screen) pulls a side in that would leave it (a tab bar at the bottom edge).
 */
export function drawFocusRing(g: Phaser.GameObjects.Graphics, r: Rect, limit?: Rect): void {
  let x0 = r.x - 4.5;
  let y0 = r.y - 4.5;
  let x1 = r.x + r.w + 4.5;
  let y1 = r.y + r.h + 4.5;
  if (limit) {
    x0 = Math.max(x0, limit.x + 0.5);
    y0 = Math.max(y0, limit.y + 0.5);
    x1 = Math.min(x1, limit.x + limit.w - 0.5);
    y1 = Math.min(y1, limit.y + limit.h - 0.5);
  }
  g.lineStyle(2, FOCUS.inner, 1);
  g.strokeRoundedRect(x0 + 1.5, y0 + 1.5, x1 - x0 - 3, y1 - y0 - 3, 3);
  g.lineStyle(1, FOCUS.outer, 1);
  g.strokeRoundedRect(x0, y0, x1 - x0, y1 - y0, 4);
}

/** The hover state of `r` (UI px): the rim lightens one step and the face a touch; nothing moves. */
export function drawHoverRim(g: Phaser.GameObjects.Graphics, r: Rect): void {
  g.fillStyle(0xffffff, 0.1);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, 2);
  g.lineStyle(1.5, FOCUS.hover, 1);
  g.strokeRoundedRect(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, 2);
}

const lerp = (a: Rect, b: Rect, k: number): Rect => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

function draw(now: number): void {
  const ring = focus.visible ? focus.focused : null;
  const hov = hovered && hovered.obj.scene && hovered.o.enabled() ? hovered : null;
  if (!ring && !hov && !drawn.length) return;
  for (const g of drawn) if (g.scene) g.clear();
  drawn = [];
  if (hov) {
    const r = shownWorld(hov.obj);
    const c = clipOf(hov.obj);
    if (r) {
      const g = graphicsFor(hov.obj.scene);
      drawHoverRim(g, local(g, c ? intersect(r, c) : r));
      drawn.push(g);
    }
  }
  const reg = ring && byF.get(ring);
  if (!reg) {
    slide = null;
    return;
  }
  const r0 = shownWorld(reg.obj);
  if (!r0) return;
  const c = clipOf(reg.obj);
  const to = c ? intersect(r0, c) : r0;
  if (!slide || slide.f !== ring) slide = { f: ring!, from: slide?.to ?? null, to, t0: now };
  slide.to = to;
  const k = motion.reduced || !slide.from ? 1 : Math.min(1, (now - slide.t0) / RING_MS);
  const at = k >= 1 ? to : lerp(slide.from!, to, 1 - (1 - k) * (1 - k));
  const g = graphicsFor(reg.obj.scene);
  const sc = reg.obj.scene.scale;
  drawFocusRing(g, local(g, at), local(g, { x: 0, y: 0, w: sc.width, h: sc.height }));
  if (!drawn.includes(g)) drawn.push(g);
}

let installed = false;

/** Wire the keys, the NavStack and the pointer to the focus manager, and draw the ring and hover each frame. Once, at boot. */
export function installFocus(game: Phaser.Game, win: Window = window): void {
  if (installed) return;
  installed = true;
  const k = (fn: () => boolean) => () => {
    const ok = fn();
    if (ok) afterKey();
    return ok;
  };
  keys.on('focus.next', k(() => tab(1)));
  keys.on('focus.prev', k(() => tab(-1)));
  for (const d of ['up', 'down', 'left', 'right'] as const) keys.on(`focus.${d}`, k(() => focus.move(d)));
  keys.on('activate', () => {
    hideTip();
    return focus.activate();
  });
  keys.on('scroll.pageUp', k(() => page('up')));
  keys.on('scroll.pageDown', k(() => page('down')));
  keys.on('scroll.home', k(() => page('home')));
  keys.on('scroll.end', k(() => page('end')));
  // Esc with the battle HUD focused goes back to field mode before anything else (input-v6.md §3.1)
  keys.on('back', () => focus.leaveField(), undefined, { first: true });
  nav.subscribe(sync);
  sync();
  // any press (mouse, finger, pen) hides the ring; it is captured before Phaser's own listener
  win.addEventListener(
    'pointerdown',
    () => {
      hideTip();
      focus.pointer();
    },
    true,
  );
  game.events.on(Phaser.Core.Events.POST_STEP, () => draw(performance.now()));
}
