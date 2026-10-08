/**
 * The layout rules of docs/DESIGN_V2.md "UX principles" as pure checks over
 * element bounds in CSS pixels (= points) of the game canvas. The bounds come
 * from the debug UI registry (src/ui/layout.ts); scripts/layout-check.mjs runs
 * this on every screen, size, safe-area variant and language.
 */
import { TOUCH_GAP_PT, TOUCH_PT } from './theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UiElement {
  /** Stable id: an i18n key, a button label or icon, or a normalised text. */
  id: string;
  kind: 'interactive' | 'text';
  /** Full bounds (canvas CSS px). */
  rect: Rect;
  /** Visible part when inside a scroll viewport (else the full rect). */
  visible: Rect;
  /** The scroll viewport it sits in, if any (cut-offs across the scroll axis are violations). */
  clip?: Rect;
  /** Text: the box it must stay inside (its panel or button), if any. */
  frame?: Rect;
  /** Text: declared maximum line width in CSS px, if any. */
  maxW?: number;
  /** Text: the column (left .. right, CSS px) a line of a wrapped block must stay in, if declared. */
  column?: { x0: number; x1: number };
  /** Text: id of the wrapped, left-aligned block this line belongs to (all its lines share a left edge). */
  block?: string;
  /** Scene key and display-list path, for reports. */
  scene: string;
  path: string;
  /** Text shown (for reports). */
  text?: string;
  /** Map content under a scrolling world camera: the UI is drawn over it, so they never collide. */
  world?: boolean;
}

export type CheckKind = 'overlap' | 'spacing' | 'text-overflow' | 'text-column' | 'text-overlap' | 'outside-safe-area' | 'touch-size' | 'clipped';

export interface Violation {
  check: CheckKind;
  ids: string[];
  detail: string;
}

export interface CheckOpts {
  /** Canvas size in CSS px (the canvas already sits inside the safe area). */
  width: number;
  height: number;
  touchPt?: number;
  gapPt?: number;
  /** Tolerance in CSS px for rounding. */
  eps?: number;
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export function contains(outer: Rect, inner: Rect, eps = 0.5): boolean {
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
}

const fmt = (r: Rect) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`;

/** Gap between two non-overlapping rects along the axis where they face each other (Infinity if diagonal). */
function facingGap(a: Rect, b: Rect): number {
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (yOverlap > 0) return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  if (xOverlap > 0) return Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Infinity;
}

export function checkLayout(els: readonly UiElement[], o: CheckOpts): Violation[] {
  const eps = o.eps ?? 0.75;
  const touch = o.touchPt ?? TOUCH_PT;
  const gap = o.gapPt ?? TOUCH_GAP_PT;
  const screen: Rect = { x: 0, y: 0, w: o.width, h: o.height };
  const out: Violation[] = [];
  const shown = els.filter((e) => e.visible.w > 0.5 && e.visible.h > 0.5);
  const inter = shown.filter((e) => e.kind === 'interactive');
  const texts = shown.filter((e) => e.kind === 'text');

  for (const e of shown) {
    if (!contains(screen, e.visible, eps)) out.push({ check: 'outside-safe-area', ids: [e.id], detail: `${e.kind} ${fmt(e.visible)} outside ${o.width}x${o.height}` });
  }
  for (const e of shown) {
    // A vertical scroll viewport may cut rows at the top and bottom, never at the sides.
    if (e.clip && (e.rect.x < e.clip.x - eps || e.rect.x + e.rect.w > e.clip.x + e.clip.w + eps)) out.push({ check: 'clipped', ids: [e.id], detail: `${e.kind} ${fmt(e.rect)} cut by its scroll area ${fmt(e.clip)}` });
  }
  for (const e of inter) {
    if (Math.min(e.rect.w, e.rect.h) < touch - eps) out.push({ check: 'touch-size', ids: [e.id], detail: `${fmt(e.rect)} < ${touch}pt` });
  }
  for (let i = 0; i < inter.length; i++) {
    for (let j = i + 1; j < inter.length; j++) {
      const a = inter[i];
      const b = inter[j];
      if (!!a.world !== !!b.world) continue;
      const x = intersect(a.visible, b.visible);
      if (x && x.w > eps && x.h > eps) {
        out.push({ check: 'overlap', ids: [a.id, b.id].sort(), detail: `${fmt(a.visible)} & ${fmt(b.visible)}` });
        continue;
      }
      const g = facingGap(a.visible, b.visible);
      if (g < gap - eps) out.push({ check: 'spacing', ids: [a.id, b.id].sort(), detail: `gap ${g.toFixed(1)}pt < ${gap}pt` });
    }
  }
  for (const e of texts) {
    if (e.frame && !contains(e.frame, e.rect, eps)) out.push({ check: 'text-overflow', ids: [e.id], detail: `text ${fmt(e.rect)} outside its box ${fmt(e.frame)}` });
    else if (e.maxW !== undefined && e.rect.w > e.maxW + eps) out.push({ check: 'text-overflow', ids: [e.id], detail: `text ${Math.round(e.rect.w)}pt wider than ${Math.round(e.maxW)}pt` });
  }
  // Lines of a wrapped block stay in their column (e.g. beside a portrait) and share its left edge.
  const blocks = new Map<string, UiElement[]>();
  for (const e of texts) {
    if (e.column && (e.rect.x < e.column.x0 - eps || e.rect.x + e.rect.w > e.column.x1 + eps))
      out.push({ check: 'text-column', ids: [e.id], detail: `line ${fmt(e.rect)} outside its column ${Math.round(e.column.x0)}..${Math.round(e.column.x1)}` });
    if (e.block && e.text?.trim()) (blocks.get(e.block) ?? blocks.set(e.block, []).get(e.block)!).push(e);
  }
  for (const [id, lines] of blocks) {
    const left = Math.min(...lines.map((l) => l.rect.x));
    const right = Math.max(...lines.map((l) => l.rect.x));
    if (right - left > eps) out.push({ check: 'text-column', ids: [id], detail: `ragged block: line starts ${Math.round(left)}..${Math.round(right)}` });
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (!!texts[i].world !== !!texts[j].world) continue;
      const x = intersect(texts[i].visible, texts[j].visible);
      // Glyph boxes include a 1-2 px margin: require a real overlap.
      if (x && x.w > 2 && x.h > 2) out.push({ check: 'text-overlap', ids: [texts[i].id, texts[j].id].sort(), detail: `${fmt(texts[i].visible)} & ${fmt(texts[j].visible)}` });
    }
  }
  return out;
}

/** Allowlist key of a violation on a screen. */
export function violationKey(screen: string, v: Violation): string {
  return [screen, v.check, ...v.ids].join('|');
}
