// Live wiring check of the local war loop (docs/PLAYTEST.md), against a running `npm run play:war -- --reset --fast`
// (a fresh world, no bot players; --fast: transits take seconds). The game logic past this (the caravan, lairs, the
// guardian, claims, the ram siege, the buyer's coin) is covered by seeded vitest scenarios: tests/war/loop.test.ts and
// server/test/war/tradeLoop.test.ts. This only proves the pieces are wired:
//
//   page: world map live -> enter home -> a move order over the region socket
//   raw sockets (dev 1, the seller; dev 2, Skythia, the buyer, each on its own address): food and coin out of each
//   strongroom into packs -> one chained transfer each into kleisoura -> into the market court -> the seller's food
//   stowed into his stall and offered, the buyer's coin stowed into his warehouse -> the buyer fills the offer.
//
// Playwright's bundled Chromium in the new headless mode (channel 'chromium'; the old headless shell can't run the page:
// software GL there is far too slow). `--chrome` uses the system Chrome instead.
//   node scripts/war/play-smoke.mjs [--url http://localhost:5173] [--api http://localhost:8787] [--dev 1] [--shots shots/play] [--chrome]
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL_ = arg('url', 'http://localhost:5173'), API = arg('api', 'http://localhost:8787'), DEV = Number(arg('dev', 1)), SHOTS = arg('shots', 'shots/play');
const BUYER = DEV + 1, TOWN = 'kleisoura';
mkdirSync(SHOTS, { recursive: true });
const t0 = Date.now();
const step = (s) => console.log(`[smoke ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s] ${s}`);
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  channel: process.argv.includes('--chrome') ? 'chrome' : 'chromium',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('[net]')) && errors.push(`console: ${m.text().slice(0, 200)}`));
let ok = true;
const passed = [];
// screenshots are best effort: under software GL a frame can take long
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}`, timeout: 60_000 }).catch(() => step(`     (no screenshot ${name})`));
const check = (cond, what) => {
  step(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) ok = false;
  else passed.push(what.split(':')[0]);
  return !!cond;
};
const must = (cond, what) => {
  if (!check(cond, what)) throw new Error(`stopped at: ${what.split(':')[0]}`);
};
const HOMES = ['dodona', 'skythia', 'kyrene', 'elaia'];

// ---------------------------------------------------------------- REST and raw region sockets, one address per player
async function login(id, name) {
  const ip = `10.9.1.${id % 250}`;
  const r = await fetch(`${API}/api/auth/telegram`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ dev: { id, first_name: name } }) });
  if (!r.ok) throw new Error(`dev login ${id}: ${r.status} ${await r.text()}`);
  const s = await r.json();
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json', 'cf-connecting-ip': ip }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? j : { error: j.error?.message ?? j.error ?? `HTTP ${res.status}`, status: res.status };
  };
  return { pid: s.player.id, token: s.token, ip, call };
}
const ROOT = new URL('../..', import.meta.url);
const SIM_V = Number(/SIM_VERSION = (\d+)/.exec(readFileSync(new URL('src/sim/version.ts', ROOT), 'utf8'))[1]);
const NET_V = Number(/NET_VERSION = (\d+)/.exec(readFileSync(new URL('src/war/net/protocol.ts', ROOT), 'utf8'))[1]);
/** A raw region socket for a player: join with person ids, then send messages and read the JSON answers. */
async function socket(p, region, team, ids) {
  // his own address (Node's WebSocket takes headers): accounts seen on one address are linked and may not trade (M6i)
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/ws/war/${region}?sim=${SIM_V}`, { protocols: ['pixelarrow.v1', p.token], headers: { 'cf-connecting-ip': p.ip } });
  const inbox = [];
  ws.onmessage = (e) => typeof e.data === 'string' && inbox.push(JSON.parse(e.data));
  await new Promise((res, fail) => ((ws.onopen = res), (ws.onerror = () => fail(new Error('socket error')))));
  const send = (m) => ws.send(JSON.stringify(m));
  const wait = async (pred, ms = 20_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
    }
    return null;
  };
  send({ t: 'join', v: NET_V, region, playerId: p.pid, team, squads: [ids] });
  const hello = await wait((m) => ['welcome', 'refused', 'error'].includes(m.t));
  return { send, wait, hello, squad: hello?.squads?.[0], close: () => ws.close() };
}
const answer = (m) => m.t === 'stowed' || m.t === 'error';
/** Men of p at home take `goods` out of the strongroom into their packs, then haul home -> via -> TOWN (one chained transfer). */
async function haul(p, team, via, goods, who) {
  const home = HOMES[team];
  const ros = await p.call('GET', '/api/war/roster');
  const ids = ros.persons.filter((x) => x.state === 'active' && (x.region ?? home) === home).map((x) => x.id);
  const hs = await socket(p, home, team, ids);
  must(hs.hello?.t === 'welcome' && hs.squad !== undefined, `${who} joined ${home} over a raw socket with ${ids.length} men: ${hs.hello?.t} ${hs.hello?.detail ?? hs.hello?.reason ?? ''}`);
  hs.send({ t: 'stow', dir: 'out', site: 'strongroom', squad: hs.squad, goods });
  const out = await hs.wait(answer);
  must(out?.t === 'stowed', `${who}: ${JSON.stringify(goods)} out of the strongroom into packs: ${JSON.stringify(out).slice(0, 120)}`);
  await sleep(1500); // the room saves the packs before they leave
  hs.close();
  const tr = await p.call('POST', '/api/war/world/transfer', { from: home, to: via, ids, path: [TOWN] });
  let arrived = false;
  for (let i = 0; i < 60 && !tr.error && !arrived; i++) {
    arrived = (await p.call('GET', '/api/war/roster')).persons?.some((x) => x.region === TOWN);
    if (!arrived) await sleep(2000);
  }
  must(arrived, `${who}'s transfer ${home} -> ${via} -> ${TOWN}: ${JSON.stringify(tr).slice(0, 120)}${arrived ? ', arrived' : ', never arrived'}`);
  const s = await socket(p, TOWN, team, ids);
  must(s.hello?.t === 'welcome' && s.squad !== undefined, `${who} took his squad over in ${TOWN}: ${s.hello?.t} ${s.hello?.detail ?? s.hello?.reason ?? ''}`);
  return s;
}
/** March into the court (dev skip between tries) and stow `goods` into the site: refused `not_in_court` until there. */
async function stowIn(s, site, goods, court) {
  s.send({ t: 'order', o: { kind: 'move', squad: s.squad, x: court.x, y: court.y } });
  for (let i = 0; i < 25; i++) {
    s.send({ t: 'dev', op: 'skip', ticks: 200 });
    await sleep(1000);
    s.send({ t: 'stow', dir: 'in', site, squad: s.squad, goods });
    const r = await s.wait(answer);
    if (r?.t === 'stowed' || !/not_in_court/.test(r?.detail ?? '')) return r;
  }
  return null;
}

try {
  // 1. world map, live
  await page.goto(`${URL_}/world.html?dev=${DEV}`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => window.__world?.st?.regions?.size > 0, null, { timeout: 60_000 });
  const w = await page.evaluate(() => ({ you: window.__world.st.you, regions: window.__world.st.regions.size }));
  must(w.you !== null && w.you !== undefined, `world map live: ${w.regions} regions, alliance ${w.you}`);
  const team = w.you, home = HOMES[team];
  must(team === 0, `the page player is Dodona (dodona-e borders ${TOWN}; Skythia is the buyer's): alliance ${team}`);
  await shot('1-world.png');

  // 2. enter the home region (select it, Enter: the world screen's own path)
  await page.evaluate((id) => window.__world.select(id), home);
  await Promise.all([page.waitForURL(/sandbox\.html/, { timeout: 30_000, waitUntil: 'commit' }), page.keyboard.press('Enter')]);
  check(page.url().includes(`region=${home}`) && page.url().includes('net='), `entered ${home} (${page.url().split('?')[1]})`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur?.squads?.some((q) => q.team === Number(new URLSearchParams(location.search).get('team')) && q.units.length > 0), null, { timeout: 180_000 });
  const sq = await page.evaluate(() => {
    const s = window.__sandbox, team = Number(new URLSearchParams(location.search).get('team')), me = s.sim.playerId;
    const q = s.sim.cur.squads.find((x) => x.team === team && (me === null || x.owner === `p:${me}`) && x.units.length);
    const us = s.sim.cur.units.filter((u) => q.units.includes(u.id));
    return { id: q.id, men: us.length, x: us.reduce((t, u) => t + u.x, 0) / us.length, y: us.reduce((t, u) => t + u.y, 0) / us.length };
  });
  must(sq.men > 0, `our squad ${sq.id} stands in ${home}: ${sq.men} men at ${sq.x.toFixed(0)},${sq.y.toFixed(0)}`);

  // 3. a move order from the page over its region socket: out of the entry strip toward the map's middle
  const W = await page.evaluate(() => ({ w: window.__sandbox.region.w, h: window.__sandbox.region.h }));
  const to = { x: Math.round(sq.x + Math.sign(W.w / 2 - sq.x) * 24), y: Math.round(sq.y + Math.sign(W.h / 2 - sq.y) * 24) };
  await page.evaluate((o) => window.__sandbox.sim.order(o), { kind: 'move', squad: sq.id, ...to });
  let moved = false;
  for (let i = 0; i < 20 && !moved; i++) {
    await page.waitForTimeout(1500);
    moved = await page.evaluate(({ id, x0, y0 }) => {
      const s = window.__sandbox.sim.cur, q = s.squads.find((x) => x.id === id), us = s.units.filter((u) => q.units.includes(u.id));
      return Math.hypot(us.reduce((t, u) => t + u.x, 0) / us.length - x0, us.reduce((t, u) => t + u.y, 0) / us.length - y0) > 1.5;
    }, { id: sq.id, x0: sq.x, y0: sq.y });
  }
  check(moved, `move order: ${moved ? 'the squad marches' : 'the squad never moved'}`);
  await shot('2-region.png');
  // the market court of the town, from the region's own zones (served by vite)
  const ct = await page.evaluate(async (id) => {
    const { parseRegion } = await import('/src/war/region/schema.ts');
    const r = parseRegion((await import(`/src/war/regions/${id}.json`)).default).safe?.[0];
    return r ? { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) } : null;
  }, TOWN);
  must(!!ct, `${TOWN}'s market court: ${JSON.stringify(ct)}`);
  await page.goto('about:blank'); // the page leaves: its men stay in the region for the raw socket to take over

  // 4. the seller (the page's player, the start's food in his strongroom): food to kleisoura, stowed into a stall, offered
  const sl = await login(DEV, 'Seller');
  const ss = await haul(sl, team, `${home}-e`, { food: 10 }, 'seller');
  const st = await sl.call('POST', `/api/war/trade/${TOWN}/rent`, { kind: 'stall' });
  check(!st.error, `seller rented a stall: ${JSON.stringify(st).slice(0, 120)}`);
  const sIn = await stowIn(ss, 'stall', { food: 10 }, ct);
  must(sIn?.t === 'stowed', `the seller's food stowed into his stall: ${JSON.stringify(sIn).slice(0, 120)}`);
  const offer = await sl.call('POST', `/api/war/trade/${TOWN}/offers`, { side: 'sell', res: 'food', n: 10, price: 3 });
  must(!offer.error && offer.offer, `sell offer listed: ${JSON.stringify(offer).slice(0, 120)}`);
  ss.close();

  // 5. the buyer (dev BUYER, Skythia): coin to kleisoura, stowed into a warehouse, the offer filled from it
  const PURSE = 60;
  const b = await login(BUYER, 'Buyer');
  if ((await b.call('GET', '/api/war/world')).you?.alliance === null) await b.call('POST', '/api/war/world/dev/alliance', { alliance: 1 });
  await b.call('POST', '/api/war/dev/seed', {});
  const bs = await haul(b, 1, 'skythia-w', { coin: PURSE }, 'buyer');
  const wh = await b.call('POST', `/api/war/trade/${TOWN}/rent`, { kind: 'warehouse' });
  check(!wh.error, `buyer rented a warehouse: ${JSON.stringify(wh).slice(0, 120)}`);
  const bIn = await stowIn(bs, 'warehouse', { coin: PURSE }, ct);
  must(bIn?.t === 'stowed', `the buyer's coin stowed into his warehouse: ${JSON.stringify(bIn).slice(0, 120)}`);
  const whGoods = () => b.call('GET', `/api/war/trade/${TOWN}/mine`).then((m) => m.sites?.find((s) => s.kind === 'warehouse')?.goods ?? {});
  const wg0 = await whGoods();
  const oid = typeof offer.offer === 'number' ? offer.offer : offer.offer?.id;
  const f = await b.call('POST', `/api/war/trade/offers/${oid}/fill`, { n: 10, key: `smoke-${Date.now()}` });
  check(!f.error && f.n === 10, `buyer filled offer ${oid}: ${JSON.stringify(f).slice(0, 160)}`);
  const wg1 = await whGoods();
  check((wg1.food ?? 0) - (wg0.food ?? 0) === 10 && (wg0.coin ?? 0) - (wg1.coin ?? 0) === 30, `the food in the buyer's warehouse, 30 coin paid from it: ${JSON.stringify(wg0)} -> ${JSON.stringify(wg1)}`);
  bs.close();
} catch (e) {
  check(false, `aborted: ${e.message.split('\n')[0]}`);
}
for (const e of errors.slice(0, 20)) step(`     ${e}`);
await browser.close();
step(`${passed.length} checks passed in ${Math.round((Date.now() - t0) / 1000)} s`);
step(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
