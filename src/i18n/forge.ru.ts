import type { FORGE_EN } from './forge.en';
import type { Entry } from './index';

/** Кузнец в городе (EC-01): строка в «Услугах», список вещей и перековка одного свойства. */
export const FORGE_RU: Record<keyof typeof FORGE_EN, Entry> = {
  'forge.smith': 'Кузнец',
  'forge.rowSub': 'Перековать одно свойство · от {n} з',
  'forge.go': 'Выбрать',
  'forge.tip': 'Выберите вещь, затем свойство, которое выпадет заново',
  'forge.none': 'Нет вещей со случайными свойствами. Они есть у необычных и лучше.',
  'forge.intro': 'Кузнец перековывает одно случайное свойство вещи: оно выпадает заново, как при добыче. Дар и остальные свойства остаются.',
  'forge.gold': 'У вас {n} золота',
  'forge.worn': 'Носит {name}',
  'forge.stash': 'На складе',
  'forge.title': 'Перековка',
  'forge.pick': 'Выберите свойство для перековки',
  'forge.powerStays': 'Дар: {name} (остаётся)',
  'forge.act': 'Перековать {n}',
  'forge.poor': 'Нужно {n} золота. У вас {gold}.',
  'forge.was': 'Было: {line}',
  'forge.new': 'Новое',
  'forge.done': 'Перековано: {line}',
  'forge.named': 'Именная вещь сохраняет свои свойства',
};
