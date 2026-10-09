// Renders the Telegram store images from the game's own procedural art
// (store.html / src/dev/store.ts) and saves them to shots/store/ (git-ignored).
// Usage: node scripts/dev/store-images.mjs [outDir]
// Starts its own Vite dev server; uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH).
import { withViteAndBrowser, shotsDir } from '../lib/harness.mjs';

const out = shotsDir('store', process.argv[2]);

const shots = [
  { img: 'cover', file: 'cover-640x360.png', w: 640, h: 360 },
  { img: 'botpic', file: 'botpic-640x640.png', w: 640, h: 640 },
];

const problems = [];
await withViteAndBrowser(async ({ base, browser }) => {
  for (const s of shots) {
    // deviceScaleFactor 1: the canvas is already at the final pixel size.
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`[${s.img}] ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`[${s.img}] ${m.text()}`));
    await page.goto(`${base}store.html?img=${s.img}`);
    await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 30000 }).catch((e) => {
      throw new Error(problems.join('\n') || e.message);
    });
    await page.locator('#out').screenshot({ path: `${out}/${s.file}` });
    console.log('saved', `${out}/${s.file}`);
    await ctx.close();
  }
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
