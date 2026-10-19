/**
 * Neutral-region marks (W-12, src/war/sim/mobs.ts), minimal greybox: each lair as a den marker on the ground (bones ring
 * for beasts, a tent and fire for a bandit camp; struck through once cleared), its aggro and leash radii with the `mobs`
 * overlay, and each claim point as a banner on a pole: grey while locked (a guard lair of its zone lives), white when
 * open, a progress bar while a squad channels (red when foes interrupt), the owner's colour once claimed.
 */
import Phaser from 'phaser';
import type { ClaimSnap, LairSnap } from '../types';
import { TEAM_COLOR } from './units';
import { HH, HW } from './iso';

const DEN: Record<LairSnap['kind'], number> = { wolf: 0x9aa0a8, boar: 0x8a6a4a, bear: 0x5a4030, bandit: 0xc09040, jackal: 0xc8a868, ibex: 0xd8d0b8 };
const R2 = Math.SQRT2;

export class NeutralLayer {
  /** The `mobs` overlay: aggro (inner) and leash (outer) rings, guard radius dashed. */
  debug = false;
  private g: Phaser.GameObjects.Graphics;
  private banners: Phaser.GameObjects.Graphics[] = [];

  constructor(private scene: Phaser.Scene, private feet: (p: { x: number; y: number }) => { x: number; y: number }, private depthAt: (x: number, y: number) => number) {
    this.g = scene.add.graphics().setDepth(9.05);
  }

  draw(lairs: LairSnap[], claims: ClaimSnap[], zoom: number): void {
    const g = this.g.clear(), k = 1 / zoom, w = Math.max(1, 1.5 * k);
    for (const l of lairs) {
      const f = this.feet(l), c = DEN[l.kind], cleared = l.state === 'cleared';
      // the den: a dark patch with a ring of bones / stakes
      g.fillStyle(0x201810, cleared ? 0.25 : 0.45).fillEllipse(f.x, f.y, 3 * HW, 3 * HH);
      g.lineStyle(w * 2, c, cleared ? 0.35 : 0.9).strokeEllipse(f.x, f.y, 3 * HW, 3 * HH);
      if (l.kind === 'bandit') {
        g.fillStyle(0x6a5030, cleared ? 0.4 : 1).fillTriangle(f.x - 18, f.y, f.x + 18, f.y, f.x, f.y - 26); // tent
        if (!cleared) g.fillStyle(0xff9030, 0.9).fillCircle(f.x + 26, f.y + 4, 4); // camp fire
      } else for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, x = f.x + Math.cos(a) * HW * 1.1, y = f.y + Math.sin(a) * HH * 1.1;
        g.lineStyle(w * 1.5, 0xe8e0d0, cleared ? 0.3 : 0.8).lineBetween(x - 4, y, x + 4, y - 2); // bones
      }
      if (cleared) g.lineStyle(w * 2, 0x60d060, 0.8).lineBetween(f.x - 20, f.y - 10, f.x + 20, f.y + 10).lineBetween(f.x - 20, f.y + 10, f.x + 20, f.y - 10);
      if (this.debug) {
        g.lineStyle(w, 0xff6040, 0.8).strokeEllipse(f.x, f.y, 2 * l.aggro * HW * R2, 2 * l.aggro * HH * R2);
        g.lineStyle(w, 0xffd040, 0.6).strokeEllipse(f.x, f.y, 2 * l.leash * HW * R2, 2 * l.leash * HH * R2);
        if (l.guard) g.lineStyle(w, 0x80c0ff, 0.5).strokeEllipse(f.x, f.y, 2 * l.guard * HW * R2, 2 * l.guard * HH * R2);
      }
    }
    claims.forEach((c, i) => {
      const b = this.banners[i] ?? this.banners[this.banners.push(this.scene.add.graphics()) - 1];
      const f = this.feet(c), top = f.y - 90;
      b.clear().setDepth(10 + this.depthAt(c.x, c.y) / 4096 + 0.25);
      const cloth = c.state === 'claimed' ? (TEAM_COLOR[c.team] ?? 0xcccccc) : c.state === 'locked' ? 0x707070 : 0xf0f0e0;
      b.fillStyle(0x000000, 0.3).fillEllipse(f.x, f.y, 26, 12);
      b.fillStyle(0x5a4028, 1).fillRect(f.x - 2, top, 4, 90); // pole
      b.fillStyle(cloth, 1).fillTriangle(f.x + 2, top, f.x + 40, top + 12, f.x + 2, top + 26);
      if (c.state === 'locked') b.lineStyle(2, 0x303030, 1).lineBetween(f.x + 8, top + 6, f.x + 26, top + 20);
      if (c.state === 'channel' || c.state === 'contested') {
        const bw = Math.max(48, 48 * k * 0.5), bx = f.x - bw / 2, by = top - 14;
        b.fillStyle(0x101010, 0.85).fillRect(bx, by, bw, 7);
        b.fillStyle(c.state === 'contested' ? 0xff4040 : 0xffe070, 1).fillRect(bx + 1, by + 1, (bw - 2) * (c.state === 'contested' ? 1 : c.progress), 5);
      }
    });
  }
}
