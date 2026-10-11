/**
 * The attention budget of the battle HUD (design/gdd/controls.md R10b; CT-07).
 *
 * Doctrines, orders, actives, works and the Then queue all land on one HUD
 * (holism W4), so the HUD shows only what this player has learned and never
 * more than KIND_BUDGET kinds of interactive control at once:
 * - progressive unlock: Feint and Orb appear in the campaign after the
 *   player's 3rd battle, Works once a camp has been pitched; duels and war
 *   show everything (their players finished the campaign tutorial);
 * - live online (realtimeLocked) drops the Then… and "Advance to range" chips;
 * - the kinds on screen: the cards, the order bar, the medallions, the timed
 *   chips (Undo / Then…) and the facing pips. Readouts don't count.
 *
 * Also the two order-bar rules that depend on it: the 5th key (Withdraw or
 * Feint, formations-orders.md R3) and the Raise-the-standard control
 * (abilities.md R5.3).
 *
 * Pure: no Phaser, no scene (ADR-0004).
 */

/** Battles a campaign player has fought before Feint and Orb appear (R10b: "after the 3rd battle"). */
export const FEINT_ORB_AFTER = 3;
/** At most this many kinds of interactive control on screen at once (R10b). */
export const KIND_BUDGET = 4;

/** Where this battle is fought, as the budget sees it. */
export type BattleKind = 'campaign' | 'tutorial' | 'online';

export interface AttentionCtx {
  kind: BattleKind;
  /** Campaign battles fought before this one (SaveData.fought when the battle opened). */
  fought: number;
  /** The player has pitched a field camp. */
  campPitched: boolean;
  /** The battle cannot pause (live duels, ranked raids, war-map attacks; controls.md R10). */
  realtimeLocked: boolean;
}

export interface Unlocks {
  feint: boolean;
  orb: boolean;
  works: boolean;
  /** The Then… chip (CT-04). */
  then: boolean;
  /** The "Advance to range" chip (R3.4). */
  toRange: boolean;
}

/** Which of the gated controls this battle shows. */
export function battleUnlocks(c: AttentionCtx): Unlocks {
  const online = c.kind === 'online';
  const learned = online || (c.kind === 'campaign' && c.fought >= FEINT_ORB_AFTER);
  return {
    feint: learned,
    orb: learned,
    works: online || (c.kind === 'campaign' && c.campPitched),
    then: !c.realtimeLocked && c.kind !== 'tutorial',
    toRange: !c.realtimeLocked,
  };
}

/** The kinds of interactive control the budget counts. */
export type ControlKind = 'cards' | 'orders' | 'medallions' | 'chips' | 'pips';

/**
 * Kept first when over budget: the facing pips the player just opened, the
 * order bar, the cards, then the medallions. The timed chips go first: they are
 * shortcuts, never the only way to do something (A11Y-19).
 */
const PRIORITY: readonly ControlKind[] = ['pips', 'orders', 'cards', 'medallions', 'chips'];

/** The kinds to show of those wanted now: all of them when they fit, else the KIND_BUDGET most important. */
export function visibleKinds(want: readonly ControlKind[]): ControlKind[] {
  return PRIORITY.filter((k) => want.includes(k)).slice(0, KIND_BUDGET);
}

/** What the 5th order key is for the selected group. */
export function fifthKey(s: {
  /** Feint is unlocked in this battle. */
  unlocked: boolean;
  /** Every man of the group may feint (Battle.canFeint). */
  eligible: boolean;
  /** A feint would be obeyed now (Battle.feintReady). */
  ready: boolean;
  /** Seconds until the group may feint again (0 when unknown or none). */
  cdLeftS: number;
  /** Then… is arming: the key queues a step, and a feint cannot be queued. */
  arming: boolean;
  /** The group is feinting now: its key stays Feint, lit. */
  active?: boolean;
}): { key: 'feint' | 'fallback'; cdLeftS: number } {
  if (s.active && s.unlocked && !s.arming) return { key: 'feint', cdLeftS: 0 };
  if (!s.unlocked || !s.eligible || s.arming) return { key: 'fallback', cdLeftS: 0 };
  // cooling down: Withdraw stays at hand (no control is lost), and the key says when Feint is back
  if (!s.ready) return { key: 'fallback', cdLeftS: Math.ceil(Math.max(0, s.cdLeftS)) };
  return { key: 'feint', cdLeftS: 0 };
}

/** The i18n keys raiseState answers with (attention.en.ts). */
export type RaiseWhy = 'attn.std.why.raised' | 'attn.std.why.lost' | 'attn.std.why.routing' | 'attn.std.why.stunned';

/**
 * The Raise-the-standard control: shown in battle to an army that fielded a
 * bearer; usable once per battle by a bearer standing in the fight (mirrors
 * Battle.canRaise, which the sim checks again). Under army break it still
 * restores morale but turns no routers back: a note, not a block.
 */
export function raiseState(s: {
  battle: boolean;
  /** The army fielded a standard bearer this battle. */
  hadBearer: boolean;
  /** The bearer while the standard stands (Battle.standardBearer), else null: it was lost. */
  bearer: { state: string; stun: number } | null;
  raised: boolean;
  /** The side's army has broken (formations-orders.md R6). */
  broken: boolean;
}): { show: boolean; why: RaiseWhy | null; note: 'attn.std.note.broken' | null } {
  if (!s.battle || !s.hadBearer) return { show: false, why: null, note: null };
  const why: RaiseWhy | null = s.raised
    ? 'attn.std.why.raised'
    : !s.bearer
      ? 'attn.std.why.lost'
      : s.bearer.state === 'routing'
        ? 'attn.std.why.routing'
        : s.bearer.state !== 'ready'
          ? 'attn.std.why.lost'
          : s.bearer.stun > 0
            ? 'attn.std.why.stunned'
            : null;
  return { show: true, why, note: why === null && s.broken ? 'attn.std.note.broken' : null };
}

/** Within this many paces a line facing the group counts as "head-on" for the orb warning. */
export const ORB_WARN_PACES = 14;

/**
 * V5-041: the orb is all-round defence and the wrong answer to a frontal line.
 * True when the nearest enemy group within ORB_WARN_PACES stands in a line or
 * a shield wall and faces this group (its facing within about 35 degrees of
 * the bearing to us): the HUD then warns before the player commits to it.
 */
export function orbWarn(me: { x: number; y: number }, foes: readonly { x: number; y: number; fx: number; fy: number; type: string }[]): boolean {
  let best: (typeof foes)[number] | null = null;
  let bestD = ORB_WARN_PACES;
  for (const f of foes) {
    const d = Math.hypot(f.x - me.x, f.y - me.y);
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  if (!best || (best.type !== 'line' && best.type !== 'shieldwall')) return false;
  const d = Math.max(1e-6, bestD);
  const dot = (best.fx * (me.x - best.x) + best.fy * (me.y - best.y)) / (d * (Math.hypot(best.fx, best.fy) || 1));
  return dot >= 0.82;
}
