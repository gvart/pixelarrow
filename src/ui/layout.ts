/**
 * Debug UI registry for the layout check (docs/DESIGN_V2.md "Automated
 * checks", docs/UI_KIT.md "Layout check").
 *
 * Every screen gets it for free: `collectUi(game)` walks the display lists of
 * the visible scenes and reports, in canvas CSS pixels,
 *  - every interactive object (input enabled, visible), and
 *  - every bitmap text,
 * with the box a text must stay in (the kit records it; otherwise the smallest
 * parchment panel or button behind the text's start) and the visible part of
 * anything inside a scroll viewport. A full-screen interactive shade (a modal
 * backdrop) hides everything drawn before it, so only the top layer counts.
 *
 * Kit components annotate objects with the helpers below (`uiId`,
 * `uiIgnore`, `uiFrame`, `uiClip`, `uiMaxWidth`); plain Phaser objects work
 * without them. `window.__layout` (main.ts) exposes `collect()` and `check()`
 * for scripts/layout-check.mjs.
 */
import Phaser from 'phaser';
import { RS, legacyColumn } from '../platform/renderScale';
import { keyOfText } from '../i18n';
import { checkLayout, checkWide, intersect, shownIds, type LayoutReg, type Rect, type UiElement, type Violation, type WideRules } from './layoutCheck';
import { metricsFor, type SizeClass } from './sizeClass';

type GO = Phaser.GameObjects.GameObject & {
  __uiStretch?: boolean;
  __uiOpaque?: boolean;
  __uiPrimary?: boolean;
  __uiId?: string;
  __uiIgnore?: boolean;
  __uiFrame?: () => Rect | null;
  __uiClip?: Phaser.GameObjects.GameObject;
  __uiMaxW?: number;
  __uiColumn?: () => { x0: number; x1: number } | null;
  __uiBlock?: string;
  __uiRect?: () => Rect;
  __uiBlocker?: boolean;
  __uiPanel?: { rect: () => Rect | null; role: 'dialog' | 'side' };
  __uiListIds?: () => string[];
  list?: GO[];
  visible?: boolean;
  alpha?: number;
  parentContainer?: Phaser.GameObjects.Container | null;
  input?: Phaser.Types.Input.InteractiveObject | null;
};

/** Name an element for reports and the allowlist (e.g. an i18n key). */
export function uiId<T extends Phaser.GameObjects.GameObject>(obj: T, id: string): T {
  (obj as GO).__uiId = id;
  return obj;
}

/** Leave an object out of the check (e.g. a scroll viewport's drag zone). */
export function uiIgnore<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as GO).__uiIgnore = true;
  return obj;
}

/** Mark a full-screen modal backdrop: everything drawn before it is covered. */
export function uiBlocker<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as GO).__uiBlocker = true;
  return obj;
}

/** The box (in world/UI coordinates of `ref`, w x h at its origin) a text must stay inside. */
export function uiFrame<T extends Phaser.GameObjects.GameObject>(text: T, ref: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w: number, h: number, x = 0, y = 0): T {
  (text as GO).__uiFrame = () => worldRect(ref, x, y, w, h);
  return text;
}

/** Declared maximum line width of a text, in UI pixels (its parent's scale applies). */
export function uiMaxWidth<T extends Phaser.GameObjects.GameObject>(text: T, w: number): T {
  (text as GO).__uiMaxW = w;
  return text;
}

/**
 * A line of a wrapped, left-aligned text block: it must stay inside the column
 * `x0 .. x1` (UI px in `ref`'s space) and start where the block's other lines
 * start (`block` names the block). Catches lines that escape a column, e.g.
 * the last line of a speech flowing out from beside a portrait.
 */
export function uiColumn<T extends Phaser.GameObjects.GameObject>(text: T, ref: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, x0: number, x1: number, block: string): T {
  (text as GO).__uiColumn = () => {
    const r = worldRect(ref, x0, 0, x1 - x0, 1);
    return { x0: r.x, x1: r.x + r.w };
  };
  (text as GO).__uiBlock = block;
  return text;
}

/** Children of `container` are clipped to `viewport`'s bounds (a scroll area). */
export function uiClip(container: Phaser.GameObjects.Container, viewport: Phaser.GameObjects.GameObject): void {
  (container as GO).__uiClip = viewport;
}

// ------------------------------------------------------------------ landscape hooks (design/ux/landscape-v6.md §5)

type Registered = Phaser.Scene & { __uiLayout?: LayoutReg; __uiCollapsed?: Record<string, string>; __uiTransient?: Record<string, () => boolean> };

/**
 * The layout variant a scene built (`class-match`): call it with the class and orientation the scene laid
 * out for (its `m.cls`, `m.land`) each time it builds. `kind` 'field' marks a battle or map screen
 * (`field-coverage` instead of `wasted-width` and `empty-column`).
 */
export function uiLayout(scene: Phaser.Scene, cls: SizeClass, land: boolean, kind: 'menu' | 'field' = 'menu'): void {
  (scene as Registered).__uiLayout = { scene: scene.sys.settings.key, cls, land, kind };
}

/** A bar meant to span its pane (top bar, tab bar, progress bar, segmented control): exempt from `stretched`, with its children. */
export function uiStretch<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as GO).__uiStretch = true;
  return obj;
}

/** An opaque HUD cluster over the field: its bounds count as covered in `field-coverage`. */
export function uiOpaque<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as GO).__uiOpaque = true;
  return obj;
}

/** The screen's primary action (with its children): shown whole at scroll 0 (`above-fold`), 300 UI px wide at most (`stretched`). */
export function uiPrimary<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as GO).__uiPrimary = true;
  return obj;
}

/**
 * The element `id` (a `uiId`) is left out of this layout on purpose and reached through the control
 * `intoId` (`element-parity`), e.g. a key rail folded into a menu button at 844x390. Scoped to the scene.
 */
export function uiCollapsed(scene: Phaser.Scene, id: string, intoId: string): void {
  ((scene as Registered).__uiCollapsed ??= {})[id] = intoId;
}

/**
 * The element `id` is transient by design (PARITY-STABLE, V6-076): it shows for a moment and goes on its
 * own, e.g. the battle Undo chip for 3 s after an order, so whether a capture catches it depends on the
 * clock, not the layout. `element-parity` leaves it out while `when` holds (always, without it); it is
 * still checked for overlap and size when shown. Scoped to the scene.
 */
export function uiTransient(scene: Phaser.Scene, id: string, when: () => boolean = () => true): void {
  ((scene as Registered).__uiTransient ??= {})[id] = when;
}

/** The ids a scene registered transient (`uiTransient`) whose condition holds now. */
export function transientIds(scene: Phaser.Scene): string[] {
  return Object.entries((scene as Registered).__uiTransient ?? {})
    .filter(([, when]) => when())
    .map(([id]) => id);
}

/**
 * An open dialog, sheet or side panel (V6-063): `obj` holds the panel, `x, y, w, h` is its box in `obj`'s
 * space. Its box is checked by its own caps (`stretched`: a dialog or sheet 320 UI px, a side panel the
 * §3.4 widths); it and what it holds are never base content, so `wasted-width` and `empty-column` measure
 * the screen beneath it (what its shade covers, or what stays live beside an inspector). A docked side
 * panel (`side`) also takes its strip out of the content region. `openPanel` and the rotate card call it.
 */
export function uiPanel<T extends Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject>(obj: T, x: number, y: number, w: number, h: number, side = false): T {
  (obj as unknown as GO).__uiPanel = { rect: () => worldRect(obj, x, y, w, h), role: side ? 'side' : 'dialog' };
  return obj;
}

/**
 * The ids of every row of a virtualised list (`content` is its scroll content): `element-parity` counts them
 * all, rows not built at the current scroll position included (V6-066). ScrollList calls it.
 */
export function uiListIds<T extends Phaser.GameObjects.GameObject>(content: T, ids: () => string[]): T {
  (content as GO).__uiListIds = ids;
  return content;
}

/** A local rect of a transformed object in world coordinates. */
export function worldRect(obj: Phaser.GameObjects.Components.Transform, x: number, y: number, w: number, h: number): Rect {
  const m = (obj as unknown as Phaser.GameObjects.Components.Transform).getWorldTransformMatrix();
  const p0 = m.transformPoint(x, y);
  const p1 = m.transformPoint(x + w, y + h);
  return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
}

function boundsOf(o: GO): Rect | null {
  if (o.__uiRect) return o.__uiRect();
  const any = o as unknown as { w?: number; h?: number; getWorldTransformMatrix?: () => Phaser.GameObjects.Components.TransformMatrix; getBounds?: () => Phaser.Geom.Rectangle };
  if (o instanceof Phaser.GameObjects.Container && typeof any.w === 'number' && typeof any.h === 'number') return worldRect(o, 0, 0, any.w, any.h);
  if (o instanceof Phaser.GameObjects.Container && o.input?.hitArea instanceof Phaser.Geom.Rectangle) {
    const r = o.input.hitArea as Phaser.Geom.Rectangle;
    // Phaser offsets container hit areas by half their size (displayOrigin).
    return worldRect(o, r.x - o.width / 2, r.y - o.height / 2, r.width, r.height);
  }
  if (typeof any.getBounds === 'function') {
    const b = any.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  return null;
}

function idOf(o: GO): string {
  if (o.__uiId) return o.__uiId;
  const any = o as unknown as { opts?: { label?: string; icon?: string }; text?: string; texture?: { key: string } };
  if (any.opts && (any.opts.label || any.opts.icon)) return any.opts.label ? textId(any.opts.label) : `icon:${any.opts.icon}`;
  if (typeof any.text === 'string') return textId(any.text);
  const key = any.texture?.key ? `:${any.texture.key.replace(/_?\d+x\d+/g, '').replace(/\d+/g, '#')}` : '';
  return `${o.type}${key}`;
}

function textId(s: string): string {
  const k = keyOfText(s.trim());
  if (k) return k;
  const n = s.toUpperCase().replace(/\s+/g, ' ').replace(/\d+/g, '#').trim();
  return n.length > 32 ? n.slice(0, 31) + '…' : n || '(empty)';
}

function pathOf(o: GO): string {
  const parts: string[] = [];
  let c: GO | null | undefined = o;
  while (c) {
    parts.unshift(c.__uiId ?? c.name ?? c.type);
    c = c.parentContainer as GO | null | undefined;
  }
  return parts.join('/');
}

function isPanel(o: GO): boolean {
  const key = (o as unknown as { texture?: { key: string } }).texture?.key ?? '';
  return o instanceof Phaser.GameObjects.Image && (key.startsWith('panel_') || key.startsWith('roll_'));
}

interface Walked {
  o: GO;
  rect: Rect;
  clip: Rect | null;
  /** World content (a scrolling map camera): cut by the camera's view, not a layout fault. */
  world: boolean;
  project: (r: Rect) => Rect;
  cam: Phaser.Cameras.Scene2D.Camera;
}

/** Where in the drawn box (as fractions of it) the tap probe presses: the centre and towards each corner. */
const TAP_PROBES: [string, number, number][] = [
  ['centre', 0.5, 0.5],
  ['top-left', 0.25, 0.25],
  ['top-right', 0.75, 0.25],
  ['bottom-left', 0.25, 0.75],
  ['bottom-right', 0.75, 0.75],
];

/**
 * Taps `o` where it is drawn (`rect`, canvas px) through Phaser's own hit test and returns the first
 * probe that misses it: a hit area offset from its art (the container-origin quirk, MECH §3) shows here.
 */
function tapMiss(o: GO, rect: Rect, cam: Phaser.Cameras.Scene2D.Camera): string | undefined {
  const mgr = o.scene?.input?.manager;
  if (!mgr) return undefined;
  for (const [name, fx, fy] of TAP_PROBES) {
    const p = { x: rect.x + rect.w * fx, y: rect.y + rect.h * fy, worldX: 0, worldY: 0 } as unknown as Phaser.Input.Pointer;
    if (!mgr.hitTest(p, [o], cam, []).length) return name;
  }
  return undefined;
}

/** A text's font size in canvas px (its own and its parents' scale, and the camera's zoom). */
function fontPx(o: GO, cam: Phaser.Cameras.Scene2D.Camera): number | undefined {
  if (!(o instanceof Phaser.GameObjects.BitmapText)) return undefined;
  return o.fontSize * Math.abs(o.getWorldTransformMatrix().scaleY) * cam.zoom;
}

/** Ancestors' marks that hold for their children too. */
interface Inherited {
  stretch: boolean;
  primary: boolean;
  /** Inside a `uiPanel`. */
  panel: boolean;
}

/** Collect the UI elements of every visible scene (top layer only), in canvas CSS px. */
export function collectUi(game: Phaser.Game): UiElement[] {
  return collect(game).elements;
}

/** What the landscape checks read besides the elements (canvas CSS px). */
interface Collected {
  elements: UiElement[];
  /** With a modal panel open: the base screen's elements its shade covers (V6-063). */
  under: UiElement[];
  /** The ids virtualised lists registered for their whole content (`uiListIds`), on the layers element-parity reads. */
  listIds: string[];
  opaque: Rect[];
  layouts: LayoutReg[];
  collapsed: Record<string, string>;
  /** Ids registered transient (`uiTransient`) whose condition holds. */
  transient: string[];
  /** A visible scene draws a scrolling world (a map or battle) under its UI. */
  field: boolean;
}

function collect(game: Phaser.Game): Collected {
  const W = game.scale.width;
  const H = game.scale.height;
  type Item = Walked & { kind: 'interactive' | 'text' | 'panel'; scene: string; marks: Inherited; dialog?: boolean; role?: 'dialog' | 'side'; layer: number };
  let items: Item[] = [];
  /** What modal backdrops covered, with the layer each was drawn in. */
  const covered: Item[] = [];
  /** Modal layers: 0 is the screen, each backdrop opens the next; whether a layer holds a dialog, sheet or panel. */
  let layer = 0;
  const layerHasPanel: boolean[] = [false];
  /** `uiListIds` met, with the layer of each. */
  const lists: { ids: string[]; layer: number }[] = [];
  const opaque: Rect[] = [];
  const layouts: LayoutReg[] = [];
  const collapsed: Record<string, string> = {};
  const transient: string[] = [];
  let field = false;
  /** A modal backdrop was just met: the next panel is its dialog or side panel. */
  let afterBlocker = false;
  for (const scene of game.scene.getScenes(true)) {
    if (!scene.sys.settings.visible) continue;
    const reg = scene as Registered;
    if (reg.__uiLayout) layouts.push(reg.__uiLayout);
    Object.assign(collapsed, reg.__uiCollapsed);
    transient.push(...transientIds(scene));
    const cams = scene.cameras.cameras.filter((c) => c.visible);
    // Scenes with a map have a scrolling main camera plus a UI camera (each ignores the other's objects).
    const multi = cams.length > 1;
    if (multi) field = true;
    const camFor = (root: GO): Phaser.Cameras.Scene2D.Camera | null => {
      const filter = (root as unknown as { cameraFilter?: number }).cameraFilter ?? 0;
      let best: Phaser.Cameras.Scene2D.Camera | null = null;
      for (const c of cams) if ((filter & c.id) === 0) best = c;
      return best;
    };
    const projector = (root: GO, cam: Phaser.Cameras.Scene2D.Camera) => (r: Rect): Rect => {
      const sf = (root as unknown as { scrollFactorX?: number }).scrollFactorX ?? 1;
      const vx = cam.worldView.x - cam.scrollX * (1 - sf);
      const vy = cam.worldView.y - cam.scrollY * (1 - sf);
      return { x: (r.x - vx) * cam.zoom + cam.x, y: (r.y - vy) * cam.zoom + cam.y, w: r.w * cam.zoom, h: r.h * cam.zoom };
    };
    const walk = (list: GO[], root: { o: GO; cam: Phaser.Cameras.Scene2D.Camera; project: (r: Rect) => Rect; world: boolean } | null, clip: Rect | null, alpha: number, inherited: Inherited) => {
      for (const o of list) {
        if (!o || o.visible === false || o.__uiIgnore) continue;
        const a = alpha * (o.alpha ?? 1);
        if (a < 0.05) continue;
        const marks: Inherited = { stretch: inherited.stretch || !!o.__uiStretch, primary: inherited.primary || !!o.__uiPrimary, panel: inherited.panel || !!o.__uiPanel };
        let r = root;
        let c = clip;
        if (!r) {
          const cam = camFor(o);
          if (!cam) continue;
          const world = multi && cam === scene.cameras.main;
          r = { o, cam, project: projector(o, cam), world };
          if (world) c = { x: cam.x, y: cam.y, w: cam.width, h: cam.height };
        }
        const project = (b: Rect, _root?: unknown) => r!.project(b);
        if (o.__uiClip) {
          const vb = boundsOf(o.__uiClip as GO);
          if (vb) {
            const v = project(vb, r);
            c = c ? intersect(c, v) ?? { x: v.x, y: v.y, w: 0, h: 0 } : v;
          }
        }
        if (o.__uiListIds) lists.push({ ids: o.__uiListIds(), layer });
        if (o.__uiPanel) {
          const b = o.__uiPanel.rect();
          if (b) {
            items.push({ o, rect: project(b, r), clip: c, kind: 'panel', scene: scene.sys.settings.key, world: r.world, project: r.project, cam: r.cam, marks, dialog: true, role: o.__uiPanel.role, layer });
            if (layer > 0) layerHasPanel[layer] = true;
            afterBlocker = false;
          }
        }
        if (o.__uiOpaque) {
          const b = boundsOf(o);
          if (b) opaque.push(project(b, r));
        }
        const interactive = !!o.input && o.input.enabled !== false;
        const isText = o instanceof Phaser.GameObjects.BitmapText || o instanceof Phaser.GameObjects.Text;
        if (interactive || isText || isPanel(o)) {
          const b = boundsOf(o);
          if (b) {
            const rect = project(b, r);
            if (interactive && ((o as GO).__uiBlocker || (!isText && rect.w * rect.h >= 0.9 * W * H && !(o instanceof Phaser.GameObjects.Container)))) {
              // A modal backdrop: drop what it covers (this and lower scenes).
              // a row scrolled out of its list is covered with the list: the shade covers its scroll window
              const under = (it: Item) => !!intersect(it.clip && !it.world ? it.clip : it.rect, rect);
              covered.push(...items.filter(under));
              items = items.filter((it) => !under(it));
              afterBlocker = true;
              layerHasPanel[++layer] = false;
            } else {
              const kind = isText ? 'text' : interactive ? 'interactive' : 'panel';
              const dialog = kind === 'panel' && afterBlocker;
              if (dialog) {
                afterBlocker = false;
                layerHasPanel[layer] = true;
              }
              items.push({ o, rect, clip: c, kind, scene: scene.sys.settings.key, world: r.world, project: r.project, cam: r.cam, marks, dialog, layer });
            }
          }
        }
        const kids = (o as GO).list;
        if (kids && kids.length) walk(kids, r, c, a, marks);
      }
    };
    walk(scene.children.list as GO[], null, null, 1, { stretch: false, primary: false, panel: false });
  }
  // V6-063: when the top layers are panels (a dialog over a sheet counts as one), the layer beneath them is
  // the base screen: its covered elements are measured by wasted-width and empty-column, the panels' are not
  let first = layer + 1;
  while (first > 1 && layerHasPanel[first - 1]) first--;
  const panelFrom = first <= layer ? first : Infinity;
  const base = (it: Item): UiElement => {
    const visible = it.clip ? intersect(it.rect, it.clip) ?? { x: it.rect.x, y: it.rect.y, w: 0, h: 0 } : it.rect;
    const el: UiElement = { id: idOf(it.o), kind: it.kind as 'interactive' | 'text', rect: it.rect, visible, scene: it.scene, path: pathOf(it.o) };
    if (it.clip && !it.world) el.clip = it.clip;
    if (it.world) el.world = true;
    if (it.o.__uiId) el.named = true;
    if (it.marks.stretch) el.stretch = true;
    if (it.kind === 'interactive' && /^(tab|nav)\./.test(el.id)) el.nav = true;
    return el;
  };
  const under = panelFrom === Infinity ? [] : covered.filter((it) => it.layer === panelFrom - 1 && it.kind !== 'panel').map(base);
  // the lists of the base screen (under a panel) and above it; a full-screen layer that is not a panel hides the rest
  const fromLayer = panelFrom === Infinity ? layer : panelFrom - 1;
  const listIds = lists.filter((l) => l.layer >= fromLayer).flatMap((l) => l.ids);
  const panels = items.filter((i) => i.kind === 'panel');
  const out: UiElement[] = [];
  items.forEach((it) => {
    if (it.kind === 'panel') {
      // a dialog, sheet or side panel (a `uiPanel`, or the first panel over a modal backdrop): its own caps only
      if (it.dialog) out.push({ id: idOf(it.o), kind: 'box', role: it.role ?? 'dialog', rect: it.rect, visible: it.rect, scene: it.scene, path: pathOf(it.o) });
      return;
    }
    const visible = it.clip ? intersect(it.rect, it.clip) ?? { x: it.rect.x, y: it.rect.y, w: 0, h: 0 } : it.rect;
    const el: UiElement = { id: idOf(it.o), kind: it.kind as 'interactive' | 'text', rect: it.rect, visible, scene: it.scene, path: pathOf(it.o) };
    if (it.marks.panel || it.layer >= panelFrom) el.panel = true;
    if (it.clip && !it.world) el.clip = it.clip;
    if (it.world) el.world = true;
    if (it.o.__uiId) el.named = true;
    if (it.marks.stretch) el.stretch = true;
    if (it.marks.primary) el.primary = true;
    if (it.kind === 'interactive' && /^(tab|nav)\./.test(el.id)) el.nav = true;
    if (it.kind === 'interactive') el.role = it.clip && !it.world ? 'row' : 'button';
    else if (wraps(it.o)) el.role = 'line';
    // a control part-scrolled out of its list is tapped where it shows: rows outside a list's window take no taps (S1-1)
    if (it.kind === 'interactive' && !it.world && visible.w > 0 && visible.h > 0) {
      const miss = tapMiss(it.o, visible, it.cam);
      if (miss) el.tapMiss = miss;
    }
    if (it.kind === 'text') {
      const size = fontPx(it.o, it.cam);
      if (size !== undefined) el.size = size;
      el.text = (it.o as unknown as { text: string }).text;
      const sx = (it.o as unknown as Phaser.GameObjects.Components.Transform).getWorldTransformMatrix?.().scaleX ?? 1;
      if (it.o.__uiMaxW !== undefined) el.maxW = it.o.__uiMaxW * sx;
      if (it.o.__uiBlock) el.block = it.o.__uiBlock;
      const col = it.o.__uiColumn?.();
      if (col) {
        const p = it.project({ x: col.x0, y: 0, w: col.x1 - col.x0, h: 1 });
        el.column = { x0: p.x, x1: p.x + p.w };
      }
      if (it.o.__uiFrame) {
        const f = it.o.__uiFrame();
        if (f) el.frame = it.project(f);
      } else {
        // The smallest panel drawn before this text that holds its start.
        const ax = it.rect.x + Math.min(3, it.rect.w / 2);
        const ay = it.rect.y + it.rect.h / 2;
        // a text half scrolled under a fixed header belongs to its scroll area, not the header:
        // panels outside its scroll area are matched on the part of it that shows
        const shown = it.clip ? intersect(it.rect, it.clip) : null;
        const ayShown = shown ? shown.y + shown.h / 2 : ay;
        const idx = items.indexOf(it);
        // Panels scrolling with the text (same scroll area) match on their full rect;
        // others only on their visible part (a row scrolled away holds nothing).
        const pick = (sameClip: boolean): Rect | null => {
          let best: Rect | null = null;
          for (const p of panels) {
            if (items.indexOf(p) > idx || p.scene !== it.scene) continue;
            // Map text (a region label) and the UI drawn over it never share a box.
            if (p.world !== it.world) continue;
            if (sameClip !== (!!it.clip && p.clip === it.clip)) continue;
            const pr = p.rect;
            const pv = sameClip ? pr : p.clip ? intersect(p.rect, p.clip) : pr;
            if (!pv) continue;
            const y = sameClip ? ay : ayShown;
            if (ax >= pv.x && ax <= pv.x + pv.w && y >= pv.y && y <= pv.y + pv.h && (!best || pr.w * pr.h < best.w * best.h)) best = pr;
          }
          return best;
        };
        const best = pick(true) ?? pick(false);
        if (best) el.frame = best;
      }
    }
    out.push(el);
  });
  const css = (b: Rect): Rect => ({ x: b.x / RS, y: b.y / RS, w: b.w / RS, h: b.h / RS });
  return { elements: RS === 1 ? out : out.map(toCss), under: RS === 1 ? under : under.map(toCss), listIds, opaque: opaque.map(css), layouts, collapsed, transient, field };
}

/** A text that wraps at a declared width: its box is its widest line (`stretched` reads lines at 300 UI px). */
function wraps(o: GO): boolean {
  const any = o as unknown as { maxWidth?: number; style?: { wordWrapWidth?: number | null } };
  return o instanceof Phaser.GameObjects.BitmapText ? (any.maxWidth ?? 0) > 0 : !!any.style?.wordWrapWidth;
}

/** Canvas px -> CSS px (the canvas is drawn RS x denser, src/platform/renderScale.ts). */
function toCss(el: UiElement): UiElement {
  const r = (b: Rect): Rect => ({ x: b.x / RS, y: b.y / RS, w: b.w / RS, h: b.h / RS });
  const o: UiElement = { ...el, rect: r(el.rect) };
  if (el.clip) o.clip = r(el.clip);
  if (el.frame) o.frame = r(el.frame);
  if (el.column) o.column = { x0: el.column.x0 / RS, x1: el.column.x1 / RS };
  if (el.maxW !== undefined) o.maxW = el.maxW / RS;
  if (el.size !== undefined) o.size = el.size / RS;
  return o;
}

/**
 * Set on the page by scripts/layout-check.mjs: the landscape checks' thresholds (WIDE_RULES), the
 * viewport's safe box (page CSS px) and whether the screen is at scroll 0. Without it only the old checks run.
 */
interface WideOpts {
  rules: WideRules;
  safe: Rect;
  scrollTop: boolean;
}

/** The landscape side of a check: the findings, plus what the script compares across sizes and reports. */
interface WideResult {
  violations: Violation[];
  /** `uiId`s on show (element-parity). */
  ids: string[];
  collapsed: Record<string, string>;
  /** Ids transient by design (`uiTransient`): element-parity leaves them out. */
  transient: string[];
  /** The canvas fills #game: the screen opted in (`responsive`), not the legacy column. */
  responsive: boolean;
  cls: SizeClass;
  land: boolean;
}

/** Collect and check the current screen. */
export function checkUi(game: Phaser.Game): { elements: UiElement[]; violations: Violation[]; width: number; height: number; wide?: WideResult } {
  const c = collect(game);
  const elements = c.elements;
  const width = game.scale.width / RS;
  const height = game.scale.height / RS;
  const violations = checkLayout(elements, { width, height });
  const o = (globalThis as { __layoutWide?: WideOpts }).__layoutWide;
  if (!o) return { elements, violations, width, height };
  const box = (el: Element | null | undefined): Rect => {
    const b = el?.getBoundingClientRect();
    return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : { x: 0, y: 0, w: width, h: height };
  };
  const parent = game.canvas.parentElement;
  const gameBox = box(parent);
  const m = metricsFor(gameBox.w * RS, gameBox.h * RS, RS, false);
  const scale: Record<string, number> = {};
  for (const s of game.scene.getScenes(true)) {
    const S = (s as Phaser.Scene & { m?: { S: number } }).m?.S;
    if (S) scale[s.sys.settings.key] = S / RS;
  }
  const kind = c.layouts.some((l) => l.kind === 'field') || (!c.layouts.length && c.field) ? 'field' : 'menu';
  const wide = checkWide(elements, { safe: o.safe, game: gameBox, canvas: box(game.canvas), m: { cls: m.cls, land: m.land, S: m.S / RS, navW: m.navW, contentW: m.contentW }, scale, layouts: c.layouts, kind, opaque: c.opaque, scrollTop: o.scrollTop, under: c.under }, o.rules);
  // the base screen under an open panel is still there (V6-063): its ids count for element-parity
  const ids = shownIds([...elements, ...c.under], c.listIds);
  return { elements, violations, width, height, wide: { violations: wide, ids, collapsed: c.collapsed, transient: c.transient, responsive: !legacyColumn(), cls: m.cls, land: m.land } };
}
