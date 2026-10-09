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

export function hasIconBitmap(id: string): boolean {
  return typeof document !== 'undefined' && FRAMES.has(id);
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
  const f = FRAMES.get(id);
  if (!f || typeof document === 'undefined') return null;
  const W = Math.max(1, Math.round(o.w ?? n));
  const H = Math.max(1, Math.round(o.h ?? n));
  const look = o.look ?? 'full';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const k = Math.min((W * (o.fill ?? 0.92)) / f.w, (H * (o.fill ?? 0.92)) / f.h);
  const dw = f.w * k;
  const dh = f.h * k;
  const dx = (W - dw) / 2 - W * 0.01;
  const dy = (H - dh) / 2 - H * 0.02;
  if (o.shadow !== false && look !== 'dim') {
    ctx.shadowColor = look === 'light' ? 'rgba(30,8,4,0.4)' : 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = Math.max(0.5, W * 0.02);
    ctx.shadowOffsetY = Math.max(0.5, H * 0.04);
    ctx.shadowBlur = Math.max(0.5, W * 0.03);
  }
  ctx.drawImage(f.src, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  if (look === 'full') return canvas;
  // recolour by brightness: the shadow (drawn above) stays dark under the light look
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
  return canvas;
}
