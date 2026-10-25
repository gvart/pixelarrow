/**
 * Glints on open water: a sparse set of water cells (about one in GAP, away from the shore) each flash a short warm
 * streak now and then, out of phase, so the sea and the rivers shimmer. Cheap: pooled additive images over the
 * baked chunks, only the cells in view, only those in their bright moment, at most MAX a frame.
 */
import Phaser from 'phaser';
import { hash } from './autotile';
import { LH, type IsoMap } from './iso';
import { KINDS } from '../regions/visual';

const GAP = 9;
const MAX = 260;
const BUCKET = 32; // visual cells per bucket side
const SHALLOW = KINDS.indexOf('shallow'), DEEP = KINDS.indexOf('deep');

export class WaterGlints {
  /** Per bucket: glint world x, y and phase, flat triples. */
  private buckets: number[][];
  private bw: number;
  private pool: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, iso: IsoMap) {
    const { fw, fh, fk, fz } = iso;
    this.bw = Math.ceil(fw / BUCKET);
    this.buckets = Array.from({ length: this.bw * Math.ceil(fh / BUCKET) }, () => []);
    const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < fw && y < fh && (fk[y * fw + x] === SHALLOW || fk[y * fw + x] === DEEP);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (hash(x, y, 21) % GAP || !wet(x, y) || !wet(x - 2, y) || !wet(x + 2, y) || !wet(x, y - 2) || !wet(x, y + 2)) continue;
      const wx = iso.OX + (x - y + 0.5 * ((hash(x, y, 22) & 15) / 15)) * 16, wy = iso.OY + (x + y + 1) * 8 - fz[y * fw + x] * LH;
      this.buckets[((y / BUCKET) | 0) * this.bw + ((x / BUCKET) | 0)].push(wx, wy, (hash(x, y, 23) & 1023) / 1023 * Math.PI * 2);
    }
    if (!scene.textures.exists('war-glint')) {
      const t = scene.textures.createCanvas('war-glint', 12, 3)!, g = t.context;
      const gr = g.createLinearGradient(0, 0, 12, 0);
      gr.addColorStop(0, 'rgba(255,248,220,0)'); gr.addColorStop(0.5, 'rgba(255,248,220,1)'); gr.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = gr; g.fillRect(0, 1, 12, 1);
      g.fillStyle = 'rgba(255,248,220,0.35)'; g.fillRect(3, 0, 6, 1); g.fillRect(3, 2, 6, 1);
      t.refresh();
    }
  }

  draw(view: { x: number; y: number; right: number; bottom: number }, zoom: number, now: number, iso: IsoMap): void {
    let n = 0;
    if (zoom >= 1 / 4) {
      // visual cell bounds of the view (water lies low: allow its level)
      const u0 = (view.x - iso.OX) / 16 - 2, u1 = (view.right - iso.OX) / 16 + 2;
      const v0 = (view.y - iso.OY) / 8 - 2, v1 = (view.bottom - iso.OY) / 8 + (iso.top * LH) / 8 + 2;
      const bx0 = Math.max(0, Math.floor((u0 + v0) / 2 / BUCKET)), bx1 = Math.min(this.bw - 1, Math.floor((u1 + v1) / 2 / BUCKET));
      const nb = this.buckets.length / this.bw;
      const by0 = Math.max(0, Math.floor((v0 - u1) / 2 / BUCKET)), by1 = Math.min(nb - 1, Math.floor((v1 - u0) / 2 / BUCKET));
      const t = now * 0.0011, s = Math.max(1, 0.6 / zoom);
      for (let by = by0; by <= by1 && n < MAX; by++) for (let bx = bx0; bx <= bx1 && n < MAX; bx++) {
        const b = this.buckets[by * this.bw + bx];
        for (let k = 0; k < b.length && n < MAX; k += 3) {
          const wx = b[k], wy = b[k + 1];
          if (wx < view.x || wx > view.right || wy < view.y || wy > view.bottom) continue;
          const a = Math.sin(t + b[k + 2] * 3.1) * Math.sin(t * 0.37 + b[k + 2]);
          if (a < 0.55) continue;
          let im = this.pool[n];
          if (!im) this.pool.push((im = this.scene.add.image(0, 0, 'war-glint').setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD)));
          n++;
          im.setPosition(wx, wy + Math.sin(t * 2 + b[k + 2]) * 1.5).setAlpha((a - 0.55) * 1.6).setScale(s, Math.max(1, s * 0.6)).setVisible(true);
        }
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}
