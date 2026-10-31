/**
 * Marks the minimap and the region map (./hud/mapDraw.ts) show fog or not, so a player can find them (playtest
 * 2026-10-31: six minutes to find the guide's bandit camp; Old Grizzle-Back never found):
 *  - every chief alive, at his lair (a slain one drops out; his cleared lair keeps its plain badge once explored);
 *  - the first-hour guide's open target (./hud/guide.ts sets it each frame; null: no guide or nothing to point at).
 */
import type { LairSnap } from '../types';

export interface ChiefMark { x: number; y: number; kind: LairSnap['kind']; name: string; title: string }

export function chiefMarks(lairs: readonly LairSnap[] | undefined): ChiefMark[] {
  const out: ChiefMark[] = [];
  for (const l of lairs ?? []) if (l.chief?.alive && l.state !== 'cleared') out.push({ x: l.x, y: l.y, kind: l.kind, name: l.chief.name, title: l.chief.title });
  return out;
}

export interface GuideMark { x: number; y: number }
let guide: GuideMark | null = null;
export const guideMark = (): GuideMark | null => guide;
export const setGuideMark = (m: GuideMark | null): void => void (guide = m ? { x: m.x, y: m.y } : null);
