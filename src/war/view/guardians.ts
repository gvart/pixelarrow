/**
 * M7d landmark guardians on the map (src/war/sim/bosses.ts; art: public/war/guardians.json, public/war/fx/objects.json).
 * Their sheets are drawn at true size by ./units.ts (manifest scale: Drakon 2.7x a man). This layer adds what the sheet
 * player does not know: where a perched guardian stands (up on the keep roof or a tower top, the building's height over
 * the ground; in flight between them, high over the yard), its clips by what it does (brace on the roof, shoot while it
 * breathes, charge as it crashes), the units of its squads not drawn (the Chimera's goat and serpent share the lion's
 * body), its moves' fx (./bossFx.ts: telegraphs, the breath, impacts, shake, phase set pieces, deaths) and the Rim
 * Warden's marked patch.
 */
import Phaser from 'phaser';
import type { BossSnap, BuildingSnap, GuardianEntry, UnitSnap, WardenSnap } from '../types';
import type { Lift } from './build/buildingLayer';
import { BossFx, type FxCtx } from './bossFx';
import type { IsoMap } from './iso';
import type { DrawnAs } from './units';

/** World px per metre (33 px/m, a 1.76 m man is 58 px). */
const PPM = 33;
/** In flight: this high over the ground (px). */
const FLIGHT_PX = 380;
/** A perch on no landmark piece: this high (px). */
const PERCH_PX = 220;

export class GuardianLayer {
  private g: Phaser.GameObjects.Graphics;
  /** The moves' FX, telegraphs, shake and set pieces. */
  readonly fx: BossFx;
  /** Landmark piece heights (px), by art id. */
  private heights = new Map<string, number>();
  private lifts = new Map<number, number>();
  private states = new Map<number, BossSnap>();
  /** Units of guardian squads not drawn. */
  readonly hidden = new Set<number>();
  /** The guardians' units (./units.ts keeps how they were drawn: `drawn`). */
  readonly watch = new Set<number>();
  drawn: (unit: number) => DrawnAs | undefined = () => undefined;
  /** The guardian the camera follows (clicked), its unit; the boss camera (frames a guardian selected or in a set piece). */
  focus: number | null = null;
  bossCam = true;
  /** The guardian under the pointer (its name plate). */
  private hover: number | null = null;
  private plate: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private iso: IsoMap, private feet: (d: { x: number; y: number; u?: { id: number } }) => { x: number; y: number }, entries: readonly GuardianEntry[] = []) {
    this.g = scene.add.graphics().setDepth(9.06);
    this.fx = new BossFx(scene, entries);
    this.plate = scene.add.text(0, 0, '', { fontFamily: 'serif', fontSize: '14px', color: '#ffe27a', backgroundColor: '#1b1612e0', padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 1).setDepth(11.5).setVisible(false);
    void this.load();
  }

  private async load(): Promise<void> {
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
    this.watch.clear();
    const byId = new Map(units.map((u) => [u.id, u]));
    for (const b of bosses) {
      for (const id of b.hide ?? []) this.hidden.add(id);
      const u = byId.get(b.unit);
      if (!u || b.state === 'slain' || b.state === 'away') continue;
      this.fx.saw(b.unit, u.cls, u.facing);
      this.states.set(b.unit, b);
      this.watch.add(b.unit);
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
    // the breath: the mouth opens on cue (just before it) and stays open while the jet runs
    if (b.fx?.kind === 'breath' && b.fx.t < 20) return ['shoot', 'attack'];
    if (!b.fx && b.state === 'perch' && this.fx.breathIn(u.id, b.id, this.now, 450)) return ['shoot', 'attack'];
    if (b.fx && b.fx.t < 12 && (b.fx.kind === 'breath' || b.fx.kind === 'rock' || b.fx.kind === 'boulder')) return ['shoot', 'attack'];
    if (b.fx && b.fx.t < 8 && (b.fx.kind === 'sweep' || b.fx.kind === 'smash' || b.fx.kind === 'stomp')) return ['attack'];
    if (b.state === 'perch') return ['brace', 'idle'];
    return undefined;
  }

  private now = 0;

  /** A man-sized guardian (the King, a queen) is outlined in gold over everything (./units.ts mark). */
  mark(id: number): number | undefined {
    const b = this.states.get(id);
    return b && (this.drawn(id)?.scale ?? 2) <= 1.05 && b.state !== 'flight' ? 0xffc23d : undefined;
  }

  /** A guardian's silhouette on screen (world px; the whole frame, wings and all), from how it was drawn last. */
  rect(unit: number): { x: number; y: number; w: number; h: number } | null {
    const d = this.drawn(unit);
    if (!d) return null;
    const w = d.fw * d.scale, h = d.fh * d.scale;
    return { x: d.x - d.ox * w, y: d.y - d.oy * h, w, h };
  }

  /** The guardian whose silhouette is under world point p (its inner part), its unit. */
  at(p: { x: number; y: number }): number | null {
    let best: number | null = null, bd = Infinity;
    for (const id of this.watch) {
      const r = this.rect(id);
      if (!r) continue;
      const cx = r.x + r.w / 2, cy = r.y + r.h * 0.55, dx = Math.abs(p.x - cx) / (r.w * 0.32), dy = Math.abs(p.y - cy) / (r.h * 0.4);
      const d = Math.max(dx, dy, 0);
      if (d < 1 && d < bd) (bd = d), (best = id);
    }
    return best;
  }

  /**
   * The boss camera (before the view is taken): framing the guardian followed (clicked) or in a set piece (a phase change,
   * the crash, a death; only when it is on screen): the camera eases to its whole silhouette, the breath's target and some
   * headroom, zooming out to fit (a man-sized guardian followed: in, to 1.25). `manual`: the player pans (the follow lets go).
   */
  camera(cam: Phaser.Cameras.Scene2D.Camera, dt: number, now: number, minZoom: number, manual: boolean): void {
    if (manual) this.focus = null;
    if (this.focus !== null && !this.watch.has(this.focus)) this.focus = null;
    const sp = this.fx.setPiece && now < this.fx.setPiece.until ? this.fx.setPiece : null;
    const unit = this.focus ?? (this.bossCam && sp ? sp.unit : null);
    if (unit === null) return;
    let r = this.rect(unit);
    if (!r && sp && sp.unit === unit) {
      const p = this.feet({ x: sp.x, y: sp.y });
      r = { x: p.x - 300, y: p.y - 420, w: 600, h: 520 };
    }
    if (!r) return;
    const b = this.states.get(unit);
    if (b?.fx && b.fx.kind === 'breath') {
      const t = this.feet({ x: b.fx.tx, y: b.fx.ty }), x0 = Math.min(r.x, t.x - 60), y0 = Math.min(r.y, t.y - 60);
      r = { x: x0, y: y0, w: Math.max(r.x + r.w, t.x + 60) - x0, h: Math.max(r.y + r.h, t.y + 40) - y0 };
    }
    const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2, vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    if (this.focus === null) {
      // a set piece off screen: left alone
      if (r.x > cx + vw / 2 || r.x + r.w < cx - vw / 2 || r.y > cy + vh / 2 || r.y + r.h < cy - vh / 2) return;
    }
    const fit = Math.min(cam.width / (r.w * 1.45), cam.height / (r.h * 1.55));
    // a man-sized guardian followed: in close enough to read him (to 1.25); else only ever out
    const z = Math.max(minZoom, Math.min(this.focus !== null && r.h < 400 ? Math.max(cam.zoom, Math.min(fit, 1.25)) : cam.zoom, fit));
    const k = 1 - Math.exp(-dt / 260), nz = cam.zoom + (z - cam.zoom) * k;
    const tx = r.x + r.w / 2, ty = r.y + r.h / 2 - r.h * 0.1; // a little more room over the head than under the feet
    if (Math.abs(nz - cam.zoom) > 1e-4) cam.setZoom(nz);
    cam.centerOn(cx + (tx - cx) * k, cy + (ty - cy) * k);
  }

  /** The name plate over the guardian under the pointer (or followed). */
  private drawPlate(bosses: readonly BossSnap[], zoom: number): void {
    const id = this.hover ?? this.focus, b = id !== null ? bosses.find((q) => q.unit === id) : undefined, r = id !== null ? this.rect(id) : null;
    if (!b || !r) { this.plate.setVisible(false); return; }
    if (this.plate.text !== b.name) this.plate.setText(b.name);
    this.plate.setPosition(Math.round(r.x + r.w / 2), Math.round(r.y + r.h * 0.04)).setScale(1 / zoom).setVisible(true);
  }

  /** The guardians' moves (./bossFx.ts) and the Warden's mark. */
  draw(bosses: readonly BossSnap[], warden: WardenSnap | undefined, zoom: number, now: number, sinceSnap: number, view: FxCtx['view'], pointer: { x: number; y: number } | null = null): void {
    const g = this.g.clear(), w = Math.max(1, 1.5 / zoom);
    this.now = now;
    this.hover = pointer ? this.at(pointer) : null;
    this.drawPlate(bosses, zoom);
    if (warden) {
      // the marked patch, pulsing harder as the strike nears
      const a = 0.25 + 0.35 * (1 - warden.in / 100) + 0.15 * Math.sin(now / 90);
      const p = [[warden.x, warden.y], [warden.x + warden.w, warden.y], [warden.x + warden.w, warden.y + warden.h], [warden.x, warden.y + warden.h]].map(([x, y]) => this.feet({ x, y }));
      g.fillStyle(0xb01818, Math.max(0.1, a)).fillPoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
      g.lineStyle(w * 2, 0xff5040, 0.9).strokePoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
    }
    this.fx.draw(bosses, { feet: this.feet, lift: (u) => this.lifts.get(u) ?? 0, zoom, now, sinceSnap, view, drawn: this.drawn });
  }
}

const tileIn = (tiles: readonly number[], x: number, y: number) => {
  for (let i = 0; i < tiles.length; i += 2) if (tiles[i] === x && tiles[i + 1] === y) return true;
  return false;
};
