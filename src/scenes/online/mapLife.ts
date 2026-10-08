/**
 * Life on the parchment war map (src/scenes/online/regionMapView.ts): the
 * sparse animated things drawn over the baked terrain, only around the
 * camera and only out of the fog. Cheap by construction: everything is a
 * function of time (no simulation state), drawn as a few pixels into one
 * Graphics or a small pool of images (the drawing is shared with the
 * offline overland map: src/ui/mapLifeFx.ts).
 *
 * - glints and wave crests on the open sea, surf breaking on the shores,
 * - cloud wisps drifting east with their shadows on the ground,
 * - chimney / altar smoke, waving flags, flickering beacons (Etna too),
 * - merchant ships and galleys plying the naval routes, with a wake,
 *   fishing boats working off the harbours, gulls wheeling over them,
 * - ox carts on the roads, herds grazing in the fields,
 * - a slow warm / cool day tint over everything.
 */
import Phaser from 'phaser';
import { hash2 } from '../../art/pixels';
import type { MapFields } from '../../art/parchmentMap';
import { boatPix } from '../../art/mapProps';
import { ImagePool, cart, cloudTextures, dayTint, drawClouds, flicker, gullAt, herd, lifeTextures, seaShimmer, shipOnLane, smokePuffs, surf, wake, wavingFlag, type LifeLane } from '../../ui/mapLifeFx';

export class MapLife {
  private g: Phaser.GameObjects.Graphics;
  private tintG: Phaser.GameObjects.Graphics;
  private c: Phaser.GameObjects.Container;
  private pool: ImagePool;
  private lanes: LifeLane[] = [];
  private roads: LifeLane[] = [];
  private tex: { merchant: string; galley: string; gull: [string, string]; boat: string };
  private clouds: { cloud: string[]; shade: string[] };

  constructor(
    scene: Phaser.Scene,
    private fields: MapFields,
    private fogged: (x: number, y: number) => boolean,
    prefix: string,
    parent: Phaser.GameObjects.Container,
  ) {
    this.g = scene.add.graphics();
    this.c = scene.add.container(0, 0);
    this.tintG = scene.add.graphics();
    parent.add([this.g, this.c, this.tintG]);
    this.pool = new ImagePool(scene, this.c);
    if (!scene.textures.exists(`${prefix}life_boat`)) scene.textures.addCanvas(`${prefix}life_boat`, boatPix().toCanvas());
    this.tex = { ...lifeTextures(scene, prefix), boat: `${prefix}life_boat` };
    this.clouds = cloudTextures(scene, prefix);
    // every second naval route carries traffic; a third of the roads see a cart
    fields.world.map.edges.forEach((e, i) => {
      if (e.waypoints.length < 2) return;
      const naval = !!e.naval;
      if (naval ? hash2(i, 3, 501) < 0.5 : hash2(i, 3, 505) < 0.65) return;
      const pts = e.waypoints.map(([x, y]) => ({ x, y }));
      let len = 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let k = 0; k < pts.length; k++) {
        if (k) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        x0 = Math.min(x0, pts[k].x);
        y0 = Math.min(y0, pts[k].y);
        x1 = Math.max(x1, pts[k].x);
        y1 = Math.max(y1, pts[k].y);
      }
      const lane: LifeLane = { pts, len, x0, y0, x1, y1, kind: hash2(i, 4, 502) < 0.6 ? 'merchant' : 'galley', speed: naval ? 7 + hash2(i, 5, 503) * 6 : 4 + hash2(i, 5, 503) * 2, phase: hash2(i, 6, 504) };
      (naval ? this.lanes : this.roads).push(lane);
    });
  }

  update(time: number, view: Phaser.Geom.Rectangle, zoom: number): void {
    const g = this.g;
    g.clear();
    this.pool.begin();
    const f = this.fields;
    const k = Math.max(1, Math.round(1.6 / zoom));
    const detail = zoom >= 0.7;
    const vx0 = view.x - 40;
    const vy0 = view.y - 40;
    const vx1 = view.right + 40;
    const vy1 = view.bottom + 40;
    const T = time / 1000;
    // sea: glints and wave crests on a coarse grid, surf on the shores
    seaShimmer(g, vx0, vy0, vx1, vy1, k, T, (x, y) => f.coast(x, y) <= -0.6 && !this.fogged(x, y));
    if (zoom >= 0.45)
      surf(g, vx0, vy0, vx1, vy1, k, T, (x, y) => {
        const c = f.coast(x, y);
        return c < -0.03 && c > -0.4 && !this.fogged(x, y);
      });
    // ships along the naval routes
    for (const l of this.lanes) {
      if (l.x1 < vx0 - 30 || l.x0 > vx1 + 30 || l.y1 < vy0 - 30 || l.y0 > vy1 + 30) continue;
      const p = shipOnLane(l, T);
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1 || this.fogged(p.x, p.y)) continue;
      wake(g, l, p.kk, p.fwd, k);
      const bob = Math.round(Math.sin(T * 2 + l.phase * 9));
      this.pool
        .img(l.kind === 'merchant' ? this.tex.merchant : this.tex.galley)
        .setScale(Math.min(k, 3))
        .setFlipX(p.dir < 0)
        .setPosition(Math.round(p.x), Math.round(p.y) + 3 + bob);
    }
    if (detail) {
      // carts on the roads
      for (const l of this.roads) {
        if (l.x1 < vx0 - 30 || l.x0 > vx1 + 30 || l.y1 < vy0 - 30 || l.y0 > vy1 + 30) continue;
        const p = shipOnLane(l, T);
        if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1 || this.fogged(p.x, p.y) || f.coast(p.x, p.y) < 0.2) continue;
        cart(g, Math.round(p.x), Math.round(p.y), p.dir < 0 ? -1 : 1, 1, T + l.phase * 7);
      }
      for (const b of f.settlementsNear(vx0, vy0, vx1, vy1)) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        if (this.fogged(cx, cy)) continue;
        const sp = b.sprite;
        const etna = /Etna/.test(f.world.info(b.id).name);
        sp.smoke.forEach((s, i) => smokePuffs(g, b.x + s.x, b.y + s.y, T, b.id, i, etna));
        for (const fl of sp.flags) wavingFlag(g, b.x + fl.x, b.y + fl.y, fl.c, T);
        for (const fi of sp.fires) flicker(g, b.x + fi.x, b.y + fi.y, T, b.id);
        // herds in the green fields
        f.fieldsOf(b.id).forEach((fp, i) => {
          if (fp.kind !== 1 || i % 2) return;
          if (fp.x > vx1 || fp.x + fp.w < vx0 || fp.y > vy1 || fp.y + fp.h < vy0) return;
          herd(g, fp.x + fp.w / 2, fp.y + fp.h / 2, fp.w / 2 - 3, fp.h / 2 - 2, T, b.id * 3 + i);
        });
        const h = f.harbourOf(b.id);
        if (h) {
          for (const fi of h.fires) flicker(g, h.x - h.ox + fi.x, h.y - h.oy + fi.y, T, b.id + 7);
          // gulls over the harbour
          for (let q = 0; q < 3; q++) {
            const p = gullAt(T, q, b.id, h.x + h.dx * 26, h.y + h.dy * 26);
            this.pool.img(this.tex.gull[Math.floor(time / 170 + q) % 2]).setScale(1).setFlipX(false).setPosition(p.x, p.y);
          }
          // a fishing boat working off the shore
          const a = T * 0.12 + b.id;
          const bx = h.x + h.dx * 34 + Math.cos(a) * 14 - h.dy * 12;
          const by = h.y + h.dy * 34 + Math.sin(a) * 7 + h.dx * 7;
          if (f.coast(bx, by) < -0.5 && !this.fogged(bx, by)) {
            const bob = Math.round(Math.sin(T * 2.4 + b.id));
            this.pool.img(this.tex.boat).setScale(1).setFlipX(Math.sin(a) > 0).setPosition(Math.round(bx), Math.round(by) + 3 + bob);
            if (Math.floor(T * 1.5 + b.id) % 3 === 0) {
              g.fillStyle(0xf4e6ee, 0.55);
              g.fillRect(Math.round(bx) - 6, Math.round(by) + 4, 2, 1);
              g.fillRect(Math.round(bx) + 5, Math.round(by) + 4, 2, 1);
            }
          }
        }
      }
    }
    if (zoom >= 0.4) drawClouds(this.pool, this.clouds, vx0, vy0, vx1, vy1, Math.min(k, 3), T, (x, y) => !this.fogged(x, y));
    this.pool.end();
    dayTint(this.tintG, view, T);
  }

  destroy(): void {
    this.g.destroy();
    this.tintG.destroy();
    this.c.destroy();
  }
}
