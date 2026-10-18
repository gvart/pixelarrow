// I5b: screenshots of the sheet preview page (src/dev/hopliteBakeoff.ts ?sheet=<class>): every clip in the 4 facings,
// basic / veteran / elite, formations in the given clips; full page, console errors listed. Needs the dev server.
// Usage: node scripts/art/pixellab/i5b/shots5b.mjs <class> <out dir> [--url http://localhost:5291] [--anims walk,slash] [--z 1,2]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const base = opt('url', 'http://localhost:5291');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
for (const z of opt('z', '1,2').split(',')) {
  for (const anim of opt('anims', 'walk').split(',')) {
    await page.goto(`${base}/hoplite-bakeoff.html?sheet=${cls}&z=${z}&anim=${anim}`);
    await page.waitForTimeout(Number(opt('wait', 3000)));
    const file = join(out, `preview_${cls}_z${z}_${anim}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
