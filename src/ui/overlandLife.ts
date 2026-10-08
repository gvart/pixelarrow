/**
 * Ambient life on the offline overland map (src/scenes/WorldScene.ts), the
 * same as on the online war map (src/ui/mapLifeFx.ts): glints and wave
 * crests on the sea, merchant ships and galleys on the sea lanes with a
 * wake, fishing boats off the villages, gulls over the harbours, chimney and
 * campfire smoke, waving flags and flickering fires. Only what is in view and
 * out of the fog is drawn; nothing is simulated.
 */
import Phaser from 'phaser';
import { boatPix } from '../art/mapProps';
import type { SiteArt, SeaLane } from '../art/overlandMap';
import { ImagePool, flicker, gullAt, lifeTextures, seaShimmer, shipOnLane, smokePuffs, wake, wavingFlag } from './mapLifeFx';

export class OverlandLife {
  private g: Phaser.GameObjects.Graphics;
  private c: Phaser.GameObjects.Container;
  private pool: ImagePool;
  private tex: { merchant: string; galley: string; gull: [string, string]; boat: string };

  constructor(
    scene: Phaser.Scene,
    private sites: SiteArt[],
    private lanes: SeaLane[],
    private water: Uint8Array,
    private W: number,
    private H: number,
    private seen: (x: number, y: number) => boolean,
    add: (o: Phaser.GameObjects.GameObject[]) => void,
    depth: number,
  ) {
    this.g = scene.add.graphics().setDepth(depth);
    this.c = scene.add.container(0, 0).setDepth(depth + 1);
    add([this.g, this.c]);
    this.pool = new ImagePool(scene, this.c);
    if (!scene.textures.exists('ol_boat')) scene.textures.addCanvas('ol_boat', boatPix().toCanvas());
    this.tex = { ...lifeTextures(scene, 'ol_'), boat: 'ol_boat' };
  }

  private sea(x: number, y: number): boolean {
    const X = Math.round(x);
    const Y = Math.round(y);
    if (X < 0 || Y < 0 || X >= this.W || Y >= this.H) return false;
    return this.water[Y * this.W + X] === 1;
  }

  update(time: number, view: Phaser.Geom.Rectangle, zoom: number): void {
    const g = this.g;
    g.clear();
    this.pool.begin();
    const k = Math.max(1, Math.round(1.2 / zoom));
    const x0 = view.x - 30;
    const y0 = view.y - 30;
    const x1 = view.right + 30;
    const y1 = view.bottom + 30;
    const T = time / 1000;
    // the open sea shimmers (off the shelf: water all round)
    seaShimmer(g, x0, y0, x1, y1, k, T, (x, y) => this.sea(x, y) && this.sea(x - 7, y) && this.sea(x + 7, y) && this.sea(x, y - 7) && this.sea(x, y + 7) && this.seen(x, y), 28);
    // ships on the sea lanes
    for (const l of this.lanes) {
      if (l.x1 < x0 - 30 || l.x0 > x1 + 30 || l.y1 < y0 - 30 || l.y0 > y1 + 30) continue;
      const p = shipOnLane(l, T);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1 || !this.seen(p.x, p.y)) continue;
      wake(g, l, p.kk, p.fwd, 1);
      const bob = Math.round(Math.sin(T * 2 + l.phase * 9));
      this.pool
        .img(l.kind === 'merchant' ? this.tex.merchant : this.tex.galley)
        .setScale(1)
        .setFlipX(p.dir < 0)
        .setPosition(Math.round(p.x), Math.round(p.y) + 3 + bob);
    }
    // the settlements and landmarks in view
    for (const s of this.sites) {
      if (s.x > x1 || s.x + s.w < x0 || s.y > y1 || s.y + s.h < y0) continue;
      if (!this.seen(s.x + s.w / 2, s.y + s.h / 2)) continue;
      const sp = s.sprite;
      const seed = s.id < 0 ? s.x + s.y : s.id;
      sp.smoke.slice(0, 8).forEach((q, i) => smokePuffs(g, s.x + q.x, s.y + q.y, T, seed, i));
      for (const f of sp.flags) wavingFlag(g, s.x + f.x, s.y + f.y, f.c, T);
      for (const f of sp.fires) flicker(g, s.x + f.x, s.y + f.y, T, seed);
      const h = s.harbour;
      if (!h || s.kind === 'lair') continue;
      for (const f of h.fires) flicker(g, f.x, f.y, T, seed + 7);
      // gulls wheel over the harbour
      const n = s.kind === 'town' ? 3 : 2;
      for (let q = 0; q < n; q++) {
        const p = gullAt(T, q, seed, h.x + h.dx * 22, h.y + h.dy * 22);
        this.pool.img(this.tex.gull[Math.floor(time / 170 + q) % 2]).setScale(1).setFlipX(false).setPosition(p.x, p.y);
      }
      // a fishing boat working off the shore
      if (s.kind === 'village' || seed % 2 === 0) {
        const a = T * 0.12 + seed;
        const bx = h.x + h.dx * 30 + Math.cos(a) * 12 - h.dy * 10;
        const by = h.y + h.dy * 30 + Math.sin(a) * 6 + h.dx * 6;
        if (this.sea(bx, by) && this.sea(bx - 5, by) && this.sea(bx + 5, by)) {
          const bob = Math.round(Math.sin(T * 2.4 + seed));
          this.pool.img(this.tex.boat).setScale(1).setFlipX(Math.sin(a) > 0).setPosition(Math.round(bx), Math.round(by) + 3 + bob);
          if (Math.floor(T * 1.5 + seed) % 3 === 0) {
            g.fillStyle(0xf4e6ee, 0.55);
            g.fillRect(Math.round(bx) - 6, Math.round(by) + 4, 2, 1);
            g.fillRect(Math.round(bx) + 5, Math.round(by) + 4, 2, 1);
          }
        }
      }
    }
    this.pool.end();
  }

  destroy(): void {
    this.g.destroy();
    this.c.destroy();
  }
}
