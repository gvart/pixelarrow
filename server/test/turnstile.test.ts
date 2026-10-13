/**
 * V6-ACCT-04: Turnstile siteverify (ADR-0008 §6, M-AF-2). siteverify is
 * reached through an injected fetch, so nothing here touches the network.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MAX_CHALLENGE_AGE_MS, SITEVERIFY_URL, verifyTurnstile } from '../src/auth/turnstile';
import type { Env } from '../src/env';
import { ApiError } from '../src/errors';
import { DUMMY_TOKEN, FAIL_SECRET, fakeSiteverify, PASS_SECRET, SPENT_SECRET } from './siteverify';

const IP = '198.51.100.7';
const NOW = Date.parse('2026-10-14T12:00:00Z');
const withSecret = (secret: string | undefined, extra: Partial<Env> = {}): Env => ({ ...env, TURNSTILE_SECRET: secret, ...extra });

interface Call {
  url: string;
  form: FormData;
}
/** A fetch that records each siteverify form and answers with `reply` (a Response, a body, or a throw). */
function recorder(reply: (form: FormData, n: number) => Response | object) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const form = init?.body as FormData;
    calls.push({ url: String(input), form });
    const r = reply(form, calls.length);
    return r instanceof Response ? r : Response.json(r);
  }) as typeof fetch;
  return { calls, fetchFn };
}
const fake = () => recorder((form) => fakeSiteverify(form));
/** A production-key reply: success with an action, a hostname and a timestamp. */
const real = (over: Record<string, unknown> = {}) =>
  recorder(() => ({ success: true, action: 'login', hostname: 'play.pixelarrow.app', challenge_ts: new Date(NOW - 10_000).toISOString(), 'error-codes': [], ...over }));
const prod = (extra: Partial<Env> = {}) => withSecret('0x4AAAAAAAprodsecret', { DEV_AUTH: undefined, ...extra });

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe('the published testing secrets with the dummy token', () => {
  it('1x passes (local and tests: DEV_AUTH=1)', async () => {
    const { fetchFn } = fake();
    expect(await verifyTurnstile(withSecret(PASS_SECRET), DUMMY_TOKEN, 'signup', IP, fetchFn)).toBe(true);
  });
  it('2x fails', async () => {
    const { fetchFn } = fake();
    expect(await verifyTurnstile(withSecret(FAIL_SECRET), DUMMY_TOKEN, 'signup', IP, fetchFn)).toBe(false);
  });
  it('3x (timeout-or-duplicate, a spent token) fails', async () => {
    const { fetchFn } = fake();
    expect(await verifyTurnstile(withSecret(SPENT_SECRET), DUMMY_TOKEN, 'login', IP, fetchFn)).toBe(false);
  });
  it('a testing-key pass is refused without DEV_AUTH, so a testing secret in production lets nobody in', async () => {
    const { fetchFn } = fake();
    expect(await verifyTurnstile(withSecret(PASS_SECRET, { DEV_AUTH: undefined }), DUMMY_TOKEN, 'signup', IP, fetchFn)).toBe(false);
  });
});

describe('the reply checks (a production key)', () => {
  it('accepts success with the action, an allowed hostname and a fresh challenge_ts', async () => {
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, real().fetchFn, NOW)).toBe(true);
  });
  it('refuses another endpoint’s action', async () => {
    expect(await verifyTurnstile(prod(), 'tok', 'signup', IP, real().fetchFn, NOW)).toBe(false);
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, real({ action: undefined }).fetchFn, NOW)).toBe(false);
  });
  it('refuses a hostname off the allow-list; localhost only with DEV_AUTH=1', async () => {
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, real({ hostname: 'evil.example' }).fetchFn, NOW)).toBe(false);
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, real({ hostname: 'localhost' }).fetchFn, NOW)).toBe(false);
    expect(await verifyTurnstile(prod({ DEV_AUTH: '1' }), 'tok', 'login', IP, real({ hostname: 'localhost' }).fetchFn, NOW)).toBe(true);
  });
  it('refuses a challenge older than 300 s, or without a timestamp', async () => {
    const at = (ms: number) => real({ challenge_ts: new Date(NOW - ms).toISOString() }).fetchFn;
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, at(MAX_CHALLENGE_AGE_MS), NOW)).toBe(true);
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, at(MAX_CHALLENGE_AGE_MS + 1_000), NOW)).toBe(false);
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, real({ challenge_ts: undefined }).fetchFn, NOW)).toBe(false);
  });
  it('refuses success: false and a missing token (without asking siteverify)', async () => {
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, real({ success: false, 'error-codes': ['invalid-input-response'] }).fetchFn, NOW)).toBe(false);
    const { calls, fetchFn } = real();
    expect(await verifyTurnstile(prod(), undefined, 'login', IP, fetchFn, NOW)).toBe(false);
    expect(await verifyTurnstile(prod(), '', 'login', IP, fetchFn, NOW)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('the request', () => {
  it('posts secret, response, remoteip and an idempotency_key (a UUID)', async () => {
    const { calls, fetchFn } = real();
    await verifyTurnstile(prod(), 'tok', 'login', IP, fetchFn, NOW);
    expect(calls).toHaveLength(1);
    const { url, form } = calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(form.get('secret')).toBe('0x4AAAAAAAprodsecret');
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe(IP);
    expect(String(form.get('idempotency_key'))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('retries a failed call once with the same idempotency_key', async () => {
    const { calls, fetchFn } = recorder((_, n) =>
      n === 1 ? new Response('busy', { status: 502 }) : { success: true, action: 'login', hostname: 'play.pixelarrow.app', challenge_ts: new Date(NOW).toISOString() },
    );
    expect(await verifyTurnstile(prod(), 'tok', 'login', IP, fetchFn, NOW)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].form.get('idempotency_key')).toBe(calls[0].form.get('idempotency_key'));
  });
});

describe('fails closed (503 turnstile_unavailable)', () => {
  it('when siteverify cannot be reached', async () => {
    const fetchFn = (async () => {
      throw new TypeError('network down');
    }) as typeof fetch;
    expect((await rejection(verifyTurnstile(prod(), 'tok', 'login', IP, fetchFn, NOW))).status).toBe(503);
  });
  it('on a 5xx', async () => {
    const { fetchFn } = recorder(() => new Response('oops', { status: 500 }));
    expect((await rejection(verifyTurnstile(prod(), 'tok', 'signup', IP, fetchFn, NOW))).code).toBe('turnstile_unavailable');
  });
  it('when the secret is missing or rejected', async () => {
    expect((await rejection(verifyTurnstile(withSecret(undefined), DUMMY_TOKEN, 'reset', IP, fake().fetchFn))).status).toBe(503);
    expect((await rejection(verifyTurnstile(withSecret('not-a-secret'), DUMMY_TOKEN, 'reset', IP, fake().fetchFn))).status).toBe(503);
  });
});
