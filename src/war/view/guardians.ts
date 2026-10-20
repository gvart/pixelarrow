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

  constructor(scene: Phaser.Scene, private iso: IsoMap, private feet: (d: { x: number; y: number; u?: { id: number } }) => { x: number; y: number }, entries: readonly GuardianEntry[] = []) {
    this.g = scene.add.graphics().setDepth(9.06);
    this.fx = new BossFx(scene, entries);
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
    const byId = new Map(units.map((u) => [u.id, u]));
    for (const b of bosses) {
      for (const id of b.hide ?? []) this.hidden.add(id);
      const u = byId.get(b.unit);
      if (!u || b.state === 'slain' || b.state === 'away') continue;
      this.fx.saw(b.unit, u.cls, u.facing);
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

  /** The guardians' moves (./bossFx.ts) and the Warden's mark. */
  draw(bosses: readonly BossSnap[], warden: WardenSnap | undefined, zoom: number, now: number, sinceSnap: number, view: FxCtx['view']): void {
    const g = this.g.clear(), w = Math.max(1, 1.5 / zoom);
    if (warden) {
      // the marked patch, pulsing harder as the strike nears
      const a = 0.25 + 0.35 * (1 - warden.in / 100) + 0.15 * Math.sin(now / 90);
      const p = [[warden.x, warden.y], [warden.x + warden.w, warden.y], [warden.x + warden.w, warden.y + warden.h], [warden.x, warden.y + warden.h]].map(([x, y]) => this.feet({ x, y }));
      g.fillStyle(0xb01818, Math.max(0.1, a)).fillPoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
      g.lineStyle(w * 2, 0xff5040, 0.9).strokePoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
    }
    this.fx.draw(bosses, { feet: this.feet, lift: (u) => this.lifts.get(u) ?? 0, zoom, now, sinceSnap, view });
  }
}

const tileIn = (tiles: readonly number[], x: number, y: number) => {
  for (let i = 0; i < tiles.length; i += 2) if (tiles[i] === x && tiles[i + 1] === y) return true;
  return false;
};
