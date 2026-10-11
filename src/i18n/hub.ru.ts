import type { HUB_EN } from './hub.en';

/** Russian twin of hub.en.ts. */
export const HUB_RU: Record<keyof typeof HUB_EN, string> = {
  'hub.status.lairs': 'Логова {n}/{total}',
  'hub.status.won': 'День {n} · Тиран повержен',
  'hub.beginFirst': 'Сначала выступите в поход',
};
