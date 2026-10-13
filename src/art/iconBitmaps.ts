/**
 * The drawn icons: bitmaps shipped as two atlases in public/icons (ui.png: UI, camp, sync
 * badges and power icons at 64 px; items.png: items, trinkets and goods at
 * 96 px). BootScene loads them and registers their frames here; the icon
 * painters (iconStyle.paintIcon, itemIconsHD, goodsIcons, the sync badges)
 * draw the bitmap when one exists for an id and fall back on their own
 * vector drawing otherwise (no DOM in tests, an atlas that failed to load).
 *
 * Ids are the atlas's: `ui:hold`, `camp:forge`, `chrome:sync_synced`,
 * `power:aegis`, `item:dory`, `trinket:owl_amulet`, `goods:gold`.
 *
 * v5 icons (art bible 7.4, 160 px cells) are built into ui.png by
 * scripts/art/atlas.mjs from their 160 px masters. A frame ships only after it
 * was seen in its real slot (D-9); until then its key is STAGED and draws its
 * stand-in, the icon that slot shows today (STAGED_ICONS).
 */
import type { IconLook } from './iconStyle';

interface Frame {
  src: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
}

const FRAMES = new Map<string, Frame>();

/** Atlas files, relative to the page (Vite base './'). */
export const ICON_ATLASES = [
  { key: 'icons_ui', png: 'icons/ui.png', json: 'icons/ui.json' },
  { key: 'icons_items', png: 'icons/items.png', json: 'icons/items.json' },
] as const;

/** Register an atlas's frames (id -> rectangle in `src`). */
export function registerIconFrames(src: CanvasImageSource, frames: Record<string, { x: number; y: number; w: number; h: number }>): void {
  for (const [id, f] of Object.entries(frames)) FRAMES.set(id, { src, ...f });
}

/**
 * v5 icon keys whose 160 px frame is staged, not shipped (docs/v5/ASSET_LOG.md AS-03). No
 * slot shows them yet: each slot's story wires its key, previews the staged atlas in the
 * real game (scripts/art/preview.mjs) and ships it, then removes the key here. Meanwhile a
 * staged key draws its stand-in (V5_ICON_FALLBACK), the icon the slot shows today.
 * Empty since AS-07: doctrine_* shipped by CDX-01; book (Codex tab), banner (Campaign tab),
 * war (War medallion), season (Arena season line), push .. scythe (ability icons), standard,
 * works and captain (encounter captain row) shipped by AS-07.
 */
export const STAGED_ICONS: readonly string[] = [];

/**
 * The v5 icon keys (art bible 7.4, AS-03) and their stand-in: the icon the slot showed before
 * (never a new design). A staged key draws the stand-in's frame; every key's vector fallback
 * (uiIcons, when the atlas fails to load) is the stand-in's shape.
 */
export const V5_ICON_FALLBACK: Readonly<Record<string, string>> = {
  book: 'log',
  banner: 'flag',
  war: 'shield',
  season: 'hourglass',
  doctrine_steady: 'hold',
  doctrine_rush: 'charge',
  doctrine_hammer: 'bash',
  doctrine_swarm: 'f_skirm',
  doctrine_fury: 'berserk',
  push: 'shield',
  bond: 'people',
  warcry: 'horn',
  sunder: 'bolt',
  aimed: 'eye',
  recharge: 'charge',
  scythe: 'swords',
  standard: 'flag',
  works: 'repair',
  captain: 'helmet',
};

/** The frame an icon id draws: its own, else its stand-in's while it is staged, else null. */
export function resolveIconId(id: string): string | null {
  if (FRAMES.has(id)) return id;
  const key = id.startsWith('ui:') ? id.slice(3) : '';
  const s = STAGED_ICONS.includes(key) ? `ui:${V5_ICON_FALLBACK[key]}` : '';
  return s && FRAMES.has(s) ? s : null;
}

export function hasIconBitmap(id: string): boolean {
  return typeof document !== 'undefined' && resolveIconId(id) !== null;
}

/**
 * Sizes to draw a `from` px bitmap through on its way to `to` px: halvings while the
 * remaining ratio is above 2, then `to`. One bilinear step that skips more than half the
 * pixels shimmers (art bible 8.6.3, OI-4); a 160 px cell drawn at 24 px goes 80, 40, 24.
 */
export function downscaleSteps(from: number, to: number): number[] {
  const out: number[] = [];
  let s = from;
  while (s > to * 2) {
    s = Math.round(s / 2);
    out.push(s);
  }
  out.push(to);
  return out;
}

/**
 * The light disc an icon sits on over dark stone (V5-059): the painted icons' dark-brown
 * outline is about 1.2:1 against stone, so on the top bar, the tab bar and medallions an
 * icon gets this parchment ground (palette parch, parchEdge rim). On parchment it is not
 * needed. Use `backing: true` (drawIconBitmap, iconStyle.paintIcon).
 */
export const ICON_BACKING = { fill: '#e7d6ad', rim: '#5a3d22' } as const;

/** Geometry of the backing disc in a w x h canvas: centred, rim inside the canvas. */
export function iconBackingDisc(w: number, h: number): { cx: number; cy: number; r: number; rimW: number } {
  const rimW = Math.max(1, Math.min(w, h) * 0.05);
  return { cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 - rimW / 2, rimW };
}

/** Fraction of the canvas an icon fills inside its backing disc. */
export const BACKED_FILL = 0.7;

/** Paint the backing disc into a canvas context. */
export function paintIconBacking(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const d = iconBackingDisc(w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
  ctx.fillStyle = ICON_BACKING.fill;
  ctx.fill();
  ctx.lineWidth = d.rimW;
  ctx.strokeStyle = ICON_BACKING.rim;
  ctx.stroke();
  ctx.restore();
}

/**
 * The atlas id of an item's icon: base trinkets are `trinket:<id>`, every
 * other item (set and named trinkets included) `item:<id>`.
 */
export function itemIconId(def: { id: string; slot: string }): string {
  return def.slot === 'trinket' && FRAMES.has(`trinket:${def.id}`) ? `trinket:${def.id}` : `item:${def.id}`;
}

/** Size of an icon's bitmap (the sync badges are not square), or null. */
export function iconBitmapSize(id: string): { w: number; h: number } | null {
  const f = FRAMES.get(id);
  return f ? { w: f.w, h: f.h } : null;
}

export interface BitmapOpts {
  look?: IconLook;
  /** Canvas size; default square n x n. */
  w?: number;
  h?: number;
  /** Fraction of the canvas the icon fills (default 0.92, room for the shadow). */
  fill?: number;
  /** A soft drop shadow down-right (default on, as the vector icons have). */
  shadow?: boolean;
  /** Sit the icon on the light disc it needs over dark stone (ICON_BACKING); default fill BACKED_FILL. */
  backing?: boolean;
}

/** Cream levels of the 'light' look (on terracotta and lit-bronze buttons), dark to bright. */
const LIGHT_RAMP: [number, number, number][] = [[122, 90, 52], [196, 163, 118], [247, 239, 224], [255, 253, 246]];
/** Flat greys of the 'dim' look (disabled, locked). */
const DIM_RAMP: [number, number, number][] = [[98, 88, 74], [138, 126, 106], [166, 154, 132]];

function ramp(stops: [number, number, number][], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * Draw icon `id` into a new canvas (n x n, or w x h), fitted and centred.
 * 'light' and 'dim' recolour it by brightness so the design still reads in
 * cream on a red button and grey when disabled. Null when there is no bitmap.
 */
export function drawIconBitmap(id: string, n: number, o: BitmapOpts = {}): HTMLCanvasElement | null {
  const rid = resolveIconId(id);
  const f = rid ? FRAMES.get(rid) : undefined;
  if (!f || typeof document === 'undefined') return null;
  const W = Math.max(1, Math.round(o.w ?? n));
  const H = Math.max(1, Math.round(o.h ?? n));
  const look = o.look ?? 'full';
  const canvas = newCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  const fill = o.fill ?? (o.backing ? BACKED_FILL : 0.92);
  const k = Math.min((W * fill) / f.w, (H * fill) / f.h);
  const dw = f.w * k;
  const dh = f.h * k;
  const dx = (W - dw) / 2 - (o.backing ? 0 : W * 0.01);
  const dy = (H - dh) / 2 - (o.backing ? 0 : H * 0.02);
  if (o.shadow !== false && look !== 'dim') {
    ctx.shadowColor = look === 'light' ? 'rgba(30,8,4,0.4)' : 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = Math.max(0.5, W * 0.02);
    ctx.shadowOffsetY = Math.max(0.5, H * 0.04);
    ctx.shadowBlur = Math.max(0.5, W * 0.03);
  }
  const s = stepDown(f, dw);
  ctx.drawImage(s.src, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
  if (look !== 'full') recolour(ctx, W, H, look);
  if (!o.backing) return canvas;
  const out = newCanvas(W, H);
  const octx = out.getContext('2d')!;
  paintIconBacking(octx, W, H);
  octx.drawImage(canvas, 0, 0);
  return out;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return c;
}

/** The frame halved (downscaleSteps) until one more bilinear draw to width dw is at most 2x. */
function stepDown(f: Frame, dw: number): { src: CanvasImageSource; x: number; y: number; w: number; h: number } {
  let cur: { src: CanvasImageSource; x: number; y: number; w: number; h: number } = f;
  for (const w of downscaleSteps(f.w, Math.max(1, Math.round(dw))).slice(0, -1)) {
    const h = Math.max(1, Math.round((cur.h * w) / cur.w));
    const c = newCanvas(w, h);
    c.getContext('2d')!.drawImage(cur.src, cur.x, cur.y, cur.w, cur.h, 0, 0, w, h);
    cur = { src: c, x: 0, y: 0, w, h };
  }
  return cur;
}

/** Recolour by brightness: the shadow (drawn with the icon) stays dark under the light look. */
function recolour(ctx: CanvasRenderingContext2D, W: number, H: number, look: 'light' | 'dim'): void {
  const img = ctx.getImageData(0, 0, W, H);
  const p = img.data;
  const stops = look === 'light' ? LIGHT_RAMP : DIM_RAMP;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const lum = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
    const [r, g, b] = ramp(stops, look === 'light' ? Math.pow(lum, 0.7) : 0.15 + lum * 0.85);
    p[i] = r;
    p[i + 1] = g;
    p[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}
