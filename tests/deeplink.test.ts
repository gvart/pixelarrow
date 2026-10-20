import { describe, expect, it } from 'vitest';
import { launchRoute, parseHashRoute, parseStartParam, sceneForRoute, startParamOf, type StartRoute } from '../src/online/deeplink';
import { legalUrl } from '../src/ui/legal';
import { ApiClient } from '../src/platform/api';
import { createPlatform, telegramLinkOptions } from '../src/platform/detect';
import { fakeEnv } from './platform/env';
import { Online } from '../src/platform/online';
import { telegramAuth } from './fakes/platform';

describe('startapp deep links', () => {
  it('round-trips every route within Telegram limits', () => {
    const routes: StartRoute[] = [
      { kind: 'invite', code: 'abcD2345xy' },
      { kind: 'loc', loc: 12 },
      { kind: 'loc', loc: 0 },
      { kind: 'boss', loc: 305 },
      { kind: 'duel' },
      { kind: 'market' },
      { kind: 'clan' },
      { kind: 'income' },
      { kind: 'season' },
      { kind: 'settings' },
      { kind: 'wallet' },
      { kind: 'account' },
      { kind: 'link', code: 'Ab-_0123456789xyzXYZ12' },
    ];
    for (const r of routes) {
      const p = startParamOf(r);
      expect(p).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(parseStartParam(p)).toEqual(r);
    }
  });

  it('routes each link to its scene', () => {
    // the old war map's links (a region, a boss, income, the season) land on the Campaign hub (W-01)
    expect(sceneForRoute(parseStartParam('loc_32'))).toEqual({ scene: 'Menu', data: {} });
    expect(sceneForRoute(parseStartParam('boss_14'))).toEqual({ scene: 'Menu', data: {} });
    expect(sceneForRoute(parseStartParam('income'))).toEqual({ scene: 'Menu', data: {} });
    expect(sceneForRoute(parseStartParam('season'))).toEqual({ scene: 'Menu', data: {} });
    expect(sceneForRoute(parseStartParam('duel'))).toEqual({ scene: 'Duel', data: {} });
    expect(sceneForRoute(parseStartParam('market'))).toEqual({ scene: 'Shop', data: { tab: 'shop', back: { scene: 'Menu' } } });
    expect(sceneForRoute(parseStartParam('myclan'))?.scene).toBe('OnlineClan');
    expect(sceneForRoute(parseStartParam('settings'))).toEqual({ scene: 'Menu', data: { settings: 'notify' } });
    expect(sceneForRoute(parseStartParam('wallet'))).toMatchObject({ scene: 'Shop', data: { tab: 'wallet' } });
    // a clan invite opens the Clan screen (the code is kept as the pending invite)
    expect(parseStartParam('clan_abcD2345xy')).toEqual({ kind: 'invite', code: 'abcD2345xy' });
    expect(sceneForRoute(parseStartParam('clan_abcD2345xy'))).toEqual({ scene: 'OnlineClan', data: {} });
  });

  it('ignores anything unknown or malformed (the game opens on the menu)', () => {
    for (const p of [null, undefined, '', 'nope', 'hex_1_2', 'loc_', 'loc_a', 'loc_-3', 'loc_1_2', 'loc_1234567', 'clan_x', 'duel!', 'x'.repeat(65), 'market ', ' loc_12']) {
      const r = parseStartParam(p);
      if (p === 'market ' || p === ' loc_12') expect(r).not.toBeNull(); // surrounding spaces are trimmed
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

describe('v6 account deep links (accounts-v6 §14 Q3)', () => {
  const CODE = 'Ab-_0123456789xyzXYZ12'; // 22 chars of base64url, as the Worker mints them

  it('startapp=account and startapp=link_<code> are Telegram launch routes', () => {
    expect(parseStartParam('account')).toEqual({ kind: 'account' });
    expect(parseStartParam(`link_${CODE}`)).toEqual({ kind: 'link', code: CODE });
    for (const p of ['link_', 'link_short', `link_${CODE}x`, `link_${CODE.slice(1)}!`, 'login', 'forgot']) expect(parseStartParam(p), p).toBeNull();
  });

  it('the web hash routes', () => {
    expect(parseHashRoute('#login')).toEqual({ kind: 'login' });
    expect(parseHashRoute('#forgot')).toEqual({ kind: 'forgot' });
    expect(parseHashRoute('#account')).toEqual({ kind: 'account' });
    expect(parseHashRoute(`#account/conflict/${CODE}`)).toEqual({ kind: 'conflict', id: CODE });
    for (const h of ['', '#', '#duel', '#account/', '#account/conflict/', '#account/conflict/a b', '#account/conflict/x/y', '#tgWebAppData=query_id%3D1&tgWebAppVersion=8.0', 'login']) expect(parseHashRoute(h), h).toBeNull();
  });

  it('the launch parameter wins over the hash', () => {
    expect(launchRoute('duel', '#account')).toEqual({ kind: 'duel' });
    expect(launchRoute(null, '#login')).toEqual({ kind: 'login' });
    expect(launchRoute('nope', '#forgot')).toEqual({ kind: 'forgot' });
    expect(launchRoute(null, '#tgWebAppData=x')).toBeNull();
    expect(launchRoute(undefined, undefined)).toBeNull();
  });

  it('account routes open the menu with the account view asked for', () => {
    expect(sceneForRoute({ kind: 'account' })).toEqual({ scene: 'Menu', data: { account: { view: 'account' } } });
    expect(sceneForRoute({ kind: 'login' })).toEqual({ scene: 'Menu', data: { account: { view: 'login' } } });
    expect(sceneForRoute({ kind: 'forgot' })).toEqual({ scene: 'Menu', data: { account: { view: 'forgot' } } });
    expect(sceneForRoute({ kind: 'conflict', id: CODE })).toEqual({ scene: 'Menu', data: { account: { view: 'conflict', id: CODE } } });
    expect(sceneForRoute({ kind: 'link', code: CODE })).toEqual({ scene: 'Menu', data: { account: { view: 'link', code: CODE } } });
  });
});

describe('invite links through the platform (ADR-0006 M8)', () => {
  /** The startapp parameter a link opens the game with, as Telegram or the web adapter reads it. */
  const paramOf = (url: string) => new URL(url).searchParams.get('startapp');
  const invite: StartRoute = { kind: 'invite', code: 'abcD2345xy' };

  it('a clan invite link opens the clan invite again, on every adapter', () => {
    const links = [
      createPlatform('web', fakeEnv().env).share.inviteUrl(startParamOf(invite)),
      createPlatform('telegram', fakeEnv().env).share.inviteUrl(startParamOf(invite)),
      createPlatform('telegram', fakeEnv().env, telegramLinkOptions({ VITE_TELEGRAM_BOT: 'pixelarrow_bot' })).share.inviteUrl(startParamOf(invite)),
    ];
    expect(links[0]).toBe('https://play.pixelarrow.app/?startapp=clan_abcD2345xy');
    expect(links[2]).toBe('https://t.me/pixelarrow_bot/play?startapp=clan_abcD2345xy');
    for (const l of links) expect(parseStartParam(paramOf(l))).toEqual(invite);
  });

  it('the Telegram bot and Mini App names come from the build env, never a guess (V6-025)', () => {
    expect(telegramLinkOptions({})).toEqual({});
    expect(telegramLinkOptions({ VITE_TELEGRAM_BOT: '  ' })).toEqual({});
    expect(telegramLinkOptions({ VITE_TELEGRAM_BOT: '@PixelArrowBot', VITE_TELEGRAM_APP: 'game' })).toEqual({ telegramBot: 'PixelArrowBot', telegramApp: 'game' });
    // a malformed value is ignored (the play URL fallback) rather than baked into every invite
    expect(telegramLinkOptions({ VITE_TELEGRAM_BOT: 'https://t.me/x', VITE_TELEGRAM_APP: 'a/b' })).toEqual({});
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
    const online = new Online({ api: new ApiClient({ base: '', fetch }), kv: () => kv, cache: kv, auth: telegramAuth('x'), timeZoneOffset: () => 180 });
    expect(await online.signIn()).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.filter((c) => c.url === '/api/notify/settings')).toEqual([{ url: '/api/notify/settings', method: 'PUT', body: { tzOffset: 180 } }]);
    await online.signIn();
    expect(calls.filter((c) => c.url === '/api/notify/settings')).toHaveLength(1);
  });
});
