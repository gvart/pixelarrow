import { describe, expect, it } from 'vitest';
import privacy from '../public/privacy.html?raw';
import refunds from '../public/refunds.html?raw';
import terms from '../public/terms.html?raw';
import ruPrivacy from '../public/ru/privacy.html?raw';
import ruRefunds from '../public/ru/refunds.html?raw';
import ruTerms from '../public/ru/terms.html?raw';

// The legal pages moved here from the game's public/ (V6-023); the landing Worker serves them as static assets.
describe('legal pages', () => {
  it('ship in both languages at the same paths', () => {
    for (const [page, text] of [
      [terms, 'Terms of Service'], [privacy, 'Privacy Policy'], [refunds, 'Refund Policy'],
      [ruTerms, 'Условия использования'], [ruRefunds, 'Политика возвратов'], [ruPrivacy, 'Политика конфиденциальности'],
    ]) expect(page).toContain(text);
  });
});
