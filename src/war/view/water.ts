/**
 * Falls: where a river's course steps down (its water cells meet lower water, scripts/war/regions/kit.ts settleWater),
 * the face toward the viewer is drawn as falling water (a static sheet: slices of blue, white streaks, a glassy lip and
 * a churned white foot) with flickering foam at its foot. The sheet lies over the baked ground, so each face is cut off,
 * screen column by column, where the ground or a wall in front of it hides it.
 *
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
/** Slices of falling water per 1 m cell edge of a fall face, and their blues. */
const SLICES = 3;
/** Screen columns per fall face, each cut off by what stands in front of it. */
const COLS = 8;
const FALL_BODY = [0x3f7f97, 0x4b8ea6, 0x5a9db3, 0x6aaabe];

export class WaterGlints {
  /** Per bucket: glint world x, y and phase, flat triples. */
  private buckets: number[][];
  private bw: number;
  private pool: Phaser.GameObjects.Image[] = [];
  /** Foam at the foot of each fall face: world x, y and phase, flat triples. */
  private foam: number[] = [];
  private foamPool: Phaser.GameObjects.Image[] = [];

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
    this.falls(iso);
    if (!scene.textures.exists('war-glint')) {
      const t = scene.textures.createCanvas('war-glint', 12, 3)!, g = t.context;
      const gr = g.createLinearGradient(0, 0, 12, 0);
      gr.addColorStop(0, 'rgba(255,248,220,0)'); gr.addColorStop(0.5, 'rgba(255,248,220,1)'); gr.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = gr; g.fillRect(0, 1, 12, 1);
      g.fillStyle = 'rgba(255,248,220,0.35)'; g.fillRect(3, 0, 6, 1); g.fillRect(3, 2, 6, 1);
      t.refresh();
    }
  }

  /** The fall faces (a cell over lower water at +x or +y, the faces the camera sees) as one static sheet, and their foam. */
  private falls(iso: IsoMap): void {
    const { fw, fh, fk, fz, OX, OY } = iso;
    const wet = (j: number) => fk[j] === SHALLOW || fk[j] === DEEP;
    const P = (cx: number, cy: number, z: number) => ({ x: OX + (cx - cy) * 16, y: OY + (cx + cy) * 8 - z * LH });
    let g: Phaser.GameObjects.Graphics | null = null;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const i = y * fw + x;
      if (!wet(i)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (x + dx >= fw || y + dy >= fh) continue;
        const j = i + dy * fw + dx, hi = fz[i], lo = fz[j];
        if (!wet(j) || lo >= hi) continue;
        // the shared edge: E-S for +x, S-W for +y (cell corners in grid units)
        const [a, b] = dx ? [[x + 1, y], [x + 1, y + 1]] : [[x + 1, y + 1], [x, y + 1]];
        // the sheet lies over the baked ground: cut each of its screen columns off where the ground or a wall in front
        // (any cell further down that column standing over the face's line of sight) hides it
        const seenAt = (t: number) => {
          const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
          let s = lo;
          for (let d = 0; d < 160; d += 0.25) {
            const cx = Math.floor(px + d), cy = Math.floor(py + d);
            if (cx >= fw || cy >= fh) break;
            if (cx + cy > x + y) s = Math.max(s, fz[cy * fw + cx] - (cx + cy + 1 - px - py) / 4);
          }
          return s;
        };
        const seen = new Float32Array(COLS);
        let seenMin = Infinity;
        for (let c = 0; c < COLS; c++) { seen[c] = seenAt((c + 0.5) / COLS); seenMin = Math.min(seenMin, seen[c]); }
        if (seenMin >= hi - 0.25) continue;
        const ba = P(a[0], a[1], lo), bb = P(b[0], b[1], lo);
        g ??= this.scene.add.graphics().setDepth(1.45);
        // a point on the face: t along its edge (a -> b), h down it (0 the lip, 1 the pool); a quad is drawn column by
        // column, each down to the level in front of it at most
        const H = hi - lo;
        const at = (t: number, h: number) => P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, hi - H * h);
        const quad = (t0: number, t1: number, h0: number, h1: number) => {
          for (let c = 0; c < COLS; c++) {
            const u0 = Math.max(t0, c / COLS), u1 = Math.min(t1, (c + 1) / COLS), e = Math.min(h1, (hi - seen[c]) / H);
            if (u1 > u0 && e > h0) g!.fillPoints([at(u0, h0), at(u1, h0), at(u1, e), at(u0, e)], true);
          }
        };
        // the foam at the foot about a level tall (at most a third of the drop), the glassy lip a third of a level
        const foot = Math.min(1 / 3, 1.1 / H), lip = Math.min(0.15, 0.35 / H);
        // the body in slices of falling water, each its own blue, darker behind the lip, paler as it falls
        for (let k = 0; k < SLICES; k++) {
          const hk = hash(x, y, 30 + k), c = FALL_BODY[hk % FALL_BODY.length], t0 = k / SLICES, t1 = (k + 1) / SLICES;
          g.fillStyle(c, 0.95); quad(t0, t1, 0, 1);
          g.fillStyle(0xd8eef4, 0.18); quad(t0, t1, 0.45 + ((hk >>> 4) & 7) / 40, 1);
        }
        // streaks: thin white runs starting at random heights, longer lower down
        for (let k = 0; k < 2 * SLICES; k++) {
          const hk = hash(x, y, 40 + k), t = (k + 0.2 + 0.6 * ((hk & 15) / 15)) / (2 * SLICES), w = 0.025 + ((hk >>> 4) & 3) * 0.012;
          const h0 = ((hk >>> 8) & 15) / 30, h1 = Math.min(1, h0 + 0.25 + ((hk >>> 12) & 15) / 25);
          g.fillStyle(0xf2fbfd, 0.32 + ((hk >>> 16) & 7) / 25); quad(t - w, t + w, h0, h1);
        }
        g.fillStyle(0x9fd6e2, 0.8); quad(0, 1, 0, lip);
        g.fillStyle(0xf4fbfd, 0.95); quad(0, 1, 0, Math.min(lip, 0.08 / H));
        // the churned foot: two white bands fading up from the pool (cut like the rest), its foam where the pool is in sight
        g.fillStyle(0xe6f5f8, 0.5); quad(0, 1, 1 - foot, 1);
        g.fillStyle(0xf6fcfd, 0.75); quad(0, 1, 1 - foot * 0.45, 1);
        if (seen[COLS >> 1] <= lo + 0.25) this.foam.push((ba.x + bb.x) / 2, (ba.y + bb.y) / 2 + 2, (hash(x, y, 33) & 1023) / 1023 * Math.PI * 2);
      }
    }
    if (this.foam.length && !this.scene.textures.exists('war-foam')) {
      const t = this.scene.textures.createCanvas('war-foam', 24, 10)!, c = t.context;
      const gr = c.createRadialGradient(12, 5, 1, 12, 5, 12);
      gr.addColorStop(0, 'rgba(250,253,255,0.95)'); gr.addColorStop(0.6, 'rgba(230,245,250,0.55)'); gr.addColorStop(1, 'rgba(230,245,250,0)');
      c.fillStyle = gr; c.save(); c.scale(1, 10 / 24); c.beginPath(); c.arc(12, 12, 12, 0, Math.PI * 2); c.fill(); c.restore();
      t.refresh();
    }
  }

  draw(view: { x: number; y: number; right: number; bottom: number }, zoom: number, now: number, iso: IsoMap): void {
    let m = 0;
    for (let k = 0; k < this.foam.length && m < MAX; k += 3) {
      const wx = this.foam[k], wy = this.foam[k + 1];
      if (wx < view.x - 20 || wx > view.right + 20 || wy < view.y - 10 || wy > view.bottom + 10) continue;
      let im = this.foamPool[m];
      if (!im) this.foamPool.push((im = this.scene.add.image(0, 0, 'war-foam').setDepth(1.46)));
      m++;
      const p = now * 0.004 + this.foam[k + 2];
      im.setPosition(wx + Math.sin(p * 0.7) * 2, wy - Math.abs(Math.sin(p)) * 2).setScale(1 + 0.25 * Math.sin(p * 1.3), 1).setAlpha(0.7 + 0.3 * Math.sin(p * 1.9)).setVisible(true);
    }
    for (let i = m; i < this.foamPool.length; i++) this.foamPool[i].setVisible(false);
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
