import type { MARKET_EN } from './market.en';

/** Russian for market.en.ts (MKT-01). */
export const MARKET_RU: Record<keyof typeof MARKET_EN, string> = {
  'market.kindTitle': 'Показать',
  'market.curTitle': 'Валюта',
  'market.sortTitle': 'Порядок',
  'market.expiredHint': 'Срок лота истёк: его больше нельзя купить.',
  'market.feeLine': 'Продавцу {gets} (сбор {fee})',
  'market.cancelListing': 'Снять лот',
  'market.cancelListingTitle': 'Снять лот с продажи?',
  'market.listingCancelled': 'Лот снят',
  'market.townTitle': 'В каком городе продать?',
  'market.priceTitle': 'Цена',
  'market.qtyTitle': 'Количество',
  'market.typeTip': 'Нажмите, чтобы ввести число.',
  'market.preset': 'x{n}',
  'market.presetTip': 'Стоимость x{n}',
  'market.keyDel': 'Стереть',
  'market.keyClear': 'Сброс',
  'market.freeSlot': 'Свободное место',
  'market.freeSlotHint': 'Выставьте товар во вкладке «Продать»',
};
