/**
 * Undo for battle orders (design/gdd/controls.md R4, CT-03).
 *
 * An undo never rewrites the order log: it is expressed as ordinary orders
 * (the inverse) that go through the same path as any other order, so the sim,
 * the replaying server and the lockstep relay see nothing new (ADR-0001). The
 * inverse is captured from the state just before the order is issued.
 *
 * - In battle only the last order is undoable, for UNDO_S seconds.
 * - In deployment a stack of DEPLOY_UNDO_DEPTH steps (form, preset, assign, work).
 *
 * Pure: no Phaser, no scene, no sim instance (ADR-0004); the scene hands in a
 * read-only view of the groups and units.
 */
import type { FormationType } from '../../sim/formation';
import type { GroupOrder, Order } from '../../sim/types';

/** Seconds the battle Undo chip stays (controls.md Tuning Knobs). */
export const UNDO_S = 3;
/** Steps of deployment undo (controls.md Tuning Knobs). */
export const DEPLOY_UNDO_DEPTH = 10;

/** What undo reads of a group (SimGroup satisfies it). */
interface UndoGroup {
  order: GroupOrder;
  formation: { type: FormationType; cx: number; cy: number; fx: number; fy: number; frontage: number };
  shieldWall: boolean;
  fireAtWill: boolean;
  focus?: number;
  disbanded: boolean;
}

/** The read-only state an inverse is captured from (a Battle satisfies it). */
interface UndoView {
  readonly groups: readonly UndoGroup[];
  readonly units: readonly { group: number }[];
}

/** One undoable step: the inverse orders to issue, newest first, and the groups it concerns. */
export interface UndoStep {
  orders: Order[];
  groups: number[];
  /** When it was recorded (ms, the caller's clock). */
  at: number;
}

/** Restore a group's formation (shape included) and, when the move could have reset it, its order. */
function restoreForm(id: number, g: UndoGroup): Order[] {
  const f = g.formation;
  const out: Order[] = [{ kind: 'form', group: id, cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, frontage: f.frontage, type: f.type }];
  // a `form` with a shape sets the shield wall from the shape; keep a wall raised or lowered by hand
  if (g.shieldWall !== (f.type === 'shieldwall')) out.push({ kind: 'shieldwall', group: id, on: g.shieldWall });
  // a big move resets the order to hold (formations-orders.md R1.2): give it back
  if (g.order === 'advance' || g.order === 'charge' || g.order === 'fallback') out.push({ kind: 'order', group: id, order: g.order });
  return out;
}

/**
 * The orders that undo `o`, captured from `v` just before `o` is issued; null
 * when `o` cannot be undone (abilities, retreat, horn, detach and rejoin, or a
 * group that does not exist).
 */
export function inverseOf(o: Order, v: UndoView): Order[] | null {
  const grp = (id: number) => (id >= 0 && id < v.groups.length && !v.groups[id].disbanded ? v.groups[id] : null);
  switch (o.kind) {
    case 'form':
    case 'preset': {
      const g = grp(o.group);
      return g ? restoreForm(o.group, g) : null;
    }
    case 'face': {
      const g = grp(o.group);
      return g ? [{ kind: 'face', group: o.group, fx: g.formation.fx, fy: g.formation.fy }] : null;
    }
    case 'order': {
      const g = grp(o.group);
      if (!g) return null;
      // a feint cannot be restarted by undo: the group holds instead
      const out: Order[] = [{ kind: 'order', group: o.group, order: g.order === 'feint' ? 'hold' : g.order }];
      // a charge opens an orb into a line; charge and fall back lower the shield wall
      if (o.order === 'charge' && g.formation.type === 'orb') out.push({ kind: 'preset', group: o.group, type: 'orb' });
      if (g.shieldWall && (o.order === 'charge' || o.order === 'fallback' || o.order === 'feint')) out.push({ kind: 'shieldwall', group: o.group, on: true });
      return out;
    }
    case 'loose': {
      const g = grp(o.group);
      return g ? [{ kind: 'loose', group: o.group, on: g.fireAtWill }] : null;
    }
    case 'shieldwall': {
      const g = grp(o.group);
      if (!g) return null;
      const out: Order[] = [{ kind: 'shieldwall', group: o.group, on: g.shieldWall }];
      // raising the wall stops a charge
      if (g.order === 'charge') out.push({ kind: 'order', group: o.group, order: 'charge' });
      return out;
    }
    case 'focus': {
      const g = grp(o.group);
      return g ? [{ kind: 'focus', group: o.group, target: g.focus ?? -1 }] : null;
    }
    case 'assign': {
      const u = v.units[o.unit];
      const from = u ? grp(u.group) : null;
      const to = grp(o.group);
      if (!u || !from || !to || u.group === o.group) return null;
      // move him back, then give both groups their shape and frontage again (assign re-presets them);
      // a group that was empty has no place to restore (the sim would clamp it into the zone)
      const wasEmpty = !v.units.some((x) => x.group === o.group);
      return [{ kind: 'assign', unit: o.unit, group: u.group }, ...restoreForm(u.group, from), ...(wasEmpty ? [] : restoreForm(o.group, to))];
    }
    case 'work':
      return [{ kind: 'unwork', x: o.x, y: o.y }];
    default:
      return null;
  }
}

/** The groups an order concerns (for "the group is gone": the chip disappears). */
export function groupsOf(o: Order, v: UndoView): number[] {
  if (o.kind === 'assign') return [v.units[o.unit]?.group ?? -1, o.group].filter((g) => g >= 0);
  return 'group' in o ? [o.group] : [];
}

/**
 * A bounded history of undo steps. Battle: depth 1 with a UNDO_S lifetime;
 * deployment: depth DEPLOY_UNDO_DEPTH, no lifetime.
 */
export class UndoHistory {
  private steps: UndoStep[] = [];

  constructor(
    readonly depth: number,
    /** ms a step stays undoable; Infinity = until popped. */
    readonly ttl = Infinity,
  ) {}

  /**
   * Record the inverse of an order. `join` merges it into the newest step (one
   * gesture that sends two orders, e.g. tap an enemy: form, then charge);
   * undoing the merged step runs the later order's inverse first.
   */
  push(orders: Order[], groups: number[], now: number, join = false): void {
    const top = this.steps[this.steps.length - 1];
    if (join && top) {
      top.orders = [...orders, ...top.orders];
      for (const g of groups) if (!top.groups.includes(g)) top.groups.push(g);
      top.at = now;
      return;
    }
    this.steps.push({ orders, groups: [...groups], at: now });
    if (this.steps.length > this.depth) this.steps.splice(0, this.steps.length - this.depth);
  }

  /** The newest step still undoable at `now`, if any (an expired one is dropped). */
  peek(now: number): UndoStep | null {
    const top = this.steps[this.steps.length - 1];
    if (!top) return null;
    if (now - top.at >= this.ttl) {
      this.steps.length = 0;
      return null;
    }
    return top;
  }

  /** Remove and return the newest live step. */
  pop(now: number): UndoStep | null {
    const top = this.peek(now);
    if (top) this.steps.pop();
    return top;
  }

  /** ms left on the newest step (Infinity without a lifetime, 0 when none). */
  left(now: number): number {
    const top = this.peek(now);
    return top ? this.ttl - (now - top.at) : 0;
  }

  get size(): number {
    return this.steps.length;
  }

  clear(): void {
    this.steps.length = 0;
  }
}
