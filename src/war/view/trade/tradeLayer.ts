/**
 * M6k trade on the region map (docs/WAR.md "Trade"; art ./tradeArt.ts), sorted with the units and buildings as
 * ../siege/siegeLayer.ts:
 *  - carts (handcart, wagon: SiegeSnap with cargo) by facing nearest the sim heading: halted, moving (the wheel strip),
 *    burning (+ the siege fire fx of the art's fx points), wrecked / burnt; a cargo overlay by its main good's kind
 *    (cargoKind) at half or full; the wagon's two mules on the art's team offsets, walking while it rolls. Owner ring,
 *    a halt mark (a foe near) and a capture bar.
 *  - loot piles (PileSnap): gear or goods heap by what fills it, small / medium / large by loads, a decay fade in the last
 *    minute and a salvage bar.
 *  - chests (BuildingSnap chest, finished): closed while it holds something, open when empty.
 *  - porters' loads: a sack on the shoulder of every man with a pack (dot LOD: a pale pip over him).
 *  - safe zones (RegionData.safe): a subtle court outline with its gates and the safe-zone badge at the court's north
 *    corner; ambush rects a faint dashed red.
 *  - the hovered or selected holder: a ring round it.
 */
import Phaser from 'phaser';
import type { BuildingSnap, PileSnap, RegionData, ResourceKind, SiegeSnap, TileRect } from '../../types';
import type { IsoMap } from '../iso';
import type { DrawUnit } from '../simClient';
import { facingOf, type SiegeArt } from '../siege/siegeArt';
import { SPRITE_ZOOM, TEAM_COLOR } from '../units';
import type { Facing, TradeArt, TradeSprite } from './tradeArt';

const IN = 1e-6;
type V = { x: number; y: number; right: number; bottom: number };
export type CargoKind = 'sacks' | 'crates' | 'amphorae' | 'logs' | 'ore' | 'strongbox';
const KIND: Partial<Record<ResourceKind, CargoKind>> = {
  food: 'sacks', flax: 'sacks', herbs: 'sacks', salt: 'sacks', charcoal: 'sacks',
  wood: 'logs', stone: 'ore', marble: 'ore', copper: 'ore', tin: 'ore', iron: 'ore', silver: 'ore',
  oil: 'amphorae', pitch: 'amphorae', coin: 'strongbox',
  bronze: 'crates', hides: 'crates', leather: 'crates', linen: 'crates',
};
/** The overlay a cargo shows: its biggest good's kind (items: crates), or null when empty. */
export function cargoKind(goods: Partial<Record<ResourceKind, number>> | undefined, items = 0): CargoKind | null {
  let best: ResourceKind | null = null, bn = 0;
  for (const [r, n] of Object.entries(goods ?? {}) as [ResourceKind, number][]) if (n > bn) (bn = n), (best = r);
  if (items / 5 > bn / 10) return 'crates';
  return best && bn > 0.05 ? (KIND[best] ?? 'crates') : items ? 'crates' : null;
}
/** A pile's sprite: gear (mostly items) or goods; s / m / l by loads. */
export const pileSprite = (p: PileSnap) => `pile-${p.items / 5 >= p.loads / 2 ? 'gear' : 'goods'}-${p.loads <= 2 ? 's' : p.loads <= 5 ? 'm' : 'l'}`;
const isCart = (e: SiegeSnap) => e.type === 'handcart' || e.type === 'wagon';

export class TradeLayer {
  art: TradeArt | null = null;
  /** The siege art: its fire fx loops (burning carts). */
  siegeArt: () => SiegeArt | null = () => null;
  /** A holder to ring: a cart, pile or building id. */
  ring: { cart?: number; pile?: number; building?: number } | null = null;
  private imgs: Phaser.GameObjects.Image[] = [];
  private ni = 0;
  private g: Phaser.GameObjects.Graphics;
  private zones: Phaser.GameObjects.Graphics;
  private zonesAt = -1;

  constructor(private scene: Phaser.Scene, private iso: IsoMap, private region: RegionData, private depthOf: (x: number, y: number) => number, private feet: (d: DrawUnit) => { x: number; y: number }) {
    this.g = scene.add.graphics().setDepth(11.2);
    this.zones = scene.add.graphics().setDepth(9.02);
  }

  private D(x: number, y: number): number {
    return 10 + this.depthOf(x, y) / 4096 + 0.25;
  }

  private pt(x: number, y: number, z = this.iso.zAt(x, y)): { x: number; y: number } {
    return { x: this.iso.sx(x, y), y: this.iso.sy(x, y, z) };
  }

  private img(texture: string, frame?: number): Phaser.GameObjects.Image {
    let im = this.imgs[this.ni];
    if (!im) this.imgs.push((im = this.scene.add.image(0, 0, texture).setOrigin(0)));
    this.ni++;
    return im.setTexture(texture, frame).setOrigin(0).setScale(1).setAlpha(1).clearTint().setFlipX(false).setBlendMode(Phaser.BlendModes.NORMAL).setVisible(true);
  }

  private put(s: { key: string; tileOrigin: { x: number; y: number } }, tx: number, ty: number, depth: number, z: number, frame?: number): Phaser.GameObjects.Image {
    const p = this.pt(tx, ty, z);
    return this.img(s.key, frame).setPosition(Math.round(p.x - s.tileOrigin.x), Math.round(p.y - s.tileOrigin.y)).setDepth(depth);
  }

  private visible(v: V, x: number, y: number, m = 200): boolean {
    const p = this.pt(x, y);
    return p.x > v.x - m && p.x < v.right + m && p.y > v.y - m && p.y < v.bottom + m * 2;
  }

  draw(sieges: readonly SiegeSnap[], piles: readonly PileSnap[], buildings: readonly BuildingSnap[], units: readonly DrawUnit[], zoom: number, v: V, now: number): void {
    this.ni = 0;
    const g = this.g.clear(), k = 1 / zoom;
    this.drawZones(zoom);
    for (const e of sieges) if (isCart(e) && this.visible(v, e.x, e.y)) this.cart(e, now, k);
    for (const p of piles) if (this.visible(v, p.x, p.y)) this.pile(p, k);
    for (const b of buildings) if (b.type === 'chest' && b.state !== 'destroyed' && this.visible(v, b.x, b.y)) this.chest(b);
    // porters' loads
    for (const d of units) {
      if (!d.u.pack || d.u.state === 'dead') continue;
      const f = this.feet(d);
      if (f.x < v.x - 40 || f.x > v.right + 40 || f.y < v.y - 80 || f.y > v.bottom + 40) continue;
      if (zoom >= SPRITE_ZOOM) {
        const y = f.y - 34;
        g.fillStyle(0x2a1e14, 0.9).fillEllipse(f.x + 6, y + 1, 11, 9);
        g.fillStyle(0xc8a066, 1).fillEllipse(f.x + 6, y, 9, 7);
        g.fillStyle(0x6a4a2a, 1).fillRect(f.x + 5, y - 5, 2, 2);
      } else g.fillStyle(0xe8d0a0, 1).fillCircle(f.x, f.y - 6 * k, 2.5 * k);
    }
    for (let i = this.ni; i < this.imgs.length; i++) this.imgs[i].setVisible(false);
  }

  /** The court outlines (and the badge) once a zoom; ambush rects dashed. */
  private drawZones(zoom: number): void {
    const zs = this.zones;
    if (this.zonesAt !== zoom) {
      this.zonesAt = zoom;
      zs.clear();
      const w = Math.max(1.5, 2 / zoom);
      for (const r of this.region.safe ?? []) {
        this.rect(zs, r, 0xf0e0a0, 0.55, w, 0.06);
        for (const gt of r.gates ?? []) this.rect(zs, gt, 0x9fe08a, 0.9, w * 1.4, 0.18);
      }
      for (const r of this.region.ambush ?? []) this.dashed(zs, r, 0xe05040, 0.45, w);
    }
    if (!this.art?.badge) return;
    for (const r of this.region.safe ?? []) {
      const p = this.pt(r.x + 0.5, r.y + 0.5), s = Math.max(1, 1 / zoom) * 0.75;
      this.img('tr-badge-safe').setScale(s).setPosition(p.x - 16 * s, p.y - 34 * s).setDepth(11.1).setAlpha(0.9);
    }
  }

  private corners(r: TileRect): { x: number; y: number }[] {
    return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => this.pt(x, y, this.iso.zAt(Math.min(x, this.region.w - 1), Math.min(y, this.region.h - 1))));
  }

  private rect(g: Phaser.GameObjects.Graphics, r: TileRect, c: number, a: number, w: number, fill: number): void {
    const pts = this.corners(r);
    g.fillStyle(c, fill).fillPoints(pts, true).lineStyle(w, c, a).strokePoints(pts, true);
  }

  private dashed(g: Phaser.GameObjects.Graphics, r: TileRect, c: number, a: number, w: number): void {
    const pts = this.corners(r);
    g.lineStyle(w, c, a).fillStyle(c, 0.05).fillPoints(pts, true);
    for (let i = 0; i < 4; i++) {
      const p = pts[i], q = pts[(i + 1) % 4], n = Math.max(2, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 14));
      for (let j = 0; j < n; j += 2) g.lineBetween(p.x + ((q.x - p.x) * j) / n, p.y + ((q.y - p.y) * j) / n, p.x + ((q.x - p.x) * (j + 1)) / n, p.y + ((q.y - p.y) * (j + 1)) / n);
    }
  }

  private cart(e: SiegeSnap, now: number, k: number): void {
    const art = this.art, f = facingOf(e.facing) as Facing, z = this.iso.zAt(e.x, e.y), base = this.D(e.x, e.y), g = this.g;
    const j = art?.carts.get(e.type);
    const [w, h] = j?.footprint[f] ?? (f === 'e' || f === 'w' ? [2, 1] : [1, 2]);
    const x0 = e.x - w / 2, y0 = e.y - h / 2;
    const wrecked = e.state === 'destroyed', moving = !wrecked && e.state === 'move' && !e.halted;
    const owner = TEAM_COLOR[e.team] ?? 0xcccccc;
    // the owner's ring on the ground (a selected / hovered cart: white)
    const c = this.pt(e.x, e.y, z), rw = (w + h) * 18;
    const ringed = this.ring?.cart === e.id;
    if (!wrecked) g.lineStyle(Math.max(1.5, 2 * k * 0.5), ringed ? 0xffffff : owner, ringed ? 0.95 : 0.6).strokeEllipse(c.x, c.y, rw * 2, rw);
    if (j && art) {
      const st = wrecked ? (e.burning ? 'burnt' : 'wrecked') : e.burning ? 'burning' : 'halted';
      const strip = moving ? art.strips.get(`tr-${e.type}-${f}-moving`) : undefined;
      const spr = art.sprites.get(j.states[f][st]);
      // mules first when they are behind the wagon on screen (facing w, n)
      const behind = f === 'w' || f === 'n';
      if (j.team && !wrecked && behind) this.mules(j.team[f], x0, y0, z, base - 30 * IN, f, moving, now);
      if (strip) this.put(strip, x0, y0, base, z, Math.floor((now * strip.fps) / 1000) % strip.frames);
      else if (spr) this.put(spr, x0, y0, base, z);
      if (j.team && !wrecked && !behind) this.mules(j.team[f], x0, y0, z, base + 30 * IN, f, moving, now);
      const kind = !wrecked && cargoKind(e.cargo, e.items ?? 0);
      if (kind) {
        const fill = (e.loads ?? 0) / (e.cap || 1), ov = art.sprites.get(j.cargo[f]?.[`${kind}-${fill >= 0.5 ? 'full' : 'half'}`] ?? '');
        if (ov) this.put(ov, x0, y0, base + 10 * IN, z);
      }
      const sa = this.siegeArt();
      const fx = e.burning || wrecked ? j.fx?.[f]?.[wrecked ? (e.burning ? 'burnt' : '') : 'burning'] : undefined;
      if (sa && fx && spr) for (const [i, p] of fx.entries()) this.fx(sa, p.id, Math.round(this.pt(x0, y0, z).x - spr.tileOrigin.x + p.at.x), Math.round(this.pt(x0, y0, z).y - spr.tileOrigin.y + p.at.y), base + (20 + i) * IN, now, e.id * 7 + i, p.alpha ?? 1);
    } else {
      // greybox: a box on the ground in the owner's colour
      const pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => this.pt(x, y, z));
      g.fillStyle(wrecked ? 0x4a4038 : 0x8a6a40, 1).fillPoints(pts.map((p) => ({ x: p.x, y: p.y - 10 })), true);
    }
    if (wrecked) return;
    // halted by a foe near: a red pip; capture under way: a bar over it
    const top = c.y - (e.type === 'wagon' ? 70 : 52);
    if (e.halted) g.fillStyle(0xff5a3c, 1).fillCircle(c.x - 14, top + 4, 3.5).fillStyle(0x1a1010, 1).fillRect(c.x - 15, top + 2, 2, 4);
    if (e.capture) {
      const bw = 40;
      g.fillStyle(0x101010, 0.85).fillRect(c.x - bw / 2, top, bw, 6).fillStyle(0xff9030, 1).fillRect(c.x - bw / 2 + 1, top + 1, (bw - 2) * e.capture, 4);
    }
  }

  private mules(offs: [number, number][], x0: number, y0: number, z: number, depth: number, f: Facing, moving: boolean, now: number): void {
    const m = this.art!.mules, row = m.rows.indexOf(m.facingRow[f]), cols = m.anims.halted.frames + m.anims.walk.frames;
    if (row < 0) return;
    const a = moving ? m.anims.walk : m.anims.halted, fr = a.col + (moving ? Math.floor((now * (a.fps ?? 10)) / 1000) % a.frames : 0);
    const an = m.anchors[m.rows[row]], s = m.scale ?? 1;
    offs.forEach(([ox, oy], i) => {
      const p = this.pt(x0 + ox, y0 + oy, z);
      this.img('tr-mule', row * cols + fr).setScale(s).setPosition(Math.round(p.x - an.x * s), Math.round(p.y - an.y * s)).setDepth(depth + i * IN);
    });
  }

  private fx(a: SiegeArt, id: string, x: number, y: number, depth: number, now: number, seed: number, alpha: number): void {
    const f = a.fx.get(id);
    if (!f) return;
    const frame = f.fps ? Math.floor(((now + seed * 137) * f.fps) / 1000) % f.frames : 0;
    const im = this.img(f.key, frame).setPosition(Math.round(x - f.anchor.x), Math.round(y - f.anchor.y)).setDepth(depth).setAlpha(alpha);
    if (f.blend === 'add') im.setBlendMode(Phaser.BlendModes.ADD);
  }

  private pile(p: PileSnap, k: number): void {
    const tx = Math.floor(p.x), ty = Math.floor(p.y), z = this.iso.zAt(tx + 0.5, ty + 0.5), depth = this.D(tx + 0.5, ty + 0.5) - 0.1 * IN;
    const spr = this.art?.sprites.get(pileSprite(p)) as TradeSprite | undefined, c = this.pt(tx + 0.5, ty + 0.5, z), g = this.g;
    // the last minute: it fades (decay)
    const fade = p.left < 600 ? 0.45 + 0.55 * (p.left / 600) : 1;
    if (spr) this.put(spr, tx, ty, depth, z).setAlpha(fade);
    else g.fillStyle(0x8a7050, fade).fillEllipse(c.x, c.y - 4, 26, 12);
    if (this.ring?.pile === p.id) g.lineStyle(Math.max(1.5, k), 0xffffff, 0.95).strokeEllipse(c.x, c.y, 52, 26);
    if (p.salvage) g.fillStyle(0x101010, 0.85).fillRect(c.x - 16, c.y - 34, 32, 5).fillStyle(0xffd060, 1).fillRect(c.x - 15, c.y - 33, 30 * p.salvage, 3);
  }

  private chest(b: BuildingSnap): void {
    const tx = b.tiles[0], ty = b.tiles[1], z = this.iso.zAt(tx + 0.5, ty + 0.5);
    const empty = !b.items && !Object.values(b.goods ?? {}).some((n) => (n ?? 0) > 0.05);
    const site = b.state === 'foundation' || b.state === 'scaffold';
    const spr = this.art?.sprites.get(empty ? 'chest-open' : 'chest-closed');
    if (spr) {
      const im = this.put(spr, tx, ty, this.D(tx + 0.5, ty + 0.5), z);
      if (site) im.setAlpha(0.35 + 0.6 * b.progress);
    }
    if (this.ring?.building === b.id) {
      const c = this.pt(tx + 0.5, ty + 0.5, z);
      this.g.lineStyle(2, 0xffffff, 0.95).strokeEllipse(c.x, c.y, 50, 25);
    }
  }
}
