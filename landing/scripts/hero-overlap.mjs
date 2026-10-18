// Hero text-column test (V6-019, V6-026): at 320, 390, 768, 1280, 1440 and 1920 px the headline, the
// sub-line, both calls to action and the note never overlap a diorama layer (the poster still, the
// living canvas, the war-table foreground), measured where each layer paints. It also checks the living layer's gates
// (V6-LAND-02b): the canvas runs at every width without reduced motion, at 1296x852 from 768 px and as the
// lighter 648x426 cut on phones; under reduced motion the hero is the static poster with no animation.
// Phone checks at 390x844: at most 30 draws a second, no draws while the hero is offscreen, no start while
// the page opens scrolled past the hero, and no module or sprite request under reduced motion, data saver
// or a low-memory device (navigator.deviceMemory <= 2).
//
// Usage (in landing/, after `npm run build`): npm run test:hero (HERO_TEST_PORT picks the port)
// Serves dist/ itself on HERO_TEST_PORT (default 6141, V6-002 slot 4) and fails if the port is taken.
// Playwright comes from the repository root's node_modules.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.HERO_TEST_PORT ?? 6141);
const SIZES = [[320, 640], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
const TEXT = ['.hero__title', '.hero__sub', '.hero__ctas', '.hero__note'];
const ART = ['.hero__diorama img', '.hero__live', '.hero__table'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok, no) => server.once('error', no).listen(PORT, '127.0.0.1', ok));

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
const browser = await chromium.launch();
try {
  for (const reduce of [false, true]) {
    for (const [width, height] of SIZES) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      const live = !reduce;
      if (live) await page.waitForSelector('.hero.is-live .hero__live', { timeout: 10000 }).catch(() => {});
      else await page.waitForTimeout(2500); // past the module's idle start, so a wrong load would show
      await page.waitForTimeout(700); // the canvas fade-in
      const tag = `${width}x${height}${reduce ? ' reduced motion' : ''}`;
      const boxes = await page.evaluate(([text, art]) => {
        // the poster and the canvas paint only inside .hero__diorama-wrap (it clips and masks the cropped corner)
        const box = (s) => [...document.querySelectorAll(s)].map((e) => {
          const r = e.getBoundingClientRect();
          const w = e.closest('.hero__diorama-wrap')?.getBoundingClientRect();
          return w ? { s, x0: Math.max(r.left, w.left), y0: Math.max(r.top, w.top), x1: Math.min(r.right, w.right), y1: Math.min(r.bottom, w.bottom) } : { s, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
        });
        return { text: text.flatMap(box), art: art.flatMap(box) };
      }, [TEXT, ART]);
      check(boxes.text.length === TEXT.length, `${tag}: all four text blocks present`);
      for (const t of boxes.text)
        for (const a of boxes.art) {
          const dx = Math.min(t.x1, a.x1) - Math.max(t.x0, a.x0);
          const dy = Math.min(t.y1, a.y1) - Math.max(t.y0, a.y0);
          const hit = dx > 0 && dy > 0 && a.x1 - a.x0 > 0 && a.y1 - a.y0 > 0;
          check(!hit, `${tag}: ${t.s} clear of ${a.s}${hit ? ` (overlap ${dx.toFixed(0)}x${dy.toFixed(0)} px)` : ''}`);
        }
      const canvas = await page.locator('.hero__live').count();
      check(live ? canvas === 1 : canvas === 0, `${tag}: living canvas ${live ? 'runs' : 'not loaded'}`);
      if (live && canvas) {
        const size = await page.$eval('.hero__live', (c) => `${c.width}x${c.height}`);
        const want = width < 768 ? '648x426' : '1296x852';
        check(size === want, `${tag}: canvas is ${want} (${size})`);
      }
      if (reduce) {
        const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && document.getElementById('top')?.contains(a.effect?.target ?? null)).length);
        check(moving === 0, `${tag}: no hero animation (${moving} running)`);
      }
      await page.close();
    }
  }

  // Phone gates (390x844, a touch phone). draws counts clearRect calls: the module clears once per drawn frame.
  const COUNT = () => {
    const c = CanvasRenderingContext2D.prototype, clear = c.clearRect;
    window.__draws = 0;
    c.clearRect = function (...a) { window.__draws++; return clear.apply(this, a); };
  };
  const phone = async ({ reduce = false, init, hash = '' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const asked = [];
    page.on('request', (r) => { if (/diorama.*\.js|hero_sprites/.test(r.url())) asked.push(r.url()); });
    await page.addInitScript(COUNT);
    if (init) await page.addInitScript(init);
    await page.goto(`http://127.0.0.1:${PORT}/${hash}`, { waitUntil: 'load' });
    return { ctx, page, asked };
  };
  const drawsIn = async (page, ms) => {
    const a = await page.evaluate(() => window.__draws);
    await page.waitForTimeout(ms);
    return (await page.evaluate(() => window.__draws)) - a;
  };
  {
    const { ctx, page } = await phone();
    await page.waitForSelector('.hero.is-live .hero__live', { timeout: 10000 }).catch(() => {});
    const n = await drawsIn(page, 2000);
    check(n >= 30 && n <= 62, `390x844 phone: draws at most 30 a second (${n} in 2 s)`);
    await page.evaluate(() => window.scrollTo(0, document.getElementById('top').offsetHeight + 400));
    await page.waitForTimeout(300);
    const off = await drawsIn(page, 1000);
    check(off === 0, `390x844 phone: no draws while the hero is offscreen (${off})`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const back = await drawsIn(page, 1000);
    check(back > 0, `390x844 phone: resumes when the hero is back (${back})`);
    await ctx.close();
  }
  {
    const { ctx, page, asked } = await phone({ hash: '#classes' });
    await page.waitForTimeout(4000);
    const early = await page.locator('.hero__live').count();
    check(early === 0 && !asked.some((u) => u.includes('sprites')), `390x844 phone opened past the hero: no canvas and no sprite fetch yet (${early}, ${asked.length} requests)`);
    await page.evaluate(() => window.scrollTo(0, 0));
    const late = await page.waitForSelector('.hero.is-live .hero__live', { timeout: 10000 }).then(() => 1, () => 0);
    check(late === 1, '390x844 phone: starts once the hero scrolls into view');
    await ctx.close();
  }
  for (const [name, opts] of [
    ['reduced motion', { reduce: true }],
    ['data saver', { init: () => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }) }],
    ['deviceMemory 2', { init: () => Object.defineProperty(navigator, 'deviceMemory', { value: 2 }) }],
  ]) {
    const { ctx, page, asked } = await phone(opts);
    await page.waitForTimeout(4000);
    const canvas = await page.locator('.hero__live').count();
    const draws = await page.evaluate(() => window.__draws);
    check(canvas === 0 && draws === 0 && asked.length === 0, `390x844 phone ${name}: static poster, no module or sprite request (${canvas} canvas, ${draws} draws, ${asked.length} requests)`);
    if (opts.reduce) {
      const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && document.getElementById('top')?.contains(a.effect?.target ?? null)).length);
      check(moving === 0, `390x844 phone reduced motion: no hero animation (${moving} running)`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} hero check(s) failed`);
  process.exit(1);
}
console.log('\nhero text column clear at every width; living layer gates hold');
