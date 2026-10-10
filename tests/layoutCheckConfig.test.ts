import { describe, expect, it } from 'vitest';
import src from '../scripts/layout-check.mjs?raw';
import allowlist from '../scripts/layout-allowlist.json';

// scripts/layout-check.mjs is a Playwright script; these guard its config, which CI runs as is (deploy.yml passes no --sizes).

describe('layout-check config', () => {
  it('checks 320x640 by default (V5-014)', () => {
    const sizes = /opt\('sizes', '([^']+)'\)/.exec(src)?.[1].split(',') ?? [];
    expect(sizes).toContain('320x640');
    expect(sizes).toContain('320x568');
  });

  it('stages the OnlineArmy garrison with a region id, not a {q,r} object (V5-016)', () => {
    expect(src).not.toMatch(/garrison: (i === 3 \? )?\{ q:/);
    expect(src).toMatch(/garrison: i === 3 \? \d+ : null/);
  });

  it('names the owning story of every allowlisted violation', () => {
    const keys = [...allowlist.A, ...allowlist.B, ...allowlist.C];
    const stories: Record<string, string> = allowlist.stories;
    for (const k of keys) expect(stories[k], k).toMatch(/^[A-Z]+-\d{2}$/);
  });
});
