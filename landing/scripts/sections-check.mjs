// Features, classes and modes check (V6-LAND-03). Serves dist/ itself and asserts, in Chromium:
//  1. Truth: every class and beast card names a class in src/data/classes.ts; the mode tiles are
//     exactly Campaign, Duels, War, Forge; every mode poster is a real clip poster in /video/.
//  2. Layout: no horizontal overflow at 320, 390, 768, 1280, 1440 and 1920.
//  3. Tilt: a card tilts under a fine pointer, never on a touch device or under reduced motion.
//  4. Dividers: draw on view only with no reduced-motion preference.
//  5. Lazy stills: no bust or poster loads on the first view; they arrive as their section nears.
//  6. Clips: no source before the clip is near; muted autoplay when visible, paused when not; at most
//     one playing on a phone and two on desktop; reduced motion keeps the poster until pressed.
// With SHOTS_DIR set, it also saves screenshots of the three sections at the six widths.
//
// Usage (in landing/, after `npm run build`): npm run test:sections (SECTIONS_TEST_PORT picks the port,
// default 6143). Playwright comes from the repository root's node_modules.
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const CLASSES_TS = fileURLToPath(new URL('../../src/data/classes.ts', import.meta.url));
const PORT = Number(process.env.SECTIONS_TEST_PORT ?? 6143);
const SHOTS = process.env.SHOTS_DIR;
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4' };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'accept-ranges': 'none' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok, no) => server.once('error', no).listen(PORT, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${PORT}/`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
const gameNames = new Set([...(await readFile(CLASSES_TS, 'utf8')).matchAll(/\bname: '([^']+)'/g)].map((m) => m[1]));

const clipState = (page) => page.$$eval('[data-clip] video', (vs) => vs.map((v) => ({
  id: v.closest('[data-clip]').dataset.webm, sources: v.querySelectorAll('source').length, playing: !v.paused, muted: v.muted,
})));
const scrollTo = async (page, sel) => {
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
};

const browser = await chromium.launch();
try {
  // 1 + 2 (+ screenshots)
  for (const [width, height] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(URL_, { waitUntil: 'load' });
    if (width === 1440) {
      const names = await page.$$eval('#classes .plate__name', (els) => els.map((e) => e.textContent.trim()));
      check(names.length === 15, `15 class and beast cards (got ${names.length})`);
      for (const n of names) check(gameNames.has(n), `"${n}" is a class in src/data/classes.ts`);
      const modes = await page.$$eval('#modes .mode__name', (els) => els.map((e) => e.textContent.trim()));
      check(modes.join() === 'Campaign,Duels,War,Forge', `modes are Campaign, Duels, War, Forge (got ${modes.join()})`);
      const posters = await page.$$eval('#modes .clip__poster img', (els) => els.map((e) => e.getAttribute('src') ?? e.dataset.src));
      check(posters.every((p, i) => p === `/video/M${i + 1}-poster.webp`), 'mode tiles use the M1-M4 clip posters');
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 0, `${width}px: no horizontal overflow (${over}px)`);
    if (SHOTS) {
      await mkdir(SHOTS, { recursive: true });
      // fixed chrome repeats over a tall element capture; hide it for the section shots only
      await page.addStyleTag({ content: '.nav, .skip { visibility: hidden !important; }' });
      for (const id of ['features', 'classes', 'modes']) {
        // let lazy images and the near-viewport clip loading settle; clips are paused for a stable frame
        await scrollTo(page, `#${id}`);
        await page.$$eval('[data-clip] video', (vs) => vs.forEach((v) => v.pause()));
        await page.locator(`#${id}`).screenshot({ path: join(SHOTS, `${id}-${width}.png`) });
      }
    }
    await page.close();
  }

  // 3. Tilt
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL_, { waitUntil: 'load' });
    await scrollTo(page, '#classes .plate');
    const card = page.locator('#classes .plate').first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.1, { steps: 4 });
    await page.waitForTimeout(300);
    const t = await card.evaluate((e) => getComputedStyle(e).transform);
    check(t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)', `fine pointer: card tilts (${t.slice(0, 32)})`);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(600);
    const rest = await card.evaluate((e) => getComputedStyle(e).getPropertyValue('--ry').trim());
    check(rest === '0deg', 'fine pointer: card eases back to rest when the pointer leaves');
    await page.close();
  }
  for (const [label, opts] of [['touch phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['reduced motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }]]) {
    const page = await browser.newPage(opts);
    await page.goto(URL_, { waitUntil: 'load' });
    await scrollTo(page, '#classes .plate');
    const card = page.locator('#classes .plate').first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width * 0.9, box.y + 10, { steps: 4 });
    await page.waitForTimeout(300);
    const t = await card.evaluate((e) => getComputedStyle(e).transform);
    check(t === 'none', `${label}: no tilt (${t})`);
    await page.close();
  }

  // 4. Dividers
  for (const reduce of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await page.goto(URL_, { waitUntil: 'load' });
    const anim = await page.$eval('.divider', (e) => getComputedStyle(e, '::before').animationName);
    check(reduce ? anim === 'none' : anim === 'divider-draw', `${reduce ? 'reduced motion: dividers are static' : 'dividers draw on view'} (${anim})`);
    await page.close();
  }

  // 5. Lazy stills
  for (const [width, height] of [[412, 823], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const early = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\/(classes|video)\//.test(e.name)).length);
    check(early === 0, `${width}px: no bust or poster on the first view (${early})`);
    await scrollTo(page, '#classes');
    const busts = await page.$$eval('#classes .plate__bust:not(noscript *)', (els) => els.filter((e) => e.complete && e.naturalWidth > 0).length);
    check(busts === 15, `${width}px: all 15 busts load once the classes are near (${busts})`);
    await page.close();
  }

  // 6. Clips
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL_, { waitUntil: 'load' });
    let s = await clipState(page);
    check(s.every((c) => c.sources === 0), 'desktop: no clip source before the modes come near');
    await scrollTo(page, '#modes .mode:nth-child(1)');
    await page.waitForTimeout(1500);
    s = await clipState(page);
    const playing = s.filter((c) => c.playing);
    check(playing.length >= 1 && playing.length <= 2, `desktop: 1-2 clips play when visible (${playing.length})`);
    check(s.every((c) => c.muted), 'clips are muted');
    await scrollTo(page, '#faq');
    s = await clipState(page);
    check(s.every((c) => !c.playing), 'desktop: clips pause when out of view');
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(URL_, { waitUntil: 'load' });
    let max = 0;
    for (let i = 1; i <= 4; i++) {
      await scrollTo(page, `#modes .mode:nth-child(${i}) .clip`);
      await page.waitForTimeout(800);
      const s = await clipState(page);
      max = Math.max(max, s.filter((c) => c.playing).length);
      check(s[i - 1].playing, `phone: clip M${i} plays when it is in view`);
    }
    check(max === 1, `phone: one clip at a time (max ${max})`);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(URL_, { waitUntil: 'load' });
    await scrollTo(page, '#modes .mode:nth-child(1)');
    await page.waitForTimeout(800);
    let s = await clipState(page);
    check(s.every((c) => c.sources === 0 && !c.playing), 'reduced motion: posters only, no source until pressed');
    await page.click('#modes .mode:nth-child(1) .clip__toggle');
    await page.waitForTimeout(1500);
    s = await clipState(page);
    check(s[0].playing && s.filter((c) => c.playing).length === 1, 'reduced motion: a pressed clip plays');
    await page.click('#modes .mode:nth-child(1) .clip__toggle', { force: true });
    await page.waitForTimeout(300);
    s = await clipState(page);
    check(!s[0].playing, 'the same button pauses it');
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall section checks passed');
