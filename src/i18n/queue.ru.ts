import type { QUEUE_EN } from './queue.en';

/** Russian twin of queue.en.ts. */
export const QUEUE_RU: Record<keyof typeof QUEUE_EN, string> = {
  'queue.chip.then': 'Затем…',
  'queue.tip.then': 'Приказ на потом: нажмите «Затем…», затем кнопку приказа. Отряд выполнит его, когда дойдёт.',
  'queue.banner.arm': 'Затем… выберите приказ по прибытии',
  'queue.banner.queued': 'По прибытии: {order}',
  'queue.banner.fired': 'Дошли: {order}',
  'queue.chip.queued': '→ {order}',
  'queue.tip.queued': 'Приказ ждёт, пока отряд дойдёт. Нажмите, чтобы отменить.',
  'queue.banner.cancel': 'Приказ на потом отменён',
  'queue.chip.clear': 'Очистить план',
  'queue.tip.clear': 'Убрать все приказы, данные на паузе.',
  'queue.tip.ghost': 'Убрать приказы этого отряда из плана',
  'queue.banner.staged': 'В плане: {n}. «Играть» отдаст приказы.',
  'queue.banner.issued': 'План отдан',
  'queue.banner.cleared': 'План очищен',
  'queue.banner.removed': 'Приказ убран из плана',
};
