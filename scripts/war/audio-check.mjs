/**
 * Headless check of the war's sound layer: open the sandbox (vite dev server, default http://localhost:5173), click
 * the canvas (the user gesture), then expect the AudioContext running, a music track chosen, ambience beds and no
 * page errors. Usage: [SC=<scenario>] [WAIT=<ms>] node scripts/war/audio-check.mjs [base url]
 */
import { launch } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await launch({ args: ['--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/sandbox.html?scenario=${process.env.SC ?? 'free'}`);
await page.waitForFunction(() => !!window.__warAudio, null, { timeout: 120000 });
const before = await page.evaluate(() => window.__warAudio.debug().state);
await page.mouse.click(640, 400);
await page.waitForFunction(() => window.__warAudio.debug().state === 'running', null, { timeout: 15000 });
// a fight: frame the units fighting (else their middle) so their sounds are in view
const frame = () => page.evaluate(() => {
  const s = window.__sandbox, us = s.sim.cur?.units.filter((u) => u.state !== 'dead') ?? [];
  const f = us.filter((u) => u.state === 'attack'), pick = f.length ? f : us;
  if (pick.length) s.focus(pick.reduce((a, u) => a + u.x, 0) / pick.length, pick.reduce((a, u) => a + u.y, 0) / pick.length, 1 / 2);
});
const wait = Number(process.env.WAIT ?? 2500);
for (let t = 0; t < wait; t += 2500) {
  if (process.env.SC) await frame();
  await page.waitForTimeout(2500);
}
await page.click('#rfSoundBtn');
await page.waitForTimeout(300);
const d = await page.evaluate(() => window.__warAudio.debug());
await browser.close();
const ok = before === 'none' && d.state === 'running' && !!d.want && errors.length === 0;
console.log(JSON.stringify({ before, state: d.state, want: d.want, music: d.music, ambience: d.ambience, played: d.played, byId: d.byId, errors }, null, 1));
console.log(ok ? 'OK' : 'FAIL');
process.exit(ok ? 0 : 1);
