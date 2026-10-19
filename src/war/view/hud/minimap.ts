/**
 * The round minimap (W-32, W-36), bottom left: the region top down in tile space (./mapDraw.ts: hillshaded terrain, clear
 * water, roads, rock, in the current view mode) filling the window of the meander ring, with buildings by owner, lairs,
 * claim points, own squads, seen enemies and the camera's view (a diamond). Click or drag it to move the camera there.
 * Redrawn at 4 Hz; its backing store follows the UI scale and the device pixel ratio.
 */
import type { SandboxScene } from '../SandboxScene';
import { UI } from './kit';
import { drawMap, type MapXf } from './mapDraw';

const D = 168, CX = 84, R = 68;
/** The region's side in the window (art px): a little more than the inscribed square, its corners just clipped. */
const SIDE = 1.76 * R;

export class Minimap {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;

  constructor(private s: SandboxScene) {
    this.el = document.createElement('div');
    this.el.className = 'rf';
    this.el.id = 'minimap';
    this.el.style.cssText = `left:4px;bottom:4px;width:${D}px;height:${D}px`;
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = `position:absolute;left:${CX - R}px;top:${CX - R}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;background:#1a120d;cursor:pointer;image-rendering:auto`;
    const ring = document.createElement('img');
    ring.src = `${UI}frames/minimap-round.png`;
    ring.srcset = `${UI}frames/minimap-round@2x.png 2x`;
    ring.style.cssText = `position:absolute;left:0;top:0;width:${D}px;height:${D}px;pointer-events:none`;
    this.el.append(this.cv, ring);
    let drag = false;
    const jump = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect(), f = this.xf(1), a = (2 * R) / r.width;
      this.s.focus(f.x0 + ((e.clientX - r.left) * a) / f.k, f.y0 + ((e.clientY - r.top) * a) / f.k);
      this.draw();
    };
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); drag = true; this.cv.setPointerCapture(e.pointerId); jump(e); });
    this.cv.addEventListener('pointermove', (e) => { if (drag) jump(e); });
    this.cv.addEventListener('pointerup', () => (drag = false));
    setInterval(() => this.draw(), 250);
  }

  /** Window px (times `px`) per tile, the region centred. */
  private xf(px: number): MapXf {
    const { w, h } = this.s.map, k = SIDE / Math.max(w, h);
    return { k: k * px, x0: w / 2 - R / k, y0: h / 2 - R / k };
  }

  draw(): void {
    // backing px per window px: the UI zoom (css zoom on the HUD) times the device pixel ratio
    const r = this.cv.getBoundingClientRect(), px = Math.max(1, Math.round(((r.width || 2 * R) / (2 * R)) * (devicePixelRatio || 1) * 2) / 2);
    const n = Math.round(2 * R * px);
    if (this.cv.width !== n) this.cv.width = this.cv.height = n;
    const g = this.cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1a120d';
    g.fillRect(0, 0, n, n);
    drawMap(g, this.s, this.xf(px), px * 0.8);
  }
}
