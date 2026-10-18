/**
 * V6-ACCT-03: the durable D1 throttle (ADR-0008 §5): fixed windows, the log-in
 * lockout and the mail caps.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clearLoginFailures, hitThrottle, loginLockedFor, mailAllowed, recordLoginFailure } from '../src/auth/throttle';

const DB = () => env.DB!;
const MIN = 60_000;
const HOUR = 60 * MIN;
let n = 0;
const fresh = (p: string) => `${p}-${++n}-${Date.now()}@example.com`;

describe('hitThrottle', () => {
  it('allows `limit` hits per window, then refuses with a retry-after, then opens a new window', async () => {
    const key = `test:${fresh('w')}`;
    const rule = { limit: 2, windowMs: MIN };
    const t = 1_000_000;
    expect(await hitThrottle(DB(), key, rule, t)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect((await hitThrottle(DB(), key, rule, t + 1)).allowed).toBe(true);
    expect(await hitThrottle(DB(), key, rule, t + 20_000)).toEqual({ allowed: false, retryAfterSec: 40 });
    expect((await hitThrottle(DB(), key, rule, t + MIN)).allowed).toBe(true);
  });

  it('counts concurrent hits exactly (one upsert, no read-then-write race)', async () => {
    const key = `test:${fresh('race')}`;
    const rule = { limit: 5, windowMs: HOUR };
    const res = await Promise.all(Array.from({ length: 12 }, () => hitThrottle(DB(), key, rule, 5_000)));
    expect(res.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe('mail caps (M-AF-5)', () => {
  it('allows 3 emails per address per hour', async () => {
    const e = fresh('hour');
    const t = 10 * HOUR;
    for (let i = 0; i < 3; i++) expect(await mailAllowed(DB(), e, t + i)).toBe(true);
    expect(await mailAllowed(DB(), e, t + 10)).toBe(false);
    expect(await mailAllowed(DB(), e, t + HOUR)).toBe(true);
  });

  it('allows 10 per address per day, all purposes together', async () => {
    const e = fresh('day');
    const t = 100 * 24 * HOUR;
    let sent = 0;
    for (let h = 0; h < 6; h++) for (let i = 0; i < 3; i++) if (await mailAllowed(DB(), e, t + h * HOUR + i)) sent++;
    expect(sent).toBe(10);
  });

  it('keys by the address hash, never the address', async () => {
    const e = fresh('keyed');
    await mailAllowed(DB(), e, 1);
    const rows = await DB().prepare("SELECT key FROM auth_throttle WHERE key LIKE 'mail%'").all<{ key: string }>();
    expect(rows.results.some((r) => r.key.includes('@') || r.key.includes('keyed'))).toBe(false);
  });
});

describe('log-in lockout (M-AF-4)', () => {
  it('locks after 5 failures for 1 minute, doubling per further failure up to 1 hour; success resets', async () => {
    const e = fresh('lock');
    let t = 1_000;
    for (let i = 0; i < 4; i++) await recordLoginFailure(DB(), e, t);
    expect(await loginLockedFor(DB(), e, t)).toBe(0);
    await recordLoginFailure(DB(), e, t);
    expect(await loginLockedFor(DB(), e, t)).toBe(60);
    const expected = [2, 4, 8, 16, 32, 60, 60];
    for (const minutes of expected) {
      t += HOUR; // the lock has run out; the next attempt fails again
      expect(await loginLockedFor(DB(), e, t)).toBe(0);
      await recordLoginFailure(DB(), e, t);
      expect(await loginLockedFor(DB(), e, t)).toBe(minutes * 60);
    }
    await clearLoginFailures(DB(), e);
    expect(await loginLockedFor(DB(), e, t)).toBe(0);
    for (let i = 0; i < 4; i++) await recordLoginFailure(DB(), e, t);
    expect(await loginLockedFor(DB(), e, t)).toBe(0);
  });

  it('works the same for an address nobody registered (keyed by its hash)', async () => {
    const e = fresh('ghost');
    for (let i = 0; i < 5; i++) await recordLoginFailure(DB(), e, 50);
    expect(await loginLockedFor(DB(), e, 51)).toBe(60);
  });
});
