// Renders the Telegram store images from the game's own procedural art
// (store.html / src/dev/store.ts) and saves them to docs/store/.
// Usage: node scripts/store-images.mjs [outDir]
// Starts its own Vite dev server; uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/store';
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];

const shots = [
  { img: 'cover', file: 'cover-640x360.png', w: 640, h: 360 },
  { img: 'botpic', file: 'botpic-640x640.png', w: 640, h: 640 },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const problems = [];
try {
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
} finally {
  await browser.close();
  await server.close();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
