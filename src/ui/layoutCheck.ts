/**
 * The layout rules of docs/DESIGN_V2.md "UX principles" as pure checks over
 * element bounds in CSS pixels (= points) of the game canvas. The bounds come
 * from the debug UI registry (src/ui/layout.ts); scripts/layout-check.mjs runs
 * this on every screen, size, safe-area variant and language.
 */
import { TOUCH_GAP_PT, TOUCH_PT } from './theme';
import { TEXT_MIN } from './tokens';
import type { SizeClass } from './sizeClass';

/** Smallest text that carries meaning, in CSS px (A11Y-09: 6.5 UI px; a UI px is 2 CSS px on every phone). */
export const TEXT_MIN_PT = TEXT_MIN * 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UiElement {
  /** Stable id: an i18n key, a button label or icon, or a normalised text. */
  id: string;
  /** 'box': an open dialog, sheet or side panel, seen by the landscape checks only (its caps in `stretched`; V6-063). */
  kind: 'interactive' | 'text' | 'box';
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
  /** Text: the font size in CSS px (A11Y-09). */
  size?: number;
  /** Interactive: where a tap inside its drawn box misses its hit area (IN-02 tap probe), if anywhere. */
  tapMiss?: string;
  /** What the `stretched` maximum is for: a list row, a button, a wrapped text line, a dialog or sheet, a docked side panel. */
  role?: 'row' | 'button' | 'line' | 'dialog' | 'side';
  /** Inside an open dialog, sheet or side panel: not base content for `wasted-width` and `empty-column` (V6-063). */
  panel?: boolean;
  /** A bar meant to span its pane (`uiStretch`, itself or an ancestor). */
  stretch?: boolean;
  /** The screen's primary action (`uiPrimary`, itself or an ancestor). */
  primary?: boolean;
  /** A nav rail or tab bar item (`nav.*` / `tab.*` ids). */
  nav?: boolean;
  /** The id was given with `uiId` (the ids `element-parity` compares). */
  named?: boolean;
}

/** The landscape checks (design/ux/landscape-v6.md §5), in the order the spec lists them. */
export const WIDE_CHECKS = ['letterbox', 'class-match', 'wasted-width', 'empty-column', 'stretched', 'field-coverage', 'above-fold', 'element-parity', 'nav-labels'] as const;
export type WideCheck = (typeof WIDE_CHECKS)[number];

export type CheckKind = 'overlap' | 'spacing' | 'text-overflow' | 'text-column' | 'text-overlap' | 'outside-safe-area' | 'touch-size' | 'clipped' | 'text-size' | 'tap' | WideCheck;

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
  /** Smallest meaningful text in CSS px (default TEXT_MIN_PT). */
  textPt?: number;
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

/** The part of `r` between the top and bottom edges of `clip` (full width), or null if none. */
function rowsIn(r: Rect, clip: Rect): Rect | null {
  const y0 = Math.max(r.y, clip.y);
  const y1 = Math.min(r.y + r.h, clip.y + clip.h);
  return y1 > y0 ? { x: r.x, y: y0, w: r.w, h: y1 - y0 } : null;
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
  const textPt = o.textPt ?? TEXT_MIN_PT;
  const screen: Rect = { x: 0, y: 0, w: o.width, h: o.height };
  const out: Violation[] = [];
  const shown = els.filter((e) => e.kind !== 'box' && e.visible.w > 0.5 && e.visible.h > 0.5);
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
    // the hit area must cover what is drawn (the v3 container-origin quirk, MECH §3)
    if (e.tapMiss) out.push({ check: 'tap', ids: [e.id], detail: `a tap at ${e.tapMiss} of ${fmt(e.rect)} misses it` });
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
    // Map labels scale with the player's zoom; an empty line shows nothing.
    if (e.size === undefined || e.world || !e.text?.trim()) continue;
    if (e.size < textPt - 0.25) out.push({ check: 'text-size', ids: [e.id], detail: `text ${e.size.toFixed(1)}px < ${textPt}px` });
  }
  for (const e of texts) {
    // A scroll viewport cutting a line at its top or bottom edge is scrolling, not overflow (see
    // 'clipped' above): judge the rows inside the viewport; a line scrolled fully out is not judged.
    const r = e.clip ? rowsIn(e.rect, e.clip) : e.rect;
    if (!r) continue;
    if (e.frame && !contains(e.frame, r, eps)) out.push({ check: 'text-overflow', ids: [e.id], detail: `text ${fmt(r)} outside its box ${fmt(e.frame)}` });
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

/**
 * The `uiId`s a screen shows, which `element-parity` compares across sizes: a named element that shows, or
 * that sits in a scroll area (a row scrolled out of a short window is one scroll away, not dropped), plus
 * `lists`: the ids a virtualised list registers for its whole content (`uiListIds`; V6-066), rows it has
 * not built at this scroll position included.
 */
export function shownIds(els: readonly UiElement[], lists: readonly string[] = []): string[] {
  return [...new Set([...els.filter((e) => e.named && (e.clip || (e.visible.w > 0.5 && e.visible.h > 0.5))).map((e) => e.id), ...lists])];
}

/** Allowlist key of a violation on a screen. */
export function violationKey(screen: string, v: Violation): string {
  return [screen, v.check, ...v.ids].join('|');
}

// ------------------------------------------------------------------ landscape checks (§5, V6-RFND-03)

/** A size class with its orientation, the key of the per-class thresholds. */
export type Variant = 'compact-port' | 'compact-land' | 'medium' | 'expanded';
export const variantOf = (cls: SizeClass, land: boolean): Variant => (cls === 'compact' ? (land ? 'compact-land' : 'compact-port') : cls);

/** The thresholds (scripts/lib/layoutMatrix.mjs WIDE_RULES, one table next to the sizes). */
export interface WideRules {
  /** CSS px the #game box or the canvas may fall short of the box around it. */
  letterbox: number;
  /** Least share of contentW the content spans, by variant (menu screens). */
  wastedWidth: Partial<Record<Variant, number>>;
  /** An empty strip this share of contentW wide and of the content height tall fails, in these variants (menu screens). */
  emptyColumn: { width: number; height: number; variants: Variant[] };
  /** Maximum widths, UI px (§2.3). */
  stretched: { row: number; button: number; cta: number; line: number; dialog: number };
  /** A docked side panel's width, UI px, by variant (§3.4); a variant without a row shows no side panels. */
  sidePanel: Partial<Record<Variant, { min: number; max: number; share?: number }>>;
  /** Least share of the #game box the field shows outside the opaque HUD, by variant (field scenes). */
  fieldCoverage: Record<Variant, number>;
}

/** What a scene registered with `uiLayout`: the variant it built, and whether it is a menu or a field screen. */
export interface LayoutReg {
  scene: string;
  cls: SizeClass;
  land: boolean;
  kind: 'menu' | 'field';
}

/** One screen as the landscape checks see it. Page rects are CSS px of the page; element rects are canvas-relative. */
export interface WideScreen {
  /** The viewport's safe box. */
  safe: Rect;
  /** The #game box. */
  game: Rect;
  /** The canvas (the v5 column while an unmigrated scene runs, ADR-0013). */
  canvas: Rect;
  /** What the size class gives the #game box (src/ui/sizeClass.ts metricsFor, not legacy); S in CSS px per UI px. */
  m: { cls: SizeClass; land: boolean; S: number; navW: number; contentW: number };
  /** CSS px per UI px of each scene, for the UI-px maxima (default m.S). */
  scale?: Record<string, number>;
  layouts: LayoutReg[];
  kind: 'menu' | 'field';
  /** `uiOpaque` HUD rects, canvas-relative. */
  opaque: Rect[];
  /** Measured at scroll 0 (above-fold is judged there only). */
  scrollTop: boolean;
  /**
   * With a modal dialog, sheet or side panel open: the base screen's elements its shade covers (V6-063).
   * `wasted-width` and `empty-column` measure these, not the panel; canvas-relative like the elements.
   */
  under?: UiElement[];
}

const shortBy = (outer: Rect, inner: Rect) => Math.max(outer.w - inner.w, outer.h - inner.h);

/** Gaps of [lo, hi] the intervals leave: the total and the longest. */
function gaps(spans: [number, number][], lo: number, hi: number): { total: number; longest: number } {
  let total = 0;
  let longest = 0;
  let at = lo;
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (a > at) {
      const g = Math.min(a, hi) - at;
      total += g;
      longest = Math.max(longest, g);
    }
    at = Math.max(at, b);
    if (at >= hi) return { total, longest };
  }
  return { total: total + (hi - at), longest: Math.max(longest, hi - at) };
}

/** Area of the union of rects clipped to `area` (coordinate compression). */
function unionArea(rects: Rect[], area: Rect): number {
  const rs = rects.map((r) => intersect(r, area)).filter((r): r is Rect => !!r);
  const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const spans = rs.filter((r) => r.x <= xs[i] && r.x + r.w >= xs[i + 1]).map((r) => [r.y, r.y + r.h] as [number, number]);
    sum += (xs[i + 1] - xs[i]) * (area.h - gaps(spans, area.y, area.y + area.h).total);
  }
  return sum;
}

/**
 * The landscape checks of one screen (design/ux/landscape-v6.md §5), all but `element-parity`, which
 * compares sizes across browser contexts (scripts/lib/layoutMatrix.mjs checkParity). Elements are moved from the canvas into the #game box, so a legacy
 * column is judged against the whole box it leaves empty.
 */
export function checkWide(els: readonly UiElement[], s: WideScreen, rules: WideRules, eps = 0.75): Violation[] {
  const out: Violation[] = [];
  const v = variantOf(s.m.cls, s.m.land);
  const dx = s.canvas.x - s.game.x;
  const dy = s.canvas.y - s.game.y;
  const shift = (r: Rect): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
  const shown = els.filter((e) => !e.world && e.visible.w > 0.5 && e.visible.h > 0.5);

  // letterbox: #game fills the safe box, and the canvas fills #game
  if (shortBy(s.safe, s.game) > rules.letterbox) out.push({ check: 'letterbox', ids: ['#game'], detail: `#game ${fmt(s.game)} inside the safe box ${fmt(s.safe)}` });
  else if (shortBy(s.game, s.canvas) > rules.letterbox) out.push({ check: 'letterbox', ids: ['canvas'], detail: `canvas ${fmt(s.canvas)} inside #game ${fmt(s.game)}` });

  // class-match: every visible scene registered the variant of this size
  if (!s.layouts.length) out.push({ check: 'class-match', ids: ['layout'], detail: `no layout registered (uiLayout); the size is ${v}` });
  for (const l of s.layouts)
    if (variantOf(l.cls, l.land) !== v) out.push({ check: 'class-match', ids: [l.scene], detail: `${l.scene} built ${variantOf(l.cls, l.land)}; the size is ${v}` });

  // the content region: the pane right of the nav rail, capped at contentW and centred in it
  const S = s.m.S;
  const paneX = s.m.land ? s.m.navW * S : 0;
  const cw = s.m.contentW * S;
  const cx0 = paneX + (s.game.w - paneX - cw) / 2;
  // V6-063: with a panel open, the base screen is measured (what the shade covers and what stays live beside
  // an inspector), never the panel's own elements; a docked side panel takes its strip out of the region
  const boxes = shown.filter((e) => e.kind === 'box');
  const base = boxes.length ? [...shown.filter((e) => !e.panel), ...(s.under ?? []).filter((e) => !e.world && e.visible.w > 0.5 && e.visible.h > 0.5)] : shown;
  const content = base.filter((e) => !e.stretch && !e.nav && e.kind !== 'box').map((e) => shift(e.visible));
  let rx0 = cx0;
  let rx1 = cx0 + cw;
  for (const b of boxes) {
    if (b.role !== 'side') continue;
    const p = shift(b.visible);
    // the longer part of the region beside the panel
    if (Math.min(rx1, p.x) - rx0 >= rx1 - Math.max(rx0, p.x + p.w)) rx1 = Math.min(rx1, p.x);
    else rx0 = Math.max(rx0, p.x + p.w);
  }
  const rw = Math.max(0, rx1 - rx0);

  const minSpan = rules.wastedWidth[v];
  if (s.kind === 'menu' && minSpan !== undefined && rw > 0) {
    const x0 = Math.max(rx0, Math.min(...content.map((r) => r.x)));
    const x1 = Math.min(rx1, Math.max(...content.map((r) => r.x + r.w)));
    const span = content.length ? Math.max(0, x1 - x0) : 0;
    const beside = rw < cw ? ' beside the side panel' : '';
    if (span < minSpan * rw - eps)
      out.push({ check: 'wasted-width', ids: ['content'], detail: `content spans ${Math.round(span)} of ${Math.round(rw)} px${beside} (${Math.round((100 * span) / rw)}% < ${Math.round(100 * minSpan)}%)` });
  }

  if (s.kind === 'menu' && rules.emptyColumn.variants.includes(v) && cw > 0) {
    const w = rules.emptyColumn.width * cw;
    const need = rules.emptyColumn.height * s.game.h;
    let worst: { x: number; gap: number } | null = null;
    for (let x = rx0; x + w <= rx1 + eps; x += 4) {
      const spans = content.filter((r) => r.x < x + w && r.x + r.w > x).map((r) => [r.y, r.y + r.h] as [number, number]);
      const gap = gaps(spans, 0, s.game.h).longest;
      if (gap >= need - eps && (!worst || gap > worst.gap)) worst = { x, gap };
    }
    if (worst) out.push({ check: 'empty-column', ids: ['content'], detail: `nothing in x ${Math.round(worst.x)}..${Math.round(worst.x + w)} for ${Math.round(worst.gap)} of ${Math.round(s.game.h)} px` });
  }

  // stretched: the §2.3 maxima per role, in UI px
  const st = rules.stretched;
  for (const e of shown) {
    if (e.stretch || !e.role) continue;
    const w = e.rect.w / (s.scale?.[e.scene] ?? S);
    if (e.role === 'side') {
      // a docked side panel: wide enough for an item card, narrow enough to keep the screen (§3.4)
      const cap = rules.sidePanel[v] ?? { min: 0, max: st.dialog };
      // `share` of VW (as panelLayout computes it) lowers the least width: Settings at 60% of VW in compact landscape
      const min = cap.share ? Math.min(cap.min, Math.round(cap.share * Math.floor(s.game.w / S))) : cap.min;
      if (w < min - eps || w > cap.max + eps) out.push({ check: 'stretched', ids: [e.id], detail: `side panel ${Math.round(w)} UI px wide, outside ${Math.round(min)}..${cap.max}` });
      continue;
    }
    const max = e.role === 'row' ? st.row : e.role === 'line' ? st.line : e.role === 'dialog' ? st.dialog : e.primary ? st.cta : st.button;
    if (w > max + eps) out.push({ check: 'stretched', ids: [e.id], detail: `${e.role}${e.primary ? ' (primary)' : ''} ${Math.round(w)} UI px wide > ${max}` });
  }

  // field-coverage: the field is the canvas minus the opaque HUD, judged against the whole #game box
  if (s.kind === 'field') {
    const canvas = shift({ x: 0, y: 0, w: s.canvas.w, h: s.canvas.h });
    const share = (canvas.w * canvas.h - unionArea(s.opaque.map(shift), canvas)) / (s.game.w * s.game.h);
    const min = rules.fieldCoverage[v];
    if (share < min - 1e-6) out.push({ check: 'field-coverage', ids: ['field'], detail: `the field shows on ${Math.round(100 * share)}% of the box < ${Math.round(100 * min)}%` });
  }

  // above-fold: the primary action shows whole at scroll 0
  if (s.scrollTop) {
    const canvasBox: Rect = { x: 0, y: 0, w: s.canvas.w, h: s.canvas.h };
    for (const e of els) {
      if (!e.primary || e.kind !== 'interactive' || e.world) continue;
      if (e.visible.w < e.rect.w - eps || e.visible.h < e.rect.h - eps || !contains(canvasBox, e.rect, eps))
        out.push({ check: 'above-fold', ids: [e.id], detail: `primary ${fmt(e.rect)} shows ${fmt(e.visible)} at scroll 0` });
    }
  }

  // nav-labels: every nav item shows its whole label; not in compact portrait, the v5 reference, whose tab bar
  // labels the active tab only (V5-068, landscape-v6 §16.9; V6-066)
  const texts = shown.filter((e) => e.kind === 'text' && e.text?.trim());
  for (const item of v === 'compact-port' ? [] : shown) {
    if (!item.nav || item.kind !== 'interactive') continue;
    const r = item.visible;
    const label = texts.find((t) => {
      const cx = t.visible.x + t.visible.w / 2;
      const cy = t.visible.y + t.visible.h / 2;
      return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
    });
    if (!label) out.push({ check: 'nav-labels', ids: [item.id], detail: 'no label' });
    else if (/(…|\.\.\.)\s*$/.test(label.text!)) out.push({ check: 'nav-labels', ids: [item.id], detail: `label "${label.text}" is cut` });
  }
  return out;
}
