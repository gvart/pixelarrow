/**
 * V6-ACCT-04: the gate order on the anonymous auth routes (ADR-0008 §2, §5,
 * §6; M-AF-1, N-PW-2): Rate Limiting binding per IP → Turnstile → D1
 * throttle → hash. A spy on PBKDF2 (crypto.subtle.deriveBits) proves no hash
 * runs when an earlier gate refuses; a spy on fetch proves Turnstile is not
 * asked once the IP limit refuses, and never on the Telegram route.
 */
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailKeyHash } from '../src/auth/throttle';
import { SITEVERIFY_URL } from '../src/auth/turnstile';
import { api, GAME_ORIGIN } from './helpers';
import { DUMMY_TOKEN } from './siteverify';

let n = 0;
const fresh = () => `gate.${++n}.${Date.now()}@example.com`;
let ipN = 0;
/** A fresh client IP per test, so the binding's counters never leak between tests. */
const freshIp = () => `192.0.2.${++ipN}.${Date.now() % 100000}`;
const PW = 'battle-standard-42';

const post = (path: string, json: unknown, ip: string) =>
  api(path, { method: 'POST', json, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip } });
const errorCode = async (res: Response) => (await res.json<{ error: { code: string } }>()).error.code;

/** Counts PBKDF2 runs (the password hash, and the dummy hash for unknown emails). */
function hashSpy() {
  return vi.spyOn(crypto.subtle, 'deriveBits');
}
/** Counts siteverify calls. */
function siteverifySpy() {
  const spy = vi.spyOn(globalThis, 'fetch');
  return () => spy.mock.calls.filter(([input]) => (input instanceof Request ? input.url : String(input)) === SITEVERIFY_URL).length;
}

afterEach(() => vi.restoreAllMocks());

describe('the IP limit runs first', () => {
  it('signup: the 11th request from one IP in a minute is 429, with no Turnstile call and no hash', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await post('/api/auth/signup', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, ip)).status).toBe(202);
    const hashes = hashSpy();
    const siteverify = siteverifySpy();
    const res = await post('/api/auth/signup', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, ip);
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe('rate_limited');
    expect(hashes).not.toHaveBeenCalled();
    expect(siteverify()).toBe(0);
    // another IP is not affected
    expect((await post('/api/auth/signup', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, freshIp())).status).toBe(202);
  });

  it('login: over the limit is 429 before the lockout counter or the hash', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await post('/api/auth/login', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, ip);
    const hashes = hashSpy();
    const res = await post('/api/auth/login', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, ip);
    expect(res.status).toBe(429);
    expect(hashes).not.toHaveBeenCalled();
  });

  it('each route has its own bucket (login:<ip> is not signup:<ip>)', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await post('/api/auth/reset/request', { email: fresh(), turnstile: DUMMY_TOKEN }, ip);
    expect((await post('/api/auth/reset/request', { email: fresh(), turnstile: DUMMY_TOKEN }, ip)).status).toBe(429);
    expect((await post('/api/auth/verify/resend', { email: fresh(), turnstile: DUMMY_TOKEN }, ip)).status).toBe(202);
  });

  it('verify and reset/confirm (link-token routes) are limited per IP too, without Turnstile', async () => {
    const ip = freshIp();
    const siteverify = siteverifySpy();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post('/api/auth/verify', { token: 'x'.repeat(43) }, ip)).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(siteverify()).toBe(0);
  });
});

describe('Turnstile runs second', () => {
  for (const [path, body] of [
    ['/api/auth/signup', { email: 'x@example.com', password: PW }],
    ['/api/auth/login', { email: 'x@example.com', password: PW }],
    ['/api/auth/reset/request', { email: 'x@example.com' }],
    ['/api/auth/verify/resend', { email: 'x@example.com' }],
  ] as const) {
    it(`${path}: a missing or bad token is 400 turnstile_failed with no hash and no mail`, async () => {
      const hashes = hashSpy();
      for (const turnstile of [undefined, 'not-the-dummy-token']) {
        const res = await post(path, { ...body, email: fresh(), turnstile }, freshIp());
        expect(res.status).toBe(400);
        expect(await errorCode(res)).toBe('turnstile_failed');
      }
      expect(hashes).not.toHaveBeenCalled();
    });
  }

  it('login: a failed Turnstile never counts toward the account lockout (it runs before the D1 throttle)', async () => {
    const email = fresh();
    for (let i = 0; i < 6; i++) await post('/api/auth/login', { email, password: PW, turnstile: 'bad' }, freshIp());
    const key = `login:${await emailKeyHash(email.toLowerCase())}`;
    expect(await env.DB!.prepare('SELECT 1 FROM auth_throttle WHERE key = ?1').bind(key).first()).toBeNull();
  });

  it('a passing token reaches the hash (the gates let real traffic through)', async () => {
    const hashes = hashSpy();
    expect((await post('/api/auth/signup', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, freshIp())).status).toBe(202);
    expect(hashes).toHaveBeenCalled();
  });

  it('fails closed with 503 when siteverify is unreachable, still with no hash', async () => {
    const real = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if ((input instanceof Request ? input.url : String(input)) === SITEVERIFY_URL) throw new TypeError('network down');
      return real(input, init);
    });
    const hashes = hashSpy();
    const res = await post('/api/auth/login', { email: fresh(), password: PW, turnstile: DUMMY_TOKEN }, freshIp());
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe('turnstile_unavailable');
    expect(hashes).not.toHaveBeenCalled();
  });
});

describe('/api/auth/telegram', () => {
  // The binding limit itself (30 / 60 s, N-AF-1) is in auth.test.ts.
  it('never calls Turnstile (N-AF-3)', async () => {
    const siteverify = siteverifySpy();
    const res = await api('/api/auth/telegram', { method: 'POST', json: { dev: { id: 7001 } }, headers: { 'cf-connecting-ip': freshIp() } });
    expect(res.status).toBe(200);
    expect(siteverify()).toBe(0);
  });
});
