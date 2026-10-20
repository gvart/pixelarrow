/**
 * Season score and victory (docs/WAR.md "Season score and victory"), shared by the server (WarWorldDO accrues it) and
 * the world screen. A region yields its owner, per hour: Omphalos 10 while no enemy squad stands on the plateau, a
 * frontier town 3, a gate 2, any other claimed neutral 1; homes and entries nothing. Hegemony: one alliance holds
 * Omphalos and HEGEMONY.towns of the four frontier towns for HEGEMONY.ms, and the season ends early.
 */
import { ALLIANCES } from './alliances';
import { worldRegion } from './graph';
import type { AllianceId } from './types';

export const OMPHALOS = 'omphalos';
/** The four frontier market towns (Kleisoura toll fort, Stymphalia causeway town, Achelous bridge town, Ammos caravanserai). */
export const FRONTIER_TOWNS: readonly string[] = ['kleisoura', 'stymphalia', 'achelous', 'ammos'];
/** The four gates to the plateau. */
export const GATES: readonly string[] = ['saddle', 'erymanthos', 'gorge', 'canyons'];
/** Regions whose purpose is a chokepoint (pass, ford, bridge, causeway, ramp; "Purpose of every region"). */
export const CHOKEPOINTS: ReadonlySet<string> = new Set([
  'dodona-e', 'dodona-s', 'skythia-w', 'kyrene-n', 'kyrene-w', 'elaia-n', 'elaia-e', 'krios',
  'kleisoura', 'stymphalia', 'achelous', 'saddle', 'erymanthos', 'gorge', 'canyons',
]);

/** Score per hour by what the region is. */
export const SCORE = { omphalos: 10, town: 3, gate: 2, neutral: 1 } as const;
export const HEGEMONY = { towns: 3, ms: 24 * 3600_000 } as const;
export const HOUR_MS = 3600_000;

/** What the score reads of a region (RegionState fits). */
export interface ScoredRegion { id: string; owner: number; live: number[] }

/** Score per hour the region yields its owner now. */
export function scoreRate(r: ScoredRegion): number {
  if (r.owner < 0) return 0;
  if (r.id === OMPHALOS) return r.live.some((n, i) => n > 0 && i !== r.owner) ? 0 : SCORE.omphalos;
  if (FRONTIER_TOWNS.includes(r.id)) return SCORE.town;
  if (GATES.includes(r.id)) return SCORE.gate;
  return worldRegion(r.id)?.role === 'neutral' ? SCORE.neutral : 0;
}

/** Score per hour per alliance. */
export function allianceRates(regions: Iterable<ScoredRegion>): number[] {
  const out = ALLIANCES.map(() => 0);
  for (const r of regions) if (r.owner >= 0 && r.owner < out.length) out[r.owner] += scoreRate(r);
  return out;
}

/** The alliance holding Omphalos and HEGEMONY.towns frontier towns, if one does. */
export function hegemon(regions: Iterable<ScoredRegion>): AllianceId | null {
  let centre = -1;
  const towns = ALLIANCES.map(() => 0);
  for (const r of regions) {
    if (r.id === OMPHALOS) centre = r.owner;
    else if (FRONTIER_TOWNS.includes(r.id) && r.owner >= 0) towns[r.owner]++;
  }
  return centre >= 0 && towns[centre] >= HEGEMONY.towns ? (centre as AllianceId) : null;
}
