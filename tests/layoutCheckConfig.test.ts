import { describe, expect, it } from 'vitest';
import src from '../scripts/layout-check.mjs?raw';
import workflow from '../.github/workflows/deploy.yml?raw';
// @ts-expect-error plain .mjs module without types
import { MATRIX } from '../scripts/lib/layoutMatrix.mjs';

// scripts/layout-check.mjs is a Playwright script; these guard its config and the CI layout job (one job per size).

describe('layout-check config', () => {
  it('CI checks every matrix size and the v5 phone sizes, 320x640 included (V5-014)', () => {
    const sizes = /size: \[([^\]]+)\]/.exec(workflow)?.[1].split(',').map((s) => s.trim()) ?? [];
    expect(MATRIX.v5).toContain('320x640');
    expect(MATRIX.v5).toContain('320x568');
    expect(sizes.sort()).toEqual([...MATRIX.all, ...MATRIX.v5].sort());
  });

  it('stages the OnlineArmy garrison with a region id, not a {q,r} object (V5-016)', () => {
    expect(src).not.toMatch(/garrison: (i === 3 \? )?\{ q:/);
    expect(src).toMatch(/garrison: i === 3 \? \d+ : null/);
  });
});
