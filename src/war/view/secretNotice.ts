/**
 * world-fill notices: the player's hidden quests (src/war/sim/secrets.ts `secret` events: found, the next step, done)
 * and a chief his men slew (`chiefSlain`), and W-72 (proposal) rival warlords' notes (`warlord`: a raid's warning only to
 * its target team), told through the roster's toasts (./hud/roster/toast.ts, the `info` kind;
 * its look is the toast's). Offline the events are the local sim's; live they come as the `secret` message.
 */
import type { WarEvent } from '../types';
import type { SandboxScene } from './SandboxScene';
import { myTeam } from './side';
import type { Note } from './hud/roster/state';
import { glyph } from './hud/glyph';

/** The key of a warlord's raid warning toast: ../hud/fieldNotes.ts drops it once the raid is over. */
export const raidKey = (warlord: string) => `raid:${warlord}`;

/** The notice of one event for this player, or null. */
export function secretText(e: WarEvent, team: number, playerId: number | null): string | null {
  if (e.kind === 'warlord') return e.team === undefined || e.team === team ? e.text : null;
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
    const rose = ev.some((e) => e.kind === 'warlord' && e.what === 'rise');
    for (const e of ev) {
      if (rose && e.kind === 'warlord' && e.what === 'took') continue; // his places laid with his rise: one notice
      const text = secretText(e, myTeam(), s.sim.playerId);
      if (!text) continue;
      // a raid's warning (W-70): a war icon, the words, the time left counting down in a chip, and "Go there"
      if (e.kind === 'warlord' && e.what === 'warn' && e.in) {
        const { x, y } = e;
        note({ kind: 'info', icon: glyph('ui:swords', 18), text: text.replace(/ in \d+ s$/, ''), for: e.in * 100, act: { label: 'Go there', run: () => s.focus(x, y) }, key: raidKey(e.warlord) });
      }
      else note({ kind: 'info', text });
    }
  };
}
