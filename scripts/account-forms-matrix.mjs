// The account management forms across the screen matrix (V6-LINK-05): AU-10, AU-11 and AU-12 are HTML over the
// canvas, so the layout check (canvas elements) doesn't see them. Each Kit sample opens at the ten matrix sizes,
// in English and Russian, and must:
//   - fit across: the card inside the viewport, nothing wider than the card (no horizontal scroll);
//   - keep Submit reachable: the overlay scrolls to it (the phone keyboard case, accounts-v6.md §1.6);
//   - give every control a 44 px target (inputs, the eye, links, Cancel and Submit, §13.4);
//   - label every input (a <label for>) and describe its errors (aria-describedby).
//
//   node scripts/account-forms-matrix.mjs <gameUrl> [--shots <dir>]
import { join } from 'node:path';
import { check, finish, launch, until } from './lib/harness.mjs';
import { MATRIX } from './lib/layoutMatrix.mjs';

const argv = process.argv.slice(2);
const BASE = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? '').replace(/\/?$/, '/');
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
if (BASE === '/') {
  console.log('NOT RUN: give the game URL');
  process.exit(2);
}
const SAMPLES = ['reauth', 'reauth-reopen', 'reauth-both', 'add-email', 'add-email-limit', 'change-email', 'change-email-same', 'change-password'];

const browser = await launch();
let shots = 0;
for (const lang of ['en', 'ru']) {
  for (const size of MATRIX.all) {
    const [w, h] = size.split('x').map(Number);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(() => (window.__noFirstRun = true));
    const p = await ctx.newPage();
    await p.goto(`${BASE}?lang=${lang}`);
    await until(() => p.evaluate(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
    await p.evaluate(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Kit', { page: 'forms' })));
    await until(() => p.evaluate(() => !!window.__game.scene.getScene('Kit')?.openFormSample), 20000, 250);
    const bad = [];
    for (const id of SAMPLES) {
      await p.evaluate((i) => window.__game.scene.getScene('Kit').openFormSample(i), id);
      await until(() => p.evaluate(() => !!document.querySelector('#px-auth form') && !document.querySelector('#px-auth [aria-busy=true]')), 5000, 100).catch(() => undefined);
      await p.waitForTimeout(400);
      const measure = () => p.evaluate(() => {
        // the overlay of the sample before may still be fading out (120 ms): measure the newest one
        const wrap = [...document.querySelectorAll('#px-auth')].at(-1);
        const card = wrap?.querySelector('form');
        if (!card) return { missing: true };
        const vw = document.documentElement.clientWidth;
        const cr = card.getBoundingClientRect();
        const shown = (e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none';
        const wide = [...card.querySelectorAll('*')].filter((e) => shown(e) && (e.getBoundingClientRect().right > cr.right + 1 || e.getBoundingClientRect().left < cr.left - 1)).map((e) => e.className || e.tagName);
        const small = [...card.querySelectorAll('input, button')].filter((e) => shown(e) && e.getBoundingClientRect().height < 44).map((e) => e.dataset.act || e.dataset.link || e.name || e.className);
        const unlabelled = [...card.querySelectorAll('input')].filter((i) => !card.querySelector(`label[for="${i.id}"]`) || !i.getAttribute('aria-describedby')).map((i) => i.name);
        const submit = card.querySelector('[data-act=submit]');
        submit.scrollIntoView({ block: 'nearest' });
        const sr = submit.getBoundingClientRect();
        const reach = sr.bottom <= window.innerHeight + 1 && sr.top >= 0;
        return { fits: cr.left >= 0 && cr.right <= vw + 0.5 && wrap.scrollWidth <= wrap.clientWidth + 1, wide, small, unlabelled, reach };
      });
      const ok = (x) => !x.missing && x.fits && !x.wide.length && !x.small.length && !x.unlabelled.length && x.reach;
      let r = await measure();
      // as the layout check does: a finding must show twice (a machine under load can catch a frame mid-transition)
      if (!ok(r)) {
        await p.waitForTimeout(600);
        r = await measure();
      }
      if (r.missing) bad.push(`${id}: no form`);
      else {
        if (!r.fits || r.wide.length) bad.push(`${id}: overflows (${r.wide.slice(0, 3).join(',')})`);
        if (r.small.length) bad.push(`${id}: under 44 px (${r.small.join(',')})`);
        if (r.unlabelled.length) bad.push(`${id}: unlabelled (${r.unlabelled.join(',')})`);
        if (!r.reach) bad.push(`${id}: Submit not reachable`);
      }
      if (SHOTS && shots < 3 && ((lang === 'ru' && size === '320x693' && id === 'add-email') || (lang === 'en' && size === '844x390' && id === 'reauth-both') || (lang === 'ru' && size === '1280x800' && id === 'change-password'))) {
        await p.screenshot({ path: join(SHOTS, `forms-${id}-${lang}-${size}.jpg`), type: 'jpeg', quality: 80 });
        shots++;
      }
      await p.evaluate(() => document.querySelector('#px-auth') && document.querySelectorAll('#px-auth [data-act=cancel]').forEach((b) => b.click()));
      await p.waitForTimeout(200);
    }
    check(`${lang} ${size}: ${SAMPLES.length} forms fit, Submit reachable, 44 px targets, labelled`, bad.length === 0, bad.join(' | '));
    await ctx.close();
  }
}
await finish({ browser });
