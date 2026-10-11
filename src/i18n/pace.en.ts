/**
 * English strings of pause and speed (CT-06, design/gdd/controls.md R10, R11):
 * who may pause, the 0.5× speed, the ladder ticket's countdown and the default
 * battle speed in Settings. Spread into en.ts; ru.ts spreads pace.ru.ts (same
 * keys, same {params}).
 */
export const PACE_EN = {
  'pace.slow': 'slow',
  'pace.tip.speed': 'Battle speed: {list}. Only how fast you watch it; the battle itself is the same.',
  'pace.locked': 'Real time: this battle cannot be paused or sped up.',
  'pace.ladder': 'You can pause this floor. Finish it within {m} min.',
  'pace.left': 'left',
  'pace.soon': '{m} min left to finish this floor. After that it pays nothing.',
  'pace.expired': 'Time is up: this fight still counts, but pays nothing.',
  'pace.expiredShort': 'expired',
  'settings.battleSpeed': 'Battle speed',
} as const;
