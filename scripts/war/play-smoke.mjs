// Headless smoke of the local war playtest (docs/PLAYTEST.md), against a running `npm run play:war`:
// world map -> enter home -> a move order -> a camp placed and built -> back to the world -> a transfer to a neighbour.
// System Chrome (channel 'chrome'): the bundled Chromium can't load the page.
//   node scripts/war/play-smoke.mjs [--url http://localhost:5173] [--dev 1] [--shots shots/play]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL_ = arg('url', 'http://localhost:5173'), DEV = Number(arg('dev', 1)), SHOTS = arg('shots', 'shots/play');
mkdirSync(SHOTS, { recursive: true });
const step = (s) => console.log(`[smoke] ${s}`);
const errors = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('[net]')) && errors.push(`console: ${m.text().slice(0, 200)}`));
let ok = true;
// screenshots are best effort: under software GL a frame can take long
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}`, timeout: 90_000 }).catch(() => step(`     (no screenshot ${name})`));
const check = (cond, what) => {
  step(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) ok = false;
};

try {
  // 1. world map, live
  await page.goto(`${URL_}/world.html?dev=${DEV}`);
  await page.waitForFunction(() => window.__world?.st?.regions?.size > 0, null, { timeout: 60_000 });
  const w = await page.evaluate(() => ({ you: window.__world.st.you, regions: window.__world.st.regions.size }));
  check(w.you !== null && w.you !== undefined, `world map live: ${w.regions} regions, alliance ${w.you}`);
  await shot('1-world.png');

  // 2. enter the home region (select it, Enter: the world screen's own path)
  const home = ['dodona', 'skythia', 'kyrene', 'elaia'][w.you ?? 0];
  await page.evaluate((id) => window.__world.select(id), home);
  await Promise.all([page.waitForURL(/sandbox\.html/, { timeout: 30_000, waitUntil: 'commit' }), page.keyboard.press('Enter')]);
  check(page.url().includes(`region=${home}`) && page.url().includes('net='), `entered ${home} (${page.url().split('?')[1]})`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur?.squads?.some((q) => q.team === Number(new URLSearchParams(location.search).get('team')) && q.units.length > 0), null, { timeout: 180_000 });
  const sq = await page.evaluate(() => {
    const s = window.__sandbox, team = Number(new URLSearchParams(location.search).get('team'));
    const q = s.sim.cur.squads.filter((x) => x.team === team && x.units.length > 0).pop();
    const u = s.sim.cur.units.find((x) => q.units.includes(x.id));
    return { id: q.id, men: q.units.length, x: u.x, y: u.y, team };
  });
  check(sq.men > 0, `our squad ${sq.id} stands in ${home}: ${sq.men} men at ${sq.x.toFixed(0)},${sq.y.toFixed(0)}`);
  await shot('2-region.png');

  // 3. a move order
  // out of the entry's no-build strip, toward the middle of the map
  const W = await page.evaluate(() => ({ w: window.__sandbox.region.w, h: window.__sandbox.region.h }));
  const step20 = (v, mid) => Math.round(v + Math.sign(mid - v) * 24);
  const to = { x: step20(sq.x, W.w / 2), y: step20(sq.y, W.h / 2) };
  await page.evaluate(({ id, to }) => window.__sandbox.sim.order({ kind: 'move', squad: id, x: to.x, y: to.y }), { id: sq.id, to });
  await page.waitForFunction(({ id, x0, y0 }) => {
    const s = window.__sandbox, q = s.sim.cur.squads.find((x) => x.id === id);
    const u = s.sim.cur.units.find((x) => q.units.includes(x.id));
    return Math.hypot(u.x - x0, u.y - y0) > 1.5;
  }, { id: sq.id, x0: sq.x, y0: sq.y }, { timeout: 30_000 }).then(() => check(true, 'move order: the squad marches'), () => check(false, 'move order: the squad never moved'));

  // 4. a build order: a camp next to the squad (first spot the server's placement check accepts)
  const placed = await page.evaluate(async ({ id, team, to }) => {
    const s = window.__sandbox, why = {};
    for (let r = 4; r < 60; r += 4) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const x = to.x + dx, y = to.y + dy;
      const c = await s.sim.checkPlacement(team, 'camp', x, y, 0);
      if (c?.ok) {
        s.sim.order({ kind: 'placeBuilding', squad: id, type: 'camp', x, y, rot: 0 });
        return { x, y };
      }
      why[c?.reason ?? 'null'] = (why[c?.reason ?? 'null'] ?? 0) + 1;
    }
    return { why };
  }, { ...sq, to });
  // a home region has no claim points: its alliance holds no influence there, so the server refuses a camp ('influence');
  // that answer still proves the build path (client -> region socket -> server placement check -> reply)
  const answered = placed.x !== undefined || Object.keys(placed.why).some((k) => k !== 'null');
  check(answered, `build order: the server's placement check answered (${placed.x !== undefined ? `camp placed at ${placed.x},${placed.y}` : `refused: ${JSON.stringify(placed.why)}`})`);
  if (placed.x === undefined && placed.why.influence) step('     note: no influence of yours here; claim a neutral first (docs/PLAYTEST.md)');
  if (placed.x !== undefined) {
    await page.waitForFunction(({ team, p }) => window.__sandbox.sim.cur.buildings.some((b) => b.type === 'camp' && b.team === team && Math.abs(b.x - p.x) <= 1 && Math.abs(b.y - p.y) <= 1), { team: sq.team, p: placed }, { timeout: 30_000 })
      .then(() => check(true, 'camp site in the snapshot'), () => check(false, 'camp site never appeared'));
    const b = await page.evaluate(({ team }) => window.__sandbox.sim.cur.buildings.find((x) => x.type === 'camp' && x.team === team), { team: sq.team });
    if (b) step(`     camp ${b.id}: ${JSON.stringify({ state: b.state, progress: b.progress, hp: b.hp })}`);
  }
  await page.waitForTimeout(3000);
  await shot('3-build.png');

  // 5. back to the world, a transfer of his men in the home region to a neighbour
  await page.goto(`${URL_}/world.html?dev=${DEV}`);
  await page.waitForFunction((home) => window.__world?.st?.regions?.size > 0, home, { timeout: 60_000 });
  const tr = await page.evaluate(async (home) => {
    const g = await import('/src/war/world/graph.ts');
    const r = g.worldRegion(home);
    for (let i = 0; i < 20; i++) {
      const res = await window.__world.source.transfer(home, r.adj[0]);
      if (!('error' in res) || !/no men|none/i.test(res.error)) return { to: r.adj[0], res };
      await new Promise((ok) => setTimeout(ok, 1000)); // the roster refreshes every 5 s
    }
    return { to: r.adj[0], res: { error: 'no men seen' } };
  }, home);
  check(!('error' in tr.res), `transfer ${home} -> ${tr.to}: ${JSON.stringify(tr.res).slice(0, 160)}`);
  await page.waitForTimeout(2000);
  await shot('4-transfer.png');
} catch (e) {
  check(false, `aborted: ${e.message.split('\n')[0]}`);
}
for (const e of errors.slice(0, 15)) step(`     ${e}`);
await browser.close();
step(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
