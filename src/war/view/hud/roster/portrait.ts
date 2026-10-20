/**
 * A soldier's portrait for the card (M5g): the first idle frame of his class sheet (the shipped PixelLab sheets the map
 * draws, ../../units.ts), facing the viewer (south-west row), cropped to the figure and scaled nearest-neighbour, the
 * red cloth turned blue as the team 0 shader does (TEAM_SWAP). One canvas per class, cached.
 */
import type Phaser from 'phaser';
import type { SheetManifest } from '../../../../art/sheetManifest';

const manifests = import.meta.glob<SheetManifest>('../../../../assets/sheets/*/manifest.json', { eager: true, import: 'default' });
const byClass = new Map(Object.entries(manifests).map(([p, m]) => [p.split('/').at(-2)!, m]));
const cache = new Map<string, HTMLCanvasElement>();
export const PORTRAIT_W = 64, PORTRAIT_H = 80;

/** The class's portrait canvas (64 x 80 art px), or null before its sheet texture is in. */
export function portrait(scene: Phaser.Scene, cls: string): HTMLCanvasElement | null {
  const key = byClass.has(cls) ? cls : 'militia';
  const hit = cache.get(key);
  if (hit) return hit;
  const m = byClass.get(key);
  const tk = scene.textures.exists(`war-${key}`) ? `war-${key}` : `war-${key}-0`;
  if (!m || !scene.textures.exists(tk)) return null;
  const row = Math.max(0, m.rows.indexOf('south-west'));
  const tex = scene.textures.get(tk), fr = tex.has(`idle${row}_0`) ? tex.get(`idle${row}_0`) : null;
  const img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (!fr) return null;
  // the frame, its opaque bounds, then fitted into the portrait (feet at the bottom, integer-ish scale)
  const f = document.createElement('canvas');
  f.width = fr.cutWidth;
  f.height = fr.cutHeight;
  const fc = f.getContext('2d', { willReadFrequently: true })!;
  fc.drawImage(img, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
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
