import { describe, expect, it } from 'vitest';
import terms from '../landing/public/terms.html?raw';
import privacy from '../landing/public/privacy.html?raw';
import refunds from '../landing/public/refunds.html?raw';
import ruTerms from '../landing/public/ru/terms.html?raw';
import ruPrivacy from '../landing/public/ru/privacy.html?raw';
import ruRefunds from '../landing/public/ru/refunds.html?raw';

// Static pages in landing/public/ (copied to landing/dist/, served at /terms, /privacy, /refunds and /ru/... by the landing Worker on pixelarrow.app, ADR-0007).
const FILES: Record<string, string> = {
  'terms.html': terms,
  'privacy.html': privacy,
  'refunds.html': refunds,
  'ru/terms.html': ruTerms,
  'ru/privacy.html': ruPrivacy,
  'ru/refunds.html': ruRefunds,
};
const page = (p: string) => FILES[p];
const PAGES = ['terms', 'privacy', 'refunds'];

describe('legal pages', () => {
  it('exist in English and Russian, mobile-ready, linked to each other and to the other language', () => {
    for (const p of PAGES) {
      for (const [file, lang, other] of [[`${p}.html`, 'en', `/ru/${p}`], [`ru/${p}.html`, 'ru', `/${p}`]] as const) {
        const html = page(file);
        expect(html).toContain(`<html lang="${lang}">`);
        expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
        expect(html).toContain('href="/legal.css"');
        expect(html).toContain(`href="${other}"`);
        const prefix = lang === 'ru' ? '/ru' : '';
        for (const q of PAGES) expect(html).toContain(`href="${prefix}/${q}"`);
        // operator details are the owner's, filled in at sign-off; no placeholder may remain
        expect(html).toContain('Vladlen Gladis');
        expect(html).not.toMatch(/\[[A-Z][A-Z /]+\]|class="ph"/);
        for (const m of html.match(/@[a-z0-9-]+\.[a-z]{2,}/gi) ?? []) expect(m).toBe('@pixelarrow.app');
      }
    }
  });

  it('cover what the store and Telegram ask for', () => {
    const privacy = page('privacy.html');
    for (const s of ['Telegram user id', 'username', 'language', 'Purchases', 'How long we keep it', '/delete_my_data', 'privacy@pixelarrow.app']) expect(privacy).toContain(s);
    const terms = page('terms.html');
    for (const s of ['digital goods', 'cannot be cashed out', 'https://telegram.org/tos/stars', '/paysupport']) expect(terms).toContain(s);
    const refunds = page('refunds.html');
    for (const s of ['refundStarPayment', 'taken back', '/paysupport', 'https://telegram.org/tos/stars']) expect(refunds).toContain(s);
    const ru = page('ru/refunds.html');
    for (const s of ['refundStarPayment', 'списываются обратно', '/paysupport']) expect(ru).toContain(s);
    expect(page('ru/privacy.html')).toContain('/delete_my_data');
    expect(page('ru/terms.html')).toContain('не подлежат выводу');
  });
});
