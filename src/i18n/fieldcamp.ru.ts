/** Russian strings of the offline field camp and provisions (keys: fieldcamp.en.ts). */
import type { FIELDCAMP_EN } from './fieldcamp.en';

export const FIELDCAMP_RU: Record<keyof typeof FIELDCAMP_EN, string> = {
  'town.provisions': 'Припасы: {food} еды, {sup} снаряжения',
  'town.buyFood': 'Еда +10',
  'town.buySupplies': 'Снаряж. +10',
  'town.foodTip': 'Пайки: каждый герой съедает один в день похода',
  'town.supplyTip': 'Лес и инструменты для лагеря и кузницы',
  'town.bought10': 'Куплено 10: {what}',
  'town.storesFull': 'Запасы полны',
};
