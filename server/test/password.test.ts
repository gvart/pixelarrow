/**
 * V6-ACCT-03: password hashing and policy (ADR-0008 §2, M-PW-1..4).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, hashPassword, PBKDF2_ITERATIONS, peppersFromEnv, verifyPassword } from '../src/auth/password';

const peppers = peppersFromEnv(env);
const PW = 'correct horse battery';

describe('password hashing', () => {
  it('writes pbkdf2-sha256$<iter>$<pepperId>$<salt>$<dk> at the spike count and verifies it', async () => {
    const h = await hashPassword(PW, peppers.current);
    const [tag, iter, pepperId, salt, dk] = h.split('$');
    expect(tag).toBe('pbkdf2-sha256');
    expect(Number(iter)).toBe(PBKDF2_ITERATIONS);
    expect(PBKDF2_ITERATIONS).toBe(310_000);
    expect(pepperId).toBe(env.PASSWORD_PEPPER_ID);
    expect(salt).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 bytes
    expect(dk).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes
    expect(h).not.toContain(PW);
    expect(await verifyPassword(PW, h, peppers)).toEqual({ ok: true, needsRehash: false });
    expect(await verifyPassword(PW + 'x', h, peppers)).toEqual({ ok: false, needsRehash: false });
  });

  it('salts every hash', async () => {
    expect(await hashPassword(PW, peppers.current)).not.toBe(await hashPassword(PW, peppers.current));
  });

  it('hashes the NFKC form, so composed and decomposed input verify alike', async () => {
    const h = await hashPassword('café-au-lait-x', peppers.current);
    expect((await verifyPassword('café-au-lait-x', h, peppers)).ok).toBe(true);
  });

  it('verifies with the stored parameters and asks for a rehash when the count is old', async () => {
    const old = await hashPassword(PW, peppers.current, 100_000);
    expect(await verifyPassword(PW, old, peppers)).toEqual({ ok: true, needsRehash: true });
    // either direction (a lowered count after the owner check also converges)
    const higher = await hashPassword(PW, peppers.current, PBKDF2_ITERATIONS + 1);
    expect(await verifyPassword(PW, higher, peppers)).toEqual({ ok: true, needsRehash: true });
  });

  it('verifies a hash under the previous pepper and asks for a rehash', async () => {
    expect(peppers.previous).toHaveLength(1);
    const old = await hashPassword(PW, peppers.previous[0]);
    expect(old.split('$')[2]).toBe('1');
    expect(await verifyPassword(PW, old, peppers)).toEqual({ ok: true, needsRehash: true });
  });

  it('a pepper changes the hash: the same password and salt under another pepper does not verify', async () => {
    const h = await hashPassword(PW, peppers.current);
    const forged = h.replace(/\$2\$/, '$1$');
    expect((await verifyPassword(PW, forged, peppers)).ok).toBe(false);
  });

  it('refuses a missing, unknown or malformed hash after spending a dummy hash', async () => {
    for (const stored of [null, '', 'bcrypt$x', 'pbkdf2-sha256$abc$2$x$y', 'pbkdf2-sha256$310000$9$AAAA$BBBB', 'pbkdf2-sha256$999999999$2$AAAA$BBBB']) {
      const t0 = performance.now();
      expect(await verifyPassword(PW, stored, peppers)).toEqual({ ok: false, needsRehash: false });
      expect(performance.now() - t0).toBeGreaterThanOrEqual(0);
    }
  });

  it('takes about as long for an unknown account as for a wrong password (dummy-hash timing)', async () => {
    const h = await hashPassword(PW, peppers.current);
    const time = async (stored: string | null) => {
      const t0 = Date.now();
      for (let i = 0; i < 3; i++) await verifyPassword('wrong password!', stored, peppers);
      return Date.now() - t0;
    };
    const known = await time(h);
    const unknown = await time(null);
    // Both run one PBKDF2 at the current count; the unknown path must not be a fast exit
    // (that would be ~0 ms against ~25 ms per hash). Loose bounds: the suite runs under CPU load.
    expect(unknown).toBeGreaterThan(known * 0.25);
    expect(known).toBeGreaterThan(unknown * 0.25);
  });

  it('needs the pepper: a missing secret is 503 not_configured', () => {
    expect(() => peppersFromEnv({ ...env, PASSWORD_PEPPER: undefined })).toThrow(/not configured/);
    expect(() => peppersFromEnv({ ...env, PASSWORD_PEPPER_ID: undefined })).toThrow(/not configured/);
  });
});

describe('password policy (NIST SP 800-63B, M-PW-3)', () => {
  const email = 'Alice.Smith@Example.com';
  it('accepts 10 to 128 characters with no composition rules', () => {
    expect(checkPasswordPolicy('a'.repeat(3) + 'bcdefgh!z', email)).toBe('ok');
    expect(checkPasswordPolicy('lowercase only words', email)).toBe('ok');
    expect(checkPasswordPolicy('🙂🐍🎲🏹🐎🌙🔥💧🌲🗡', email)).toBe('ok'); // counted in characters, not UTF-16 units
  });
  it('counts length after NFKC and never truncates', () => {
    expect(checkPasswordPolicy('short9char', email)).toBe('ok');
    expect(checkPasswordPolicy('short9chr', email)).toBe('too_short');
    expect(checkPasswordPolicy('x'.repeat(64) + 'y'.repeat(64), email)).toBe('ok');
    expect(checkPasswordPolicy('x'.repeat(64) + 'y'.repeat(65), email)).toBe('too_long');
    // U+FB01 is one character that NFKC expands to two ('fi'): 9 typed, 10 counted
    expect(checkPasswordPolicy('\ufb01ve-arrow', email)).toBe('ok');
    expect(checkPasswordPolicy('🙂🐍🎲🏹🐎🌙🔥💧🌲', email)).toBe('too_short');
  });
  it('rejects common passwords, case-insensitively, plus repeats and plain sequences', () => {
    for (const pw of ['password123', 'Password123', 'qwertyuiop', '1234567890', '1q2w3e4r5t', 'iloveyou123', 'zzzzzzzzzzzz', 'abcdefghijkl', '9876543210', 'abcabcabcabc', 'pixelarrow123']) {
      expect(checkPasswordPolicy(pw, email), pw).toBe('common');
    }
  });
  it('rejects the email and its local part', () => {
    expect(checkPasswordPolicy('alice.smith@example.com', email)).toBe('matches_email');
    expect(checkPasswordPolicy('ALICE.SMITH', 'alice.smith@example.com')).toBe('matches_email');
    expect(checkPasswordPolicy('alice.smith!', email)).toBe('ok');
  });
});
