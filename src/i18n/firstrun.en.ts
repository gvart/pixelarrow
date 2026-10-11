/**
 * English strings of Boot and the first-run screens (TUT-01; design/ux/screens-campaign.md
 * C-1, C-2): the loading line, the load error with Retry, the Skip link and the three
 * mode cards. Spread into en.ts; ru.ts spreads firstrun.ru.ts (same keys, same {params}).
 * The mode cards are named by the tab bar's own keys (`tab.campaign`, `tab.duels`, `tab.war`).
 */
export const FIRSTRUN_EN = {
  'boot.loading': 'Mustering the hoplites…',
  'boot.error': "Couldn't load.",
  'boot.errorHint': 'Check your connection and try again.',
  'boot.retry': 'Retry',
  'firstrun.skip': 'Skip the tutorial',
  'firstrun.ways': 'Three ways to fight',
  'firstrun.pitch.campaign': 'Offline. Lead your company along the coast, fight bands, raise your heroes.',
  'firstrun.pitch.duels': 'Climb the ladder floor by floor, or fight live opponents in the Arena.',
  'firstrun.pitch.war': 'A shared map for a season: take hexes, join a clan.',
} as const;
