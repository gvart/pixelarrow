import { describe, expect, it } from 'vitest';
import { parseStartParam, sceneForRoute, startParamOf, type StartRoute } from '../src/online/deeplink';
import { legalUrl } from '../src/ui/legal';
import { ApiClient } from '../src/platform/api';
import { Online } from '../src/platform/online';

describe('startapp deep links', () => {
  it('round-trips every route within Telegram limits', () => {
    const routes: StartRoute[] = [
      { kind: 'invite', code: 'abcD2345xy' },
      { kind: 'hex', q: 12, r: -7 },
      { kind: 'hex', q: -34, r: 0 },
      { kind: 'boss', q: 5, r: -9 },
      { kind: 'duel' },
      { kind: 'market' },
      { kind: 'clan' },
      { kind: 'income' },
      { kind: 'season' },
      { kind: 'settings' },
      { kind: 'wallet' },
    ];
    for (const r of routes) {
      const p = startParamOf(r);
      expect(p).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(parseStartParam(p)).toEqual(r);
    }
  });

  it('routes each link to its scene', () => {
    expect(sceneForRoute(parseStartParam('hex_3_-2'))).toEqual({ scene: 'Online', data: { focus: { q: 3, r: -2 }, select: true } });
    expect(sceneForRoute(parseStartParam('boss_-1_4'))).toEqual({ scene: 'Online', data: { focus: { q: -1, r: 4 }, select: true } });
    expect(sceneForRoute(parseStartParam('duel'))).toEqual({ scene: 'Online', data: { lobby: true } });
    expect(sceneForRoute(parseStartParam('market'))?.scene).toBe('Market');
    expect(sceneForRoute(parseStartParam('myclan'))?.scene).toBe('OnlineClan');
    expect(sceneForRoute(parseStartParam('income'))).toEqual({ scene: 'Online', data: {} });
    expect(sceneForRoute(parseStartParam('season'))).toEqual({ scene: 'Online', data: {} });
    expect(sceneForRoute(parseStartParam('settings'))).toEqual({ scene: 'Menu', data: { settings: 'notify' } });
    expect(sceneForRoute(parseStartParam('wallet'))).toMatchObject({ scene: 'Shop', data: { tab: 'wallet' } });
    // a clan invite still opens the online mode (the code is kept as the pending invite)
    expect(parseStartParam('clan_abcD2345xy')).toEqual({ kind: 'invite', code: 'abcD2345xy' });
    expect(sceneForRoute(parseStartParam('clan_abcD2345xy'))).toEqual({ scene: 'Online', data: {} });
  });

  it('ignores anything unknown or malformed (the game opens on the menu)', () => {
    for (const p of [null, undefined, '', 'nope', 'hex_1', 'hex_a_b', 'hex_1_2_3', 'hex_99999_1', 'clan_x', 'duel!', 'x'.repeat(65), 'market ', ' hex_1_2']) {
      const r = parseStartParam(p);
      if (p === 'market ' || p === ' hex_1_2') expect(r).not.toBeNull(); // surrounding spaces are trimmed
      else expect(r).toBeNull();
    }
    expect(sceneForRoute(null)).toBeNull();
  });

  it('legal page links follow the language', () => {
    expect(legalUrl('terms', 'en')).toBe('https://pixelarrow.app/terms');
    expect(legalUrl('refunds', 'ru')).toBe('https://pixelarrow.app/ru/refunds');
    expect(legalUrl('privacy', 'de')).toBe('https://pixelarrow.app/privacy');
  });
});

describe('time zone report for quiet hours', () => {
  it('after sign-in the device offset goes to the notification settings, once', async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === '/api/auth/telegram') return json({ token: 'tok', expiresAt: 0, player: { id: 1 } });
      if (url === '/api/notify/settings') return json({ types: [], quiet: true, tzOffset: 180, blocked: false });
      return json({ entitlements: [], purchases: [] });
    };
    const kv = { get: async () => null, set: async () => {}, remove: async () => {} };
    const online = new Online({ api: new ApiClient({ base: '', fetch }), kv: () => kv, cache: kv, initData: () => 'x', timeZoneOffset: () => 180 });
    expect(await online.signIn()).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.filter((c) => c.url === '/api/notify/settings')).toEqual([{ url: '/api/notify/settings', method: 'PUT', body: { tzOffset: 180 } }]);
    await online.signIn();
    expect(calls.filter((c) => c.url === '/api/notify/settings')).toHaveLength(1);
  });
});
