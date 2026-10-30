/**
 * W-76 proposal: the player's open hidden quest steps on this page (src/war/sim/secrets.ts `secret` lines with `to`),
 * by quest: where its next step is and the marker's label. Only his own (his team, and online his `p:<pid>` men); a
 * quest drops out once done. The marker and the minimap dot (./hud/quest.ts mountSecretMarker, ./hud/mapDraw.ts) read it.
 */
import type { WarEvent } from '../types';

export interface SecretStep { quest: string; title: string; x: number; y: number; label: string }
export type SecretSteps = ReadonlyMap<string, SecretStep>;

/** `prev` with events `evs` applied for the player of `team` (playerId null: offline, the team's). */
export function applySecrets(prev: SecretSteps, evs: readonly WarEvent[], team: number, playerId: number | null): SecretSteps {
  let out: Map<string, SecretStep> | null = null;
  for (const e of evs) {
    if (e.kind !== 'secret' || e.team !== team || (playerId !== null && e.owner !== `p:${playerId}`)) continue;
    if (e.what !== 'done' && !e.to) continue;
    out ??= new Map(prev);
    if (e.what === 'done') out.delete(e.quest);
    else out.set(e.quest, { quest: e.quest, title: e.title, ...e.to! });
  }
  return out ?? prev;
}

let steps: SecretSteps = new Map();
/** This page's open steps. */
export const secretSteps = (): SecretSteps => steps;
export function noteSecrets(evs: readonly WarEvent[], team: number, playerId: number | null): void {
  steps = applySecrets(steps, evs, team, playerId);
}
