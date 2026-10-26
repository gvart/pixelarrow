// Page check for the "Play your way" landing. Serves dist/ itself and asserts, in Chromium:
//  1. Truth: the soldier cards are exactly the six squad classes, each a class in src/data/classes.ts,
//     and their icons and sprites load; the page names no campaign, duel, Telegram or Mini App.
//  2. Links: every Play link opens the game menu (PLAY_URL); no link leaves for Telegram.
//  3. Layout: no horizontal overflow at 320, 390, 768, 1280, 1440 and 1920; the hero card stays inside
//     the viewport width.
//  4. Clips (when public/video has them): muted, only clips in view play, and a press on the toggle
//     pauses; with none, each band shows its fallback still.
//  5. Reduced motion: no clip plays and the soldier loops stand still.
// With SHOTS_DIR set, it also saves full-page screenshots at the six widths.
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
const PLAY_URL = 'https://play.pixelarrow.app/';
const PORT = Number(process.env.SECTIONS_TEST_PORT ?? 6143);
const SHOTS = process.env.SHOTS_DIR;
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
const SQUAD = ['hoplite', 'archer', 'celt_sword', 'slinger', 'javelineer', 'militia'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4' };

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
const URL_ = `http://127.0.0.1:${PORT}/`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
const classIds = new Set([...(await readFile(CLASSES_TS, 'utf8')).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]));
const videos = (page) => page.$$eval('[data-clip] video', (vs) => vs.map((v) => ({ id: v.closest('section').id, playing: !v.paused, muted: v.muted })));
const walk = async (page) => {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 400) await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(800);
};

const browser = await chromium.launch();
try {
  // 1 + 2
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL_, { waitUntil: 'load' });
    await walk(page);
    const sprites = await page.$$eval('.man__sprite', (els) => els.map((e) => /\/men\/(\w+)-idle\.webp/.exec(e.style.backgroundImage)?.[1]));
    check(sprites.join() === SQUAD.join(), `soldier cards are the six squad classes (got ${sprites.join()})`);
    for (const c of sprites) check(classIds.has(c), `"${c}" is a class in src/data/classes.ts`);
    const broken = await page.$$eval('main img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')));
    check(broken.length === 0, `every image loads (${broken.join(', ') || 'none broken'})`);
    const text = (await page.textContent('body')).toLowerCase();
    for (const word of ['campaign', 'duel', 'telegram', 'mini app']) check(!text.includes(word), `the page never says "${word}"`);
    const plays = await page.$$eval('a', (as) => as.filter((a) => a.textContent.trim().toLowerCase() === 'play').map((a) => a.href));
    check(plays.length >= 3 && plays.every((h) => h === PLAY_URL), `every Play link opens ${PLAY_URL} (${plays.length} links)`);
    const tg = await page.$$eval('a', (as) => as.filter((a) => /t\.me|telegram/i.test(a.href)).length);
    check(tg === 0, 'no link to Telegram');
    await page.close();
  }

  // 3 (+ screenshots)
  for (const [width, height] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(URL_, { waitUntil: 'load' });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 0, `${width}px: no horizontal overflow (${over}px)`);
    const card = await page.$eval('.hero__card', (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
    check(card, `${width}px: the hero card fits the width`);
    if (SHOTS) {
      await mkdir(SHOTS, { recursive: true });
      await walk(page);
      await page.screenshot({ path: join(SHOTS, `page-${width}.png`), fullPage: true });
    }
    await page.close();
  }

  // 4
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL_, { waitUntil: 'load' });
    const clips = await page.locator('[data-clip]').count();
    if (!clips) {
      const stills = await page.$$eval('.clip__poster img', (imgs) => imgs.every((i) => i.naturalWidth > 0));
      check(stills, 'no clips in public/video: every band shows its still');
    } else {
      await page.waitForTimeout(2500);
      let v = await videos(page);
      check(v.every((x) => x.muted), 'every clip is muted');
      check(v.find((x) => x.id === 'top')?.playing === true, 'the hero clip plays at the top');
      check(v.filter((x) => x.id !== 'top').every((x) => !x.playing), 'clips out of view stay paused');
      await page.click('#top .clip__toggle');
      await page.waitForTimeout(300);
      v = await videos(page);
      check(v.find((x) => x.id === 'top')?.playing === false, 'the toggle pauses the hero clip');
      await page.$eval('#boss-hunter', (e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(2500);
      v = await videos(page);
      check(v.find((x) => x.id === 'boss-hunter')?.playing === true && v.find((x) => x.id === 'top')?.playing === false, 'scrolled down: the boss clip plays, the hero stays paused');
    }
    await page.close();
  }

  // 5
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(URL_, { waitUntil: 'load' });
    await walk(page);
    await page.waitForTimeout(1500);
    const v = await videos(page);
    check(v.every((x) => !x.playing), `reduced motion: no clip plays (${v.filter((x) => x.playing).length} playing)`);
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.classList?.contains('man__sprite')).length);
    check(moving === 0, `reduced motion: the soldiers stand still (${moving} moving)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nlanding page checks pass');
