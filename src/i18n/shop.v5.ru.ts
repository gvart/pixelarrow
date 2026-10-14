import type { SHOP_V5_EN } from './shop.v5.en';
import type { Entry } from './index';

/** Лавка v5 (SHP-01): дверь на рынок, подсказка с оружейной дуэлей, загрузка, бонус набора драхм. */
export const SHOP_V5_RU: Record<keyof typeof SHOP_V5_EN, Entry> = {
  'shop.v5.tip': 'Облик за драхмы: силы он не добавляет. Снаряжение — из боёв, городских рынков, у торговцев войны и в оружейной дуэлей.',
  'shop.v5.market': 'Рынок',
  'shop.v5.marketSub': 'Торговля с другими игроками: покупайте и продавайте за золото или драхмы.',
  'shop.v5.loading': 'Открываем лавку...',
  'shop.v5.bonus': '+{n}% бонус',
  'shop.v5.xpHow': 'Как набрать опыт',
  // AU-01, signed out (design/ux/accounts-v6.md)
  'auth.gate.title': 'Войдите, чтобы играть онлайн',
  'auth.gate.shop': 'Лавка, пропуск сезона и ваши драхмы хранятся в аккаунте.',
  // AU-20, оплата там, где способа оплаты ещё нет (design/ux/accounts-v6.md)
  'shop.web.legal': 'Драхмы нельзя обменять на деньги.',
  'shop.web.soonTitle': 'Покупка драхм в браузере появится позже.',
  'shop.web.soonBody': 'Telegram Stars работают только внутри Telegram, а оплату для браузера мы ещё настраиваем. Пока наборы драхм продаются в игре в Telegram.',
  'shop.web.soon': 'Скоро',
  'shop.web.soonTip': 'Оплата в браузере пока недоступна. Драхмы можно купить в игре в Telegram.',
};
