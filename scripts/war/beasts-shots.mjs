// W-67 beasts and lairs: every lair kind's den live and cleared (added on test-ridge's east field, the cleared ones'
// mobs killed), a lion lair roused (its roar rings), and the mob scenarios at their FX beats: the lion's pounce, the
// boar's charge run-up, the serpent's lunge.
// Usage: node scripts/war/beasts-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/beasts', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const boot = async (q) => {
  await page.goto(`${base}sandbox.html?region=test-ridge&sim=real&offline=1${q}`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById('rfLoad'), null, { timeout: 120000 });
  await page.evaluate(() => window.__sandbox.setFog(false));
};
const KINDS = ['wolf', 'boar', 'bear', 'bandit', 'jackal', 'ibex', 'lion', 'serpent'];
/** Kind k's den: live at P, cleared beside it on screen (x + 5, y - 5: one row of the iso screen). */
const P = (k) => [372.5 + 7 * k, 226.5 + 7 * k];

// (1) the dens
await boot('');
await page.evaluate(([kinds, ps]) => {
  const s = window.__sandbox;
  kinds.forEach((k, i) => {
    s.sim.addLair(k, ps[i][0], ps[i][1], 2);
    s.sim.addLair(k, ps[i][0] + 5, ps[i][1] - 5, 1);
  });
}, [KINDS, KINDS.map((_, k) => P(k))]);
await page.waitForFunction((n) => (window.__sandbox.sim.cur.lairs ?? []).filter((l) => l.alive > 0).length >= n, KINDS.length * 2, { timeout: 30000 });
await page.evaluate(([ps]) => {
  const s = window.__sandbox, cur = s.sim.cur;
  for (const l of cur.lairs) {
    if (!ps.some(([x, y]) => Math.abs(l.x - (x + 5)) < 0.1 && Math.abs(l.y - (y - 5)) < 0.1)) continue;
    s.sim.devUnits(cur.squads.find((q) => q.id === l.squad)?.units ?? [], 'kill');
  }
}, [KINDS.map((_, k) => P(k))]);
await page.waitForFunction(() => (window.__sandbox.sim.cur.lairs ?? []).filter((l) => l.state === 'cleared').length >= 8, null, { timeout: 30000 });
await wait(1500);
const mid = P(3.5);
await page.evaluate(([x, y]) => window.__sandbox.focus(x + 2.5, y - 2.5, 0.5), mid);
await wait(1500);
await shot('lairs_all_zoom050');
for (const [k, kind] of KINDS.entries()) {
  const [x, y] = P(k);
  await page.evaluate(([x, y]) => window.__sandbox.focus(x + 2.5, y - 2.5, 1), [x, y]);
  await wait(900);
  await shot(`lair_${kind}_live_cleared`);
}
// (2) a lion lair roused: men walk up to it, the roar rings
const [lx, ly] = P(6);
await page.evaluate(([x, y]) => {
  const s = window.__sandbox;
  s.focus(x, y, 0.5);
  s.sim.devSpawn(0, 'hoplite', 12, x + 9, y + 2);
}, [lx, ly]);
await page.waitForFunction(() => (window.__sandbox.mobFx.seen.mobCry ?? 0) > 0, null, { timeout: 20000 }).catch(() => console.log('no cry'));
await wait(350);
await shot('lion_lair_roused_roar');
await wait(2500);
await shot('lion_pride_pounce_fight');

// (3) the mob scenarios at their beats
for (const kind of ['lion', 'boar', 'serpent']) {
  await boot(`&scenario=mob-${kind}`);
  await wait(800);
  await shot(`mob_${kind}_start`);
  await page.waitForFunction(() => (window.__sandbox.mobFx.seen.mobDash ?? 0) > 0, null, { timeout: 60000 }).catch(() => console.log(`no ${kind} dash`));
  await page.evaluate(() => {
    const s = window.__sandbox, u = s.drawn.find((d) => d.u.cls.startsWith('mob_') && d.u.state !== 'dead');
    if (u) s.focus(u.x, u.y, 1);
  });
  await wait(250);
  await shot(`mob_${kind}_dash`);
  await wait(1200);
  await shot(`mob_${kind}_fight`);
}

console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
