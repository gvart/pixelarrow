import { describe, expect, it } from 'vitest';
import { WIDE_CHECKS, checkLayout, checkWide, variantOf, type Rect, type UiElement, type WideScreen } from '../src/ui/layoutCheck';
import { BUTTON_MAX, CTA_MAX, DIALOG_MAX, READING_MAX, ROW_MAX, metricsFor } from '../src/ui/sizeClass';
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

describe('nav-labels', () => {
  const item = (id: string, x: number) => el('interactive', R(x, 780, 70, 60), { id, nav: true });
  const label = (text: string, x: number) => el('text', R(x + 5, 820, 50, 14), { text });
  it('fails a nav item without a label or with an ellipsised one', () => {
    const els = [item('tab.camp', 0), label('CAMP', 0), item('tab.war', 80), item('tab.shop', 160), label('SHO…', 160)];
    expect(wide(els, screen(390, 844)).filter((v) => v.check === 'nav-labels').map((v) => v.ids[0])).toEqual(['tab.war', 'tab.shop']);
  });
});

describe('element-parity (needs uiCollapsed to drop an element)', () => {
  it('fails an id present at 390x844 and missing here, unless collapsed into a control that shows', () => {
    const base = ['a', 'b', 'c', 'd'];
    const here = new Set(['a', 'menu']);
    expect(checkParity(base, here, { c: 'menu', d: 'gone' }).map((v: { ids: string[] }) => v.ids[0])).toEqual(['b', 'd']);
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
