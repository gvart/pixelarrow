/**
 * What a press on the battlefield lands on (pure, no Phaser), in screen px.
 *
 * A press is resolved twice, because one finger can still become either
 * gesture (src/ui/input/gestures.ts decides which):
 * - `grab`: what a DRAG from here would take hold of. The selected group's
 *   facing knob turns it; its soldiers, slots or placement marker move it.
 *   When both are in reach the closer one wins (a tie goes to the knob).
 * - `tap`: what a TAP here means. First match wins:
 *   1. a floating group tag (a map marker): select its group;
 *   2. the nearest visible man within reach (a horse is a longer target):
 *      own -> select (see tapSelect), enemy -> attack or show who he is;
 *   3. empty ground: the selected group moves there.
 *
 * The scene builds a HitState snapshot from the sim and the camera; this file
 * never reads the scene. ADR-0004 (design/adr/ADR-0004-input-layer.md).
 */
import type { DragKind } from '../dragFormation';

export interface Pt {
  x: number;
  y: number;
}

/** A visible, standing man (dead, fled and hidden foes are left out by the scene). */
export interface HitUnit {
  id: number;
  side: number;
  group: number;
  /** Screen point of his body (about the middle of the sprite). */
  x: number;
  y: number;
  /** A horse or beast: a long target, accepted anywhere on the body. */
  big: boolean;
}

export interface HitState {
  /** The side the player commands. */
  me: number;
  /** The selection can take a formation drag now (a commandable group or soldier is selected). */
  grabbable: boolean;
  /** Screen points of the selected group's body: its soldiers, slots and placement marker. */
  body: Pt[];
  /** Screen point of the selected group's facing knob (the turn handle), or null. */
  knob: Pt | null;
  /** Floating group tags (map markers), in draw order. */
  tags: (Pt & { gid: number })[];
  units: HitUnit[];
  /** Grab radius around the body and the knob (screen px). */
  grabR: number;
  /** Tap radius of a group tag (screen px). */
  tagR: number;
  /** Tap radius of a man (screen px). */
  unitR: number;
}

export type TapHit =
  | { kind: 'tag'; gid: number }
  | { kind: 'own'; unit: number; group: number }
  | { kind: 'enemy'; unit: number; group: number }
  | { kind: 'ground' };

export interface Hit {
  grab: DragKind | null;
  tap: TapHit;
}

const d2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** What a drag from this point would grab: the knob (turn), the body (move) or nothing. */
export function grabAt(s: HitState, p: Pt): DragKind | null {
  if (!s.grabbable) return null;
  let body = Infinity;
  for (const q of s.body) body = Math.min(body, d2(q, p));
  const knob = s.knob ? d2(s.knob, p) : Infinity;
  const r2 = s.grabR * s.grabR;
  if (knob < r2 && knob <= body) return 'turn';
  return body < r2 ? 'move' : null;
}

/** What a tap on this point means. */
export function tapAt(s: HitState, p: Pt): TapHit {
  for (const t of s.tags) if (Math.hypot(t.x - p.x, t.y - p.y) <= s.tagR) return { kind: 'tag', gid: t.gid };
  let best: HitUnit | null = null;
  let bestD = s.unitR;
  for (const u of s.units) {
    // a horse is a long target: a touch anywhere on its body counts
    const d = u.big ? Math.sqrt((u.x - p.x) ** 2 + ((u.y - p.y) * 1.6) ** 2) * 0.7 : Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  if (best) return { kind: best.side === s.me ? 'own' : 'enemy', unit: best.id, group: best.group };
  return { kind: 'ground' };
}

/** A press resolved for both gestures. */
export function hitTest(s: HitState, p: Pt): Hit {
  return { grab: grabAt(s, p), tap: tapAt(s, p) };
}

export interface Selection {
  group: number;
  /** A single soldier picked out of his group (-1: the whole group). */
  unit: number;
}

/**
 * The selection after a tap on one of your own men:
 * - a hero who fights alone: select him;
 * - another man of the selected group: pick him out (Solo);
 * - the picked-out man again: back to the whole group;
 * - a man of another group: select that group.
 */
export function tapSelect(sel: Selection, unit: { id: number; group: number }, individual: boolean): Selection {
  if (individual) return { group: unit.group, unit: unit.id };
  if (sel.group === unit.group && sel.unit !== unit.id) return { group: sel.group, unit: unit.id };
  if (sel.unit === unit.id) return { group: sel.group, unit: -1 };
  return { group: unit.group, unit: -1 };
}
