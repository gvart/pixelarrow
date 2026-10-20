/**
 * M7d landmark guardians on the map (src/war/sim/bosses.ts; art: public/war/guardians.json, public/war/fx/objects.json).
 * Their sheets are drawn at true size by ./units.ts (manifest scale: Drakon 2.7x a man). This layer adds what the sheet
 * player does not know: where a perched guardian stands (up on the keep roof or a tower top, the building's height over
 * the ground; in flight between them, high over the yard), its clips by what it does (brace on the roof, shoot while it
 * breathes, charge as it crashes), the units of its squads not drawn (the Chimera's goat and serpent share the lion's
 * body), its moves' fx (the breath strips at the guardian's scale, the crash dust, Scylla's strike out of the water,
 * rings for sweeps and stomps, a rock's flight) and the Rim Warden's marked patch.
 */
import Phaser from 'phaser';
import type { BossSnap, BuildingSnap, UnitSnap, WardenSnap } from '../types';
import type { Lift } from './build/buildingLayer';
import { HH, HW, type IsoMap } from './iso';

/** guardians.json fxScale: the breath plays at Drakon's sheet scale (1.5 over a man's 0.55: ~2.7x the strip). */
const FX_SCALE = 1.5 / 0.55;
/** World px per metre (33 px/m, a 1.76 m man is 58 px). */
const PPM = 33;
/** In flight: this high over the ground (px). */
const FLIGHT_PX = 380;
/** A perch on no landmark piece: this high (px). */
const PERCH_PX = 220;

interface Strip { key: string; frames: number; fps: number; ax: number; ay: number; loop: boolean; then?: string }

export class GuardianLayer {
  private g: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private strips = new Map<string, Strip>();
  /** Landmark piece heights (px), by art id. */
  private heights = new Map<string, number>();
  private lifts = new Map<number, number>();
  private states = new Map<number, BossSnap>();
  /** Units of guardian squads not drawn. */
  readonly hidden = new Set<number>();

  constructor(private scene: Phaser.Scene, private iso: IsoMap, private feet: (d: { x: number; y: number; u?: { id: number } }) => { x: number; y: number }) {
    this.g = scene.add.graphics().setDepth(9.06);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const fx = (await (await fetch('war/fx/objects.json')).json()) as { fx: { id: string; file: string; frames: number; fps: number; loop: boolean; frame: { w: number; h: number }; anchor: { x: number; y: number }; then?: string }[] };
      for (const f of fx.fx) {
        const key = `gd-fx-${f.id}`;
        if (!this.scene.textures.exists(key)) {
          const im = new Image();
          await new Promise((ok, fail) => { im.onload = ok; im.onerror = fail; im.src = `war/fx/${f.file}`; });
          this.scene.textures.addSpriteSheet(key, im, { frameWidth: f.frame.w, frameHeight: f.frame.h });
        }
        this.strips.set(f.id, { key, frames: f.frames, fps: f.fps, ax: f.anchor.x / f.frame.w, ay: f.anchor.y / f.frame.h, loop: f.loop, then: f.then });
      }
    } catch (e) {
      console.warn('[guardians] fx', e);
    }
    try {
      const lm = (await (await fetch('war/landmarks/landmarks.json')).json()) as { pieces: { id: string; heightM?: number }[] };
      for (const p of lm.pieces) if (p.heightM) this.heights.set(p.id, Math.round(p.heightM * PPM));
    } catch (e) {
      console.warn('[guardians] landmarks', e);
    }
  }

  /** Each frame, before the units: which guardians stand where (perched over a building, in flight) and who is not drawn. */
  update(bosses: readonly BossSnap[], buildings: readonly BuildingSnap[], units: readonly UnitSnap[]): void {
    this.lifts.clear();
    this.states.clear();
    this.hidden.clear();
    const byId = new Map(units.map((u) => [u.id, u]));
    for (const b of bosses) {
      for (const id of b.hide ?? []) this.hidden.add(id);
      const u = byId.get(b.unit);
      if (!u || b.state === 'slain' || b.state === 'away') continue;
      this.states.set(b.unit, b);
      if (b.state === 'flight') this.lifts.set(b.unit, FLIGHT_PX);
      else if (b.state === 'perch' && b.id !== 'river_god') {
        const tx = Math.floor(u.x), ty = Math.floor(u.y);
        const on = buildings.find((p) => p.art && tileIn(p.tiles, tx, ty));
        this.lifts.set(b.unit, on ? (this.heights.get(on.art!) ?? PERCH_PX) : PERCH_PX);
      }
    }
  }

  /** A perched or flying guardian is drawn up there (./units.ts lift). */
  lift(d: { x: number; y: number; u?: { id: number } }): Lift | null {
    const px = d.u ? this.lifts.get(d.u.id) : undefined;
    if (px === undefined) return null;
    return { x: d.x, y: d.y, z: this.iso.zAt(d.x, d.y), px, depth: 10 + (d.x + d.y + 40) / 4096 + 0.3 };
  }

  /** A guardian's clip by what it does (the Animator override), undefined: the usual pick. */
  clip(u: UnitSnap): readonly string[] | undefined {
    const b = this.states.get(u.id);
    if (!b) return undefined;
    if (b.state === 'flight') return b.phase === 2 ? ['charge', 'walk'] : ['walk'];
    if (b.fx && b.fx.t < 12 && (b.fx.kind === 'breath' || b.fx.kind === 'rock' || b.fx.kind === 'boulder')) return ['shoot', 'attack'];
    if (b.fx && b.fx.t < 8 && (b.fx.kind === 'sweep' || b.fx.kind === 'smash' || b.fx.kind === 'stomp')) return ['attack'];
    if (b.state === 'perch') return ['brace', 'idle'];
    return undefined;
  }

  /** The guardians' moves and the Warden's mark. */
  draw(bosses: readonly BossSnap[], warden: WardenSnap | undefined, zoom: number, now: number, sinceSnap: number): void {
    const g = this.g.clear(), w = Math.max(1, 1.5 / zoom);
    let n = 0;
    if (warden) {
      // the marked patch, pulsing harder as the strike nears
      const a = 0.25 + 0.35 * (1 - warden.in / 100) + 0.15 * Math.sin(now / 90);
      const p = [[warden.x, warden.y], [warden.x + warden.w, warden.y], [warden.x + warden.w, warden.y + warden.h], [warden.x, warden.y + warden.h]].map(([x, y]) => this.feet({ x, y }));
      g.fillStyle(0xb01818, Math.max(0.1, a)).fillPoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
      g.lineStyle(w * 2, 0xff5040, 0.9).strokePoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
    }
    for (const b of bosses) {
      const f = b.fx;
      if (!f) continue;
      const s = (f.t + Math.min(1, sinceSnap / 100)) / 10; // seconds into the move
      const at = this.feet({ x: f.x, y: f.y, u: { id: b.unit } });
      const lift = this.lifts.get(b.unit) ?? 0;
      if (f.kind === 'breath') {
        // the strip of the screen quadrant nearest the cone, at the guardian's scale, from its mouth
        const dx = f.tx - f.x, dy = f.ty - f.y, sx = dx - dy, sy = (dx + dy) / 2, q = sy >= 0 ? 'se' : 'ne';
        const ign = this.strips.get(`breath-${q}-ignite`), loop = this.strips.get(`breath-${q}-loop`);
        const st = s < 0.5 ? ign : loop;
        if (!st) continue;
        const fr = s < 0.5 ? Math.min(st.frames - 1, Math.floor(s * st.fps)) : Math.floor((s - 0.5) * st.fps) % st.frames;
        const k = b.id === 'chimera' ? 0.4 / 0.55 : FX_SCALE;
        const sp = this.sprite(n++, st.key, fr).setOrigin(sx < 0 ? 1 - st.ax : st.ax, st.ay).setFlipX(sx < 0).setScale(k);
        sp.setPosition(at.x, at.y - (lift ? 40 : 10)).setDepth(10 + (f.x + f.y) / 4096 + 0.4).setAlpha(f.t > 16 ? (20 - f.t) / 4 : 1);
      } else if (f.kind === 'crash') {
        const st = this.strips.get('crash-dust');
        if (st) this.sprite(n++, st.key, Math.min(st.frames - 1, Math.floor(s * st.fps))).setOrigin(st.ax, st.ay).setScale(FX_SCALE * 0.8).setPosition(at.x, at.y).setDepth(10 + (f.x + f.y) / 4096 + 0.4).setAlpha(1);
        ring(g, at.x, at.y, f.r, s, 0xe0d0b0, w);
      } else if (f.kind === 'snatch') {
        const st = this.strips.get('scylla-strike'), t = this.feet({ x: f.tx, y: f.ty });
        if (st) this.sprite(n++, st.key, Math.min(st.frames - 1, Math.floor(s * st.fps))).setOrigin(st.ax, st.ay).setScale(1.6).setPosition(t.x, t.y).setDepth(10 + (f.tx + f.ty) / 4096 + 0.4).setAlpha(1);
      } else if (f.kind === 'sweep' || f.kind === 'stomp' || f.kind === 'smash') {
        ring(g, at.x, at.y, f.r, s, f.kind === 'stomp' ? 0xd8b070 : 0xf0e8d8, w);
      } else if (f.kind === 'rock' || f.kind === 'boulder' || f.kind === 'charge') {
        const t = this.feet({ x: f.tx, y: f.ty }), k = Math.min(1, s / 0.6);
        if (f.kind === 'charge') g.lineStyle(w * 4, 0xd8b070, 0.6 * (1 - k)).lineBetween(at.x, at.y, t.x, t.y);
        else {
          const x = at.x + (t.x - at.x) * k, y = at.y - lift + (t.y - at.y + lift) * k - Math.sin(k * Math.PI) * 120;
          if (k < 1) g.fillStyle(0x6a6058, 1).fillCircle(x, y, f.kind === 'boulder' ? 14 : 9);
          else ring(g, t.x, t.y, f.r, s - 0.6, 0xc8b8a0, w);
        }
      }
    }
    for (let i = n; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
  }

  private sprite(i: number, key: string, frame: number): Phaser.GameObjects.Sprite {
    let sp = this.sprites[i];
    if (!sp) this.sprites.push((sp = this.scene.add.sprite(0, 0, key)));
    return sp.setTexture(key, frame).setVisible(true).setFlipX(false);
  }
}

const tileIn = (tiles: readonly number[], x: number, y: number) => {
  for (let i = 0; i < tiles.length; i += 2) if (tiles[i] === x && tiles[i + 1] === y) return true;
  return false;
};
/** A ring of r tiles widening out over its first half second. */
function ring(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, s: number, c: number, w: number): void {
  if (s < 0 || s > 1) return;
  const k = 0.4 + 0.6 * Math.min(1, s * 2);
  g.lineStyle(w * 3, c, 0.8 * (1 - s)).strokeEllipse(x, y, 2 * r * HW * Math.SQRT2 * k, 2 * r * HH * Math.SQRT2 * k);
}
