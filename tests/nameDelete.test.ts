/**
 * Nickname and deletion rules (V6-LINK-07; design/ux/accounts-v6.md §9, §10): the API calls, the shared
 * validator's reasons and the server's codes as messages, Rename's off state, the cost line, the delete
 * screen's unlink alternative, the typed word and the step-3 result, with no Phaser.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type FetchLike, type NameStatus } from '../src/platform/api';
import { costLine, localNameError, moderationUnseen, nameDate, renameError, renameOff, sameName, cleanName } from '../src/ui/account/nameRules';
import { alternativeTo, deleteFail, deleteWordMatches, GONE, KEPT } from '../src/ui/account/deletion';
import { setLang, t } from '../src/i18n';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 18, 12);
const status = (o: Partial<NameStatus> = {}): NameStatus => ({ freeChange: true, nextChangeAt: null, lockedUntil: null, moderatedAt: null, ...o });

afterEach(() => setLang('en'));

describe('the rename and delete API (server/src/account/routes.ts)', () => {
  it('PUT /api/account/name with the name; DELETE /api/account always sends the English DELETE', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch: FetchLike = async (url, init = {}) => (calls.push({ url, init }), json(200, url.endsWith('/name') ? { displayName: 'Nikias', name: status({ freeChange: false }) } : { status: 'done' }));
    const api = new ApiClient({ base: '', fetch, timeoutMs: 200, transport: () => 'bearer' });
    api.token = 'tok';
    expect((await api.rename('Nikias')).displayName).toBe('Nikias');
    setLang('ru');
    expect(await api.deleteAccount()).toEqual({ status: 'done' });
    expect(calls.map((c) => `${c.init.method} ${c.url} ${c.init.body}`)).toEqual(['PUT /api/account/name {"name":"Nikias"}', 'DELETE /api/account {"confirm":"DELETE"}']);
  });
});

describe('AU-18 rename (§9.4)', () => {
  it('the shared validator gives instant feedback before any request (§9.7.1)', () => {
    expect(localNameError('Adm1n')?.key).toBe('name.err.notAllowed');
    expect(localNameError('Sаша')?.key).toBe('name.err.mixed'); // a Latin S in a Cyrillic name
    expect(localNameError('ab')?.key).toBe('name.err.length');
    expect(localNameError('a'.repeat(17))?.key).toBe('name.err.length');
    expect(localNameError('a__b')?.key).toBe('name.err.chars');
    expect(localNameError('1234')?.key).toBe('name.err.chars');
    expect(localNameError('Swift Archer')).toBeNull();
    expect(localNameError('Ника')).toBeNull();
  });

  it('the same name (after the server would clean it) sends nothing', () => {
    expect(sameName('  Swift   Archer ', 'Swift Archer')).toBe(true);
    expect(sameName('Swift Archer2', 'Swift Archer')).toBe(false);
    expect(cleanName(' Ника ')).toBe('Ника');
  });

  it("maps the server's codes to the same messages; the blocklist is never named", () => {
    const at = NOW + 12 * DAY;
    expect(renameError(new ApiError(400, 'invalid_name', 'x', { reason: 'blocked' }))).toEqual({ key: 'name.err.notAllowed', field: true });
    expect(renameError(new ApiError(400, 'invalid_name', 'x', { reason: 'mixed_script' }))).toEqual({ key: 'name.err.mixed', field: true });
    expect(renameError(new ApiError(409, 'taken', 'x'))).toEqual({ key: 'name.err.taken', field: true });
    expect(renameError(new ApiError(429, 'cooldown', 'x', { nextChangeAt: at }))).toEqual({ key: 'name.err.cooldown', params: { date: nameDate(at) } });
    expect(renameError(new ApiError(429, 'rate_limited', 'x')).key).toBe('reauth.err.rate');
    expect(renameError(new ApiError(423, 'locked', 'x', { lockedUntil: at }))).toEqual({ key: 'name.err.locked', params: { date: nameDate(at) } });
    expect(renameError(new ApiError(0, 'network', 'x')).key).toBe('auth.err.offline');
    expect(renameError(new ApiError(500, 'internal', 'x')).key).toBe('auth.err.unavailable');
  });

  it('Rename on AU-09 is off during the cooldown or a lock, with the date (§9.7.2)', () => {
    expect(renameOff(status(), NOW)).toBeNull();
    expect(renameOff(status({ freeChange: false, nextChangeAt: NOW + DAY }), NOW)?.key).toBe('name.err.cooldown');
    expect(renameOff(status({ freeChange: false, nextChangeAt: NOW - 1 }), NOW)).toBeNull();
    expect(renameOff(status({ lockedUntil: NOW + DAY, nextChangeAt: NOW + 2 * DAY }), NOW)?.key).toBe('name.err.locked');
  });

  it('the cost line says the first change is free, then names the next date', () => {
    expect(costLine(status(), NOW)).toEqual({ key: 'name.freeFirst' });
    expect(costLine(status({ freeChange: false }), NOW)).toEqual({ key: 'name.nextOn', params: { date: nameDate(NOW + 30 * DAY) } });
  });

  it('the moderation notice shows once per reset', () => {
    expect(moderationUnseen(status(), null)).toBe(false);
    expect(moderationUnseen(status({ moderatedAt: NOW }), null)).toBe(true);
    expect(moderationUnseen(status({ moderatedAt: NOW }), NOW)).toBe(false);
    expect(moderationUnseen(status({ moderatedAt: NOW + 1 }), NOW)).toBe(true);
  });
});

describe('AU-19 delete account (§10)', () => {
  const both = { identities: [{ kind: 'telegram' as const, telegramUsername: 'n' }, { kind: 'password' as const, emailMasked: 'j***@g***.com' }] };
  it('step 1 lists every group (§10.3.1), in both languages', () => {
    expect(GONE).toHaveLength(7);
    expect(KEPT).toHaveLength(2);
    for (const l of ['en', 'ru'] as const) {
      setLang(l);
      for (const k of [...GONE, ...KEPT]) expect(t(k, { years: 5 })).not.toBe(k);
    }
  });

  it('the unlink alternative only with two methods, naming the one that stays', () => {
    expect(alternativeTo(both, 'cookie')).toBe('password'); // the web: remove the email, keep Telegram
    expect(alternativeTo(both, 'bearer')).toBe('telegram'); // Telegram: unlink it, keep the web
    expect(alternativeTo({ identities: [both.identities[0]] }, 'bearer')).toBeNull();
    expect(alternativeTo({ identities: [both.identities[1]] }, 'cookie')).toBeNull();
  });

  it('the word: DELETE, or УДАЛИТЬ in Russian, any case and spaces around (§10.3.2)', () => {
    expect(deleteWordMatches(' delete ')).toBe(true);
    expect(deleteWordMatches('DELET')).toBe(false);
    expect(deleteWordMatches('')).toBe(false);
    setLang('ru');
    expect(deleteWordMatches('удалить')).toBe(true);
    expect(deleteWordMatches('DELETE')).toBe(true);
    expect(deleteWordMatches('удали')).toBe(false);
  });

  it('busy leaves the account and says why; anything else may be tried again (the server is idempotent)', () => {
    expect(deleteFail(new ApiError(409, 'busy_try_later', 'x'))).toEqual({ key: 'delete.busy', retry: false });
    expect(deleteFail(new ApiError(503, 'unavailable', 'x'))).toEqual({ key: 'delete.failed', retry: true });
    expect(deleteFail(new ApiError(0, 'network', 'x'))).toEqual({ key: 'delete.failed', retry: true });
  });
});
