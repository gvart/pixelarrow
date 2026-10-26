// The standalone email-link pages /auth/* (V6-ACCT-06, design/ux/accounts-v6.md §5.4, §7.2, §8.3, §8.4):
// what each server reply shows, where the token comes from, the language and the guest-save hint.
import { describe, expect, it } from 'vitest';
import { conflictView, guestSave, pageLang, readToken, resetView, savedLangSetting, variantOf, verifyView } from '../auth/logic';
import { PW_MAX, PW_MIN } from '../auth/logic';
import headers from '../public/_headers?raw';
import { readText } from './support/nodeIo.js';

const TOKEN = 'Abc_def-0123456789xyzABCDEFGHIJ';
const ok = (body: unknown) => ({ status: 200, body });
const err = (status: number, code: string) => ({ status, body: { error: { code, message: 'x' } } });
const player = { displayName: 'SwiftArcher4821' };

describe('readToken', () => {
  it('reads the token from #t= only', () => {
    expect(readToken(`#t=${TOKEN}`)).toBe(TOKEN);
    expect(readToken('')).toBeNull();
    expect(readToken('#t=')).toBeNull();
    expect(readToken('#login')).toBeNull();
  });
  it('refuses anything that is not a token (no markup, no oversize)', () => {
    expect(readToken('#t=<img src=x>')).toBeNull();
    expect(readToken(`#t=${'a'.repeat(129)}`)).toBeNull();
    expect(readToken('#t=short')).toBeNull();
  });
});

describe('variantOf', () => {
  it('maps the four email-link paths, with or without .html', () => {
    expect(variantOf('/auth/signup')).toBe('signup');
    expect(variantOf('/auth/reset.html')).toBe('reset');
    expect(variantOf('/auth/add_email')).toBe('add_email');
    expect(variantOf('/auth/change_email')).toBe('change_email');
    expect(variantOf('/auth/other')).toBeNull();
  });
});

describe('verifyView (POST /api/auth/verify)', () => {
  it('signs up: welcome with the name, the campaign line when this browser holds a guest save', () => {
    expect(verifyView('signup', ok({ purpose: 'signup', player }), true)).toEqual({ kind: 'success', purpose: 'signup', name: 'SwiftArcher4821', campaign: 'comes' });
    expect(verifyView('signup', ok({ purpose: 'signup', player }), false)).toMatchObject({ kind: 'success', campaign: 'otherDevice' });
  });
  it('follows the purpose the server answers, not the path', () => {
    expect(verifyView('signup', ok({ purpose: 'add_email', player }), false)).toMatchObject({ kind: 'success', purpose: 'add_email' });
    expect(verifyView('change_email', ok({ purpose: 'change_email', player }), false)).toMatchObject({ kind: 'success', purpose: 'change_email' });
  });
  it('maps every error code to a state', () => {
    expect(verifyView('signup', err(400, 'invalid_token'), false)).toEqual({ kind: 'expired', variant: 'signup' });
    expect(verifyView('add_email', err(400, 'invalid_token'), false)).toEqual({ kind: 'expired', variant: 'add_email' });
    expect(verifyView('signup', err(409, 'email_taken'), false)).toEqual({ kind: 'taken' });
    expect(verifyView('change_email', err(409, 'email_taken'), false)).toEqual({ kind: 'taken' });
    expect(verifyView('add_email', err(409, 'email_conflict'), false)).toEqual({ kind: 'conflict' });
    expect(verifyView('add_email', err(409, 'already_has_email'), false)).toEqual({ kind: 'expired', variant: 'add_email' });
    expect(verifyView('signup', err(429, 'rate_limited'), false)).toEqual({ kind: 'rate' });
    expect(verifyView('signup', err(403, 'banned'), false)).toEqual({ kind: 'banned' });
    expect(verifyView('signup', err(403, 'bad_origin'), false)).toEqual({ kind: 'unavailable' });
    expect(verifyView('signup', err(503, 'email_unavailable'), false)).toEqual({ kind: 'offline' });
    expect(verifyView('signup', null, false)).toEqual({ kind: 'offline' });
  });
});

describe('resetView (POST /api/auth/reset/confirm)', () => {
  it('done on 200, the policy codes under the field, the token codes as cards', () => {
    expect(resetView(ok({ player }))).toEqual({ kind: 'resetDone' });
    expect(resetView(err(400, 'too_short'))).toEqual({ kind: 'field', key: 'auth.err.pwShort' });
    expect(resetView(err(400, 'too_long'))).toEqual({ kind: 'field', key: 'auth.err.pwLong' });
    expect(resetView(err(400, 'common'))).toEqual({ kind: 'field', key: 'auth.err.pwCommon' });
    expect(resetView(err(400, 'matches_email'))).toEqual({ kind: 'field', key: 'auth.err.pwEmail' });
    expect(resetView(err(400, 'invalid_token'))).toEqual({ kind: 'expired', variant: 'reset' });
    expect(resetView(err(429, 'rate_limited'))).toEqual({ kind: 'banner', key: 'auth.page.rate' });
    expect(resetView(null)).toEqual({ kind: 'banner', key: 'auth.page.offline' });
    expect(resetView(err(403, 'banned'))).toEqual({ kind: 'banned' });
  });
});

describe('conflictView (POST /api/auth/verify/conflict)', () => {
  it('hands a live conflict over to the game, else confirms the email', () => {
    expect(conflictView(ok({ conflict: 'c0ffeec0ffeec0ffeec0ff', player }))).toEqual({ kind: 'handover', to: '/#account/conflict/c0ffeec0ffeec0ffeec0ff' });
    expect(conflictView(ok({ removedEmpty: true, player }))).toEqual({ kind: 'success', purpose: 'add_email', name: 'SwiftArcher4821', removedEmpty: true });
    expect(conflictView(ok({ player }))).toEqual({ kind: 'success', purpose: 'add_email', name: 'SwiftArcher4821' });
  });
  it('a wrong password stays on the form; a spent token is the expired card', () => {
    expect(conflictView(err(401, 'invalid_credentials'))).toEqual({ kind: 'field', key: 'auth.err.creds' });
    expect(conflictView(err(400, 'invalid_token'))).toEqual({ kind: 'expired', variant: 'add_email' });
    expect(conflictView(err(429, 'rate_limited'))).toEqual({ kind: 'banner', key: 'auth.page.rate' });
    expect(conflictView(null)).toEqual({ kind: 'banner', key: 'auth.page.offline' });
  });
  it('never builds a hand-over URL out of a malformed conflict id', () => {
    expect(conflictView(ok({ conflict: '../../evil', player }))).toEqual({ kind: 'success', purpose: 'add_email', name: 'SwiftArcher4821' });
  });
});

/** A fake localStorage holding the game's save (src/game/save.ts layout, src/platform/web/dom.ts prefix). */
function store(items: Record<string, string>) {
  return { getItem: (k: string) => items[k] ?? null };
}
const saveWith = (settings: object) => ({
  'pixelarrow:px_meta': JSON.stringify({ v: 9, n: 2, s: 1 }),
  'pixelarrow:px_part1_0': JSON.stringify({ v: 9, settings }).slice(0, 10),
  'pixelarrow:px_part1_1': JSON.stringify({ v: 9, settings }).slice(10),
});

describe('the device hints', () => {
  it('a save never synced with a server is a guest save', () => {
    expect(guestSave(store(saveWith({})))).toBe(true);
    expect(guestSave(store({ ...saveWith({}), 'pixelarrow:px_sync': '{"revision":3,"seq":4}' }))).toBe(false);
    expect(guestSave(store({}))).toBe(false);
    expect(guestSave(null)).toBe(false);
    expect(guestSave({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
  it('reads the language setting from the current save slot', () => {
    expect(savedLangSetting(store(saveWith({ lang: 'ru' })))).toBe('ru');
    expect(savedLangSetting(store(saveWith({ lang: 'auto' })))).toBe('auto');
    expect(savedLangSetting(store({ 'pixelarrow:px_meta': '{"n":1}', 'pixelarrow:px_part_0': 'not json' }))).toBeNull();
    expect(savedLangSetting(store({}))).toBeNull();
  });
  it('picks the language: the game setting, then the browser, then English', () => {
    expect(pageLang('ru', ['en-US'])).toBe('ru');
    expect(pageLang('auto', ['ru-RU', 'en'])).toBe('ru');
    expect(pageLang(null, ['de', 'en'])).toBe('en');
    expect(pageLang(null, ['de'])).toBe('en');
  });
});

it('mirrors the server password policy (server/src/auth/password.ts)', () => {
  const src = readText('server/src/auth/password.ts');
  expect([PW_MIN, PW_MAX]).toEqual([Number(/PASSWORD_MIN = (\d+)/.exec(src)?.[1]), Number(/PASSWORD_MAX = (\d+)/.exec(src)?.[1])]);
});

describe('the pages ship safe by construction', () => {
  const pages = import.meta.glob('../auth/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('four pages, each with no Referer, no inline script and its variant', () => {
    expect(Object.keys(pages).map((k) => k.split('/').pop()).sort()).toEqual(['add_email.html', 'change_email.html', 'reset.html', 'signup.html']);
    for (const [path, html] of Object.entries(pages)) {
      expect(html).toContain('<meta name="referrer" content="no-referrer" />');
      expect(html).toContain(`data-variant="${path.split('/').pop()!.replace('.html', '')}"`);
      // Only the module entry: no inline script or style, so the strict CSP holds.
      expect(html.match(/<script/g)).toHaveLength(1);
      expect(html).toContain('<script type="module" src="./main.ts"></script>');
      expect(html).not.toMatch(/<style|style="/);
    }
  });

  it('public/_headers: no Referer, never framed, nothing but this origin and Turnstile', () => {
    const block = headers.split('\n/auth/*\n')[1]?.split('\n\n')[0] ?? '';
    const h = Object.fromEntries(block.split('\n').filter((l) => /^\s+\S/.test(l)).map((l) => [l.slice(0, l.indexOf(':')).trim().toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
    expect(h['referrer-policy']).toBe('no-referrer');
    const csp = Object.fromEntries((h['content-security-policy'] ?? '').split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
    expect(csp['default-src']).toBe("'none'");
    expect(csp['frame-ancestors']).toBe("'none'");
    expect(csp['connect-src']).toBe("'self'");
    expect(csp['script-src']).toBe("'self' https://challenges.cloudflare.com");
    expect(csp['frame-src']).toBe('https://challenges.cloudflare.com');
    expect(csp['base-uri']).toBe("'none'");
  });
});
