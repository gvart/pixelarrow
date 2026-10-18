// Regression: layout fixtures for the v5 sheets that scripts/layout-check.mjs does not stage
// (QA-02 acceptance 2: every new sheet at 4 sizes in en and ru). The set of sheets is derived
// in tests/regression/sheetFixtures.test.ts: every opener exported from src/ui/sheets/** must
// have a layout-check screen or a fixture here, so a new sheet cannot ship unchecked.
//
// Each fixture opens its sheet through the scene method the game calls, waits until the
// sheet is on screen and every finite tween has ended (no fixed sleep), then runs the
// game's own layout rules (window.__layout.check(), src/ui/layoutCheck.ts: overlap, text
// overflow and size floor, safe area, touch targets, tap probe). Any violation fails; so
// does a sheet that never showed (that would be a check that did not run).
// Sizes 320x568, 320x640, 360x780, 390x844; en and ru; plain insets (the Telegram insets
// variant is layout-check's).
// Usage: node scripts/regression/sheet-layout.mjs <baseUrl> [--platform telegram|web|both] [--sizes 390x844] [--langs en]
import { launch, check, until, baseUrl, settled, done, usePlatform, entryUrl } from './lib.mjs';
import { captureErrors, apiDown, makePageApi } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const base = baseUrl();
const SIZES = opt('sizes', '320x568,320x640,360x780,390x844').split(',').map((s) => s.split('x').map(Number));
const LANGS = opt('langs', 'en,ru').split(',');

/** A World with the party at home and no card or coach in the way. */
const WORLD = async (api) => {
  await api.start('World', {});
  // scene.start is queued to the next step: a World still running from the last fixture would read
  // as settled at once, and its restart would then drop the sheet the fixture opens
  await api.ev(() => new Promise((r) => { let n = 0; const f = () => (++n < 2 ? window.__game.events.once('postrender', f) : r(1)); window.__game.events.once('postrender', f); }));
  await settled(api, 'World');
  await api.call('World', 'const w = s.w; w.stop(); w.s.safeUntil = 1e9; w.s.pendingEvent = null; s.eventCard?.close(); return 1;');
};

/** Sheet fixtures: id, the sheet's layout id, the scene it opens on, and how to open it. */
const FIXTURES = [
  // (the Journal tab is layout-check's world-journal)
  { id: 'sheet-arc-lairs', sheet: 'arc.sheet', scene: 'World', open: async (api) => (await WORLD(api), api.call('World', "s.openArc('lairs'); return !!s.arcSheet;")) },
  {
    id: 'sheet-assault',
    sheet: 'assault.sheet',
    scene: 'World',
    open: async (api) => (await WORLD(api), api.call('World', "const l = s.w.map.settlements.find((x) => x.kind === 'lair' && !s.w.lairFallen(x.id)); s.openAssault(l.id); return !!s.assaultSheet;")),
  },
  {
    id: 'sheet-abilities',
    sheet: 'battle.moreSheet',
    scene: 'Battle',
    open: async (api) => {
      await api.ev(() => {
        window.__state.pending = null;
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
      });
      await until(() => api.ev(() => { const s = window.__game.scene.getScene('Battle'); return s.sys.isActive() && !!s.sim && !!s.hud; }), 30000, 150);
      // the fresh skirmish's men have no abilities yet: the selected group's first man gets four, so the
      // sheet holds five rows with the horn (the most the rail hands it; the longest ru labels among them)
      const n = await api.call('Battle', "s.startFight(); s.setPaused(true); s.hideBanner(); s.selectedUnits()[0].abil = ['bash', 'rally', 'warcry', 'sunder']; const d = s.abilityDefs(); s.openMore(d); return d.length;");
      check(`sheet-abilities staged with at least 4 rows`, n >= 4, String(n));
      return n;
    },
  },
];

/** The sheet is drawn: an object with its layout id is visible in the scene. */
const sheetShown = (api, scene, id) =>
  api.ev(([k, id]) => {
    let hit = false;
    const walk = (list) => list.forEach((o) => { if (o.__uiId === id && o.visible && o.alpha > 0) hit = true; if (o.list) walk(o.list); });
    walk(window.__game.scene.getScene(k).children.list);
    return hit;
  }, [scene, id]);

const tweensDone = (api) =>
  api.ev(() => window.__game.scene.getScenes(true).every((s) => s.tweens.getTweens().every((t) => !t.isPlaying() || t.loop === -1 || t.data.some((d) => d.repeat === -1))));

const t0 = Date.now();
const browser = await launch();
const errors = [];
for (const lang of LANGS) {
  for (const [W, H] of SIZES) {
    const cfg = `${lang} ${W}x${H}`;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => (window.__noFirstRun = true));
    await usePlatform(ctx, { languageCode: lang });
    const page = await ctx.newPage();
    captureErrors(page, { into: errors, ignoreNetwork: true, prefix: true });
    await apiDown(page);
    const api = makePageApi(page);
    await page.goto(entryUrl(base, `?lang=${lang}`), { timeout: 60000 });
    const up = await until(() => api.ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
    check(`[${cfg}] boot`, up);
    if (!up) { await ctx.close(); continue; }
    // the campaign layout-check stages (fixed seed, 9 heroes, no one-time hints)
    await api.ev(async () => {
      const st = window.__state;
      st.campaign = st.campaign.constructor.fresh(20261006);
      st.hasSave = true;
      const c = st.campaign;
      c.data.settings.seenGestureHint = true;
      c.data.settings.seenHints = ['*'];
      c.data.gold = 2000;
      while (c.data.heroes.length < 9) c.recruit();
      c.data.heroes.forEach((h, i) => { h.group = i < 7 ? 0 : 1; h.level = i < 4 ? 6 : 2; });
      await st.save();
    });
    for (const f of FIXTURES) {
      const name = `[${cfg}] ${f.id}`;
      try {
        // one more try when the sheet did not show (logged with what was in its way: a sheet the map raised itself)
        let shown = false;
        for (let i = 0; i < 2 && !shown; i++) {
          const opened = await f.open(api);
          shown = !!opened && (await until(() => sheetShown(api, f.scene, f.sheet), 10000, 150));
          if (!shown) console.log(`  ${name}: not shown (try ${i + 1}): ${JSON.stringify(await api.ev((k) => { const s = window.__game.scene.getScene(k); return { opened: null, active: s.sys.isActive(), eventCard: !!s.eventCard, encounter: !!s.encounter, assault: !!s.assaultSheet, arc: !!s.arcSheet, coach: !!s.coach, cine: !!s.cine }; }, f.scene))} opener=${opened}`);
        }
        check(`${name}: the sheet is on screen`, shown);
        if (!shown) continue;
        await until(() => tweensDone(api), 5000, 100);
        const r = await api.ev(() => { const x = window.__layout.check(); return { n: x.elements.length, v: x.violations }; });
        check(`${name}: layout clean (${r.n} elements)`, r.n > 0 && r.v.length === 0, r.v.map((v) => `${v.check}: ${v.ids.join(' / ')}${v.detail ? ` (${v.detail})` : ''}`).join(' | '));
      } catch (e) {
        check(`${name}: ran`, false, String(e?.message ?? e).split('\n')[0]);
      }
    }
    await ctx.close();
  }
}
check('no page or console errors', errors.length === 0, errors.join(' | ').slice(0, 2000));
console.log(`sheet-layout: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await done(browser);
