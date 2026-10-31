/**
 * W-76 proposal: the rival warlords on the world map, live (RegionState.lords: what each domain room last reported).
 *
 *  - a land of his domain no room has reported keeps its pennant (src/data/warWarlords.ts domainOf: he grows there by
 *    age whether anyone looks or not); a land reported empty loses it;
 *  - a raid warned or out rings its land's pennant, until RAID_SHOW_MS after it set out (a room that emptied mid-raid
 *    leaves no ring for ever);
 *  - fallen in any report (backAt still ahead): his hall's pennant only, struck, and when he is back.
 */
import { domainOf, warlord, WARLORDS } from '../../data/warWarlords';
import type { LordWorld, RegionState } from '../net/world';
import type { WarlordMark } from './map';

/** A raid shows this long after it set out (its march and fight are a few minutes). */
export const RAID_SHOW_MS = 4 * 60_000;

const reportsOf = (id: string, regions: readonly RegionState[]) =>
  new Map(regions.flatMap((r) => (r.lords ?? []).filter((l) => l.id === id).map((l) => [r.id, l] as [string, LordWorld])));
const raidLive = (l: LordWorld | undefined, now: number) => !!l?.raid && now < l.raid.at + RAID_SHOW_MS;
const backOf = (reps: Map<string, LordWorld>, now: number) => Math.max(0, ...[...reps.values()].map((l) => l.backAt ?? 0).filter((t) => t > now));

/** Every warlord's pennants. */
export function lordMarks(regions: readonly RegionState[], now: number): WarlordMark[] {
  return WARLORDS.flatMap((w) => {
    const reps = reportsOf(w.id, regions), dom = domainOf(w);
    if (backOf(reps, now)) return [{ id: w.id, region: dom[0], seat: true, tint: w.tint, fallen: true as const }];
    return dom.flatMap((region, i): WarlordMark[] => {
      const l = reps.get(region);
      if (l && l.holds <= 0 && !raidLive(l, now)) return [];
      return [{ id: w.id, region, seat: i === 0, tint: w.tint, ...(l ? { holds: l.holds, men: l.men } : {}), ...(raidLive(l, now) ? { raid: true } : {}) }];
    });
  });
}

/** What his card shows: the lands he holds (reported), places and men there, a live raid, when he is back. */
export function lordInfo(id: string, regions: readonly RegionState[], now: number): { known: boolean; holds: number; men: number; lands: string[]; raid?: { region: string; at: number }; backAt?: number } {
  const w = warlord(id), reps = reportsOf(id, regions), back = backOf(reps, now);
  if (back) return { known: true, holds: 0, men: 0, lands: [], backAt: back };
  const held = (w ? domainOf(w) : []).flatMap((r) => { const l = reps.get(r); return l && l.holds > 0 ? [[r, l] as const] : []; });
  const raid = [...reps].find(([, l]) => raidLive(l, now));
  return {
    known: reps.size > 0, holds: held.reduce((a, [, l]) => a + l.holds, 0), men: held.reduce((a, [, l]) => a + l.men, 0), lands: held.map(([r]) => r),
    ...(raid ? { raid: { region: raid[0], at: raid[1].raid!.at } } : {}),
  };
}

/** Men as a rough count ("~10"): a garrison is a guess from afar. */
export const roughMen = (n: number) => (n <= 0 ? '0' : n < 5 ? 'a few' : `~${Math.round(n / 5) * 5}`);

/** A hall's pennant cloth is this wide in map px at scale 1 (a land's is 3/4 of it). */
export const PENNANT_W = 22;
/** On screen a hall's cloth is at least this wide (CSS px: it reads at fit zoom) and at most this (no clutter up close). */
export const PENNANT_PX: readonly [number, number] = [32, 44];
/** The pennants' scale in map px at camera zoom `k` (screen px per map px): his hall's cloth stays PENNANT_PX wide on screen. */
export const pennantScale = (k: number): number => Math.min(Math.max(PENNANT_W * k, PENNANT_PX[0]), PENNANT_PX[1]) / (PENNANT_W * k);
