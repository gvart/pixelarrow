import type { MERCHANT_EN } from './merchant.en';

/** Russian twin of merchant.en.ts. */
export const MERCHANT_RU: Record<keyof typeof MERCHANT_EN, string> = {
  'shop.mapMerchants': 'Припасы продают торговцы на карте войны, в каждом городе и в факториях: откройте город и нажмите «Торговец».',
  'wallet.kind.merchant': 'Торговец',
};
