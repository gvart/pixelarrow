/**
 * A stand-in for Turnstile's siteverify (ADR-0008 §6: tests never reach the
 * network). It answers like Cloudflare does for its published testing
 * secrets; the replies below were recorded from the real endpoint on
 * 2026-10-13 with the dummy token (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
 * A testing secret accepts only the dummy token.
 */
import { SITEVERIFY_URL } from '../src/auth/turnstile';

export const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
export const PASS_SECRET = '1x0000000000000000000000000000000AA';
export const FAIL_SECRET = '2x0000000000000000000000000000000AA';
export const SPENT_SECRET = '3x0000000000000000000000000000000AA';

const testing = { result_with_testing_key: true };
const REPLIES: Record<string, (ts: string) => unknown> = {
  [PASS_SECRET]: (ts) => ({ challenge_ts: ts, 'error-codes': [], hostname: 'example.com', metadata: testing, success: true }),
  [FAIL_SECRET]: () => ({ 'error-codes': ['invalid-input-response'], success: false, messages: [], metadata: testing }),
  [SPENT_SECRET]: () => ({ 'error-codes': ['timeout-or-duplicate'], success: false, messages: [], metadata: testing }),
};

/** The fake endpoint's answer to one siteverify form. */
export function fakeSiteverify(form: FormData): Response {
  const reply = REPLIES[String(form.get('secret') ?? '')];
  if (!reply) return Response.json({ success: false, 'error-codes': ['invalid-input-secret'] });
  if (form.get('response') !== DUMMY_TOKEN) return Response.json({ success: false, 'error-codes': ['invalid-input-response'], metadata: testing });
  return Response.json(reply(new Date().toISOString()));
}

/** Routes fetch() to SITEVERIFY_URL to the fake; everything else goes through `real`. */
export function withFakeSiteverify(real: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === SITEVERIFY_URL) return fakeSiteverify(init?.body as FormData);
    return real(input, init);
  };
}
