// Screenshots mock.html (the composed world map) to shots/war/worldmap/WM_mock[@2x].png.
// Usage: python3 -m http.server 8765 --bind 127.0.0.1 (repo root), then SHOTS=<repo>/shots node scripts/war/world-art/mock.mjs
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROOT } from './regions.mjs';

const out = join(process.env.SHOTS || join(ROOT, 'shots'), 'war/worldmap');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 2048 * scale, height: 1536 * scale } });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:8765/scripts/war/world-art/mock.html?scale=${scale}`);
  await page.waitForFunction(() => document.title === 'ready');
  await page.locator('canvas').screenshot({ path: join(out, `WM_mock${scale === 2 ? '@2x' : ''}.png`) });
  await page.close();
}
await browser.close();
console.log(`mock-ups in ${out}`);
