// W-66 look check: the Tunnel of Shades by the home camp (scenario food-hunger, test-ridge) with every shade walking
// its line out of the mouth (src/war/view/shades.ts previewShades), at zoom 1 and 2.
// Usage: node scripts/war/shades-shots.mjs [baseUrl] [outDir]   (needs a running dev server)
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/shades', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
await page.goto(`${base}sandbox.html?region=test-ridge&scenario=food-hunger`);
await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'), null, { timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('rfLoad'), null, { timeout: 120000 });
// HOME (src/war/scenarios/kit.ts) is 342, 338; the camp stands on it: the tunnel goes in the open ground west of it
await page.evaluate(async () => {
  const m = await import('/src/war/view/shades.ts');
  await m.previewShades(window.__sandbox, 326, 334);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/tunnel-town-1x.png` });
for (const [i, z] of [[0, 2], [1, 2]]) {
  await page.evaluate(([dz, k]) => { const s = window.__sandbox; s.focus(327.5, 340 + k * 6, dz); }, [z, i]);
  await page.waitForTimeout(400 + i * 130);
  await page.screenshot({ path: `${out}/shades-2x-${i}.png` });
}
console.log('saved to', out, problems.length ? problems : 'no errors');
await browser.close();
