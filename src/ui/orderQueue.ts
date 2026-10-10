/**
 * Paused staging and the one-step "Then…" queue (design/gdd/controls.md R6, F1; CT-04).
 *
 * Both live on the client only. Neither ever reaches the sim, the server or the
 * lockstep relay as anything but ordinary orders issued at a real tick
 * (ADR-0001):
 * - a staged plan is issued, in order, at the resume tick when Play is pressed,
 *   which is the tick the orders would have had if issued while paused;
 * - a queued "Then…" step is issued as a normal order at the tick its arrival
 *   test (F1) first passes, so a replay of the order log reproduces it.
 *
 * Pure: no Phaser, no scene (ADR-0004); the scene hands in a read-only view of
 * the battle (a Battle satisfies QueueView).
 */
import { TICK_RATE } from '../sim/battle';
import type { Order } from '../sim/types';

/** Seconds the "Then…" chip stays after a move order (controls.md Tuning Knobs). */
export const THEN_CHIP_S = 3;
/** Paces from the move target that count as arrived (F1). */
export const ARRIVE_DIST = 1;
/** Seconds of battle time a group must stand still to count as arrived (F1). */
export const STILL_S = 1.5;
/** Drift (paces) of the group's centre still read as "standing still" (men shuffle in their slots). */
export const STILL_EPS = 0.15;
/** How long the tap-move preview (path line and destination ghost) stays (controls.md R5). */
export const TAP_GHOST_MS = 600;

/** The order keys that can be queued "on arrival" (R6.2): the order bar's five keys. */
export type ThenKey = 'advance' | 'charge' | 'hold' | 'loose' | 'fallback';

/** The ordinary order a queued key issues for group `gid` (Shoot queues "Shoot on"). */
export function thenOrder(gid: number, key: ThenKey): Order {
  return key === 'loose' ? { kind: 'loose', group: gid, on: true } : { kind: 'order', group: gid, order: key };
}

/** What the arrival test reads of the battle (a Battle satisfies it). */
export interface QueueView {
  readonly tick: number;
  readonly groups: readonly { disbanded: boolean; routed: boolean }[];
  activeMembers(gid: number): readonly { x: number; y: number; engaged: boolean }[];
  /** Where the group's men are going: their slots in the group's formation now. */
  groupSlots(gid: number): readonly { x: number; y: number }[];
}

const mean = (pts: readonly { x: number; y: number }[]) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });

interface Queued {
  key: ThenKey;
  /** The group's centre when it last moved, and the tick of that (the "still for" clock). */
  anchor: { x: number; y: number };
  since: number;
}

/**
 * The "Then…" queue: at most one step per group (R6.2 "Depth: one step per
 * group"). Arming again replaces the step; a new move order clears it.
 */
export class ThenQueue {
  private steps = new Map<number, Queued>();

  /** Queue `key` to fire when group `gid` arrives. Replaces any step it had. */
  arm(gid: number, key: ThenKey, v: QueueView): void {
    const mem = v.activeMembers(gid);
    this.steps.set(gid, { key, anchor: mem.length ? mean(mem) : { x: 0, y: 0 }, since: v.tick });
  }

  /** The key queued for `gid`, if any. */
  get(gid: number): ThenKey | null {
    return this.steps.get(gid)?.key ?? null;
  }

  /** Drop `gid`'s queued step (a new move order, an undo, the ✕). Returns whether there was one. */
  clear(gid: number): boolean {
    return this.steps.delete(gid);
  }

  reset(): void {
    this.steps.clear();
  }

  get size(): number {
    return this.steps.size;
  }

  /**
   * The orders due now (F1), in group-id order, removed from the queue:
   * fire = dist(centre, target) ≤ ARRIVE_DIST ∨ stillFor ≥ STILL_S ∨ contact.
   * A group that is gone (disbanded, routed, no one left) loses its step silently.
   * Call once per rendered frame while the battle runs; it updates the
   * "still for" clock from the ticks, so a pause never counts as standing still.
   */
  due(v: QueueView): Order[] {
    const out: Order[] = [];
    for (const gid of [...this.steps.keys()].sort((a, b) => a - b)) {
      const q = this.steps.get(gid)!;
      const g = v.groups[gid];
      const mem = g && !g.disbanded && !g.routed ? v.activeMembers(gid) : [];
      if (!mem.length) {
        this.steps.delete(gid);
        continue;
      }
      const c = mean(mem);
      if (Math.hypot(c.x - q.anchor.x, c.y - q.anchor.y) > STILL_EPS) {
        q.anchor = c;
        q.since = v.tick;
      }
      const slots = v.groupSlots(gid);
      const target = slots.length ? mean(slots) : c;
      const arrived = Math.hypot(c.x - target.x, c.y - target.y) <= ARRIVE_DIST;
      const still = (v.tick - q.since) / TICK_RATE >= STILL_S;
      const contact = mem.some((u) => u.engaged);
      if (arrived || still || contact) {
        this.steps.delete(gid);
        out.push(thenOrder(gid, q.key));
      }
    }
    return out;
  }
}

/** One order held while paused, and the group it concerns (-1: none). */
export interface Staged {
  order: Order;
  group: number;
}

/**
 * Paused staging (R6.1): orders given while paused offline are held here and
 * drawn as ghosts. Play issues them in the order given, at the resume tick.
 */
export class StagedPlan {
  private items: Staged[] = [];

  add(order: Order): void {
    this.items.push({ order, group: 'group' in order ? order.group : -1 });
  }

  /** Remove the newest staged order (Undo while paused). */
  pop(): Staged | null {
    return this.items.pop() ?? null;
  }

  /** Remove every staged order of group `gid` (the ✕ on its ghost). Returns how many went. */
  removeGroup(gid: number): number {
    const n = this.items.length;
    this.items = this.items.filter((s) => s.group !== gid);
    return n - this.items.length;
  }

  /** "Clear plan". */
  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }

  /** Every staged order, in the order given. */
  get orders(): readonly Order[] {
    return this.items.map((s) => s.order);
  }

  /** The newest staged order of `kind` for group `gid` (what its ghost and its key show). */
  last<K extends Order['kind']>(gid: number, kind: K): Extract<Order, { kind: K }> | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      if (s.group === gid && s.order.kind === kind) return s.order as Extract<Order, { kind: K }>;
    }
    return null;
  }

  /** The groups with something staged, in id order. */
  groups(): number[] {
    return [...new Set(this.items.map((s) => s.group).filter((g) => g >= 0))].sort((a, b) => a - b);
  }

  /** Empty the plan and hand back its orders, in the order given, for issue at the resume tick. */
  flush(): Order[] {
    const out = this.items.map((s) => s.order);
    this.items = [];
    return out;
  }
}
