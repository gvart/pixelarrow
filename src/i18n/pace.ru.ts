import type { PACE_EN } from './pace.en';

/** Russian twin of pace.en.ts. */
export const PACE_RU: Record<keyof typeof PACE_EN, string> = {
  'pace.slow': 'медленно',
  'pace.tip.speed': 'Скорость боя: {list}. Меняется только темп показа, сам бой тот же.',
  'pace.locked': 'Бой в реальном времени: без паузы и ускорения.',
  'pace.ladder': 'Бой на этом этаже можно ставить на паузу. Закончите его за {m} мин.',
  'pace.left': 'осталось',
  'pace.soon': 'Осталось {m} мин, чтобы закончить этаж. Потом награды не будет.',
  'pace.expired': 'Время вышло: бой засчитан, но без награды.',
  'pace.expiredShort': 'истекло',
  'settings.battleSpeed': 'Скорость боя',
};
