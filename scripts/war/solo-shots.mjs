// W-73 solo loop (offline): the region mastery chip under the top bar's plaque, its toast when the region is mastered,
// and the Tasks panel's solo draw (no partner tasks offline).
// Usage: node scripts/war/solo-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/solo', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const W = Number(process.env.W ?? 1520), H = Number(process.env.H ?? 750);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}-${W}.png` });
  console.log('saved', `${out}/${name}-${W}.png`);
};

await page.goto(`${base}sandbox.html?region=${process.env.REGION ?? 'moors'}&sim=real&offline=1`);
await page.waitForFunction(() => window.__sandbox?.sim?.cur && window.__mastery, null, { timeout: 180000 });
await page.waitForFunction(() => !document.getElementById('rfLoad'), null, { timeout: 120000 });
await wait(2500);
// some progress: two lairs and a hidden quest
await page.evaluate(() => {
  const m = window.__mastery, n = m.need;
  m.set({ region: 'x', lairs: [2, n.lairs.length], chiefs: [0, n.chiefs.length], secrets: [1, n.secrets.length], done: false });
});
await wait(600);
await shot('mastery-chip');
await page.evaluate(() => {
  const m = window.__mastery, n = m.need;
  m.set({ region: 'x', lairs: [n.lairs.length, n.lairs.length], chiefs: [n.chiefs.length, n.chiefs.length], secrets: [n.secrets.length, n.secrets.length], done: true });
});
await wait(700);
await shot('mastery-toast');
await page.click('#rfTasksBtn');
await wait(1200);
await shot('solo-tasks');
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
