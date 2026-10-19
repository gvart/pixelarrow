/**
 * The round minimap (W-32), bottom left: the scene's terrain overview (iso, 1/8) in the window of the meander ring, own
 * and enemy units as dots, buildings as small squares, the camera's view as a rectangle. Click or drag it to move the
 * camera there. Terrain redraws when the overview finishes baking; the dots and the view at 4 Hz.
 */
import type { SandboxScene } from '../SandboxScene';
import { UI } from './kit';

const D = 168, CX = 84, R = 68;
/** Team colours: you, red, gold, violet. */
const TEAM = ['#5ab8ff', '#ff4a3a', '#ffd040', '#c070ff'];

export class Minimap {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private terrain = document.createElement('canvas');
  private ready = false;
  /** World px -> minimap px: scale and offset (the iso diamond fills the window, its tips clipped). */
  private k = 1;
  private ox = 0;
  private oy = 0;

  constructor(private s: SandboxScene) {
    this.el = document.createElement('div');
    this.el.className = 'rf';
    this.el.id = 'minimap';
    this.el.style.cssText = `left:4px;bottom:4px;width:${D}px;height:${D}px`;
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = 2 * R;
    this.cv.style.cssText = `position:absolute;left:${CX - R}px;top:${CX - R}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;background:#2a1a12;cursor:pointer`;
    const ring = document.createElement('img');
    ring.src = `${UI}frames/minimap-round.png`;
    ring.srcset = `${UI}frames/minimap-round@2x.png 2x`;
    ring.style.cssText = `position:absolute;left:0;top:0;width:${D}px;height:${D}px;pointer-events:none`;
    this.el.append(this.cv, ring);
    const { W, H } = s.iso;
    this.k = (2 * R * 1.5) / W;
    this.ox = R - (W * this.k) / 2;
    this.oy = R - (H * this.k) / 2;
    this.terrain.width = this.terrain.height = 2 * R;
    let drag = false;
    const jump = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect(), f = (2 * R) / r.width;
      const x = ((e.clientX - r.left) * f - this.ox) / this.k, y = ((e.clientY - r.top) * f - this.oy) / this.k;
      this.s.cameras.main.centerOn(x, y);
    };
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); drag = true; this.cv.setPointerCapture(e.pointerId); jump(e); });
    this.cv.addEventListener('pointermove', (e) => { if (drag) jump(e); });
    this.cv.addEventListener('pointerup', () => (drag = false));
    setInterval(() => this.draw(), 250);
  }

  private bakeTerrain(): void {
    const g = this.terrain.getContext('2d')!, src = this.s.overviewCanvas();
    g.clearRect(0, 0, 2 * R, 2 * R);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, this.ox, this.oy, this.s.iso.W * this.k, this.s.iso.H * this.k);
    this.ready = this.s.overviewReady;
  }

  draw(): void {
    const s = this.s;
    if (!this.ready) this.bakeTerrain();
    const g = this.cv.getContext('2d')!, iso = s.iso;
    g.clearRect(0, 0, 2 * R, 2 * R);
    g.drawImage(this.terrain, 0, 0);
    const at = (x: number, y: number) => [this.ox + iso.sx(x, y) * this.k, this.oy + iso.sy(x, y, iso.zAt(x, y)) * this.k];
    for (const b of s.sim.cur?.buildings ?? []) {
      if (b.state === 'destroyed') continue;
      const [x, y] = at(b.x, b.y);
      g.fillStyle = '#0e0907';
      g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      g.fillStyle = TEAM[b.team] ?? '#ccc';
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
    for (const d of s.drawn) {
      if (d.u.state === 'dead') continue;
      const [x, y] = at(d.x, d.y);
      g.fillStyle = TEAM[d.team] ?? '#ccc';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // the camera's view
    const v = s.viewRect();
    g.strokeStyle = '#f0d9b5';
    g.lineWidth = 1;
    g.strokeRect(Math.round(this.ox + v.x * this.k) + 0.5, Math.round(this.oy + v.y * this.k) + 0.5, Math.max(2, Math.round((v.right - v.x) * this.k)), Math.max(2, Math.round((v.bottom - v.y) * this.k)));
  }
}
