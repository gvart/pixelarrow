/**
 * world-fill notices: the player's hidden quests (src/war/sim/secrets.ts `secret` events: found, the next step, done)
 * and a chief his men slew (`chiefSlain`), told through the roster's toasts (./hud/roster/toast.ts, the `info` kind;
 * its look is the toast's). Offline the events are the local sim's; live they come as the `secret` message.
 */
import type { WarEvent } from '../types';
import type { SandboxScene } from './SandboxScene';
import { myTeam } from './side';

type Note = { kind: 'info'; text: string };

/** The notice of one event for this player, or null. */
export function secretText(e: WarEvent, team: number, playerId: number | null): string | null {
  if (e.kind === 'chiefSlain') return e.by === team ? `${e.name} is slain: his spoils lie where he fell` : null;
  if (e.kind !== 'secret' || e.team !== team || (playerId !== null && e.owner !== `p:${playerId}`)) return null;
  if (e.what === 'found') return `Hidden: ${e.title}. ${e.text}`;
  if (e.what === 'done') {
    const got = Object.entries(e.goods ?? {}).map(([k, n]) => `${n} ${k}`).join(', ');
    return `${e.title}: ${e.text}${got ? ` (${got} at your men)` : ''}`;
  }
  return e.text ? `${e.title}: ${e.text}` : null;
}

/** Chain onto the sim's event listeners and tell each notice through `note`. */
export function secretNotices(s: SandboxScene, note: (n: Note) => void): void {
  const prev = s.sim.onEvents;
  s.sim.onEvents = (ev) => {
    prev?.(ev);
    for (const e of ev) {
      const text = secretText(e, myTeam(), s.sim.playerId);
      if (text) note({ kind: 'info', text });
    }
  };
}
