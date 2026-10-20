/**
 * The round minimap (W-32, W-36), bottom left: the region in tile space (./mapDraw.ts: hillshaded terrain, clear water,
 * roads, rock, in the current view mode) turned to the iso camera's north and scaled so its ground covers the whole
 * window of the meander ring (no empty corners). The window spans SPAN of the region's side and follows the camera,
 * clamped to the region, so every corner is reachable. Markers: buildings by owner, lairs, claim points, own squads,
 * seen enemies and the camera's view. Click or drag it to move the camera there (the view holds still while dragging).
 * Redrawn at 4 Hz; its backing store follows the UI scale and the device pixel ratio.
 */
import type { SandboxScene } from '../SandboxScene';
import { UI } from './kit';
import { drawMap, frustum, ISO_ROT, toTile, type MapXf } from './mapDraw';

const D = 168, CX = 84, R = 70;
/** The window's diameter as a share of the region's side. */
const SPAN = 0.86;

export class Minimap {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  /** The tile at the window's centre; held while dragging. */
  private c = { x: 0, y: 0 };
  private drag = false;

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
    const jump = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect(), a = (2 * R) / r.width, t = toTile(this.xf(1), (e.clientX - r.left) * a, (e.clientY - r.top) * a);
      this.s.focus(Math.max(0, Math.min(this.s.map.w, t.x)), Math.max(0, Math.min(this.s.map.h, t.y)));
      this.draw();
    };
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.drag = true; this.cv.setPointerCapture(e.pointerId); jump(e); });
    this.cv.addEventListener('pointermove', (e) => { if (this.drag) jump(e); });
    this.cv.addEventListener('pointerup', () => (this.drag = false));
    this.cv.addEventListener('lostpointercapture', () => (this.drag = false));
    setInterval(() => this.draw(), 250);
  }

  /** Window px (times `px`) per tile, turned to the iso north, centred on the held tile. */
  private xf(px: number): MapXf {
    const { w, h } = this.s.map, k = (2 * R) / (SPAN * Math.max(w, h));
    return { k: k * px, rot: ISO_ROT, cx: this.c.x, cy: this.c.y, ox: R * px, oy: R * px };
  }

  /** Follow the camera, keeping the window's circle inside the region. */
  private follow(): void {
    const { w, h } = this.s.map, rho = (SPAN * Math.max(w, h)) / 2, fr = frustum(this.s);
    const x = fr.reduce((a, p) => a + p.x, 0) / 4, y = fr.reduce((a, p) => a + p.y, 0) / 4;
    this.c = { x: Math.max(rho, Math.min(w - rho, x)), y: Math.max(rho, Math.min(h - rho, y)) };
  }

  draw(): void {
    if (!this.drag) this.follow();
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
