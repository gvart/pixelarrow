import type { UNDO_EN } from './undo.en';

/** Russian twin of undo.en.ts. */
export const UNDO_RU: Record<keyof typeof UNDO_EN, string> = {
  'undo.chip': 'Отмена',
  'undo.tip.battle': 'Отменить последний приказ. Только 3 с; приказ всегда можно отдать заново.',
  'undo.tip.deploy': 'Отменить последнее изменение расстановки (до 10 шагов).',
  'undo.why.none': 'Пока нечего отменять',
  'undo.banner.done': 'Приказ отменён',
  'undo.banner.deploy': 'Изменение отменено',
  'undo.reset.title': 'Сбросить все отряды?',
  'undo.reset.body': 'Все отряды вернутся на исходные места. Шаги отмены будут стёрты.',
  'undo.reset.ok': 'Сбросить всё',
};
