import { describe, expect, it } from 'vitest';
import manifest from './SUITE.md?raw';
import runner from '../../scripts/regression/run.mjs?raw';

// QA-02: the manifest and the runner list what is actually there (derived from the folders), so a script
// or test added later cannot sit outside the suite, and every KNOWN bug the scripts mark is written down.

const scripts = import.meta.glob('../../scripts/regression/*.mjs', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// (a glob leaves out the file that holds it)
const tests = [...Object.keys(import.meta.glob('./*.test.ts')), './suite.test.ts'];
const base = (p: string) => p.split('/').pop()!;
/** Modules, not runnable checks. */
const HELPERS = new Set(['lib.mjs', 'doors.mjs', 'run.mjs']);

describe('regression suite manifest (QA-02)', () => {
  const runnable = Object.keys(scripts).map(base).filter((f) => !HELPERS.has(f));

  it('finds the scripts and tests (the derivation ran)', () => {
    expect(runnable.length).toBeGreaterThanOrEqual(3);
    expect(tests.length).toBeGreaterThanOrEqual(3);
  });

  it('runs and lists every regression script', () => {
    for (const f of runnable) {
      expect(runner.includes(`'scripts/regression/${f}'`), `${f} is not in run.mjs SUITE`).toBe(true);
      expect(manifest.includes(`\`${f}\``), `${f} is not in SUITE.md`).toBe(true);
    }
  });

  it('lists every regression test file', () => {
    for (const f of tests.map(base)) expect(manifest.includes(`\`${f}\``), `${f} is not in SUITE.md`).toBe(true);
  });

  it('lists every KNOWN bug the scripts mark', () => {
    const ids = Object.values(scripts).flatMap((src) => [...src.matchAll(/known\('(QA02-B\d+)'/g)].map((m) => m[1]));
    for (const id of ids) expect(manifest.includes(`| ${id} |`), `${id} is not under Known bugs in SUITE.md`).toBe(true);
  });
});
