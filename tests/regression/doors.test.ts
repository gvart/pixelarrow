import { describe, expect, it } from 'vitest';
import { DOORS, ELSEWHERE, TABS } from '../../scripts/regression/doors.mjs';
import { sourceFiles } from '../support/nodeIo.js';

// QA-02: scripts/regression/hub-flows.mjs walks DOORS in a browser. This holds the table to the Back
// contract in src/platform/nav.ts, so the walk cannot drift from it: a new screen with a Back rule needs
// a door (or a reason in ELSEWHERE), and a door's expected landing is what resolveBack says.

// telegram.ts touches `window` only when attaching; give node a minimal one (as tests/nav.test.ts does).
(globalThis as Record<string, unknown>).window ??= { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
const { BACK_RULES, TAB_ROOTS, resolveBack } = await import('../../src/platform/nav');
const { MODE_TABS } = await import('../../src/ui/mosaic/tabLayout');

describe('regression doors (hub-flows.mjs)', () => {
  it('walks the five mode tabs in bar order, each to its hub', () => {
    expect(TABS.map(([tab]) => tab)).toEqual(MODE_TABS.map((m) => m.id));
    for (const [tab, hub] of TABS) expect(TAB_ROOTS[hub], hub).toBe(tab);
  });

  it('has a door to every screen Back leads away from, or names who covers it', () => {
    const screens = Object.entries(BACK_RULES)
      .filter(([, r]) => r.kind === 'parent' || r.kind === 'origin')
      .map(([k]) => k);
    const walked = new Set(DOORS.map((d) => d.at));
    for (const k of screens) expect(walked.has(k) || k in ELSEWHERE, `${k}: no door in scripts/regression/doors.mjs and no ELSEWHERE reason`).toBe(true);
    for (const k of Object.keys(ELSEWHERE)) expect(BACK_RULES[k], `ELSEWHERE.${k} is not a screen any more`).toBeDefined();
  });

  it("expects Back where the screen's Back rule sends it", () => {
    for (const d of DOORS) {
      if (d.at === d.back) continue; // a hub's sub-view: Back returns to the hub view (checked by `state` in the browser)
      expect(resolveBack(d.at, d.origin ? { scene: d.origin } : null)?.scene, d.name).toBe(d.back);
    }
  });

  it('taps only layout ids the game still draws', () => {
    const src = sourceFiles('src')
      .map((f) => f.text)
      .join('\n');
    for (const d of DOORS) {
      if (!('tap' in d.via)) continue;
      const id = d.via.tap;
      expect(src.includes(`'${id}'`), `${d.name}: no '${id}' in src/`).toBe(true);
    }
  });
});
