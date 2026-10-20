/**
 * Strategic geography for the world screen (docs/WAR.md "Strategic geography": purposes, market towns, trade routes,
 * season score). Keep in step with the doc's tables.
 */
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import type { AllianceId } from '../world/types';
import type { RegionState } from '../net/world';

/** Primary and secondary purpose per region ("Purpose of every region"). */
export const PURPOSE: Record<string, [string, string]> = {
  dodona: ['resource heart (iron, wood, pitch)', 'trade hub (home agora)'],
  skythia: ['breadbasket (grain, horses, hides)', 'trade hub (home agora)'],
  kyrene: ['resource heart (copper, stone)', 'trade hub (home agora)'],
  elaia: ['resource heart (marble, oil)', 'coastal (bay harbour)'],
  'dodona-n': ['buffer', 'coastal'],
  'dodona-w': ['buffer', 'coastal'],
  'dodona-e': ['chokepoint (Teeth ravine)', 'resource heart (iron 1)'],
  'dodona-s': ['chokepoint (Ladon fords)', 'breadbasket (herbs, timber)'],
  'skythia-n': ['buffer', 'coastal'],
  'skythia-e': ['buffer', 'coastal'],
  'skythia-w': ['chokepoint (scree road)', 'resource heart (timber, pitch)'],
  'skythia-s': ['buffer', 'breadbasket'],
  'kyrene-n': ['chokepoint (wadi)', 'resource heart (copper 1)'],
  'kyrene-e': ['resource heart (salt 2)', 'coastal'],
  'kyrene-s': ['resource heart (salt)', 'buffer'],
  'kyrene-w': ['breadbasket (food, flax)', 'chokepoint (east bridgehead)'],
  'elaia-n': ['breadbasket (food, flax, herbs)', 'chokepoint (causeway landfall)'],
  'elaia-w': ['coastal', 'resource heart (pitch)'],
  'elaia-s': ['fortress (stepped cape)', 'buffer'],
  'elaia-e': ['breadbasket (olives, food)', 'chokepoint (west bridgehead)'],
  krios: ['resource heart (iron 2)', 'chokepoint (icy col)'],
  siren: ['resource heart (salt, silver)', 'coastal'],
  ammon: ['resource heart (salt 2, silver)', 'fortress (buttes)'],
  delta: ['resource heart (bog iron, salt)', 'breadbasket (food, flax)'],
  kleisoura: ['chokepoint (the pass)', 'resource heart (tin 2)'],
  stymphalia: ['trade hub (causeway town)', 'chokepoint (causeway)'],
  achelous: ['chokepoint (ford and bridge site)', 'resource heart (tin 2)'],
  ammos: ['trade hub (oasis caravanserai)', 'buffer'],
  moors: ['fortress (granite tors)', 'resource heart (iron 1)'],
  kimmeria: ['fortress (hill fort)', 'breadbasket (horses)'],
  savanna: ['resource heart (copper 1, hides)', 'fortress (kopjes)'],
  bacchae: ['breadbasket (olives, food)', 'resource heart (marble 1)'],
  saddle: ['chokepoint (north ramp)', 'resource heart (iron 1)'],
  erymanthos: ['chokepoint (west ramp)', 'resource heart (timber 3, herbs)'],
  gorge: ['chokepoint (rock bridge)', 'resource heart (copper 1)'],
  canyons: ['chokepoint (canyon maze)', 'resource heart (copper 2)'],
  omphalos: ['sacred (season score)', 'resource heart (silver 3, marble 2)'],
};

/** Market towns: the four home agoras, the four frontier towns and the Great Fair ("Trade routes"). */
export const FRONTIER_TOWNS = ['kleisoura', 'stymphalia', 'achelous', 'ammos'];
export const GATES = ['saddle', 'erymanthos', 'gorge', 'canyons'];
export const MARKET_TOWNS = new Set([...ALLIANCES.map((a) => a.home), ...FRONTIER_TOWNS, 'omphalos']);

export const isChokepoint = (id: string) => (PURPOSE[id] ?? []).some((p) => p.startsWith('chokepoint'));

export interface TradeRoute { name: string; path: string[] }
/** The Sacred Way's arms take one of their "or" branches each (saddle and canyons, canyons and gorge). */
export const TRADE_ROUTES: TradeRoute[] = [
  { name: 'Tin Road', path: ['dodona', 'dodona-e', 'kleisoura', 'skythia-w', 'skythia'] },
  { name: 'Lake Road', path: ['dodona', 'dodona-s', 'stymphalia', 'elaia-n', 'elaia'] },
  { name: 'River Road', path: ['elaia', 'elaia-e', 'achelous', 'kyrene-w', 'kyrene'] },
  { name: 'Desert Road', path: ['skythia', 'skythia-s', 'ammos', 'kyrene-n', 'kyrene'] },
  { name: 'Sacred Way (iron arm)', path: ['dodona', 'dodona-s', 'moors', 'saddle', 'omphalos', 'canyons', 'savanna', 'kyrene-n', 'kyrene'] },
  { name: 'Sacred Way (marble arm)', path: ['skythia', 'skythia-s', 'kimmeria', 'canyons', 'omphalos', 'gorge', 'bacchae', 'elaia-n', 'elaia'] },
];

/**
 * Season score per hour a region yields its owner now ("Season score and victory"): Omphalos 10 while no enemy squad
 * stands there, a frontier town 3, a gate 2, any other claimed neutral 1; homes and entries 0.
 */
export function scoreRate(r: RegionState): number {
  if (r.owner < 0) return 0;
  if (r.id === 'omphalos') return r.live.some((n, i) => n > 0 && i !== r.owner) ? 0 : 10;
  if (FRONTIER_TOWNS.includes(r.id)) return 3;
  if (GATES.includes(r.id)) return 2;
  return worldRegion(r.id)?.role === 'neutral' ? 1 : 0;
}

export interface AllianceScore { id: AllianceId; rate: number; towns: number; frontier: number; omphalos: boolean }

/** Score rate, market towns held and the Omphalos holder per alliance. */
export function seasonStandings(regions: RegionState[]): AllianceScore[] {
  return ALLIANCES.map((a) => {
    const own = regions.filter((r) => r.owner === a.id);
    return {
      id: a.id,
      rate: own.reduce((s, r) => s + scoreRate(r), 0),
      towns: own.filter((r) => MARKET_TOWNS.has(r.id)).length,
      frontier: own.filter((r) => FRONTIER_TOWNS.includes(r.id)).length,
      omphalos: own.some((r) => r.id === 'omphalos'),
    };
  });
}

/**
 * Fog of the world map: troops show in regions the alliance owns, borders or stands in; elsewhere only the owner.
 * Without an alliance nothing is in sight.
 */
export function inSight(id: string, you: AllianceId | null, regions: Map<string, RegionState>, ownSquadsIn: Set<string>): boolean {
  if (you === null) return false;
  if (ownSquadsIn.has(id) || regions.get(id)?.owner === you) return true;
  return (worldRegion(id)?.adj ?? []).some((n) => regions.get(n)?.owner === you);
}
