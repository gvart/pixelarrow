/**
 * world-fill local mini-bosses on the map (src/war/sim/mobs.ts chief lairs; src/data/warWild.ts): a chief is his kind's
 * own sheet drawn larger and tinted (the unit layer's pose and tint hooks), with his name over his head (a plate like
 * the guardians' in ./guardians.ts, smaller) while he lives and the camera is close enough to see the men.
 */
import Phaser from 'phaser';
import type { LairSnap } from '../types';
import { BODY } from './units';

type Chief = NonNullable<LairSnap['chief']>;

export class ChiefLayer {
  private live = new Map<number, Chief>();
  private plates: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene) {}

  /** The chiefs alive this frame, by unit. */
  update(lairs: readonly LairSnap[] | undefined): void {
    this.live.clear();
    for (const l of lairs ?? []) if (l.chief?.alive && l.chief.unit >= 0) this.live.set(l.chief.unit, l.chief);
  }

  /** His draw scale over his sheet's (the unit layer's pose), undefined for any other unit. */
  pose(id: number): { sx: number; sy: number; flash: boolean; hold: boolean } | undefined {
    const c = this.live.get(id);
    return c ? { sx: c.scale, sy: c.scale, flash: false, hold: false } : undefined;
  }

  tint(id: number): number | undefined {
    return this.live.get(id)?.tint;
  }

  /** Name plates over the chiefs drawn on screen (`feet`: where a unit's feet are, world px, and his drawn height `top`; null: not drawn). */
  draw(feet: (id: number) => { x: number; y: number; top?: number } | null, zoom: number, show: boolean): void {
    let n = 0;
    if (show) for (const [id, c] of this.live) {
      const f = feet(id);
      if (!f) continue;
      let t = this.plates[n];
      if (!t) {
        t = this.scene.add.text(0, 0, '', { fontFamily: 'serif', fontSize: '12px', color: '#ffe27a', backgroundColor: '#1b1612c8', padding: { x: 4, y: 2 }, align: 'center' })
          .setOrigin(0.5, 1).setDepth(11.4);
        this.plates.push(t);
      }
      n++;
      const text = `${c.name}\n${c.title}`;
      if (t.text !== text) t.setText(text);
      t.setPosition(Math.round(f.x), Math.round(f.y - (f.top !== undefined ? f.top + 6 : BODY * 2.1 * c.scale))).setScale(1 / zoom).setVisible(true);
    }
    for (let i = n; i < this.plates.length; i++) this.plates[i].setVisible(false);
  }
}
