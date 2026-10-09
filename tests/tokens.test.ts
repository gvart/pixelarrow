import { describe, expect, it } from 'vitest';
import duel from '../src/scenes/duel/DuelScene.ts?raw';
import { CONTRAST_PAIRS, MODE_ICON, RESOURCES, contrast } from '../src/ui/tokens';

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

  it('one icon per mode, never a resource icon, and the Duels screen takes them from MODE_ICON', () => {
    const res = new Set<string>(Object.values(RESOURCES).map((r) => r.icon));
    const byIcon = new Map<string, string[]>();
    for (const [m, ic] of Object.entries(MODE_ICON)) {
      expect(res.has(ic)).toBe(false);
      byIcon.set(ic, [...(byIcon.get(ic) ?? []), m]);
    }
    // only raids and their defence share one (the same mode)
    for (const [ic, modes] of byIcon) if (modes.length > 1) expect([ic, modes.sort()]).toEqual(['raid', ['defence', 'raid']]);
    // P1: the Team's "Use for" chips used a flag, swords and a shield for the three modes
    expect(duel).toMatch(/USE_ICONS[^=]*=\s*\{\s*ladder: MODE_ICON\.ladder, arena: MODE_ICON\.arena, defence: MODE_ICON\.defence\s*\}/);
    expect(duel).toMatch(/MODE_ICONS = \[MODE_ICON\.ladder, MODE_ICON\.arena\]/);
  });
});
