/**
 * The haptics map (FL-03): which battle event buzzes the phone, and how hard.
 * Telegram's HapticFeedback; off with the Haptics setting (setHaptics).
 *
 * `scene` rows are fired by BattleScene already and are listed here so the
 * whole map reads in one place; `audio` rows fire from battleAudio (hooks.ts)
 * next to their sound. A row never buzzes for both.
 */
import type { JuiceKind } from '../ui/battleFx';

export type Cue = { kind: 'impact'; style: 'light' | 'medium' | 'heavy' } | { kind: 'notify'; style: 'error' | 'success' | 'warning' } | null;

interface HapticRow {
  /** Who fires it. */
  by: 'scene' | 'audio';
  /** When the event is the player's side (their man, group, army). */
  mine: Cue;
  /** When it is the enemy's. */
  theirs: Cue;
}

const light: Cue = { kind: 'impact', style: 'light' };
const medium: Cue = { kind: 'impact', style: 'medium' };
const heavy: Cue = { kind: 'impact', style: 'heavy' };

export const HAPTICS: Record<JuiceKind, HapticRow> = {
  // a man of mine falls: BattleScene 'death' -> notify warning
  kill: { by: 'scene', mine: { kind: 'notify', style: 'warning' }, theirs: null },
  // my hero's ability: BattleScene abilityFx -> heavy
  ability: { by: 'scene', mine: heavy, theirs: null },
  // a charge lands on or from one of my groups
  impact: { by: 'audio', mine: medium, theirs: null },
  // a charge breaks on stakes: mine broke theirs, or theirs broke mine
  stakes: { by: 'audio', mine: medium, theirs: medium },
  standard: { by: 'audio', mine: { kind: 'notify', style: 'warning' }, theirs: light },
  // my group routs: BattleScene 'rout' -> notify error
  rout: { by: 'scene', mine: { kind: 'notify', style: 'error' }, theirs: null },
  // the enemy army breaks (mine breaking is already the rout's error buzz)
  armyBreak: { by: 'audio', mine: null, theirs: { kind: 'notify', style: 'success' } },
};

/** The same kind buzzes at most this often (real ms): a 20-man charge is one buzz. */
export const HAPTIC_GAP_MS = 300;

/** The cue battleAudio should fire for this event, or null (scene rows, nothing for this side). */
export function hapticCue(kind: JuiceKind, mine: boolean): Cue {
  const row = HAPTICS[kind];
  return row.by === 'audio' ? (mine ? row.mine : row.theirs) : null;
}
