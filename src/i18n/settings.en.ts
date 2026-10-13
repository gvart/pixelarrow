/**
 * English strings of the v5 Settings sheet (DLG-01, design/ux/screens-modes.md
 * M-15): the New-campaign sub line and the cloud-save state chip (MENU-4,
 * MENU-7). Spread into en.ts; ru.ts spreads settings.ru.ts (same keys).
 */
export const SETTINGS_EN = {
  'settings.newCampaignSub': 'From day 1',
  'settings.sync.local': 'This device',
  'settings.sync.syncing': 'Saving…',
  'settings.sync.synced': 'Saved',
  'settings.sync.offline': 'Offline',
  // BTL-01 (A11Y-16, V5-072): the battle's thumb controls on the left
  'settings.leftHand': 'Left-handed battle controls',
  // FL-01 (A11Y-13): no camera shake in battle; no flash rings
  'settings.reduceShake': 'Reduce screen shake',
  'settings.reduceFlash': 'Reduce flashes',
} as const;
