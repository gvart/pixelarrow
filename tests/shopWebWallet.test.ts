/**
 * V6-PAY-02 (AU-20, design/ux/accounts-v6.md §11.2): where the platform has no
 * payment provider yet (the web: payments.status() is coming_soon), the wallet's
 * Drachmae packs show no Stars price and their button is off with the reason;
 * Telegram's packs keep their Stars price and blue button.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { packButton } from '../src/ui/econ/shopModel';
import { setLang, t } from '../src/i18n';
import type { PaymentStatus } from '../src/platform/core';

const stars: PaymentStatus = { available: true, provider: 'telegram_stars' };
const web: PaymentStatus = { available: false, reason: 'coming_soon' };

afterEach(() => setLang('en'));

describe('a Drachmae pack button', () => {
  it('in Telegram, is the Stars price and can be tapped', () => {
    setLang('en');
    expect(packButton(stars, 250)).toEqual({ label: '250 Stars', stars: true });
  });

  it("in Telegram with the payment sheet unavailable (offline), is unchanged", () => {
    setLang('en');
    expect(packButton({ available: false, reason: 'offline' }, 250)).toEqual({ label: '250 Stars', stars: true });
  });

  for (const lang of ['en', 'ru'] as const)
    it(`on the web (${lang}), says "coming soon", shows no Stars price and is off with its reason`, () => {
      setLang(lang);
      const b = packButton(web, 250);
      expect(b.stars).toBe(false);
      expect(b.label).toBe(t('shop.web.soon'));
      expect(b.offReason).toBe(t('shop.web.soonTip'));
      expect(`${b.label} ${b.offReason}`).not.toMatch(/250|star|звёзд/i);
    });
});

describe('the AU-20 copy', () => {
  const keys = ['shop.web.soonTitle', 'shop.web.soonBody', 'shop.web.soon', 'shop.web.soonTip'] as const;
  for (const lang of ['en', 'ru'] as const)
    it(`exists in ${lang}, names no price, date or payment provider, and points to Telegram`, () => {
      setLang(lang);
      for (const k of keys) {
        const s = t(k);
        expect(s, k).not.toBe(k);
        // no number (a price or a date), no month, no provider we don't have
        expect(s, k).not.toMatch(/\d|stripe|paypal|apple pay|google pay|card|карт/i);
      }
      expect(t('shop.web.soonTip')).toMatch(/Telegram/);
      expect(t('shop.web.soonBody')).toMatch(/Telegram/);
    });
});
