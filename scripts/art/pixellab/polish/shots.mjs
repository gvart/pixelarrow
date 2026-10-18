// Polish: screenshots of the sheet preview page (src/dev/hopliteBakeoff.ts ?sheet=<class>), with the three tiers
// forced, as i5b/shots5b.mjs but with long timeouts (a busy machine) and an optional crop of the tier rows.
// Needs the dev server. Usage: node scripts/art/pixellab/polish/shots.mjs <class> <out dir> [--url http://localhost:5291]
//   [--anims idle] [--z 2] [--wait 6000]
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
page.setDefaultTimeout(180000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
for (const z of opt('z', '2').split(',')) {
  for (const anim of opt('anims', 'idle').split(',')) {
    await page.goto(`${base}/hoplite-bakeoff.html?sheet=${cls}&z=${z}&anim=${anim}`, { timeout: 180000 });
    await page.waitForTimeout(Number(opt('wait', 6000)));
    const file = join(out, `preview_${cls}_z${z}_${anim}.png`);
    await page.screenshot({ path: file, fullPage: true, timeout: 180000 });
    console.log(file);
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
