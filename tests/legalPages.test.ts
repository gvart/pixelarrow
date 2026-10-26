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

  it('cover the email account, the game server and the data it keeps, with no Telegram left', () => {
    const privacy = page('privacy.html');
    for (const s of ['email address', 'Cloudflare D1', 'How long we keep it', 'Deleting your account', 'privacy@pixelarrow.app']) expect(privacy).toContain(s);
    const terms = page('terms.html');
    for (const s of ['email address and a password', 'no monetary value', 'cannot be cashed out']) expect(terms).toContain(s);
    expect(page('refunds.html')).toContain('Nothing is for sale');
    expect(page('ru/terms.html')).toContain('не подлежат выводу');
    expect(page('ru/privacy.html')).toContain('Cloudflare D1');
    for (const html of Object.values(FILES)) expect(html).not.toMatch(/telegram|campaign|кампани|stars|\/paysupport|\/delete_my_data/i);
  });
});
