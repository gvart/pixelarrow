import type { SETTINGS_EN } from './settings.en';

/** Russian twin of settings.en.ts. */
export const SETTINGS_RU: Record<keyof typeof SETTINGS_EN, string> = {
  'settings.newCampaignSub': 'С первого дня',
  'settings.sync.local': 'На устройстве',
  'settings.sync.syncing': 'Сохраняю…',
  'settings.sync.synced': 'Сохранено',
  'settings.sync.offline': 'Офлайн',
};
