import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without types
import { KNOWN_CRASHES, allows, configsFor, mergeAllowlist, rewriteAllowlist, sizesFor, staleEntries, storyOf } from '../scripts/lib/layoutMatrix.mjs';

// The v6 screen matrix (brief "Hard constraints: screen matrix", V6-GATE-01).
describe('layout-check matrix', () => {
  it('runs the ten matrix sizes by default', () => {
    expect(sizesFor()).toEqual(['390x844', '360x780', '320x693', '844x390', '768x1024', '820x1180', '1024x768', '1280x800', '1440x900', '1920x1080']);
  });

  it('selects groups with --matrix, several at once', () => {
    expect(sizesFor('phone')).toEqual(['390x844', '360x780', '320x693']);
    expect(sizesFor('tablet')).toEqual(['768x1024', '820x1180']);
    expect(sizesFor('landscape')).toEqual(['844x390', '1024x768', '1280x800', '1440x900', '1920x1080']);
    expect(sizesFor('phone,tablet')).toHaveLength(5);
  });

  it('lets --sizes win over --matrix', () => {
    expect(sizesFor('all', '320x568,375x667')).toEqual(['320x568', '375x667']);
  });

  it('rejects an unknown group', () => {
    expect(() => sizesFor('desktop')).toThrow(/desktop/);
  });
});

describe('layout-check configurations', () => {
  it('runs the Telegram insets on phones only, landscape insets at 844x390', () => {
    const cfgs = configsFor(['390x844', '844x390', '1280x800'], ['en'], ['plain', 'tg']);
    expect(cfgs.map((c: { size: number[]; insets: string }) => `${c.size.join('x')} ${c.insets}`)).toEqual(['390x844 plain', '390x844 tg', '844x390 plain', '844x390 tg', '1280x800 plain']);
    const tg = (s: string) => cfgs.find((c: { size: number[]; insets: string }) => c.size.join('x') === s && c.insets === 'tg').tg;
    expect(tg('390x844')).toEqual({ safeTop: 59, contentTop: 46, safeBottom: 34 });
    expect(tg('844x390')).toMatchObject({ safeLeft: 59, safeRight: 59, safeBottom: 21 });
  });
});

describe('layout allowlist', () => {
  it('merges one file per owner story, each entry tagged with its story', () => {
    const allowed = mergeAllowlist(Object.entries({ 'V6-RSCR-01': ['menu|touch-size|a@844x390'], 'V6-RSCR-04': ['duel-shop-sell|text-size|*'] }));
    expect([...allowed]).toEqual([
      ['menu|touch-size|a@844x390', 'V6-RSCR-01'],
      ['duel-shop-sell|text-size|*', 'V6-RSCR-04'],
    ]);
  });

  it('scopes an @WxH entry to its size; an unscoped entry or a screen|check|* covers every size', () => {
    const allowed = mergeAllowlist(Object.entries({ A: ['menu|touch-size|a@844x390', 'army|overlap|x|y', 'hero|text-size|*@1280x800'] }));
    expect(allows(allowed, 'menu|touch-size|a', '844x390')).toBe(true);
    expect(allows(allowed, 'menu|touch-size|a', '390x844')).toBe(false);
    expect(allows(allowed, 'army|overlap|x|y', '1920x1080')).toBe(true);
    expect(allows(allowed, 'hero|text-size|t1', '1280x800')).toBe(true);
    expect(allows(allowed, 'hero|text-size|t1', '1440x900')).toBe(false);
  });

  it('refuses an entry listed in two story files', () => {
    expect(() => mergeAllowlist(Object.entries({ A: ['x|overlap|a'], B: ['x|overlap|a'] }))).toThrow(/x\|overlap\|a/);
  });
});

describe('layout allowlist: owners and rewriting', () => {
  it('maps every screen family to its V6-RSCR owner story', () => {
    const cases: Record<string, string> = {
      menu: 'V6-RSCR-01',
      'menu-settings-about': 'V6-RSCR-10',
      'kit-overlay-purchase': 'V6-RSCR-10',
      'kit-tokens': 'V6-RSCR-11',
      'battle-fight': 'V6-RSCR-02',
      'results-inspect': 'V6-RSCR-02',
      'online-army-closed': 'V6-RSCR-03',
      'merchant-buy': 'V6-RSCR-03',
      'duel-shop-sell': 'V6-RSCR-04',
      'army-stash': 'V6-RSCR-05',
      'stash-compare': 'V6-RSCR-05',
      'shop-pass': 'V6-RSCR-06',
      'town-market': 'V6-RSCR-06',
      'world-journal': 'V6-RSCR-07',
      'camp-war-build': 'V6-RSCR-07',
      'tutorial-move': 'V6-RSCR-08',
      'codex-beast': 'V6-RSCR-09',
    };
    for (const [screen, story] of Object.entries(cases)) expect(storyOf(screen), screen).toBe(story);
  });

  const ran = { screens: new Set(['menu', 'army']), sizes: new Set(['390x844', '844x390']) };
  const owners = { menu: 'F', army: 'B' };
  const found = (rows: [string, string[]][]) => new Map(rows.map(([k, sizes]) => [k, { screen: k.split('|')[0], sizes: new Set(sizes) }]));

  it('seeds a new violation scoped to the size it showed at, in its screen story file', () => {
    const out = rewriteAllowlist(new Map(), found([['army|overlap|a|b', ['844x390']]]), ran, owners);
    expect(out).toEqual({ 'V6-RSCR-05': ['army|overlap|a|b@844x390'] });
  });

  it('keeps an unscoped entry that still shows, and entries of screens or sizes not run', () => {
    const allowed = new Map([
      ['army|text-size|*', 'V6-RSCR-05'],
      ['hero|overlap|x@844x390', 'V6-RSCR-05'],
      ['army|overlap|q@1280x800', 'V6-RSCR-05'],
      ['army|overlap|gone@844x390', 'V6-RSCR-05'],
    ]);
    const out = rewriteAllowlist(allowed, found([['army|text-size|t1', ['390x844', '844x390']]]), ran, owners);
    expect(out['V6-RSCR-05']).toEqual(['army|overlap|q@1280x800', 'army|text-size|*', 'hero|overlap|x@844x390']);
  });

  it('never seeds a foundation screen at the phone portrait sizes, apart from the text-size floor', () => {
    const out = rewriteAllowlist(new Map(), found([['menu|overlap|a|b', ['390x844', '844x390']], ['menu|text-size|t', ['390x844']]]), ran, owners);
    expect(out).toEqual({ 'V6-RSCR-01': ['menu|overlap|a|b@844x390', 'menu|text-size|*@390x844'] });
  });

  it('lists entries that no longer show at the sizes run as stale', () => {
    const allowed = new Map([
      ['army|overlap|gone@844x390', 'V6-RSCR-05'],
      ['army|overlap|q@1280x800', 'V6-RSCR-05'],
      ['army|text-size|*', 'V6-RSCR-05'],
    ]);
    expect(staleEntries(allowed, found([['army|text-size|t1', ['390x844']]]), ran)).toEqual(['army|overlap|gone@844x390']);
  });

  it('names the owner story of every known crash, keyed screen@WxH/insets', () => {
    for (const [k, why] of Object.entries(KNOWN_CRASHES as Record<string, string>)) {
      expect(k).toMatch(/^[a-z0-9-]+@\d+x\d+\/(plain|tg)$/);
      expect(why).toMatch(/^V6-RSCR-\d{2}: /);
      expect(storyOf(k.split('@')[0])).toBe(why.slice(0, 10));
    }
  });

  it('treats an unscoped entry as fixed only after a run of the whole matrix', () => {
    const allowed = new Map([['army|text-size|*', 'V6-RSCR-05']]);
    expect(staleEntries(allowed, found([]), ran)).toEqual([]);
    expect(staleEntries(allowed, found([]), { screens: ran.screens, sizes: new Set(sizesFor()) })).toEqual(['army|text-size|*']);
  });
});
