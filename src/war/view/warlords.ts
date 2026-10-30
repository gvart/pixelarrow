/**
 * W-72 proposal, rival warlords on the region map (src/war/sim/warlords.ts; Snapshot.warlords): each holding as his war
 * banner (a tall dark pole, a swallow-tailed cloth in his colour) with his band's name and its men over it, a band on
 * the march as a smaller banner, and a raid on your ground in warning as a pulsing red ring with its countdown. The
 * lord's own name and title ride on the chiefs' plate (./chiefs.ts) through `lordPlates`.
 */
import Phaser from 'phaser';
import type { LairSnap, WarlordSnap } from '../types';
import { HH, HW } from './iso';
import { myTeam } from './side';

const LABEL: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Inter, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#f4d8c8', stroke: '#140808', strokeThickness: 4, align: 'center' };
const R2 = Math.SQRT2;

/** His lord as a chief plate (name, title, drawn larger and tinted) for ./chiefs.ts. */
export function lordPlates(ws: readonly WarlordSnap[] | undefined): LairSnap[] {
  return (ws ?? []).flatMap((w) => (w.lord >= 0 ? [{
    id: -1, kind: w.kind, x: 0, y: 0, squad: -1, alive: 1, count: 1, state: 'home' as const, aggro: 0, leash: 0, guard: 0, nodes: 0,
    chief: { id: w.id, name: w.name, title: w.title, unit: w.lord, alive: true, scale: w.scale, tint: w.tint },
  }] : []));
}

export class WarlordLayer {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene, private feet: (p: { x: number; y: number }) => { x: number; y: number }, private depthAt: (x: number, y: number) => number) {
    this.g = scene.add.graphics().setDepth(9.06);
  }

  draw(ws: readonly WarlordSnap[] | undefined, zoom: number, now: number): void {
    const g = this.g.clear(), k = 1 / zoom;
    let n = 0;
    const label = (text: string, x: number, y: number, depth: number, color = '#f4d8c8') => {
      const t = this.labels[n] ?? this.labels[this.labels.push(this.scene.add.text(0, 0, '', LABEL).setOrigin(0.5, 1).setResolution(2)) - 1];
      n++;
      if (t.text !== text) t.setText(text);
      t.setColor(color).setScale(k).setPosition(x, y).setDepth(depth).setVisible(true);
    };
    for (const w of ws ?? []) {
      if (w.fallen) continue;
      for (const h of w.holds) {
        const f = this.feet(h), big = h.state === 'held', tall = big ? 110 : 70, top = f.y - tall, d = 10 + this.depthAt(h.x, h.y) / 4096 + 0.26;
        g.fillStyle(0x000000, 0.35).fillEllipse(f.x, f.y, 30, 13);
        g.fillStyle(0x2a1a14, 1).fillRect(f.x - 2.5, top, 5, tall); // pole
        g.fillStyle(0x2a1a14, 1).fillRect(f.x - 9, top - 2, 18, 4); // crossbar
        // swallow-tailed cloth hanging from the crossbar, in his colour with a dark border
        const cw = big ? 30 : 20, ch = big ? 44 : 30;
        g.fillStyle(w.tint, 1).fillPoints([{ x: f.x - cw / 2, y: top }, { x: f.x + cw / 2, y: top }, { x: f.x + cw / 2, y: top + ch }, { x: f.x, y: top + ch * 0.7 }, { x: f.x - cw / 2, y: top + ch }], true);
        g.lineStyle(2, 0x140808, 1).strokePoints([{ x: f.x - cw / 2, y: top }, { x: f.x + cw / 2, y: top }, { x: f.x + cw / 2, y: top + ch }, { x: f.x, y: top + ch * 0.7 }, { x: f.x - cw / 2, y: top + ch }], true);
        g.fillStyle(0x140808, 0.9).fillCircle(f.x, top + ch * 0.35, cw * 0.18); // his mark
        // on a claim point his label goes over the point's own (./neutral.ts: two lines over its 90 px pole)
        const ly = h.place.startsWith('c') ? f.y - 90 - 16 - 58 * k : top - 8;
        label(big ? `${capital(w.band)}: ${w.name}'s men ${h.men}` : `${capital(w.band)} marching`, f.x, ly, d + 0.02, '#ff9a7a');
      }
      // a raid on my ground in warning: a pulsing ring and the countdown
      const r = w.raid;
      if (r && r.team === myTeam()) {
        const f = this.feet(r), p = 0.5 + 0.5 * Math.sin(now / 160), rad = 6;
        g.lineStyle(Math.max(2, 3 * k), 0xff3a2a, 0.55 + 0.4 * p).strokeEllipse(f.x, f.y, 2 * rad * HW * R2 * (0.9 + 0.1 * p), 2 * rad * HH * R2 * (0.9 + 0.1 * p));
        label(`${w.name}'s raid in ${Math.ceil(r.in / 10)} s`, f.x, f.y - rad * HH * R2 - 6, 12, '#ff8a6a');
      }
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
