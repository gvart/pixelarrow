import type { ARMY_V5_EN } from './army.v5.en';

/** Войско v5 (ARM-01): новые строки. */
export const ARMY_V5_RU: Record<keyof typeof ARMY_V5_EN, string> = {
  'army5.miniTip': 'Показать всю карточку',
  'army5.filterTitle': 'Показать',
  'army5.sortTitle': 'Порядок отряда',
  'army5.pickTitle': 'Кого переучить?',
  'army5.pickHint': 'Коснитесь бойца: откроются его перки, чтобы переучить ступень.',
  'army5.emptyTitle': 'Никого не осталось',
  'army5.emptyHint': 'Добровольцы ждут в городе {town}.',
  'army5.emptyHintAny': 'Добровольцы ждут в городах и деревнях.',
};
