import layoutCheckSrc from '../scripts/layout-check.mjs?raw';
import { describe, expect, it } from 'vitest';
import { KIT_PAGES, SHELL_TAB, SURFACES, VECTOR_GLYPHS, columns, kitIconNames, kitTab, stepPage, tokenGroups, typeRoles, v5IconKeys } from '../src/scenes/kit/catalog';
import { COLOR_ROLE, DISPLAY_MIN, GROUP_COLOR, MODE_ICON, MOSAIC, RESOURCES, TEXT_MIN, TYPE } from '../src/ui/tokens';

// F-05: the Kit shows the whole design system; these hold that nothing in it is left out.
describe('Kit pages', () => {
  it('ids and tabs are unique, and the shell demo is not a pager page', () => {
    expect(new Set(KIT_PAGES.map((p) => p.id)).size).toBe(KIT_PAGES.length);
    expect(new Set(KIT_PAGES.map((p) => p.tab)).size).toBe(KIT_PAGES.length);
    expect(KIT_PAGES.some((p) => p.tab === SHELL_TAB)).toBe(false);
  });

  it('opens by tab, by page id or by the kit query parameter; anything else opens the first page', () => {
    expect(kitTab({ tab: 0 })).toBe(0);
    expect(kitTab({ tab: SHELL_TAB })).toBe(SHELL_TAB);
    expect(kitTab({ page: 'states' })).toBe(KIT_PAGES.find((p) => p.id === 'states')!.tab);
    expect(kitTab({}, '?scene=Kit&kit=icons')).toBe(KIT_PAGES.find((p) => p.id === 'icons')!.tab);
    expect(kitTab({ tab: 99 })).toBe(KIT_PAGES[0].tab);
    expect(kitTab(undefined, '?scene=Kit&kit=nope')).toBe(KIT_PAGES[0].tab);
    expect(kitTab({ tab: 0, page: 'icons' })).toBe(0);
  });

  it('the pager walks every page and wraps round', () => {
    const seen = new Set<number>();
    let tab = KIT_PAGES[0].tab;
    for (let i = 0; i < KIT_PAGES.length; i++) {
      seen.add(tab);
      tab = stepPage(tab, 1);
    }
    expect(seen.size).toBe(KIT_PAGES.length);
    expect(tab).toBe(KIT_PAGES[0].tab);
    expect(stepPage(KIT_PAGES[0].tab, -1)).toBe(KIT_PAGES[KIT_PAGES.length - 1].tab);
  });

  it('the layout check visits every page (a kit-<id> screen each)', () => {
    const src: string = layoutCheckSrc;
    for (const p of KIT_PAGES) expect(src, `kit-${p.id}`).toContain(`id: 'kit-${p.id}'`);
  });
});

describe('Kit catalog', () => {
  it('shows every colour role, every mosaic token, the four groups and every resource', () => {
    const groups = tokenGroups();
    const names = (src: string) => groups.find((g) => g.source === src)!.swatches.map((s) => s.name);
    expect(names('COLOR_ROLE')).toEqual(Object.keys(COLOR_ROLE));
    expect(names('MOSAIC')).toEqual(Object.keys(MOSAIC));
    expect(names('RESOURCES')).toEqual(Object.keys(RESOURCES));
    expect(groups.find((g) => g.source === 'GROUP_COLOR')!.swatches.map((s) => s.color)).toEqual([...GROUP_COLOR]);
  });

  it('shows every type role, none meaningful under the floor', () => {
    const roles = typeRoles();
    expect(roles.map((r) => r.name).sort()).toEqual(Object.keys(TYPE).sort());
    for (const r of roles) {
      if (r.face === 'display') expect(r.size, r.name).toBeGreaterThanOrEqual(DISPLAY_MIN);
      if (r.face === 'text') expect(r.size, r.name).toBeGreaterThanOrEqual(TEXT_MIN);
    }
    expect(roles.filter((r) => r.face === 'micro').map((r) => r.name)).toEqual(['micro']);
  });

  it('lists every icon once, with the morale glyphs, markers, v5 keys, resources and modes', () => {
    const names = kitIconNames();
    expect(new Set(names).size).toBe(names.length);
    for (const k of [...VECTOR_GLYPHS, ...v5IconKeys().map((v) => v.key), ...Object.values(RESOURCES).map((r) => r.icon), ...Object.values(MODE_ICON)]) expect(names, k).toContain(k);
  });

  it('shows the surfaces of every button role, the disabled face and the sheet', () => {
    for (const s of ['btnPrimary', 'btnBronze', 'btnNeutral', 'btnStone', 'btnLit', 'btnBuy', 'btnDanger', 'sheet', 'tabBar']) expect(SURFACES).toContain(s);
  });

  it('columns fit the width', () => {
    expect(columns(134, 64, 4)).toBe(2);
    expect(columns(10, 64, 4)).toBe(1);
    expect(columns(200, 64, 4)).toBe(3);
  });
});
