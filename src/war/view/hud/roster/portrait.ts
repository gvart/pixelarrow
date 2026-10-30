/**
 * A soldier's portrait for the card (M5g): the first idle frame of his class sheet (the shipped PixelLab sheets the map
 * draws, ../../units.ts), facing the viewer (south-west row), cropped to the figure and scaled nearest-neighbour, the
 * red cloth turned blue as the team 0 shader does (TEAM_SWAP). One canvas per class, cached. The map uploads a class's
 * sheet only once a man of it is drawn, so for a class not on the map the portrait cuts the frame from the sheet image.
 */
import type Phaser from 'phaser';
import type { SheetManifest } from '../../../../art/sheetManifest';

const manifests = import.meta.glob<SheetManifest>('../../../../assets/sheets/*/manifest.json', { eager: true, import: 'default' });
const byClass = new Map(Object.entries(manifests).map(([p, m]) => [p.split('/').at(-2)!, m]));
// the sheets the map ships (../../units.ts), by class: the portrait of a class not on the map is cut from these
const urls = import.meta.glob<string>(
  '../../../../assets/sheets/*/*.png',
  { eager: true, query: '?url', import: 'default' },
);
const urlOf = new Map(Object.entries(urls).map(([p, u]) => [p.split('/').at(-2)!, u]));
const images = new Map<string, HTMLImageElement>();
const cache = new Map<string, HTMLCanvasElement>();

/** The sheet image of a class (loading on first call; null until it is in). */
function sheetImage(cls: string): HTMLImageElement | null {
  let im = images.get(cls);
  if (!im) {
    const u = urlOf.get(cls);
    if (!u) return null;
    im = new Image();
    im.src = u;
    images.set(cls, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
export const PORTRAIT_W = 64, PORTRAIT_H = 80;

/** The class's portrait canvas (64 x 80 art px), or null before its sheet texture is in. */
export function portrait(scene: Phaser.Scene, cls: string): HTMLCanvasElement | null {
  const key = byClass.has(cls) && urlOf.has(cls) ? cls : 'militia';
  const hit = cache.get(key);
  if (hit) return hit;
  const m = byClass.get(key);
  if (!m) return null;
  const row = Math.max(0, m.rows.indexOf('south-west'));
  // the map's uploaded frame, else the idle frame cut from the sheet image (column c, band c / wrap: SheetManifest.wrap)
  const tk = scene.textures.exists(`war-${key}`) ? `war-${key}` : `war-${key}-0`;
  const tex = scene.textures.exists(tk) ? scene.textures.get(tk) : null, fr = tex?.has(`idle${row}_0`) ? tex.get(`idle${row}_0`) : null;
  let img: HTMLImageElement | HTMLCanvasElement | null, cut: { x: number; y: number; w: number; h: number };
  if (tex && fr) (img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement), (cut = { x: fr.cutX, y: fr.cutY, w: fr.cutWidth, h: fr.cutHeight });
  else {
    const c = m.anims.idle?.col ?? 0, wrap = m.wrap ?? 1e9;
    img = sheetImage(key);
    cut = { x: (c % wrap) * m.frame.w, y: (Math.floor(c / wrap) * m.rows.length + row) * m.frame.h, w: m.frame.w, h: m.frame.h };
  }
  if (!img) return null;
  // the frame, its opaque bounds, then fitted into the portrait (feet at the bottom, integer-ish scale)
  const f = document.createElement('canvas');
  f.width = cut.w;
  f.height = cut.h;
  const fc = f.getContext('2d', { willReadFrequently: true })!;
  fc.drawImage(img, cut.x, cut.y, cut.w, cut.h, 0, 0, cut.w, cut.h);
  const d = fc.getImageData(0, 0, f.width, f.height);
  let x0 = f.width, y0 = f.height, x1 = 0, y1 = 0;
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const i = (y * f.width + x) * 4;
      if (d.data[i + 3] < 8) continue;
      x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y);
      // team 0: saturated red -> blue (the TEAM_SWAP formula)
      const r = d.data[i] / 255, g = d.data[i + 1] / 255, b = d.data[i + 2] / 255, rr = Math.max(r, 0.001);
      const ss = (a: number, z: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (z - a))); return t * t * (3 - 2 * t); };
      const w = ss(0.3, 0.55, (r - Math.max(g, b)) / rr) * (1 - ss(0.1, 0.25, (g - b) / rr));
      if (w > 0) {
        d.data[i] = 255 * Math.min(1, r + (b * 0.6 - r) * w);
        d.data[i + 1] = 255 * Math.min(1, g + (g * 0.8 + r * 0.3 - g) * w);
        d.data[i + 2] = 255 * Math.min(1, b + (r * 1.2 + 0.06 - b) * w);
      }
    }
  if (x1 < x0) return null;
  fc.putImageData(d, 0, 0);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const k = Math.min((PORTRAIT_W - 4) / bw, (PORTRAIT_H - 4) / bh);
  const out = document.createElement('canvas');
  out.width = PORTRAIT_W * 2; // drawn at 2x: sharp on hi-dpi at every UI scale
  out.height = PORTRAIT_H * 2;
  const c = out.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const w = Math.round(bw * k * 2), h = Math.round(bh * k * 2);
  c.drawImage(f, x0, y0, bw, bh, Math.round((out.width - w) / 2), out.height - h - 4, w, h);
  cache.set(key, out);
  return out;
}

/** A man's icon in the card's strip (../hud.ts): CSS px, drawn at 2x. */
export const ICON_W = 18, ICON_H = 21;
const icons = new Map<string, string>();

/**
 * The class's small icon for the card's soldier strip: the head and shoulders of its portrait (team colour as there),
 * as a data URL, cached; null before the portrait is in.
 */
export function portraitIcon(scene: Phaser.Scene, cls: string): string | null {
  const p = portrait(scene, cls);
  if (!p) return null;
  const key = byClass.has(cls) && urlOf.has(cls) ? cls : 'militia';
  const hit = icons.get(key);
  if (hit) return hit;
  // the figure's top: the first row with paint in the middle third (a raised spear off to a side does not count)
  const d = p.getContext('2d')!.getImageData(0, 0, p.width, p.height).data, x0 = Math.floor(p.width / 3), x1 = Math.ceil((p.width * 2) / 3);
  let top = 0;
  find: for (let y = 0; y < p.height; y++) for (let x = x0; x < x1; x++) if (d[(y * p.width + x) * 4 + 3] > 8) { top = y; break find; }
  // a crop of the icon's shape from just above the head, about the upper half of the figure
  const ch = Math.round((p.height - top) * 0.5), cw = Math.round((ch * ICON_W) / ICON_H);
  const out = document.createElement('canvas');
  out.width = ICON_W * 2;
  out.height = ICON_H * 2;
  const c = out.getContext('2d')!;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(p, Math.round((p.width - cw) / 2), Math.max(0, top - 4), cw, ch, 0, 0, out.width, out.height);
  const url = out.toDataURL();
  icons.set(key, url);
  return url;
}

/** E3: his scars as dark-red slashes in the portrait's top corner (2x canvas px), one per heavy wound lived through. */
export function scarMarks(g: CanvasRenderingContext2D, n: number): void {
  for (let i = 0; i < Math.min(3, n); i++) {
    const x = 10 + i * 9, y = 10;
    g.strokeStyle = '#1a0c08';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + 7, y); g.stroke();
    g.strokeStyle = '#a8402c';
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + 7, y); g.stroke();
  }
}
