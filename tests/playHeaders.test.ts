import { describe, expect, it } from 'vitest';
import headers from '../public/_headers?raw';

// The game's HTML is served by the assets layer of the play Worker, which never
// runs Worker code for it, so its headers come from public/_headers (copied to
// dist/). Telegram Web must be able to frame play (ADR-0007); the Worker's own
// responses are covered in server/test/headers.test.ts.

/** Headers of the `/*` rule: the lines indented under it, up to the next rule. */
function rule(text: string, pattern: string): Record<string, string> {
  const out: Record<string, string> = {};
  let inRule = false;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inRule = line.trim() === pattern;
      continue;
    }
    if (!inRule) continue;
    const i = line.indexOf(':');
    out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

describe('play static headers (public/_headers)', () => {
  const all = rule(headers, '/*');

  it('lets play and Telegram Web frame every page', () => {
    expect(all['content-security-policy']).toBe("frame-ancestors 'self' https://web.telegram.org");
  });

  it('never sends X-Frame-Options', () => {
    const lines = headers.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    expect(lines.join('\n').toLowerCase()).not.toContain('x-frame-options');
  });
});
