/**
 * The four starting alliances (docs/WAR.md "Alliances", W-03). The id is the team number inside region rooms; the colour
 * is the team's everywhere (./palette.ts: the world map and the region), as the world art paints it (regions.json).
 */
import type { Alliance, SeasonConfig } from './types';

export const ALLIANCES: readonly Alliance[] = [
  { id: 0, key: 'dodona', name: 'Dodona', home: 'dodona', quadrant: 'NW', specialty: 'iron', color: '#2e6c9c' },
  { id: 1, key: 'skythia', name: 'Skythia', home: 'skythia', quadrant: 'NE', specialty: 'horses', color: '#f0c050' },
  { id: 2, key: 'kyrene', name: 'Kyrene', home: 'kyrene', quadrant: 'SE', specialty: 'copper', color: '#b42c22' },
  { id: 3, key: 'elaia', name: 'Elaia', home: 'elaia', quadrant: 'SW', specialty: 'marble', color: '#7d4f9e' },
];

/** The running war season. Alliance membership is per season (server: war_alliance_members). */
export const WAR_SEASON: SeasonConfig = { id: 1, name: 'First War', travelScale: 1, offExitMsPerTile: 1500, foeRadius: 20, lengthMs: 28 * 24 * 3600_000 };
