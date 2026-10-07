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
import { keyOfText } from '../i18n';
import { checkLayout, intersect, type Rect, type UiElement, type Violation } from './layoutCheck';

type GO = Phaser.GameObjects.GameObject & {
  __uiId?: string;
  __uiIgnore?: boolean;
  __uiFrame?: () => Rect | null;
  __uiClip?: Phaser.GameObjects.GameObject;
  __uiMaxW?: number;
  __uiColumn?: () => { x0: number; x1: number } | null;
  __uiBlock?: string;
  __uiRect?: () => Rect;
  __uiBlocker?: boolean;
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

/** Custom bounds for an object (world coordinates), e.g. a container with a hit area. */
export function uiRect<T extends Phaser.GameObjects.GameObject>(obj: T, fn: () => Rect): T {
  (obj as GO).__uiRect = fn;
  return obj;
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
}

/** Collect the UI elements of every visible scene (top layer only), in canvas CSS px. */
export function collectUi(game: Phaser.Game): UiElement[] {
  const W = game.scale.width;
  const H = game.scale.height;
  let items: (Walked & { kind: 'interactive' | 'text' | 'panel'; scene: string })[] = [];
  for (const scene of game.scene.getScenes(true)) {
    if (!scene.sys.settings.visible) continue;
    const cams = scene.cameras.cameras.filter((c) => c.visible);
    // Scenes with a map have a scrolling main camera plus a UI camera (each ignores the other's objects).
    const multi = cams.length > 1;
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
    const walk = (list: GO[], root: { o: GO; cam: Phaser.Cameras.Scene2D.Camera; project: (r: Rect) => Rect; world: boolean } | null, clip: Rect | null, alpha: number) => {
      for (const o of list) {
        if (!o || o.visible === false || o.__uiIgnore) continue;
        const a = alpha * (o.alpha ?? 1);
        if (a < 0.05) continue;
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
        const interactive = !!o.input && o.input.enabled !== false;
        const isText = o instanceof Phaser.GameObjects.BitmapText || o instanceof Phaser.GameObjects.Text;
        if (interactive || isText || isPanel(o)) {
          const b = boundsOf(o);
          if (b) {
            const rect = project(b, r);
            if (interactive && ((o as GO).__uiBlocker || (!isText && rect.w * rect.h >= 0.9 * W * H && !(o instanceof Phaser.GameObjects.Container)))) {
              // A modal backdrop: drop what it covers (this and lower scenes).
              items = items.filter((it) => !(intersect(it.rect, rect)));
            } else {
              const kind = isText ? 'text' : interactive ? 'interactive' : 'panel';
              items.push({ o, rect, clip: c, kind, scene: scene.sys.settings.key, world: r.world, project: r.project });
            }
          }
        }
        const kids = (o as GO).list;
        if (kids && kids.length) walk(kids, r, c, a);
      }
    };
    walk(scene.children.list as GO[], null, null, 1);
  }
  const panels = items.filter((i) => i.kind === 'panel');
  const out: UiElement[] = [];
  items.forEach((it) => {
    if (it.kind === 'panel') return;
    const visible = it.clip ? intersect(it.rect, it.clip) ?? { x: it.rect.x, y: it.rect.y, w: 0, h: 0 } : it.rect;
    const el: UiElement = { id: idOf(it.o), kind: it.kind as 'interactive' | 'text', rect: it.rect, visible, scene: it.scene, path: pathOf(it.o) };
    if (it.clip && !it.world) el.clip = it.clip;
    if (it.world) el.world = true;
    if (it.kind === 'text') {
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
        const idx = items.indexOf(it);
        // Panels scrolling with the text (same scroll area) match on their full rect;
        // others only on their visible part (a row scrolled away holds nothing).
        const pick = (sameClip: boolean): Rect | null => {
          let best: Rect | null = null;
          for (const p of panels) {
            if (items.indexOf(p) > idx || p.scene !== it.scene) continue;
            if (sameClip !== (!!it.clip && p.clip === it.clip)) continue;
            const pr = p.rect;
            const pv = sameClip ? pr : p.clip ? intersect(p.rect, p.clip) : pr;
            if (!pv) continue;
            if (ax >= pv.x && ax <= pv.x + pv.w && ay >= pv.y && ay <= pv.y + pv.h && (!best || pr.w * pr.h < best.w * best.h)) best = pr;
          }
          return best;
        };
        const best = pick(true) ?? pick(false);
        if (best) el.frame = best;
      }
    }
    out.push(el);
  });
  return out;
}

/** Collect and check the current screen. */
export function checkUi(game: Phaser.Game): { elements: UiElement[]; violations: Violation[]; width: number; height: number } {
  const elements = collectUi(game);
  const width = game.scale.width;
  const height = game.scale.height;
  return { elements, violations: checkLayout(elements, { width, height }), width, height };
}
