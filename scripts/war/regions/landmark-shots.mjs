// W-48 landmark shots: each of the nine landmarks in the sandbox (real sim, offline, fog off) at zoom 1/4 and 1/2 over
// its centre, and the whole region zoomed out. Usage: node scripts/war/regions/landmark-shots.mjs [baseUrl] [outDir] [ids]
// (requires a running dev server).
import { launch, captureErrors, shotsDir } from '../../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/landmark-arch', process.argv[3]);
const ids = (process.argv[4] ?? 'krios,ammon,omphalos,siren,delta,saddle,erymanthos,gorge,canyons').split(',');
const browser = await launch(); // (the angle GL flags fail image decodes on macOS headless)
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems = captureErrors(page, { prefix: true, echo: true });
for (const id of ids) {
  await page.goto(`${base}sandbox.html?region=${id}&sim=real&offline=1`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur?.buildings?.length > 0, null, { timeout: 240000 }).catch(async (e) => { console.log(problems, await page.evaluate(() => Object.keys(window.__sandbox ?? {}))); throw e; });
  await page.evaluate(() => window.__sandbox.setFog(false));
  await page.waitForTimeout(1500);
  await page.keyboard.press('l'); // the landmark card off the picture
  // the landmark's centre: the middle of its pieces' bounds
  const c = await page.evaluate(() => {
    const bs = window.__sandbox.sim.cur.buildings.filter((b) => b.landmark);
    const xs = bs.map((b) => b.x), ys = bs.map((b) => b.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, n: bs.length };
  });
  console.log(id, c);
  for (const [z, tag] of [[1 / 4, 'q'], [1 / 2, 'h']]) {
    await page.evaluate(({ x, y, z }) => window.__sandbox.focus(x, y, z), { ...c, z });
    await page.waitForTimeout(14000);
    await page.screenshot({ path: `${out}/${id}_${tag}.png` });
  }
  await page.evaluate(() => window.__sandbox.focus(256, 256, 1 / 8));
  await page.waitForTimeout(14000);
  await page.screenshot({ path: `${out}/${id}_map.png` });
}
await browser.close();
