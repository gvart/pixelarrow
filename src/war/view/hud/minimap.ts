/**
 * The minimap (W-32, W-36; the Dota 2 hybrid look: a square well in a bronze frame with gold corners, ./theme.ts),
 * bottom left: the whole region in tile space (./mapDraw.ts: hillshaded terrain, clear water, roads, rock, in the current
 * view mode) turned to the iso camera's north, so it stands as a diamond in the square and every corner of the region
 * is in view. Markers: buildings by owner, lairs, claim points, own squads, seen enemies and the camera's view. Click or
 * drag it to move the camera there. Redrawn at 4 Hz; its backing store follows the UI scale and the device pixel ratio.
 */
import type { SandboxScene } from '../SandboxScene';
import { drawMap, ISO_ROT, toTile, type MapXf } from './mapDraw';

/** The frame's side and the map well's inset, art px. */
const D = 168, IN = 7, W = D - 2 * IN;
/** The region's diamond across the well: its corners just inside the square. */
const FIT = 0.98;

export class Minimap {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private drag = false;

  constructor(private s: SandboxScene) {
    this.el = document.createElement('div');
    this.el.className = 'rf';
    this.el.id = 'minimap';
    this.el.style.cssText = `left:4px;bottom:4px;width:${D}px;height:${D}px`;
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = `position:absolute;left:${IN}px;top:${IN}px;width:${W}px;height:${W}px;background:#0b0c0e;cursor:pointer;image-rendering:auto`;
    this.el.append(this.cv, ...['a', 'b', 'c', 'd'].map((k) => Object.assign(document.createElement('i'), { className: `mm-corner ${k}` })));
    const jump = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect(), a = W / r.width, t = toTile(this.xf(1), (e.clientX - r.left) * a, (e.clientY - r.top) * a);
      this.s.focus(Math.max(0, Math.min(this.s.map.w, t.x)), Math.max(0, Math.min(this.s.map.h, t.y)));
      this.draw();
    };
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.drag = true; this.cv.setPointerCapture(e.pointerId); jump(e); });
    this.cv.addEventListener('pointermove', (e) => { if (this.drag) jump(e); });
    this.cv.addEventListener('pointerup', () => (this.drag = false));
    this.cv.addEventListener('lostpointercapture', () => (this.drag = false));
    setInterval(() => this.draw(), 250);
  }

  /** Well px (times `px`) per tile, turned to the iso north, the region's centre in the well's centre. */
  private xf(px: number): MapXf {
    const { w, h } = this.s.map, k = (FIT * W) / ((w + h) / Math.SQRT2);
    return { k: k * px, rot: ISO_ROT, cx: w / 2, cy: h / 2, ox: (W / 2) * px, oy: (W / 2) * px };
  }

  draw(): void {
    // backing px per well px: the UI zoom (css zoom on the HUD) times the device pixel ratio
    const r = this.cv.getBoundingClientRect(), px = Math.max(1, Math.round(((r.width || W) / W) * (devicePixelRatio || 1) * 2) / 2);
    const n = Math.round(W * px);
    if (this.cv.width !== n) this.cv.width = this.cv.height = n;
    const g = this.cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // the well round the diamond: dark stone with a faint lattice
    g.fillStyle = '#0b0c0e';
    g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(95,75,42,.16)';
    g.lineWidth = px;
    for (let i = -n; i < n; i += 8 * px) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + n, n); g.moveTo(i + n, 0); g.lineTo(i, n); g.stroke(); }
    drawMap(g, this.s, this.xf(px), px * 0.8);
  }
}
