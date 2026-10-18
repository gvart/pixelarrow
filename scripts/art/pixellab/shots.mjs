// Screenshots of the sheet preview page (src/dev/hopliteBakeoff.ts ?sheet=<class>) at zoom 1-3, full page, with the
// page's console errors listed. Needs the dev server running.
// Usage: node scripts/art/pixellab/shots.mjs <class> <out dir> [--url http://localhost:5173] [--wait 2500]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const base = opt('url', 'http://localhost:5173');
const wait = Number(opt('wait', 2500));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
for (const z of ['1', '2', '3']) {
  for (const anim of ['walk', 'thrust', 'ready']) {
    if (z !== '1' && anim !== 'walk') continue;
    await page.goto(`${base}/hoplite-bakeoff.html?sheet=${cls}&z=${z}&anim=${anim}`);
    await page.waitForTimeout(wait);
    const file = join(out, `preview_${cls}_z${z}_${anim}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
