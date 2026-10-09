import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, RESOURCES, contrast } from '../src/ui/tokens';

describe('design tokens', () => {
  it('every text / surface pair passes WCAG AA', () => {
    const fails = CONTRAST_PAIRS.filter((p) => contrast(p.fg, p.bg) < p.min).map(
      (p) => `${p.what}: ${p.fg.toString(16)} on ${p.bg.toString(16)} = ${contrast(p.fg, p.bg).toFixed(2)} < ${p.min}`,
    );
    expect(fails).toEqual([]);
  });

  it('every resource has its own icon and colour', () => {
    const icons = Object.values(RESOURCES).map((r) => r.icon);
    const colors = Object.values(RESOURCES).map((r) => r.color);
    expect(new Set(icons).size).toBe(icons.length);
    expect(new Set(colors).size).toBe(colors.length);
    // the ladder's rating star is not a currency
    expect(icons).not.toContain('star');
  });
});
