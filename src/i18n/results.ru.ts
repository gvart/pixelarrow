import type { RESULTS_EN } from './results.en';

/** Russian for results.en.ts (RES-01). */
export const RESULTS_RU: Record<keyof typeof RESULTS_EN, string> = {
  'results.tip.lost': 'Ваши потери в бою: погибшие, сражённые и бежавшие. Кто погиб навсегда, видно в списке героев.',
  'results.taken': 'Взято трофеев: {n}',
  'results.leftBehind': 'Добыча осталась на поле',
  'results.hoard': 'Сокровища логова',
  'results.field': 'Добыча с поля',
  'results.arc.title': 'Тиран пал',
  'results.arc.won': 'Кампания выиграна. Отряд, выстоявший до конца:',
  'results.arc.fallen': 'Мы помним: {names}',
  'results.arc.piece': 'Предмет комплекта: {set}',
  'results.arc.noPiece': 'Все предметы комплекта уже ваши.',
  'results.arc.continue': 'Продолжить кампанию',
};
