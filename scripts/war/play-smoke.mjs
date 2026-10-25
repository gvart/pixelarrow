// Headless smoke of the whole local war loop (docs/PLAYTEST.md), against a running `npm run play:war -- --reset --fast`
// (a fresh world; --fast: transits take seconds). The dev skip (DEV_AUTH) fast-forwards the region server between checks.
//
//   world map -> enter home -> march -> home influence and nodes -> gather wood into a store -> camp and storehouse
//   built at home -> recruit and train at home -> a smith and an engineer join, a sword forged at a forge, a handcart
//   made at a workshop -> the cart loaded and crewed, a caravan dodona -> dodona-e -> kleisoura (a frontier town) ->
//   a stall rented, goods stowed from the cart, a sell offer listed -> a second dev player (Skythia) present in the
//   town buys it (fill) -> transfer kleisoura -> dodona-e -> moors -> the bear lair raided -> its claim point claimed
//   -> a ram built and crewed against the second player's palisade gate -> a last transfer moors -> dodona-e.
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
const BUYER = DEV + 1;
mkdirSync(SHOTS, { recursive: true });
const step = (s) => console.log(`[smoke] ${s}`);
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
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}`, timeout: 90_000 }).catch(() => step(`     (no screenshot ${name})`));
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

// ---------------------------------------------------------------- page helpers
const api = (method, path, body) => page.evaluate(({ method, path, body }) => window.__sandbox.sim.api(method, path, body), { method, path, body });
const skip = (n) => page.evaluate((n) => window.__sandbox.sim.skip(n), n);
const order = (o) => page.evaluate((o) => window.__sandbox.sim.order(o), o);
/** Poll `cond` (async, page side or not), fast-forwarding the region `n` ticks between tries. */
const until = async (cond, rounds = 20, n = 300) => {
  for (let i = 0; i < rounds; i++) {
    const v = await cond();
    if (v) return v;
    if (n) await skip(n);
    await page.waitForTimeout(1500);
  }
  return cond();
};
/** Our squads standing in the region: id, men, centre, classes. */
const ours = () => page.evaluate(() => {
  const s = window.__sandbox, team = Number(new URLSearchParams(location.search).get('team'));
  return s.sim.cur.squads.filter((q) => q.team === team).map((q) => {
    const us = s.sim.cur.units.filter((u) => q.units.includes(u.id) && u.state !== 'dead');
    return us.length ? { id: q.id, men: us.length, x: us.reduce((t, u) => t + u.x, 0) / us.length, y: us.reduce((t, u) => t + u.y, 0) / us.length, cls: [...new Set(us.map((u) => u.cls))], civ: !!q.civ, states: [...new Set(us.map((u) => u.state))].join(','), carry: us.filter((u) => u.carry).length } : null;
  }).filter(Boolean);
});
const squadAt = async (id) => (await ours()).find((q) => q.id === id) ?? null;
/** Open region `id` live as the world screen does (world=1: take over our squads there, or join with men from home). */
async function enter(id) {
  await page.goto(`${URL_}/sandbox.html?region=${id}&world=1&net=${encodeURIComponent(`/ws/war/${id}`)}&dev=${DEV}&team=${team}`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => window.__sandbox?.sim?.cur?.squads?.some((q) => q.team === Number(new URLSearchParams(location.search).get('team')) && q.units.length > 0), null, { timeout: 180_000 });
  await page.evaluate(() => {
    window.__smoke = [];
    const s = window.__sandbox.sim, prev = s.onServer;
    s.onServer = (m) => (window.__smoke.push(m), prev?.(m));
  });
  await page.waitForTimeout(2000);
}
const serverMsgs = () => page.evaluate(() => window.__smoke.splice(0));
/** A world transfer by REST; then wait until the men stand in `dest` (their roster region). */
async function transfer(from, to, squad, path = []) {
  const res = await api('POST', 'world/transfer', { from, to, squad, ...(path.length ? { path } : {}) });
  if (!res || res.error) return { res };
  const dest = path.at(-1) ?? to;
  for (let i = 0; i < 90; i++) {
    const r = await api('GET', 'roster');
    if (r?.persons?.some((p) => p.region === dest)) return { res, arrived: true };
    await page.waitForTimeout(2000);
  }
  return { res, arrived: false };
}
/** A building or engine of ours by type, nearest (x,y). */
const nearestOf = (kind, type, at, team) => page.evaluate(({ kind, type, at, team }) => {
  const s = window.__sandbox.sim.full, xs = (kind === 'b' ? s.buildings : s.sieges ?? []).filter((b) => b.type === type && b.team === team && b.state !== 'destroyed' && !b.rubble);
  const c = (b) => (kind === 'b' ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: b.x, y: b.y });
  return xs.map((b) => ({ ...b, ...{ cx: c(b).x, cy: c(b).y } })).sort((a, b) => Math.hypot(a.cx - at.x, a.cy - at.y) - Math.hypot(b.cx - at.x, b.cy - at.y))[0] ?? null;
}, { kind, type, at, team });
/** Place a building near `at` at the first spot the server's check accepts; the squad builds it; wait until done. */
async function placeAndBuild(type, squad, at) {
  const placed = await page.evaluate(async ({ id, team, at, type }) => {
    const s = window.__sandbox, why = {};
    for (let r = 4; r < 40; r += 3) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const x = Math.round(at.x + dx), y = Math.round(at.y + dy);
      const c = await s.sim.checkPlacement(team, type, x, y, 0);
      if (c?.ok) {
        s.sim.order({ kind: 'placeBuilding', squad: id, type, x, y, rot: 0 });
        return { x, y };
      }
      why[c?.reason ?? 'null'] = (why[c?.reason ?? 'null'] ?? 0) + 1;
    }
    return { why };
  }, { id: squad, team, at, type });
  if (!check(placed.x !== undefined, `${type} placed: ${placed.x !== undefined ? `${placed.x},${placed.y}` : `refused ${JSON.stringify(placed.why)}`}`)) return null;
  const get = () => page.evaluate(({ team, p, type }) => window.__sandbox.sim.cur.buildings.find((b) => b.type === type && b.team === team && Math.abs(b.x - p.x) <= 2 && Math.abs(b.y - p.y) <= 2) ?? null, { team, p: placed, type });
  const done = await until(async () => { const b = await get(); return b?.state === 'done' ? b : null; }, 20, 200);
  const b = done ?? (await get());
  check(!!done, `${type} built: ${b ? JSON.stringify({ id: b.id, state: b.state, progress: +b.progress.toFixed(2) }) : 'never appeared'}`);
  return done;
}

// ---------------------------------------------------------------- the buyer (dev BUYER, Skythia): REST and a raw socket
async function login(id, name) {
  const r = await fetch(`${API}/api/auth/telegram`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.9.1.${id % 250}` }, body: JSON.stringify({ dev: { id, first_name: name } }) });
  if (!r.ok) throw new Error(`dev login ${id}: ${r.status} ${await r.text()}`);
  const s = await r.json();
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json', 'cf-connecting-ip': `10.9.1.${id % 250}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? j : { error: j.error?.message ?? j.error ?? `HTTP ${res.status}`, status: res.status };
  };
  return { pid: s.player.id, token: s.token, call };
}
const ROOT = new URL('../..', import.meta.url);
const SIM_V = Number(/SIM_VERSION = (\d+)/.exec(readFileSync(new URL('src/sim/version.ts', ROOT), 'utf8'))[1]);
const NET_V = Number(/NET_VERSION = (\d+)/.exec(readFileSync(new URL('src/war/net/protocol.ts', ROOT), 'utf8'))[1]);
/** A raw region socket for a player: join with person ids, then send messages and read the JSON answers. */
async function socket(p, region, team, ids) {
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/ws/war/${region}?sim=${SIM_V}`, ['pixelarrow.v1', p.token]);
  const inbox = [];
  ws.onmessage = (e) => typeof e.data === 'string' && inbox.push(JSON.parse(e.data));
  await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = () => fail(new Error('socket error')))));
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
  return { ws, send, wait, hello, close: () => ws.close() };
}

let team = 0;
try {
  // 1. world map, live
  await page.goto(`${URL_}/world.html?dev=${DEV}`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => window.__world?.st?.regions?.size > 0, null, { timeout: 60_000 });
  const w = await page.evaluate(() => ({ you: window.__world.st.you, regions: window.__world.st.regions.size }));
  must(w.you !== null && w.you !== undefined, `world map live: ${w.regions} regions, alliance ${w.you}`);
  team = w.you;
  await shot('1-world.png');

  // 2. enter the home region (select it, Enter: the world screen's own path)
  const home = HOMES[team];
  await page.evaluate((id) => window.__world.select(id), home);
  await Promise.all([page.waitForURL(/sandbox\.html/, { timeout: 30_000, waitUntil: 'commit' }), page.keyboard.press('Enter')]);
  check(page.url().includes(`region=${home}`) && page.url().includes('net='), `entered ${home} (${page.url().split('?')[1]})`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur?.squads?.some((q) => q.team === Number(new URLSearchParams(location.search).get('team')) && q.units.length > 0), null, { timeout: 180_000 });
  await page.evaluate(() => {
    window.__smoke = [];
    const s = window.__sandbox.sim, prev = s.onServer;
    s.onServer = (m) => (window.__smoke.push(m), prev?.(m));
  });
  const sq = (await ours()).pop();
  must(sq?.men > 0, `our squad ${sq?.id} stands in ${home}: ${sq?.men} men at ${sq?.x.toFixed(0)},${sq?.y.toFixed(0)}`);
  await shot('2-region.png');

  // 3. a move order: out of the entry's no-build strip, toward the middle of the map
  const W = await page.evaluate(() => ({ w: window.__sandbox.region.w, h: window.__sandbox.region.h }));
  const step20 = (v, mid) => Math.round(v + Math.sign(mid - v) * 24);
  await order({ kind: 'move', squad: sq.id, x: step20(sq.x, W.w / 2), y: step20(sq.y, W.h / 2) });
  const moved = await until(async () => { const p = await squadAt(sq.id); return p && Math.hypot(p.x - sq.x, p.y - sq.y) > 1.5; }, 20, 0);
  check(moved, `move order: ${moved ? 'the squad marches' : 'the squad never moved'}`);

  // 4. the economy view: our home's influence (pre-claimed at the home town) and the resource nodes we see
  const eco = await page.waitForFunction(() => {
    const s = window.__sandbox, m = s.sim.influence, ps = (s.region.prebuilt ?? []).filter((p) => !p.tiles);
    if (!m || !s.sim.nodes.length || !ps.length) return null;
    const a = { x: Math.round(ps.reduce((t, p) => t + p.x, 0) / ps.length) + 0.5, y: Math.round(ps.reduce((t, p) => t + p.y, 0) / ps.length) + 0.5 };
    return { ...a, ours: (m.mask[Math.floor(a.y) * m.w + Math.floor(a.x)] & 1) === 1, nodes: s.sim.nodes.length };
  }, null, { timeout: 60_000 }).then((h) => h.jsonValue(), () => null);
  must(!!eco?.ours, `home influence and nodes on the wire: ${eco ? `anchor ${eco.x},${eco.y} ours ${eco.ours}, ${eco.nodes} nodes seen` : 'none came'}`);

  // 5. march to the home town: 50 tiles short of its centre on our side (inside the anchor's radius 64)
  const p0 = await squadAt(sq.id), d0 = Math.hypot(p0.x - eco.x, p0.y - eco.y);
  const town = { x: Math.round(eco.x + ((p0.x - eco.x) / d0) * 50), y: Math.round(eco.y + ((p0.y - eco.y) / d0) * 50) };
  await order({ kind: 'move', squad: sq.id, x: town.x, y: town.y });
  const there = await until(async () => { const p = await squadAt(sq.id); return p && Math.hypot(p.x - town.x, p.y - town.y) < 8 ? p : null; });
  must(!!there, `marched to the home town (${town.x},${town.y})${there ? '' : `: still at ${JSON.stringify(await squadAt(sq.id))}`}`);

  // 6. gather wood: the nearest open wood node; the men carry it to the nearest store of ours (the town's storehouses)
  const wood0 = await page.evaluate((team) => window.__sandbox.sim.cur.stock?.[team]?.wood ?? 0, team);
  const node = await page.evaluate(({ at }) => {
    const ns = window.__sandbox.sim.nodes.filter((n) => n.res === 'wood' && n.amount >= 1 && !n.guarded && !n.rare);
    return ns.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0] ?? null;
  }, { at: there });
  if (check(!!node, `a wood node to gather${node ? `: ${node.id} at ${node.x.toFixed(0)},${node.y.toFixed(0)} (${node.amount})` : ''}`)) {
    await order({ kind: 'gather', squad: sq.id, node: node.id });
    const got = await until(() => page.evaluate(({ team, w0 }) => { const w = window.__sandbox.sim.cur.stock?.[team]?.wood ?? 0; return w > w0 ? w : null; }, { team, w0: wood0 }));
    check(!!got, `wood delivered to a store: ${wood0} -> ${got ?? JSON.stringify(await squadAt(sq.id))}`);
    await order({ kind: 'stopWork', squad: sq.id });
  }
  await shot('3-gather.png');

  // 7. build a camp and a storehouse at home (the dev stock covers what the gathering did not)
  for (const [res, n] of [['wood', 300], ['stone', 200]]) await page.evaluate(({ team, res, n }) => window.__sandbox.sim.addStock(team, res, n), { team, res, n });
  await placeAndBuild('camp', sq.id, (await squadAt(sq.id)) ?? town);
  await placeAndBuild('storehouse', sq.id, (await squadAt(sq.id)) ?? town);
  await shot('4-build.png');

  // 8. recruit and train at home (REST): the dev seed first gives two civilians at home and coin (the militia are out)
  const seeded = await api('POST', 'dev/seed', { squad: [{ cls: 'civ_smith', level: 5 }, { cls: 'civ_engineer', level: 5 }], reserve: [{ cls: 'militia' }] });
  check(!seeded?.error, `dev seed: a smith, an engineer and a reserve militiaman at home, coin: ${JSON.stringify(seeded).slice(0, 120)}`);
  // the start's 12 militia took the home pool (6 an hour): right after the start it refuses, as it should
  const rec = await api('POST', 'recruit', { town: 'home', count: 1 });
  check(rec?.ids?.length === 1 || rec?.error?.code === 'pool_empty', `recruit at home: ${JSON.stringify(rec).slice(0, 120)}`);
  let ros = await api('GET', 'roster');
  const trainee = rec?.ids?.[0] ?? ros.persons.find((p) => p.cls === 'militia' && !p.region)?.id;
  const tr = trainee ? await api('POST', `persons/${trainee}/train`, { cls: 'hoplite' }) : { error: 'nobody at home' };
  check(tr?.until > 0, `training a militiaman as a hoplite: ${JSON.stringify(tr).slice(0, 120)}`);
  ros = await api('GET', 'roster');
  const smith = ros.persons.find((p) => p.cls === 'civ_smith' && !p.region), eng = ros.persons.find((p) => p.cls === 'civ_engineer' && !p.region);
  const nd = smith ? await api('POST', `persons/${smith.id}/node`, { node: 'bladesmith' }) : { error: 'no smith' };
  check(!nd?.error, `the smith takes Bladesmith: ${JSON.stringify(nd).slice(0, 120)}`);

  // 9. the civilians join (a rejoin: the militia stay ours), a sword at a forge, then a handcart at a workshop
  await enter(home);
  const civ = (await ours()).find((q) => q.civ || q.cls.some((c) => c.startsWith('civ_')));
  must(!!civ && !!eng, `smith and engineer in ${home}: ${JSON.stringify(civ)}`);
  for (const [res, n] of [['bronze', 20], ['wood', 100], ['hides', 10], ['iron', 10], ['charcoal', 10]]) await page.evaluate(({ team, res, n }) => window.__sandbox.sim.addStock(team, res, n), { team, res, n });
  const forge = await nearestOf('b', 'forge', town, team);
  must(!!forge, `a forge of ours in ${home}: ${forge ? `${forge.id} at ${forge.cx},${forge.cy}` : 'none'}`);
  // a chest of ours by the forge: what the smith makes lands in it (and shows in the stash)
  await placeAndBuild('chest', sq.id, { x: forge.cx, y: forge.cy + 6 });
  await order({ kind: 'civWork', squad: civ.id, building: forge.id });
  await order({ kind: 'craft', team, building: forge.id, recipe: 'item:xiphos' });
  const swordIn = async () => ((await api('GET', 'stash'))?.field ?? []).some((h) => JSON.stringify(h).includes('xiphos'));
  const sword = await until(async () => ((await swordIn()) ? true : null), 25, 300);
  check(!!sword, `a sword (xiphos) forged into our chest: ${sword ? 'in the stash' : `queue ${JSON.stringify(await page.evaluate((id) => window.__sandbox.sim.full.buildings.find((b) => b.id === id)?.queue ?? null, forge.id))}, stash ${JSON.stringify(await api('GET', 'stash')).slice(0, 200)}`}`);
  const shop = await nearestOf('b', 'workshop', town, team);
  must(!!shop, `a workshop of ours: ${shop ? shop.id : 'none'}`);
  await order({ kind: 'civWork', squad: civ.id, building: shop.id });
  await order({ kind: 'craft', team, building: shop.id, recipe: 'handcart' });
  const cart = await until(() => nearestOf('s', 'handcart', { x: shop.cx, y: shop.cy }, team), 25, 300);
  must(!!cart, `a handcart made at the workshop: ${cart ? `${cart.id} at ${cart.x.toFixed(0)},${cart.y.toFixed(0)}` : JSON.stringify(await page.evaluate((id) => window.__sandbox.sim.full.buildings.find((b) => b.id === id)?.queue ?? null, shop.id))}`);
  await shot('5-craft.png');

  // 10. caravan: the militia crew the cart, load wood from a store of ours, and haul it dodona -> dodona-e -> kleisoura
  await order({ kind: 'crew', squad: sq.id, siege: cart.id });
  const crewed = await until(() => page.evaluate(({ c, q }) => window.__sandbox.sim.full.sieges?.find((s) => s.id === c)?.crew === q, { c: cart.id, q: sq.id }), 15, 100);
  check(crewed, `the militia crew the handcart`);
  const store = await nearestOf('b', 'storehouse', { x: cart.x, y: cart.y }, team);
  await order({ kind: 'load', squad: sq.id, from: { building: store.id }, res: 'wood', n: 30 });
  const loaded = await until(() => page.evaluate((c) => { const s = window.__sandbox.sim.full.sieges?.find((x) => x.id === c); return (s?.load ?? s?.loads ?? 0) > 0 ? s : null; }, cart.id), 15, 100);
  check(!!loaded, `wood loaded on the cart: ${JSON.stringify(loaded ?? (await page.evaluate((c) => window.__sandbox.sim.full.sieges?.find((x) => x.id === c), cart.id))).slice(0, 200)}`);
  // one leg at a time: a chained haul (path) leaves its cart behind (docs/PLAYTEST.md known gaps)
  const hop1 = await transfer(home, 'dodona-e', sq.id);
  must(hop1.arrived, `caravan ${home} -> dodona-e: ${JSON.stringify(hop1.res).slice(0, 160)}${hop1.arrived ? ', arrived' : ', never arrived'}`);
  await enter('dodona-e');
  const c1 = await page.evaluate((team) => window.__sandbox.sim.full.sieges?.find((x) => x.type === 'handcart' && x.team === team && x.state !== 'destroyed') ?? null, team);
  must(!!c1, `the cart came along to dodona-e: ${JSON.stringify(c1).slice(0, 160)}`);
  const hop1b = await transfer('dodona-e', 'kleisoura', c1.crew >= 0 ? c1.crew : (await ours())[0].id);
  must(hop1b.arrived, `caravan dodona-e -> kleisoura: ${JSON.stringify(hop1b.res).slice(0, 160)}${hop1b.arrived ? ', arrived' : ', never arrived'}`);

  // 11. the frontier town: the cart in the market court, a stall rented, wood stowed from the cart, a sell offer
  await enter('kleisoura');
  const k = await page.evaluate((team) => {
    const s = window.__sandbox, safe = s.region.safe ?? [];
    const c = s.sim.full.sieges?.find((x) => x.type === 'handcart' && x.team === team);
    const r = safe[0];
    return { cart: c ? { id: c.id, x: c.x, y: c.y, crew: c.crew } : null, court: r ? { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) } : null };
  }, team);
  must(!!k.cart && !!k.court, `cart and the market court in kleisoura: ${JSON.stringify(k)}`);
  const crew = (await ours()).find((q) => q.id === k.cart.crew) ?? (await ours())[0];
  await order({ kind: 'move', squad: crew.id, x: k.court.x, y: k.court.y });
  const inCourt = await until(() => page.evaluate(({ c, court }) => { const s = window.__sandbox.sim.full.sieges?.find((x) => x.id === c); return s && Math.hypot(s.x - court.x, s.y - court.y) < 6; }, { c: k.cart.id, court: k.court }), 25, 300);
  check(inCourt, `the cart rolled into the market court`);
  const rent = await api('POST', 'trade/kleisoura/rent', { kind: 'stall' });
  check(!rent?.error, `stall rented in kleisoura: ${JSON.stringify(rent).slice(0, 120)}`);
  await serverMsgs();
  await page.evaluate((c) => window.__sandbox.sim.stow({ dir: 'in', site: 'stall', cart: c, goods: { wood: 10 } }), k.cart.id);
  await page.waitForTimeout(3000);
  const stowed = (await serverMsgs()).find((m) => m.t === 'stowed' || m.t === 'error');
  check(stowed?.t === 'stowed', `wood stowed from the cart into the stall: ${JSON.stringify(stowed).slice(0, 160)}`);
  const offer = await api('POST', 'trade/kleisoura/offers', { side: 'sell', res: 'wood', n: 10, price: 3 });
  must(!offer?.error && offer?.offer, `sell offer listed: ${JSON.stringify(offer).slice(0, 160)}`);
  await shot('6-market.png');

  // 12. the buyer: another dev player (Skythia) joins kleisoura with men from home, rents a warehouse, fills the offer
  const b = await login(BUYER, 'Buyer');
  const bw = await b.call('GET', '/api/war/world');
  if (bw.you?.alliance === null) await b.call('POST', '/api/war/world/dev/alliance', { alliance: 1 });
  await b.call('POST', '/api/war/dev/seed', {});
  const bros = await b.call('GET', '/api/war/roster');
  const bids = bros.persons.filter((p) => p.state === 'active' && !p.region).map((p) => p.id);
  const bs = await socket(b, 'kleisoura', 1, bids);
  check(bs.hello?.t === 'welcome', `buyer ${b.pid} joined kleisoura: ${bs.hello?.t} ${bs.hello?.detail ?? bs.hello?.reason ?? ''}`);
  await sleep(1500);
  const wh = await b.call('POST', '/api/war/trade/kleisoura/rent', { kind: 'warehouse' });
  check(!wh.error, `buyer rented a warehouse: ${JSON.stringify(wh).slice(0, 120)}`);
  const board = await b.call('GET', '/api/war/trade/kleisoura/board');
  const oid = typeof offer.offer === 'number' ? offer.offer : offer.offer?.id;
  const f = await b.call('POST', `/api/war/trade/offers/${oid}/fill`, { n: 10, key: `smoke-${Date.now()}` });
  check(!f.error && f.n > 0, `buyer filled the offer ${oid}: ${JSON.stringify(f).slice(0, 160)} (board ${JSON.stringify(board).slice(0, 80)})`);
  const mine = await api('GET', 'trade/kleisoura/mine');
  check(/coin/.test(JSON.stringify(mine)), `the stall holds the coin: ${JSON.stringify(mine).slice(0, 160)}`);
  bs.close();

  // 13. on to the moors (kleisoura -> dodona-e -> moors), the buyer's palisade raised there first (a foe's to siege)
  const bros2 = await b.call('GET', '/api/war/roster');
  const left = bros2.persons.filter((p) => (p.state === 'active' || p.state === 'reserve') && !p.region).map((p) => p.id).slice(0, 12);
  const ms = await socket(b, 'moors', 1, left);
  check(ms.hello?.t === 'welcome', `buyer joined the moors with ${left.length} men: ${ms.hello?.t} ${ms.hello?.detail ?? ''}`);
  const bsq = ms.hello?.squads?.[0]?.id ?? ms.hello?.squads?.[0];
  const PAL = { x: 185, y: 301 }; // the moors' lair-free claim point: his ground
  ms.send({ t: 'dev', op: 'claim', x: PAL.x, y: PAL.y, r: 24 });
  ms.send({ t: 'dev', op: 'stock', res: 'wood', n: 400 });
  await sleep(1500);
  const wall = { material: 'wood', points: [[PAL.x - 8, PAL.y - 6], [PAL.x + 8, PAL.y - 6]], gates: [[PAL.x, PAL.y - 6]] };
  ms.send({ t: 'check', id: 1, kind: 'wall', ...wall });
  const wc = await ms.wait((m) => m.t === 'checked');
  check(wc?.result?.ok !== false, `buyer's palisade line checks: ${JSON.stringify(wc?.result ?? wc).slice(0, 160)}`);
  ms.send({ t: 'order', o: { kind: 'placeWall', squad: bsq, ...wall } });
  for (let i = 0; i < 12; i++) ms.send({ t: 'dev', op: 'skip', ticks: 600 });
  await sleep(4000);
  ms.close();

  const pre = await ours();
  const moversId = (pre.find((q) => !q.civ) ?? pre[0]).id;
  const hop2 = await transfer('kleisoura', 'dodona-e', moversId, ['moors']);
  must(hop2.arrived, `transfer kleisoura -> dodona-e -> moors: ${JSON.stringify(hop2.res).slice(0, 160)}${hop2.arrived ? ', arrived' : ', never arrived'}`);

  // 14. raid the bear lair that guards the moors' third claim point, then claim it
  await enter('moors');
  const R = await page.evaluate(() => ({ lair: window.__sandbox.region.lairs?.[4], cp: window.__sandbox.region.claimPoints?.[2] }));
  must(R.lair && R.cp, `moors lair 4 and claim point 2: ${JSON.stringify(R)}`);
  // the militia alone lose to bears: dev reinforcements (two squads of hoplites) beside them
  const m0 = (await ours())[0];
  for (let i = 0; i < 2; i++) await page.evaluate(({ team, x, y }) => window.__sandbox.sim.devSpawn(team, 'hoplite', 12, x, y), { team, x: m0.x + 3 * i, y: m0.y + 3 });
  await page.waitForTimeout(3000);
  for (const q of await ours()) await order({ kind: 'attackMove', squad: q.id, x: R.lair.x, y: R.lair.y });
  const lairFoes = () => page.evaluate(({ lair }) => {
    const s = window.__sandbox.sim.full, q = new Map(s.squads.map((x) => [x.id, x]));
    return s.units.filter((u) => u.state !== 'dead' && q.get(u.squad)?.team === 6 && Math.hypot(u.x - lair.x, u.y - lair.y) < 30).length;
  }, R);
  const cleared = await until(async () => {
    const n = await lairFoes(), near = (await ours()).some((q) => Math.hypot(q.x - R.lair.x, q.y - R.lair.y) < 20);
    return near && n === 0 ? true : null;
  }, 30, 300);
  check(cleared, `the bear lair raided: ${cleared ? 'no beasts left' : `${await lairFoes()} beasts left, squads ${JSON.stringify(await ours())}`}`);
  const claimer = (await ours())[0];
  await order({ kind: 'claimRegion', squad: claimer.id, point: 2 });
  const claimed = await until(() => page.evaluate(({ cp, team }) => { const m = window.__sandbox.sim.influence; return m && (m.mask[Math.floor(cp.y) * m.w + Math.floor(cp.x)] & (1 << team)) ? true : null; }, { cp: R.cp, team }), 25, 300);
  check(claimed, `claim point 2 claimed: ${claimed ? 'its radius is our influence' : JSON.stringify(await squadAt(claimer.id))}`);
  await shot('7-claim.png');

  // 15. siege: a ram built next to the buyer's palisade, crewed, battering his gate
  const gate = await page.evaluate(({ PAL }) => {
    const s = window.__sandbox.sim.full;
    return s.buildings.filter((b) => b.team === 1 && Math.hypot(b.x - PAL.x, b.y - PAL.y) < 20).map((b) => ({ id: b.id, type: b.type, state: b.state, x: b.x, y: b.y, hp: b.hp })).sort((a, b) => (/gate/i.test(b.type) ? 1 : 0) - (/gate/i.test(a.type) ? 1 : 0));
  }, { PAL });
  const g = gate[0];
  const anyFoe = await page.evaluate(() => window.__sandbox.sim.full.buildings.filter((b) => b.team === 1).map((b) => `${b.id}:${b.type}:${b.state}`).slice(0, 8));
  if (check(!!g && /gate/i.test(g.type), `the buyer's palisade gate in the moors: ${JSON.stringify(g ?? anyFoe)}`)) {
    page.evaluate(({ team }) => window.__sandbox.sim.addStock(team, 'wood', 200), { team });
    const sappers = (await ours()).filter((q) => !q.civ).sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y));
    const rx = g.x, ry = g.y - 10;
    await order({ kind: 'move', squad: sappers[0].id, x: rx, y: ry });
    await until(async () => { const p = await squadAt(sappers[0].id); return p && Math.hypot(p.x - rx, p.y - ry) < 6; }, 20, 300);
    await order({ kind: 'buildSiege', squad: sappers[0].id, type: 'ram', x: rx, y: ry });
    const ram = await until(async () => { const r = await nearestOf('s', 'ram', { x: rx, y: ry }, team); return r && r.state !== 'building' && r.state !== 'site' && (r.progress ?? 1) >= 1 ? r : null; }, 20, 300);
    const ramNow = ram ?? (await nearestOf('s', 'ram', { x: rx, y: ry }, team));
    if (check(!!ram, `a ram built by the gate: ${JSON.stringify(ramNow).slice(0, 160)}`)) {
      await order({ kind: 'crew', squad: sappers[0].id, siege: ram.id });
      await until(() => page.evaluate(({ c, q }) => window.__sandbox.sim.full.sieges?.find((s) => s.id === c)?.crew === q, { c: ram.id, q: sappers[0].id }), 10, 100);
      await order({ kind: 'attackBuilding', squad: sappers[0].id, building: g.id });
      const hp = () => page.evaluate((id) => { const b = window.__sandbox.sim.full.buildings.find((x) => x.id === id); return b ? { hp: b.hp, state: b.state } : null; }, g.id);
      const hp0 = await hp();
      const hit = await until(async () => { const h = await hp(); return !h || h.state === 'destroyed' || h.hp < hp0.hp ? h ?? { gone: true } : null; }, 20, 200);
      check(!!hit, `the ram batters the gate: ${JSON.stringify(hp0)} -> ${JSON.stringify(hit ?? (await hp()))}`);
    }
  }
  await shot('8-siege.png');

  // 16. a last transfer between regions: the militia, moors -> dodona-e
  const back = (await ours()).find((q) => q.cls.includes('militia')) ?? (await ours())[0];
  const hop3 = await transfer('moors', 'dodona-e', back.id);
  check(hop3.arrived, `transfer moors -> dodona-e: ${JSON.stringify(hop3.res).slice(0, 160)}${hop3.arrived ? ', arrived' : ', never arrived'}`);
} catch (e) {
  check(false, `aborted: ${e.message.split('\n')[0]}`);
}
for (const e of errors.slice(0, 20)) step(`     ${e}`);
await browser.close();
step(`${passed.length} checks passed`);
step(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
