import { describe, expect, it } from 'vitest';
import duel from '../src/scenes/duel/DuelScene.ts?raw';
import palette from '../docs/v5/art/palette.json';
import {
  ACCENT,
  COLOR_ROLE,
  CONTRAST_PAIRS,
  DISPLAY_MIN,
  GROUP_COLOR,
  MODE_ICON,
  MOSAIC,
  RARITY_INK,
  RESOURCES,
  TEXT_MIN,
  TYPE,
  TYPE_FACE,
  contrast,
  lineHeight,
} from '../src/ui/tokens';

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

describe('v5 tokens (art bible 4 and 7.2)', () => {
  const ui = palette.ui as Record<string, string>;
  const num = (h: string) => parseInt(h.slice(1), 16);
  /** The token behind each palette.json name. */
  const TOKEN: Record<string, number> = {
    ...Object.fromEntries(Object.keys(ui).filter((k) => k in MOSAIC).map((k) => [k, MOSAIC[k as keyof typeof MOSAIC]])),
    purchase: ACCENT.purchase,
    ...Object.fromEntries(GROUP_COLOR.map((c, i) => [`group${i + 1}`, c])),
    ...Object.fromEntries(Object.entries(RARITY_INK).map(([r, c]) => [`rar${r[0].toUpperCase()}${r.slice(1)}`, c])),
  };

  it('every colour of the art bible palette is a token with the same value', () => {
    const diff = Object.entries(ui).filter(([k, v]) => TOKEN[k] !== num(v)).map(([k, v]) => `${k}: ${v} vs ${TOKEN[k]?.toString(16)}`);
    expect(diff).toEqual([]);
  });

  it('every art bible pair is in CONTRAST_PAIRS: 4.5:1 for text, 3:1 for parts (A11Y-01, 02)', () => {
    const missing = palette.pairs
      .filter((p) => !CONTRAST_PAIRS.some((c) => c.fg === TOKEN[p.fg] && c.bg === TOKEN[p.bg] && c.min >= (p.kind === 'text' ? 4.5 : 3)))
      .map((p) => `${p.fg} on ${p.bg} (${p.use})`);
    expect(missing).toEqual([]);
    for (const p of CONTRAST_PAIRS) expect(p.min, p.what).toBeGreaterThanOrEqual(3);
  });

  it('grey means disabled only, and red only alerts, badges and errors (G2, G3, A11Y-05)', () => {
    const sat = (c: number) => {
      const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      const mx = Math.max(r, g, b);
      return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
    };
    const RED = new Set<number>([MOSAIC.alert, MOSAIC.inkBad, ACCENT.dangerFill, ACCENT.danger]);
    const misuse: string[] = [];
    for (const [role, c] of Object.entries(COLOR_ROLE)) {
      const grey = sat(c) < 0.15 && c !== MOSAIC.cream;
      if (grey && !role.startsWith('disabled')) misuse.push(`${role} is grey`);
      if (!grey && role.startsWith('disabled')) misuse.push(`${role} is not grey`);
      if (RED.has(c) !== ['alert', 'badge', 'error'].includes(role)) misuse.push(`${role}: red ${RED.has(c)}`);
    }
    expect(misuse).toEqual([]);
    // battle groups: no red group I any more (D-6)
    for (const g of GROUP_COLOR) expect(RED.has(g)).toBe(false);
  });

  it('type scale: meaningful text is at least 6.5 units, display caps at least 7 (A11Y-09, G10)', () => {
    expect(TEXT_MIN).toBe(6.5);
    expect(TYPE.caption).toBe(TEXT_MIN);
    for (const [k, v] of Object.entries(TYPE)) if (k !== 'micro') expect(v, k).toBeGreaterThanOrEqual(TEXT_MIN);
    for (const k of ['displayL', 'displayM', 'displayS'] as const) expect(TYPE[k]).toBeGreaterThanOrEqual(DISPLAY_MIN);
    expect(lineHeight(7)).toBe(9);
    expect(TYPE_FACE.display).toBe('roman');
  });
});
