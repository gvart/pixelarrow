/// <reference types="vite/client" />
// V6-ACCT-01 guard: the PBKDF2 iteration count stays inside the range the spike measured as safe
// (docs/v6/qa/PBKDF2_SPIKE.md), and the docs that carry the number agree with it.
import { describe, expect, it } from 'vitest';
import { PBKDF2_CHOSEN, PBKDF2_SAFE_MAX, PBKDF2_SAFE_MIN } from '../scripts/pbkdf2-probe/limits';
import { hashOnce } from '../scripts/pbkdf2-probe/worker';
import adr from '../../design/adr/ADR-0008-accounts-sessions.md?raw';
import manifest from '../../docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md?raw';

// V6-ACCT-03 adds server/src/auth/password.ts exporting PBKDF2_ITERATIONS. Until then the glob is
// empty; once it exists, the configured value is held to the measured range.
const passwordModules = import.meta.glob<{ PBKDF2_ITERATIONS?: number }>('../src/auth/password.ts', { eager: true });

const grouped = (n: number) => n.toLocaleString('en-US');

describe('PBKDF2 spike guard (V6-ACCT-01)', () => {
  it('keeps the chosen count inside the measured safe range', () => {
    expect(PBKDF2_SAFE_MIN).toBe(100_000);
    expect(PBKDF2_CHOSEN).toBeGreaterThanOrEqual(PBKDF2_SAFE_MIN);
    expect(PBKDF2_CHOSEN).toBeLessThanOrEqual(PBKDF2_SAFE_MAX);
  });

  it('holds the accounts code to the same range once it exists', () => {
    for (const [path, mod] of Object.entries(passwordModules)) {
      expect(mod.PBKDF2_ITERATIONS, `${path} must export PBKDF2_ITERATIONS`).toBeTypeOf('number');
      expect(mod.PBKDF2_ITERATIONS).toBe(PBKDF2_CHOSEN);
    }
  });

  it('derives a 32-byte key at the floor and at the chosen count under workerd', async () => {
    for (const iter of [PBKDF2_SAFE_MIN, PBKDF2_CHOSEN]) {
      expect((await hashOnce(iter)).byteLength).toBe(32);
    }
  });

  it('records that local workerd has no 100,000 cap (production must be confirmed by the owner)', async () => {
    // If this starts failing, workerd gained a cap: re-run the spike and lower PBKDF2_SAFE_MAX.
    expect((await hashOnce(PBKDF2_SAFE_MIN + 1)).byteLength).toBe(32);
  });

  it('keeps ADR-0008 §2 and M-PW-1 in step with the chosen count', () => {
    const section2 = adr.slice(adr.indexOf('### 2. Password hashing'), adr.indexOf('### 3. Sessions'));
    expect(section2).toContain(`**${grouped(PBKDF2_CHOSEN)} iterations**`);
    const mpw1 = manifest.split('\n').find((l) => l.startsWith('- M-PW-1:')) ?? '';
    expect(mpw1).toContain(grouped(PBKDF2_CHOSEN));
  });
});
