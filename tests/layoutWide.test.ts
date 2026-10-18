import { describe, expect, it } from 'vitest';
import { WIDE_CHECKS, checkLayout, checkWide, shownIds, variantOf, type Rect, type UiElement, type WideScreen } from '../src/ui/layoutCheck';
import { BUTTON_MAX, CTA_MAX, DIALOG_MAX, READING_MAX, ROW_MAX, SIDE_PANEL_MAX, SIDE_PANEL_MIN, metricsFor } from '../src/ui/sizeClass';
// @ts-expect-error plain .mjs module without types
import { MATRIX, WIDE_CHECKS as SCRIPT_CHECKS, checkParity, WIDE_RULES, isFoundationScreen, isPending, loadPending, stableRewrite, triageWide } from '../scripts/lib/layoutMatrix.mjs';

// The client tsconfig has no Node types: reach node:fs untyped (as tests/platformBoundary.test.ts does).
const { mkdtempSync, writeFileSync } = (await import('node:fs' as string)) as { mkdtempSync(p: string): string; writeFileSync(p: string, s: string): void };
const { tmpdir } = (await import('node:os' as string)) as { tmpdir(): string };
const join = (...p: string[]) => p.join('/');

// The landscape layout-check rules (design/ux/landscape-v6.md §5, V6-RFND-03).

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
let n = 0;
const el = (kind: UiElement['kind'], r: Rect, extra: Partial<UiElement> = {}): UiElement => ({ id: extra.id ?? `e${n++}`, kind, rect: r, visible: r, scene: 'S', path: 'p', ...extra });

/** A W x H CSS px viewport, no insets; `col` makes the canvas the v5 legacy column (min(W, 0.64 H), centred). */
function screen(W: number, H: number, o: Partial<WideScreen> & { col?: boolean } = {}): WideScreen {
  const m = metricsFor(W, H, 1, false);
  const cw = o.col ? Math.min(W, H * 0.64) : W;
  const full = R(0, 0, W, H);
  return {
    safe: full,
    game: full,
    canvas: R((W - cw) / 2, 0, cw, H),
    m: { cls: m.cls, land: m.land, S: m.S, navW: m.navW, contentW: m.contentW },
    layouts: [{ scene: 'S', cls: m.cls, land: m.land, kind: 'menu' }],
    kind: 'menu',
    opaque: [],
    scrollTop: true,
    ...o,
  };
}
const wide = (els: UiElement[], s: WideScreen) => checkWide(els, s, WIDE_RULES);
const kinds = (els: UiElement[], s: WideScreen) => [...new Set(wide(els, s).map((v) => v.check))].sort();

/** A wide content grid filling the pane right of the rail at 1280x800 (S 2, rail 72 UI = 144 CSS). */
const goodWide = () => {
  const out: UiElement[] = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out.push(el('interactive', R(150 + c * 280, 20 + r * 190, 220, 120)));
  return out;
};

describe('thresholds table (one table, next to the sizes)', () => {
  it('holds every §5 threshold and agrees with the §2.3 maxima in src/ui/sizeClass.ts', () => {
    expect(WIDE_RULES.wastedWidth).toEqual({ medium: 0.8, expanded: 0.7 });
    expect(WIDE_RULES.emptyColumn).toEqual({ width: 0.25, height: 0.6, variants: ['compact-land', 'medium', 'expanded'] });
    expect(WIDE_RULES.stretched).toEqual({ row: ROW_MAX, button: BUTTON_MAX, cta: CTA_MAX, line: READING_MAX, dialog: DIALOG_MAX });
    expect(WIDE_RULES.sidePanel).toEqual({ 'compact-land': { min: 220, max: 280, share: 0.6 }, expanded: { min: SIDE_PANEL_MIN, max: SIDE_PANEL_MAX } });
    expect(WIDE_RULES.fieldCoverage).toEqual({ expanded: 0.6, 'compact-land': 0.5, medium: 0.5, 'compact-port': 0.4 });
    expect(WIDE_RULES.letterbox).toBe(2);
    expect(MATRIX.all).toHaveLength(10);
  });

  it('names nine checks, none of which the old checkLayout emits', () => {
    expect(WIDE_CHECKS).toEqual(['letterbox', 'class-match', 'wasted-width', 'empty-column', 'stretched', 'field-coverage', 'above-fold', 'element-parity', 'nav-labels']);
    expect([...SCRIPT_CHECKS]).toEqual([...WIDE_CHECKS]);
  });

  it('keys classes by variant', () => {
    expect(variantOf('compact', false)).toBe('compact-port');
    expect(variantOf('compact', true)).toBe('compact-land');
    expect(variantOf('expanded', true)).toBe('expanded');
  });
});

describe('a well-built wide screen passes all nine', () => {
  it('1280x800 with a full-width grid: no finding', () => {
    expect(wide(goodWide(), screen(1280, 800))).toEqual([]);
  });
});

describe('letterbox', () => {
  it('fails when the canvas is the v5 column inside the safe box (the 0.64 cap)', () => {
    const v = wide(goodWide(), screen(1280, 800, { col: true })).filter((x) => x.check === 'letterbox');
    expect(v).toHaveLength(1);
    expect(v[0].detail).toMatch(/512x800/);
  });
  it('fails when #game is narrower than the safe box by more than 2 px, passes within 2', () => {
    expect(kinds([], screen(1280, 800, { game: R(0, 0, 1276, 800), canvas: R(0, 0, 1276, 800) }))).toContain('letterbox');
    expect(wide([], screen(1280, 800, { game: R(0, 0, 1278.5, 800), canvas: R(0, 0, 1278.5, 800) })).filter((x) => x.check === 'letterbox')).toEqual([]);
  });
});

describe('class-match', () => {
  it('fails when the registered variant differs from the size class', () => {
    const s = screen(1280, 800, { layouts: [{ scene: 'S', cls: 'compact', land: false, kind: 'menu' }] });
    expect(kinds(goodWide(), s)).toEqual(['class-match']);
  });
  it('fails when no layout is registered', () => {
    expect(wide(goodWide(), screen(1280, 800, { layouts: [] })).map((v) => v.detail)).toEqual([expect.stringMatching(/no layout registered/)]);
  });
});

describe('wasted-width (menu screens, medium and expanded)', () => {
  const column = () => [el('interactive', R(400, 100, 480, 60)), el('text', R(420, 200, 400, 20))]; // 480 of 1136 CSS = 42%
  it('fails a centred column at 1280x800 (expanded, 70%)', () => {
    expect(kinds(column(), screen(1280, 800))).toContain('wasted-width');
  });
  it('passes at 70% of contentW but not 80% (expanded vs medium)', () => {
    // 1280x800: content = 1280 - 144 = 1136 CSS; 0.72 of it
    const els = [el('interactive', R(144, 10, 100, 50)), el('interactive', R(144 + 0.72 * 1136 - 100, 10, 100, 50))];
    expect(wide(els, screen(1280, 800)).filter((v) => v.check === 'wasted-width')).toEqual([]);
    // 768x1024 medium portrait: contentW 384 UI = 768 CSS; 0.72 fails at 80%
    const med = [el('interactive', R(0, 10, 100, 50)), el('interactive', R(0.72 * 768 - 100, 10, 100, 50))];
    expect(kinds(med, screen(768, 1024))).toContain('wasted-width');
  });
  it('ignores bars that span (uiStretch), the nav, field scenes and compact', () => {
    const bar = el('interactive', R(0, 0, 1280, 40), { stretch: true });
    const rail = el('interactive', R(0, 100, 144, 600), { id: 'nav.camp', nav: true });
    expect(kinds([bar, rail, ...column()], screen(1280, 800))).toContain('wasted-width');
    expect(kinds(column(), screen(1280, 800, { kind: 'field', layouts: [{ scene: 'S', cls: 'expanded', land: true, kind: 'field' }] }))).not.toContain('wasted-width');
    expect(kinds([el('interactive', R(400, 100, 40, 60))], screen(390, 844))).not.toContain('wasted-width');
  });
});

describe('empty-column', () => {
  it('fails a one-sided layout: under a full-width header, the right 40% holds nothing', () => {
    const els = [el('text', R(150, 4, 1120, 40))];
    for (let r = 0; r < 6; r++) els.push(el('interactive', R(150, 60 + r * 120, 650, 100)));
    expect(kinds(els, screen(1280, 800))).toEqual(['empty-column']);
  });
  it('passes when the empty strip is shorter than 60% of the height', () => {
    const els = [el('interactive', R(150, 10, 1100, 400)), el('interactive', R(150, 420, 600, 300))];
    expect(wide(els, screen(1280, 800)).filter((v) => v.check === 'empty-column')).toEqual([]);
  });
  it('does not apply in compact portrait', () => {
    expect(wide([el('interactive', R(0, 0, 100, 50))], screen(390, 844)).filter((v) => v.check === 'empty-column')).toEqual([]);
  });
});

describe('stretched (UI px: rows 360, buttons 240, CTA 300, lines 300, dialogs 320)', () => {
  const s = screen(1280, 800); // S 2
  const at = (e: UiElement) => wide([...goodWide(), e], s).filter((v) => v.check === 'stretched');
  it('fails a row wider than 360 UI px, passes one at 360', () => {
    expect(at(el('interactive', R(150, 700, 722, 40), { role: 'row' }))).toHaveLength(1);
    expect(at(el('interactive', R(150, 700, 720, 40), { role: 'row' }))).toHaveLength(0);
  });
  it('allows a declared primary CTA to 300, a plain button to 240', () => {
    expect(at(el('interactive', R(150, 700, 560, 40), { role: 'button' }))).toHaveLength(1);
    expect(at(el('interactive', R(150, 700, 560, 40), { role: 'button', primary: true }))).toHaveLength(0);
    expect(at(el('interactive', R(150, 700, 610, 40), { role: 'button', primary: true }))).toHaveLength(1);
  });
  it('fails a wrapped line wider than 300 and a dialog wider than 320', () => {
    expect(at(el('text', R(150, 700, 610, 40), { role: 'line' }))).toHaveLength(1);
    expect(at(el('box', R(150, 100, 650, 400), { role: 'dialog' }))).toHaveLength(1);
  });
  it('lets bars that span opt out with uiStretch', () => {
    expect(at(el('interactive', R(0, 0, 1280, 40), { role: 'button', stretch: true }))).toHaveLength(0);
  });
});

describe('field-coverage (field scenes)', () => {
  const field = (W: number, H: number, opaque: Rect[], o: Partial<WideScreen> = {}) => {
    const s = screen(W, H, o);
    return wide([], { ...s, kind: 'field', layouts: [{ ...s.layouts[0], kind: 'field' }], opaque, ...o }).filter((v) => v.check === 'field-coverage');
  };
  it('fails below 60% at expanded, counting overlapping HUD rects once', () => {
    expect(field(1280, 800, [R(0, 0, 1280, 300), R(0, 200, 1280, 100)])).toHaveLength(0); // 37.5% covered
    expect(field(1280, 800, [R(0, 0, 1280, 300), R(0, 200, 1280, 150)])).toHaveLength(1); // 43.75% covered
  });
  it('uses 50% in compact landscape and 40% in compact portrait', () => {
    expect(field(844, 390, [R(0, 0, 844, 180)])).toHaveLength(0);
    expect(field(844, 390, [R(0, 0, 844, 200)])).toHaveLength(1);
    expect(field(390, 844, [R(0, 0, 390, 500)])).toHaveLength(0);
    expect(field(390, 844, [R(0, 0, 390, 520)])).toHaveLength(1);
  });
  it('counts the stage beside a letterboxed field as lost field', () => {
    expect(field(1280, 800, [], { canvas: R(384, 0, 512, 800) })).toHaveLength(1);
  });
});

describe('above-fold', () => {
  it('fails when the primary is cut by its scroll area or off the canvas at scroll 0', () => {
    const cta = el('interactive', R(150, 760, 400, 60), { primary: true, visible: R(150, 760, 400, 40), clip: R(0, 0, 1280, 800) });
    expect(kinds([...goodWide(), cta], screen(1280, 800))).toContain('above-fold');
  });
  it('is judged at scroll 0 only', () => {
    const cta = el('interactive', R(150, 760, 400, 60), { primary: true, visible: R(150, 760, 400, 40) });
    expect(kinds([...goodWide(), cta], screen(1280, 800, { scrollTop: false }))).not.toContain('above-fold');
  });
});

describe('nav-labels (the rail, and tab bars outside compact portrait: V6-066)', () => {
  const item = (id: string, x: number) => el('interactive', R(x, 780, 70, 60), { id, nav: true });
  const label = (text: string, x: number) => el('text', R(x + 5, 820, 50, 14), { text });
  /** A nav rail item at 1280x800 (rail 144 CSS wide), its label under its icon. */
  const railItem = (id: string, y: number) => el('interactive', R(0, y, 144, 96), { id, nav: true });
  const railLabel = (text: string, y: number) => el('text', R(40, y + 60, 64, 20), { text });
  const navLabels = (els: UiElement[], s: WideScreen) => wide(els, s).filter((v) => v.check === 'nav-labels').map((v) => v.ids[0]);
  it('fails a landscape rail item without a label or with an ellipsised one', () => {
    const els = [railItem('nav.camp', 100), railLabel('CAMP', 100), railItem('nav.war', 200), railItem('nav.shop', 300), railLabel('SHO…', 300)];
    expect(navLabels(els, screen(1280, 800))).toEqual(['nav.war', 'nav.shop']);
  });
  it('fails an unlabelled tab bar outside compact portrait (medium)', () => {
    expect(navLabels([item('tab.camp', 0), label('CAMP', 0), item('tab.war', 80)], screen(768, 1024))).toEqual(['tab.war']);
  });
  it('passes the compact-portrait tab bar, the v5 reference that labels the active tab only (V5-068)', () => {
    const els = [item('tab.camp', 0), label('CAMP', 0), item('tab.war', 80), item('tab.shop', 160), label('SHO…', 160)];
    expect(navLabels(els, screen(390, 844))).toEqual([]);
    expect(navLabels(els, screen(320, 693))).toEqual([]);
  });
});

describe('element-parity (needs uiCollapsed to drop an element)', () => {
  it('fails an id present at 390x844 and missing here, unless collapsed into a control that shows', () => {
    const base = ['a', 'b', 'c', 'd'];
    const here = new Set(['a', 'menu']);
    expect(checkParity(base, here, { c: 'menu', d: 'gone' }).map((v: { ids: string[] }) => v.ids[0])).toEqual(['b', 'd']);
  });
});

// V6-063: with a dialog, sheet or side panel open, wasted-width and empty-column judge the base screen
// beneath it; the panel is judged by its own caps (dialog 320, side panel 240..320 UI px in expanded).
describe('open panels (V6-063): the base screen is measured, the panel by its caps', () => {
  const s = () => screen(1280, 800); // S 2: the content region is x 144..1280 CSS
  /** A side panel docked at the right of the content (240 UI = 480 CSS), with its title and close button. */
  const sidePanel = (w = 480) => [el('box', R(1268 - w, 80, w, 700), { role: 'side' }), el('text', R(1280 - w, 90, 200, 20), { panel: true }), el('interactive', R(1222, 82, 44, 44), { panel: true })];
  /** A base grid left of the panel: three columns, 150 .. 770 CSS. */
  const leftGrid = () => {
    const out: UiElement[] = [];
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) out.push(el('interactive', R(150 + c * 220, 20 + r * 190, 180, 120)));
    return out;
  };
  const kindsOf = (els: UiElement[], o: Partial<WideScreen> = {}) => kinds(els, { ...s(), ...o });

  it('passes a modal task panel over a full-width base (the base beneath the shade is measured)', () => {
    expect(wide(sidePanel(), { ...s(), under: goodWide() })).toEqual([]);
  });

  it('passes an intentionally narrow inspector: the strip it docks in is the panel, not wasted width', () => {
    expect(wide([...leftGrid(), ...sidePanel()], s())).toEqual([]);
  });

  it('still fails real wasted width under a modal dialog', () => {
    const column = [el('interactive', R(400, 100, 480, 60)), el('text', R(420, 200, 400, 20))];
    const dialog = [el('box', R(320, 250, 640, 300), { role: 'dialog' }), el('interactive', R(340, 480, 290, 44), { panel: true }), el('interactive', R(650, 480, 290, 44), { panel: true })];
    expect(kindsOf(dialog, { under: column })).toEqual(['empty-column', 'wasted-width']);
  });

  it('still fails a narrow base column beside an inspector', () => {
    const column = [0, 1, 2, 3].map((r) => el('interactive', R(150, 20 + r * 190, 200, 120)));
    expect(kindsOf([...column, ...sidePanel()])).toContain('wasted-width');
  });

  it("never counts the panel's own elements as base content", () => {
    const full = [el('box', R(320, 100, 640, 600), { role: 'dialog' })];
    for (let c = 0; c < 4; c++) full.push(el('interactive', R(150 + c * 280, 300, 220, 44), { panel: true }));
    expect(kindsOf(full, { under: [] })).toContain('wasted-width');
  });

  it('checks a side panel by the §3.4 widths: 240..320 UI px in expanded', () => {
    const stretched = (w: number) => wide([...leftGrid(), ...sidePanel(w)], s()).filter((v) => v.check === 'stretched');
    expect(stretched(480)).toEqual([]); // 240 UI
    expect(stretched(640)).toEqual([]); // 320 UI
    expect(stretched(660)).toHaveLength(1); // 330 UI: too wide
    expect(stretched(400)).toHaveLength(1); // 200 UI: narrower than an item card
  });

  it('in compact landscape: up to 280 UI px, at least 220 or 60% of VW (Settings)', () => {
    // 844x390 inside Telegram's insets: 726x323 CSS, S 2, VW 363
    const t = screen(726, 323);
    const at = (w: number) => wide([el('box', R(726 - 2 * w, 0, 2 * w, 300), { role: 'side' })], t).filter((v) => v.check === 'stretched');
    expect(at(218)).toEqual([]); // 60% of 363
    expect(at(280)).toEqual([]);
    expect(at(200)).toHaveLength(1);
    expect(at(290)).toHaveLength(1);
  });
});

describe('shownIds (element-parity reads these)', () => {
  it('counts a named element that shows, or that sits in a scroll area (one scroll away), never a hidden one', () => {
    const clip = R(0, 0, 100, 100);
    const els = [
      el('interactive', R(0, 0, 50, 50), { id: 'on', named: true }),
      el('interactive', R(0, 200, 50, 50), { id: 'scrolled', named: true, clip, visible: R(0, 200, 50, 0) }),
      el('interactive', R(0, 200, 50, 50), { id: 'gone', named: true, visible: R(0, 200, 0, 0) }),
      el('interactive', R(0, 0, 50, 50), { id: 'unnamed' }),
    ];
    expect(shownIds(els)).toEqual(['on', 'scrolled']);
  });

  // V6-066: a virtualised ScrollList builds only the rows near its window; the ids it registers for its whole
  // content (uiListIds) count, so an off-screen row is not a dropped element, while a row truly removed still is
  const rowIds = (n: number) => Array.from({ length: n }, (_, i) => `settings.row${i}`);
  /** The rows a virtualised list renders: `from .. to` only. */
  const rendered = (from: number, to: number) => rowIds(to + 1).slice(from).map((id, i) => el('interactive', R(0, (from + i) * 50, 300, 44), { id, named: true, clip: R(0, 0, 300, 400) }));
  it('counts every row of a virtualised list for element-parity', () => {
    const base = shownIds(rendered(0, 9), rowIds(12)); // 390x844: rows 0..9 built
    const here = new Set(shownIds(rendered(0, 4), rowIds(12))); // 844x390: rows 0..4 built
    expect(checkParity(base, here, {})).toEqual([]);
  });
  it('still fails a row removed at one size', () => {
    const base = shownIds(rendered(0, 9), rowIds(12));
    const here = new Set(shownIds(rendered(0, 4), rowIds(11))); // the last row is gone from the list
    expect(checkParity(base, here, {}).map((v: { ids: string[] }) => v.ids[0])).toEqual(['settings.row11']);
  });
});

describe('the old checks ignore the new boxes', () => {
  it('a dialog box outside the canvas is not an old-style violation', () => {
    expect(checkLayout([el('box', R(-10, 0, 50, 50), { role: 'dialog' })], { width: 100, height: 100 })).toEqual([]);
  });
});

// ------------------------------------------------------------------ enforcement per family (V6-021)

describe('pending families: reported, not failed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'allow-'));
  writeFileSync(join(dir, 'V6-RSCR-09.json'), JSON.stringify({ pending: true, entries: [] }));
  writeFileSync(join(dir, 'V6-RSCR-01.json'), JSON.stringify({ entries: [] }));
  const pending = loadPending(dir);

  it('reads the pending flag per family file', () => {
    expect([...pending]).toEqual(['V6-RSCR-09']);
    expect(isPending('codex-beast', pending)).toBe(true);
    expect(isPending('menu', pending)).toBe(false);
  });

  // a v5 column of rows, laid out in the legacy canvas (512 CSS wide, centred at 1280x800)
  const rows = Array.from({ length: 7 }, (_, r) => el('interactive', R(10, 10 + r * 110, 490, 90)));
  const letterboxed = wide(rows, screen(1280, 800, { col: true }));
  it('fixture: a pending family (Codex, not opted in) at 1280x800 reports its findings without failing', () => {
    const t = triageWide({ screen: 'codex', owner: 'F', responsive: false, violations: letterboxed }, pending);
    expect(t.pending.map((v: { check: string }) => v.check)).toContain('letterbox');
    expect(t.enforced).toEqual([]);
  });
  it('fixture: an opted-in (migrated) screen fails the same rule, even inside a pending family', () => {
    const t = triageWide({ screen: 'codex', owner: 'F', responsive: true, violations: letterboxed }, pending);
    expect(t.pending).toEqual([]);
    expect(t.enforced.map((v: { check: string }) => v.check)).toContain('letterbox');
  });
  it('a family without the flag is enforced; old checks pass through untouched', () => {
    const old = { check: 'overlap', ids: ['a', 'b'], detail: '' };
    const t = triageWide({ screen: 'menu', owner: 'F', responsive: false, violations: [old, ...letterboxed] }, pending);
    expect(t.enforced.map((v: { check: string }) => v.check)).toEqual(['overlap', 'letterbox', 'wasted-width', 'empty-column']);
  });
  it('the foundation screens (Menu, Settings, Kit) can never allowlist the new checks', () => {
    expect(isFoundationScreen('menu', 'F')).toBe(true);
    expect(isFoundationScreen('menu-settings-about', 'F')).toBe(true);
    expect(isFoundationScreen('kit-tokens', 'F')).toBe(true);
    expect(isFoundationScreen('menu-shop', 'B')).toBe(false);
    expect(isFoundationScreen('codex', 'F')).toBe(false);
  });
});

// ------------------------------------------------------------------ --update-allowlist stability (V6-057)

describe('--update-allowlist: a finding is added only after it repeats in 2 runs', () => {
  const owners = { menu: 'F', 'army-list': 'B', codex: 'F' };
  const ran = { screens: new Set(['army-list', 'codex']), sizes: new Set(MATRIX.all), pairs: undefined };
  const seen = (sizes: string[]) => ({ screen: 'army-list', sizes: new Set(sizes) });
  const allowed = new Map([
    ['codex|touch-size|tab.codex@844x390', 'V6-RSCR-09'],
    ['army-list|overlap|a|b@844x390', 'V6-RSCR-05'],
  ]);

  it('run 1 holds a new finding as a candidate; run 2 adds it; a one-off is never added', () => {
    const found1 = new Map([['army-list|spacing|x|y', seen(['1280x800'])], ['army-list|clipped|z', seen(['844x390'])]]);
    const r1 = stableRewrite(allowed, found1, ran, owners, new Set(['V6-RSCR-09', 'V6-RSCR-05']), { add: [], drop: [] });
    expect(r1.out['V6-RSCR-05']).not.toContain('army-list|spacing|x|y@1280x800');
    expect(r1.candidates.add).toEqual(['army-list|clipped|z@844x390', 'army-list|spacing|x|y@1280x800']);
    const found2 = new Map([['army-list|spacing|x|y', seen(['1280x800'])]]);
    const r2 = stableRewrite(allowed, found2, ran, owners, new Set(['V6-RSCR-09', 'V6-RSCR-05']), r1.candidates);
    expect(r2.out['V6-RSCR-05']).toContain('army-list|spacing|x|y@1280x800');
    expect(r2.out['V6-RSCR-05']).not.toContain('army-list|clipped|z@844x390');
  });

  it('never drops entries of a pending family, drops others only when missing twice', () => {
    const none = new Map();
    const r1 = stableRewrite(allowed, none, ran, owners, new Set(['V6-RSCR-09']), { add: [], drop: [] });
    expect(r1.out['V6-RSCR-09']).toEqual(['codex|touch-size|tab.codex@844x390']);
    expect(r1.out['V6-RSCR-05']).toEqual(['army-list|overlap|a|b@844x390']);
    expect(r1.candidates.drop).toEqual(['army-list|overlap|a|b@844x390']);
    const r2 = stableRewrite(allowed, none, ran, owners, new Set(['V6-RSCR-09']), r1.candidates);
    expect(r2.out['V6-RSCR-09']).toEqual(['codex|touch-size|tab.codex@844x390']);
    expect(r2.out['V6-RSCR-05'] ?? []).toEqual([]);
  });
});
