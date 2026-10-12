/**
 * DLG-02 (audit G12): the online mode's error words come from i18n by the server's code or the
 * HTTP status, never from the server's English text; ru has every gaps key with the same placeholders.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/platform/api';
import { apiErrorText, errorText, explain } from '../src/online/client';
import { GAPS_EN } from '../src/i18n/gaps.en';
import { GAPS_RU } from '../src/i18n/gaps.ru';
import { setLang, t } from '../src/i18n';

describe('online error words (G12)', () => {
  afterEach(() => setLang('en'));
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);

  it('maps a known code in en and ru', () => {
    const e = new ApiError(409, 'marching', 'Your army is on the march');
    setLang('en');
    expect(errorText(e)).toBe('Your army is on the march.');
    setLang('ru');
    expect(errorText(e)).toBe('Ваша армия в походе.');
  });

  it('falls back by status for an unknown code, then to the generic message', () => {
    setLang('ru');
    expect(errorText(new ApiError(409, 'some_new_code', 'Brand new English text'))).toBe(GAPS_RU['gap.err.s409']);
    expect(errorText(new ApiError(418, 'some_new_code', 'I am a teapot'))).toBe(GAPS_RU['gap.err.generic']);
    expect(apiErrorText(502, 'whatever', 'Bad gateway')).toBe(GAPS_RU['gap.err.s5xx']);
    expect(errorText(new Error('TypeError: x is undefined'))).toBe(GAPS_RU['gap.err.generic']);
  });

  it('never shows the server text', () => {
    setLang('en');
    const raw = 'Not enough energy (3/10)';
    expect(errorText(new ApiError(409, 'no_energy', raw))).not.toContain(raw);
    expect(explain(new ApiError(409, 'no_energy', raw)).message).toBe(t('gap.err.no_energy'));
    expect(explain(new ApiError(503, 'not_configured', 'x')).message).toBe(t('gap.net.closed'));
  });

  it('ru has every key, with the same placeholders, and no Latin words', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(GAPS_EN) as (keyof typeof GAPS_EN)[]) {
      expect(GAPS_RU[k], k).toBeTruthy();
      expect(ph(GAPS_RU[k]), k).toBe(ph(GAPS_EN[k]));
      expect(GAPS_RU[k].replace(/Telegram|\/paysupport/g, ''), k).not.toMatch(/[A-Za-z]{2,}/);
    }
  });
});
