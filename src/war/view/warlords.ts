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

/** The HUD's 13px label on a dark plate (as the chiefs' plates, ./chiefs.ts), over the fog: his holdings are no secret. */
const LABEL: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Inter, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#f4d8c8', backgroundColor: '#1b1612e0', padding: { x: 6, y: 3 }, align: 'center' };
/** Labels sit over the fog (./fog.ts FOG_DEPTH) with the chiefs' plates. */
const PLATE_DEPTH = 11.42;
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
  /** The plates' borders, over the fog with them. */
  private top: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene, private feet: (p: { x: number; y: number }) => { x: number; y: number }) {
    this.g = scene.add.graphics().setDepth(9.06);
    this.top = scene.add.graphics().setDepth(PLATE_DEPTH + 0.001);
  }

  draw(ws: readonly WarlordSnap[] | undefined, zoom: number, now: number): void {
    const g = this.g.clear(), edges = this.top.clear(), k = 1 / zoom;
    let n = 0;
    const label = (text: string, x: number, y: number, color = '#f4d8c8', border = 0) => {
      const t = this.labels[n] ?? this.labels[this.labels.push(this.scene.add.text(0, 0, '', LABEL).setOrigin(0.5, 1).setResolution(2)) - 1];
      n++;
      if (t.text !== text) t.setText(text);
      t.setColor(color).setScale(k).setPosition(Math.round(x), Math.round(y)).setDepth(PLATE_DEPTH).setVisible(true);
      if (border) {
        const b = t.getBounds();
        edges.lineStyle(1.5 * k, border, 0.95).strokeRect(b.x, b.y, b.width, b.height);
      }
    };
    for (const w of ws ?? []) {
      if (w.fallen) continue;
      for (const h of w.holds) {
        const f = this.feet(h), big = h.state === 'held', tall = big ? 110 : 70, top = f.y - tall;
        g.fillStyle(0x000000, 0.35).fillEllipse(f.x, f.y, 30, 13);
        g.fillStyle(0x2a1a14, 1).fillRect(f.x - 2.5, top, 5, tall); // pole
        g.fillStyle(0x2a1a14, 1).fillRect(f.x - 9, top - 2, 18, 4); // crossbar
        // swallow-tailed cloth hanging from the crossbar, in his colour with a dark border
        const cw = big ? 30 : 20, ch = big ? 44 : 30;
        g.fillStyle(w.tint, 1).fillPoints([{ x: f.x - cw / 2, y: top }, { x: f.x + cw / 2, y: top }, { x: f.x + cw / 2, y: top + ch }, { x: f.x, y: top + ch * 0.7 }, { x: f.x - cw / 2, y: top + ch }], true);
        g.lineStyle(2, 0x140808, 1).strokePoints([{ x: f.x - cw / 2, y: top }, { x: f.x + cw / 2, y: top }, { x: f.x + cw / 2, y: top + ch }, { x: f.x, y: top + ch * 0.7 }, { x: f.x - cw / 2, y: top + ch }], true);
        g.fillStyle(0x140808, 0.9).fillCircle(f.x, top + ch * 0.35, cw * 0.18); // his mark
        // a held claim point says who holds it here (./neutral.ts hides its own label), high over the pole: clear of his
        // plate (./chiefs.ts) and of the gold "Claim point" marker under it (./hud/claimCard.ts)
        const point = big && h.place.startsWith('c');
        label(!big ? `${capital(w.band)} marching` : point ? `Held by ${w.name} · ${h.men} men` : `${capital(w.band)}: ${w.name}'s men ${h.men}`, f.x, point ? f.y - 90 - 16 - 90 * k : top - 8, '#ffb39a', w.tint);
      }
      // a raid on my ground in warning: a pulsing ring and the countdown
      const r = w.raid;
      if (r && r.team === myTeam()) {
        const f = this.feet(r), p = 0.5 + 0.5 * Math.sin(now / 160), rad = 6;
        g.lineStyle(Math.max(2, 3 * k), 0xff3a2a, 0.55 + 0.4 * p).strokeEllipse(f.x, f.y, 2 * rad * HW * R2 * (0.9 + 0.1 * p), 2 * rad * HH * R2 * (0.9 + 0.1 * p));
        label(`${w.name}'s raid in ${Math.ceil(r.in / 10)} s`, f.x, f.y - rad * HH * R2 - 6, '#ffd0c0', 0xff3a2a);
      }
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
