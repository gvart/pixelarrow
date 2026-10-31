/**
 * Short field notices through the roster's toasts (./roster/toast.ts, W-70: an icon and a few plain words):
 *
 *   back up       W-79 early mercy: a man of his knocked down by the wild got up (the sim's `rise` event)
 *   raid beaten   W-72: a warlord's raid on him ended with what it came for still standing (his snapshot's `raiding`
 *                 went out; a `raid` event that felled one of his buildings meanwhile says it was not beaten)
 *   raid over     the raid's warning toast (../secretNotice.ts) ends once the raid is: beaten, lost or called off
 */
import type { Snapshot, WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { raidKey } from '../secretNotice';
import { glyph } from './glyph';
import type { Note, Row } from './roster/state';

/** The notice of a man of `team` getting up (`rows`: the roster's, to name him), else null. */
export function riseNote(e: WarEvent, cur: Snapshot | null, team: number, rows: readonly Row[]): Note | null {
  if (e.kind !== 'rise' || !cur) return null;
  const u = cur.units.find((x) => x.id === e.unit), q = u && cur.squads.find((x) => x.id === u.squad);
  if (!q || q.team !== team) return null;
  const name = rows.find((r) => r.unit?.id === e.unit)?.p.hero.name;
  return { kind: 'info', icon: glyph('power:second_wind', 18), text: `${name ?? 'A man'} is back on his feet` };
}

/** Per warlord: a raid of his on `team` is out, and whether it felled one of `team`'s buildings. */
export type RaidMemo = Map<string, { on: boolean; out: boolean; fell: boolean }>;

/** Raids on `team` that just ended without felling what they came for (the warlords' ids). */
export function raidsBeaten(cur: Snapshot, team: number, memo: RaidMemo, ev: readonly WarEvent[] = []): string[] {
  const out: string[] = [];
  const fell = ev.some((e) => e.kind === 'raid' && e.fell && e.team === team);
  for (const w of cur.warlords ?? []) {
    let m = memo.get(w.id);
    if (!m) memo.set(w.id, (m = { on: false, out: false, fell: false }));
    if (w.raid) m.on = w.raid.team === team; // warned: who it rides for
    if (w.raiding && m.on) m.out = true;
    if (fell && m.out) m.fell = true;
    if (w.raiding) continue;
    if (m.out) {
      if (!m.fell && !w.fallen) out.push(w.id);
      m.on = m.out = m.fell = false;
    }
  }
  return out;
}

/**
 * Raids on `team` that are over (the warlords' ids): warned (in `warned`), and now neither warned nor out, or their
 * lord fell or left the snapshot. Their warning toasts go.
 */
export function raidsOver(cur: Snapshot, team: number, warned: Set<string>): string[] {
  const out: string[] = [], ws = new Map((cur.warlords ?? []).map((w) => [w.id, w]));
  for (const w of ws.values()) if (w.raid?.team === team && !w.fallen) warned.add(w.id);
  for (const id of warned) {
    const w = ws.get(id);
    if (w && !w.fallen && (w.raid?.team === team || w.raiding)) continue;
    warned.delete(id);
    out.push(id);
  }
  return out;
}

export const raidNote = (): Note => ({ kind: 'info', icon: glyph('ui:shield', 18), text: 'Raid beaten' });

/** Chain onto the sim's events and look at its warlords once a second; tell each notice through `note`, end one by `drop`. */
export function fieldNotes(s: SandboxScene, note: (n: Note) => void, rows: () => readonly Row[], drop: (key: string) => void = () => {}): void {
  const memo: RaidMemo = new Map(), warned = new Set<string>();
  let seen: WarEvent[] = [];
  const prev = s.sim.onEvents;
  s.sim.onEvents = (ev) => {
    prev?.(ev);
    seen.push(...ev.filter((e) => e.kind === 'raid'));
    for (const e of ev) {
      const n = riseNote(e, s.sim.cur, myTeam(), rows());
      if (n) note(n);
    }
  };
  setInterval(() => {
    const cur = s.sim.cur;
    if (!cur) return;
    for (const id of raidsOver(cur, myTeam(), warned)) drop(raidKey(id));
    if (raidsBeaten(cur, myTeam(), memo, seen).length) note(raidNote());
    seen = [];
  }, 1000);
}
