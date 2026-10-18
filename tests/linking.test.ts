/**
 * Linking (V6-LINK-06; design/ux/accounts-v6.md §8.5–§8.7, V6-053/054): the API calls of the link and
 * conflict endpoints, and the rules the three sheets follow (AU-13 on the web, AU-14 and the Telegram
 * side of AU-16 in the Mini App, AU-16 on the web), with no Phaser.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type ConflictSide, type FetchLike } from '../src/platform/api';
import { cardState, conflictCards, factLines, linkFail, telegramLabel, typedMatches, waitingStep, webView } from '../src/ui/account/linking';
import { setLang, t } from '../src/i18n';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(answer: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init = {}) => (calls.push({ url, init }), answer(url, init));
  const api = new ApiClient({ base: '', fetch, timeoutMs: 200, transport: () => 'bearer' });
  api.token = 'tok';
  return { api, calls };
}

describe('the link and conflict API (server/src/account/routes.ts, V6-054)', () => {
  it('sends each call to its route; initData only ever in the body', async () => {
    const { api, calls } = client((url) => json(url.endsWith('/resolve') ? 202 : 200, url.endsWith('/resolve') ? { status: 'waiting_telegram' } : {}));
    await api.linkStart();
    await api.linkAbandon();
    await api.linkStatus();
    await api.linkConfirm();
    await api.linkPeek('AAAAAAAAAAAAAAAAAAAAAA');
    await api.linkComplete('init=1');
    await api.linkNotMe('init=2');
    await api.conflict('BBBBBBBBBBBBBBBBBBBBBB');
    expect(await api.resolveConflict('BBBBBBBBBBBBBBBBBBBBBB', 'other', 'Doros')).toEqual({ status: 'waiting_telegram' });
    await api.telegramConflicts('init=3');
    await api.chooseFromTelegram('BBBBBBBBBBBBBBBBBBBBBB', 'init=4', 'web');
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'POST /api/account/link/telegram',
      'DELETE /api/account/link/telegram',
      'GET /api/account/link/telegram/status',
      'POST /api/account/link/telegram/confirm',
      'GET /api/account/link/telegram/AAAAAAAAAAAAAAAAAAAAAA',
      'POST /api/account/link/telegram/complete',
      'POST /api/account/link/telegram/cancel',
      'GET /api/account/conflict/BBBBBBBBBBBBBBBBBBBBBB',
      'POST /api/account/conflict/BBBBBBBBBBBBBBBBBBBBBB/resolve',
      'POST /api/account/conflict/telegram',
      'POST /api/account/conflict/BBBBBBBBBBBBBBBBBBBBBB/telegram',
    ]);
    expect(calls.every((c) => !c.url.includes('init='))).toBe(true);
    expect(JSON.parse(String(calls[8].init.body))).toEqual({ keep: 'other', confirm: 'Doros' });
    expect(JSON.parse(String(calls[10].init.body))).toEqual({ initData: 'init=4', keep: 'web' });
  });

  it('escapes ids in the path', async () => {
    const { api, calls } = client(() => json(200, {}));
    await api.linkPeek('a/b?c');
    expect(calls[0].url).toBe('/api/account/link/telegram/a%2Fb%3Fc');
  });
});

describe('AU-13: the web sheet follows the status', () => {
  it('maps every status to a step', () => {
    expect(webView({ status: 'pending', expiresAt: 5 })).toEqual({ step: 'waiting', expiresAt: 5 });
    expect(webView({ status: 'awaiting_web', expiresAt: 5, telegram: { username: 'nik', firstName: 'Nikias' } })).toEqual({ step: 'ask', expiresAt: 5, tg: '@nik' });
    expect(webView({ status: 'conflict', conflict: 'X' })).toEqual({ step: 'conflict', id: 'X' });
    expect(webView({ status: 'linked' })).toEqual({ step: 'linked' });
    expect(webView({ status: 'cancelled' })).toEqual({ step: 'cancelled' });
    // a code gone without a trace reads as expired: a new code is the way on
    expect(webView({ status: 'expired' })).toEqual({ step: 'expired' });
    expect(webView({ status: 'none' })).toEqual({ step: 'expired' });
  });

  it('names the Telegram account that asked: @username, else the first name, else says it has no username', () => {
    setLang('en');
    expect(telegramLabel({ username: 'nik', firstName: 'N' })).toBe('@nik');
    expect(telegramLabel({ username: null, firstName: 'Nikias' })).toBe('Nikias');
    expect(telegramLabel({ username: null, firstName: null })).toBe(t('link.someone'));
  });
});

describe('server codes as what to show and what to do next', () => {
  const err = (status: number, code: string) => new ApiError(status, code, code);
  it('the web side', () => {
    expect(linkFail(err(410, 'link_expired'), 'browser')).toMatchObject({ key: 'link.expired', next: 'newCode' });
    expect(linkFail(err(409, 'already_linked'), 'browser')).toMatchObject({ key: 'link.already', next: 'close' });
    expect(linkFail(err(429, 'rate_limited'), 'browser')).toMatchObject({ key: 'link.err.rate', next: 'close' });
    expect(linkFail(err(409, 'retry'), 'browser')).toMatchObject({ key: 'link.err.retry', next: 'retry' });
    expect(linkFail(err(410, 'link_cancelled'), 'browser')).toMatchObject({ key: 'conflict.cancelled', next: 'close' });
    expect(linkFail(err(410, 'conflict_expired'), 'browser')).toMatchObject({ key: 'conflict.expired', next: 'close' });
    expect(linkFail(err(404, 'not_found'), 'browser')).toMatchObject({ key: 'conflict.expired', next: 'close' });
    expect(linkFail(err(409, 'choices_differ'), 'browser')).toMatchObject({ key: 'conflict.differ', next: 'close' });
    expect(linkFail(err(409, 'busy_try_later'), 'browser')).toMatchObject({ key: 'conflict.busy', next: 'close' });
    expect(linkFail(err(409, 'contact_support'), 'browser')).toMatchObject({ key: 'conflict.support', next: 'support' });
    expect(linkFail(err(400, 'confirm_mismatch'), 'browser')).toMatchObject({ key: 'conflict.typeMismatch', next: 'field' });
    expect(linkFail(err(403, 'banned'), 'browser')).toMatchObject({ key: 'auth.banned.body', next: 'close' });
    expect(linkFail(err(0, 'network'), 'browser')).toMatchObject({ key: 'auth.err.offline', next: 'retry' });
    expect(linkFail(err(500, 'internal'), 'browser')).toMatchObject({ key: 'auth.err.unavailable', next: 'retry' });
    expect(linkFail(new Error('x'), 'browser')).toMatchObject({ key: 'auth.err.unavailable', next: 'retry' });
  });

  it('the Mini App side: stale or reused initData asks for a relaunch', () => {
    expect(linkFail(err(410, 'link_expired'), 'tg')).toMatchObject({ key: 'link.tg.expired', next: 'close' });
    expect(linkFail(err(400, 'bad_start_param'), 'tg')).toMatchObject({ key: 'link.tg.expired', next: 'close' });
    expect(linkFail(err(401, 'init_data_expired'), 'tg')).toMatchObject({ key: 'link.tg.stale', next: 'close' });
    expect(linkFail(err(401, 'init_data_expired'), 'choose')).toMatchObject({ key: 'conflict.tg.reopen', next: 'reopen' });
    expect(linkFail(err(401, 'init_data_reused'), 'choose')).toMatchObject({ key: 'conflict.tg.reopen', next: 'reopen' });
    expect(linkFail(err(401, 'invalid_init_data'), 'tg')).toMatchObject({ key: 'reauth.err.telegram', next: 'close' });
    expect(linkFail(err(403, 'wrong_account'), 'choose')).toMatchObject({ key: 'reauth.err.wrongAccount', next: 'close' });
    expect(linkFail(err(409, 'already_chosen'), 'choose')).toMatchObject({ key: 'conflict.chosen', next: 'close' });
    expect(linkFail(err(409, 'forced_survivor'), 'choose')).toMatchObject({ key: 'conflict.forcedOff', next: 'close' });
  });
});

const side = (o: Partial<ConflictSide> = {}): ConflictSide => ({
  displayName: 'Doros',
  signIn: ['telegram'],
  campaignDay: 4,
  heroes: 3,
  duelRating: null,
  war: null,
  purchases: false,
  createdAt: Date.UTC(2026, 9, 9),
  ...o,
});

describe('AU-16: the account cards', () => {
  it("lists a side's facts in words (no number without its meaning)", () => {
    setLang('en');
    const lines = factLines(side()).map((l) => t(l.key, l.params));
    expect(lines).toEqual(['Telegram', 'Campaign day 4', '3 heroes', 'No duels', 'No war profile', 'Purchases: no', expect.stringMatching(/^Since .*2026/)]);
    const rich = factLines(side({ signIn: ['password', 'telegram'], campaignDay: null, heroes: 1, duelRating: 1480, war: { regions: 12 }, purchases: true })).map((l) => t(l.key, l.params));
    expect(rich.slice(0, 6)).toEqual(['Email and Telegram', 'No campaign yet', '1 hero', 'Duel rating 1480', 'War: 12 hexes', 'Purchases: yes']);
    setLang('ru');
    expect(t(factLines(side({ heroes: 5 }))[2].key, factLines(side({ heroes: 5 }))[2].params)).toBe('5 героев');
    setLang('en');
  });

  it('a forced survivor is preselected and the other side is off; else nothing is picked', () => {
    expect(conflictCards(undefined)).toEqual({ picked: null });
    expect(conflictCards('other')).toEqual({ picked: 'other' });
    expect(cardState('this', null, undefined)).toBe('unpicked');
    expect(cardState('this', 'this', undefined)).toBe('picked');
    expect(cardState('other', 'other', 'other')).toBe('forcedKept');
    expect(cardState('this', 'other', 'other')).toBe('forcedOff');
  });

  it("the typed name matches in any case and with spaces around it, never a different name", () => {
    expect(typedMatches('  doros ', 'Doros')).toBe(true);
    expect(typedMatches('ДОРОС', 'Дорос')).toBe(true);
    expect(typedMatches('Doro', 'Doros')).toBe(false);
    expect(typedMatches('', 'Doros')).toBe(false);
  });

  it('the web waits for the Mini App, resolves on the same choice, and stops on a different one', () => {
    const v = (telegram: 'this' | 'other' | null) => ({ choices: { web: 'this' as const, telegram } });
    expect(waitingStep(v(null), 'this')).toBe('wait');
    expect(waitingStep(v('this'), 'this')).toBe('resolve');
    expect(waitingStep(v('other'), 'this')).toBe('differ');
  });
});
