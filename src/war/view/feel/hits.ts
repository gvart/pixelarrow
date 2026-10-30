/**
 * Ordinary blows felt (pure logic, no Phaser; tests/war/feel.test.ts). The sim's hp drops are read by diffing each
 * snapshot with the last (view only: the sim is untouched) and matched to the nearest foe that struck since, within
 * reach (a melee blow) or to none (a missile, a burn: a flash only). Per hit:
 *
 *   flash   the struck unit drawn white for FLASH ms (any hp drop)
 *   nudge   melee: the struck unit pushed NUDGE px away from its striker and eased back (heavy: HEAVY_NUDGE)
 *   puff    melee: sparks where two armed men meet (metal on metal), dust where a beast strikes or is struck
 *   hold    a heavy blow (a big beast's club, pounce, charge or maul; any chief's or guardian's): striker and struck
 *           frozen on their frames for HOLD ms, a local hit-stop (the rest of the field runs on), and a small shake
 *
 * A 24-man melee must read, not strobe: per unit one flash per FLASH_GAP and one nudge or puff per PUFF_GAP; per
 * snapshot at most MAX_PUFFS new puffs and MAX_HOLDS holds; a unit held is not held again for HOLD_GAP; the shake at
 * most every SHAKE_GAP. The drawing: ./sparks.ts (puffs), ../units.ts (flash, nudge, hold), the sound ../sound/warAudio.ts.
 */
import type { Snapshot, UnitSnap } from '../../types';
import { heavyBlow, isBeast, struckSince } from '../sound/mix';

export type PuffKind = 'spark' | 'dust';
export interface Hit {
  /** The struck unit, its class, and its striker (-1: none found, a missile or a burn). */
  id: number; cls: string; by: number;
  /** Tile point of the struck unit. */
  x: number; y: number;
  /** Screen direction (unit vector) from the striker to the struck (0, 0: none). */
  sx: number; sy: number;
  /** A puff to show (null: throttled, capped or no striker). */
  puff: PuffKind | null;
  heavy: boolean;
  /** This blow freezes striker and struck (a local hit-stop). */
  hold: boolean;
  /** Camera trauma to add (before the view's falloff; 0: none). */
  shake: number;
}

/** How a unit is drawn this frame for its last hit: white or not, pushed (world px), frozen. */
export interface HitPose { flash: boolean; ox: number; oy: number; hold: boolean }

interface Mark { flashAt: number; puffAt: number; holdAt: number; holdUntil: number; nudgeAt: number; sx: number; sy: number; amp: number }

export const FLASH = 70;
/** The flash's strength (alpha of the white copy): full on a man or a beast, softer on a chief or a big guardian so a
 * huge sprite reads as hit, not as a white blank. scale: the sheet's draw scale over a soldier's. */
export const FLASH_ALPHA = 0.75;
export const BIG_FLASH_ALPHA = 0.45;
export function flashAlpha(scale: number, chief: boolean): number {
  return chief || scale >= 1.8 ? BIG_FLASH_ALPHA : FLASH_ALPHA;
}
export const FLASH_GAP = 220;
export const PUFF_GAP = 380;
export const NUDGE = 3;
export const HEAVY_NUDGE = 7;
export const NUDGE_MS = 190;
/** A local hit-stop: under the 80 ms cap of the house rules. */
export const HOLD = 70;
export const HOLD_GAP = 600;
export const MAX_PUFFS = 8;
export const MAX_HOLDS = 3;
export const SHAKE_GAP = 450;
/** Trauma of a heavy blow; a guardian's more. */
export const HEAVY_SHAKE = 0.07;
export const BOSS_SHAKE = 0.1;
/** Tiles (squared) a striker may stand from the man it hit, after the blow's knock (a cyclops: reach 1.7, knock 1.6); a chief's or a guardian's. */
const REACH2 = 4.5 * 4.5;
const BIG_REACH2 = 6 * 6;

/** Units that strike as heavies whatever their kind: chiefs (lairs) and guardians (bosses). */
export function bigUnits(cur: Snapshot, into: Set<number> = new Set()): Set<number> {
  into.clear();
  for (const l of cur.lairs ?? []) if (l.chief?.alive && l.chief.unit >= 0) into.add(l.chief.unit);
  for (const b of cur.bosses ?? []) if (b.state !== 'slain') into.add(b.unit);
  return into;
}

export class HitWatch {
  private tick = -1;
  private hp = new Map<number, number>();
  private marks = new Map<number, Mark>();
  private teams = new Map<number, number>();
  private strikers: UnitSnap[] = [];
  private lastShake = -Infinity;
  readonly big = new Set<number>();
  private bosses = new Set<number>();
  private out: Hit[] = [];
  /** Hits seen (scripts): flashes, puffs and holds. */
  readonly count = { hits: 0, puffs: 0, holds: 0 };

  /** The hits of `cur` since the last snapshot (empty for the same tick again, and on the first one), at view time `now`. */
  diff(cur: Snapshot, now: number): readonly Hit[] {
    const out = this.out;
    out.length = 0;
    if (cur.tick === this.tick) return out;
    const first = this.tick < 0, gap = !first && cur.tick > this.tick ? Math.min(10, cur.tick - this.tick) : 1;
    this.tick = cur.tick;
    this.teams.clear();
    for (const q of cur.squads) this.teams.set(q.id, q.team);
    bigUnits(cur, this.big);
    this.bosses.clear();
    for (const b of cur.bosses ?? []) this.bosses.add(b.unit);
    const st = this.strikers;
    st.length = 0;
    for (const u of cur.units) if (u.state === 'attack' && struckSince(u.swing, gap)) st.push(u);
    let puffs = 0, holds = 0;
    for (const u of cur.units) {
      const was = this.hp.get(u.id);
      this.hp.set(u.id, u.hp);
      if (first || was === undefined || !(u.hp < was - 1e-6)) continue;
      const team = this.teams.get(u.squad);
      // the striker: the nearest foe that struck since, within reach
      let by: UnitSnap | null = null, bd = Infinity;
      for (const s of st) {
        if (s.id === u.id || this.teams.get(s.squad) === team) continue;
        const d = (s.x - u.x) ** 2 + (s.y - u.y) ** 2;
        if (d < bd && d < (this.big.has(s.id) ? BIG_REACH2 : REACH2)) (bd = d), (by = s);
      }
      const m = this.mark(u.id);
      const flash = now - m.flashAt >= FLASH_GAP;
      if (flash) m.flashAt = now;
      const hit: Hit = { id: u.id, cls: u.cls, by: by?.id ?? -1, x: u.x, y: u.y, sx: 0, sy: 0, puff: null, heavy: false, hold: false, shake: 0 };
      if (by) {
        const big = this.big.has(by.id);
        hit.heavy = heavyBlow(by.cls, big);
        // tile direction (dx, dy) on screen: (dx - dy, (dx + dy) / 2)
        const dx = u.x - by.x, dy = u.y - by.y, ex = dx - dy, ey = (dx + dy) / 2, l = Math.hypot(ex, ey);
        if (l > 1e-6) (hit.sx = ex / l), (hit.sy = ey / l);
        if (now - m.puffAt >= PUFF_GAP && (puffs < MAX_PUFFS || hit.heavy)) {
          m.puffAt = now;
          puffs++;
          hit.puff = isBeast(by.cls) || isBeast(u.cls) ? 'dust' : 'spark';
          m.nudgeAt = now;
          m.sx = hit.sx;
          m.sy = hit.sy;
          m.amp = hit.heavy ? HEAVY_NUDGE : NUDGE;
        }
        if (hit.heavy && holds < MAX_HOLDS) {
          const mb = this.mark(by.id);
          if (now - m.holdAt >= HOLD_GAP && now - mb.holdAt >= HOLD_GAP) {
            holds++;
            hit.hold = true;
            m.holdAt = mb.holdAt = now;
            m.holdUntil = mb.holdUntil = now + HOLD;
          }
          if (now - this.lastShake >= SHAKE_GAP) {
            this.lastShake = now;
            hit.shake = this.bosses.has(by.id) ? BOSS_SHAKE : HEAVY_SHAKE;
          }
        }
      }
      if (!flash && !hit.puff && !hit.hold) continue;
      this.count.hits++;
      if (hit.puff) this.count.puffs++;
      if (hit.hold) this.count.holds++;
      out.push(hit);
    }
    // forget the gone and the long quiet
    if (cur.tick % 20 === 0) {
      const live = new Set<number>();
      for (const u of cur.units) live.add(u.id);
      for (const id of this.hp.keys()) if (!live.has(id)) this.hp.delete(id);
      for (const [id, m] of this.marks) if (now - Math.max(m.flashAt, m.puffAt, m.holdAt) > 2000) this.marks.delete(id);
    }
    return out;
  }

  private mark(id: number): Mark {
    let m = this.marks.get(id);
    if (!m) this.marks.set(id, (m = { flashAt: -Infinity, puffAt: -Infinity, holdAt: -Infinity, holdUntil: -Infinity, nudgeAt: -Infinity, sx: 0, sy: 0, amp: 0 }));
    return m;
  }

  /** How unit `id` is drawn at view time `now` for its last hit; undefined: as ever. */
  pose(id: number, now: number): HitPose | undefined {
    const m = this.marks.get(id);
    if (!m) return undefined;
    const flash = now - m.flashAt < FLASH, hold = now < m.holdUntil, t = now - m.nudgeAt;
    let k = 0;
    if (t >= 0 && t < NUDGE_MS) k = t < 50 ? t / 50 : (1 - (t - 50) / (NUDGE_MS - 50)) ** 2; // out fast, eased back
    if (!flash && !hold && k === 0) return undefined;
    return { flash, ox: m.sx * m.amp * k, oy: m.sy * m.amp * k, hold };
  }
}
