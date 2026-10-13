import type { FIRSTRUN_EN } from './firstrun.en';

/** Russian twin of firstrun.en.ts. */
export const FIRSTRUN_RU: Record<keyof typeof FIRSTRUN_EN, string> = {
  'boot.loading': 'Собираем гоплитов…',
  'boot.error': 'Не удалось загрузить.',
  'boot.errorHint': 'Проверьте связь и попробуйте снова.',
  'boot.retry': 'Повторить',
  'firstrun.skip': 'Пропустить обучение',
  'firstrun.ways': 'Три вида боя',
  'firstrun.pitch.campaign': 'Без сети. Ведите отряд вдоль побережья, бейте банды, растите героев.',
  'firstrun.pitch.duels': 'Поднимайтесь по Башне этаж за этажом или бейтесь с живыми противниками на Арене.',
  'firstrun.pitch.war': 'Общая карта на сезон: захватывайте гексы, вступайте в клан.',
};
