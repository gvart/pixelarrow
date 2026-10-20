// Headless smoke of the local war playtest (docs/PLAYTEST.md), against a running `npm run play:war`:
// world map -> enter home -> a move order -> home influence and nodes on the wire -> march to the home town -> gather
// wood into a store -> a camp placed and built at home -> back to the world -> a transfer to a neighbour. The dev skip
// (DEV_AUTH) fast-forwards the region server between checks.
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

  // 4. the economy view: our home's influence (pre-claimed at the home town) and the resource nodes we see
  const eco = await page.waitForFunction(() => {
    const s = window.__sandbox, m = s.sim.influence, ps = (s.region.prebuilt ?? []).filter((p) => !p.tiles);
    if (!m || !s.sim.nodes.length || !ps.length) return null;
    const a = { x: Math.round(ps.reduce((t, p) => t + p.x, 0) / ps.length) + 0.5, y: Math.round(ps.reduce((t, p) => t + p.y, 0) / ps.length) + 0.5 };
    return { ...a, ours: (m.mask[Math.floor(a.y) * m.w + Math.floor(a.x)] & 1) === 1, nodes: s.sim.nodes.length };
  }, null, { timeout: 60_000 }).then((h) => h.jsonValue(), () => null);
  check(!!eco?.ours, `home influence and nodes on the wire: ${eco ? `anchor ${eco.x},${eco.y} ours ${eco.ours}, ${eco.nodes} nodes seen` : 'none came'}`);
  if (!eco) throw new Error('no economy view');

  // the squad's place in the snapshot; the dev skip (DEV_AUTH) fast-forwards the region server
  const where = () => page.evaluate((id) => {
    const s = window.__sandbox, q = s.sim.cur.squads.find((x) => x.id === id), us = s.sim.cur.units.filter((u) => q?.units.includes(u.id) && u.state !== 'dead');
    return us.length ? { x: us.reduce((t, u) => t + u.x, 0) / us.length, y: us.reduce((t, u) => t + u.y, 0) / us.length, carry: us.filter((u) => u.carry).length, states: [...new Set(us.map((u) => u.state))].join(',') } : null;
  }, sq.id);
  const skip = (n) => page.evaluate((n) => window.__sandbox.sim.skip(n), n);
  const until = async (cond, rounds = 20, n = 300) => {
    for (let i = 0; i < rounds; i++) {
      const v = await cond();
      if (v) return v;
      await skip(n);
      await page.waitForTimeout(1500);
    }
    return cond();
  };

  // 5. march to the home town: 50 tiles short of its centre on our side (inside the anchor's radius 64)
  const p0 = await where(), d0 = Math.hypot(p0.x - eco.x, p0.y - eco.y);
  const town = { x: Math.round(eco.x + ((p0.x - eco.x) / d0) * 50), y: Math.round(eco.y + ((p0.y - eco.y) / d0) * 50) };
  await page.evaluate(({ id, town }) => window.__sandbox.sim.order({ kind: 'move', squad: id, x: town.x, y: town.y }), { id: sq.id, town });
  const there = await until(async () => { const p = await where(); return p && Math.hypot(p.x - town.x, p.y - town.y) < 8 ? p : null; });
  check(!!there, `marched to the home town (${town.x},${town.y})${there ? '' : `: still at ${JSON.stringify(await where())}`}`);

  // 6. gather wood: the nearest open wood node; the men carry it to the nearest store of ours (the town's storehouses)
  const wood0 = await page.evaluate((team) => window.__sandbox.sim.cur.stock?.[team]?.wood ?? 0, sq.team);
  const node = await page.evaluate(({ at }) => {
    const ns = window.__sandbox.sim.nodes.filter((n) => n.res === 'wood' && n.amount >= 1 && !n.guarded && !n.rare);
    return ns.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0] ?? null;
  }, { at: there ?? town });
  check(!!node, `a wood node to gather${node ? `: ${node.id} at ${node.x.toFixed(0)},${node.y.toFixed(0)} (${node.amount})` : ''}`);
  if (node) {
    await page.evaluate(({ id, node }) => window.__sandbox.sim.order({ kind: 'gather', squad: id, node }), { id: sq.id, node: node.id });
    const got = await until(() => page.evaluate(({ team, w0 }) => { const w = window.__sandbox.sim.cur.stock?.[team]?.wood ?? 0; return w > w0 ? w : null; }, { team: sq.team, w0: wood0 }));
    check(!!got, `wood delivered to a store: ${wood0} -> ${got ?? JSON.stringify(await where())}`);
    await page.evaluate((id) => window.__sandbox.sim.order({ kind: 'stopWork', squad: id }), sq.id);
  }
  await shot('3-gather.png');

  // 7. build a camp at home: the first spot near the squad the server's placement check accepts, then the men build it
  const near = (await where()) ?? town;
  const placed = await page.evaluate(async ({ id, team, at }) => {
    const s = window.__sandbox, why = {};
    for (let r = 4; r < 40; r += 3) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const x = Math.round(at.x + dx), y = Math.round(at.y + dy);
      const c = await s.sim.checkPlacement(team, 'camp', x, y, 0);
      if (c?.ok) {
        s.sim.order({ kind: 'placeBuilding', squad: id, type: 'camp', x, y, rot: 0 });
        return { x, y };
      }
      why[c?.reason ?? 'null'] = (why[c?.reason ?? 'null'] ?? 0) + 1;
    }
    return { why };
  }, { ...sq, at: near });
  check(placed.x !== undefined, `camp placed at home: ${placed.x !== undefined ? `${placed.x},${placed.y}` : `refused ${JSON.stringify(placed.why)}`}`);
  if (placed.x !== undefined) {
    const camp = () => page.evaluate(({ team, p }) => window.__sandbox.sim.cur.buildings.find((b) => b.type === 'camp' && b.team === team && Math.abs(b.x - p.x) <= 2 && Math.abs(b.y - p.y) <= 2) ?? null, { team: sq.team, p: placed });
    const done = await until(async () => { const b = await camp(); return b?.state === 'done' ? b : null; }, 20, 200);
    const b = done ?? (await camp());
    check(!!done, `camp built: ${b ? JSON.stringify({ id: b.id, state: b.state, progress: +b.progress.toFixed(2) }) : 'never appeared'}`);
  }
  await page.waitForTimeout(3000);
  await shot('4-build.png');

  // 8. back to the world, a transfer of his men in the home region to a neighbour
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
  await shot('5-transfer.png');
} catch (e) {
  check(false, `aborted: ${e.message.split('\n')[0]}`);
}
for (const e of errors.slice(0, 15)) step(`     ${e}`);
await browser.close();
step(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
