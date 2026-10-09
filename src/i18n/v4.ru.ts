import type { V4_EN } from './v4.en';

/** Russian twin of v4.en.ts. */
export const V4_RU: Record<keyof typeof V4_EN, string> = {
  'dv.chestTitle': 'Сундук главы {ch} · {n} звёзд',
  'dv.chestItem': 'и редкий предмет снаряжения',
  'dv.chestStars': 'Звёзды главы {ch}',
  'dv.chestHow': 'Нужно ещё {n} звёзд: переиграйте этажи главы на 3 звезды.',
  'dv.overCap': 'Отряд башни на {n} очков выше предела этажа ({cap}): уберите героя в «Отряде».',
  'dv.replay': 'повтор (слава за фарм)',
  'dv.enemyArmy': 'Войско врага · {n}',
};
