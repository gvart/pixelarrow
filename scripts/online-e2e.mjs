// End-to-end test of the online mode against a real local backend: two fake
// players (DEV_AUTH) in two browser contexts join the season, one attacks a
// hex (server-verified, with the 15 s timed deployment and the battle report),
// they form a clan through an invite link, and fight a live lockstep duel
// (deployment orders withheld from the opponent until go, one side readied by
// its countdown). Saves shots/23-online-map.png, 24-clan.png and 25-duel.png
// (git-ignored).
//
// Needs: `npm run dev` in server/ (wrangler dev on :8787 with DEV_AUTH=1 in
// .dev.vars and migrations applied) and `VITE_DEV_AUTH=1 npx vite` (proxying
// /api and /ws to :8787). Usage: node scripts/online-e2e.mjs [viteUrl] [outDir]
// E2E_DEBUG=1 logs the duel's socket traffic; E2E_NAVPROBE=1 logs navigations, crashes and failed CDP calls.
import { launch, phoneContext, captureErrors, makePageApi, check, finish, shotsDir, until as untilBase } from './lib/harness.mjs';

const base = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const out = shotsDir('', process.argv[3]);
const ids = [Math.floor(Date.now() / 1000) % 100000 + 200000, Math.floor(Date.now() / 1000) % 100000 + 300000];

const browser = await launch();
const NAVPROBE = !!process.env.E2E_NAVPROBE;
if (NAVPROBE) {
  // the raw CDP error behind Playwright's 'Execution context was destroyed' (it rewrites any protocol error to that)
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { CRSession } = req(req.resolve('playwright-core/package.json').replace(/package\.json$/, 'lib/server/chromium/crConnection.js'));
  const send = CRSession.prototype.send;
  CRSession.prototype.send = function (method, params) {
    const t = Date.now();
    return send.call(this, method, params).catch((e) => {
      if (method.startsWith('Runtime.')) console.log(`  CDPERR ${method} after ${Date.now() - t}ms: ${String(e.message ?? e).slice(0, 400)}`);
      throw e;
    });
  };
}

async function player(devuser, extra = '') {
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  const errors = captureErrors(page, { ignoreNetwork: true, stack: true });
  // E2E_DEBUG=1: log the duel traffic on the shard socket (not presence or army moves).
  if (process.env.E2E_DEBUG) {
    page.on('websocket', (ws) => {
      const log = (dir) => (f) => {
        const t = String(f.payload);
        if (!/"type":"(presence|who|welcome|ping|pong|army_[a-z]+)"/.test(t)) console.log(`  [${devuser} ${dir}] ${t.slice(0, 160)}`);
      };
      ws.on('framesent', log('>'));
      ws.on('framereceived', log('<'));
      ws.on('close', () => console.log(`  [${devuser}] socket closed`));
    });
  }
  if (NAVPROBE) {
    // who navigates the page, if anything: document requests, navigation requests, crashes, unloads
    const t0 = Date.now();
    const L = (...a) => console.log(`  NAV [${devuser}] +${Date.now() - t0}ms`, ...a);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    cdp.on('Page.frameRequestedNavigation', (e) => L('requested', e.reason, e.disposition, e.url));
    cdp.on('Page.navigatedWithinDocument', (e) => L('within', e.url));
    cdp.on('Network.requestWillBeSent', (e) => { if (e.type === 'Document') L('docreq', e.request.url, JSON.stringify(e.initiator).slice(0, 1500)); });
    cdp.on('Inspector.targetCrashed', () => L('CRASHED'));
    page.on('crash', () => L('page crash'));
    page.on('close', () => L('page close'));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) L('framenavigated', f.url()); });
    page.on('console', (m) => { if (/^\[nav\]/.test(m.text())) L(m.text()); });
    await page.addInitScript(() => {
      console.log('[nav] load', performance.getEntriesByType('navigation')[0]?.type, location.href, 'hist', history.length, JSON.stringify(history.state));
      addEventListener('pagehide', (e) => console.log('[nav] pagehide persisted', e.persisted));
      addEventListener('beforeunload', () => console.log('[nav] beforeunload'));
      window.navigation?.addEventListener('navigate', (e) => {
        const g = window.__game;
        const rec = { t: Date.now(), type: e.navigationType, url: e.destination.url, user: e.userInitiated, same: e.destination.sameDocument, form: !!e.formData, scenes: g?.scene.getScenes(true).map((s) => s.scene.key).join(','), stack: new Error().stack };
        const log = JSON.parse(sessionStorage.getItem('__navlog') ?? '[]');
        log.push(rec);
        sessionStorage.setItem('__navlog', JSON.stringify(log.slice(-6)));
      });
    });
  }
  // Two players in software WebGL run at ~5 fps: taps are dispatched inside the page (harness.mjs tap).
  const p = { page, ctx, errors, devuser, api: makePageApi(page, { tapWait: 250, step: 200 }) };
  await page.goto(`${base}?devuser=${devuser}${extra}`);
  await page.waitForTimeout(2500);
  return p;
}

const ev = (p, fn, arg) => p.page.evaluate(fn, arg).catch(async (e) => {
  if (!NAVPROBE || !/context was destroyed/.test(String(e))) throw e;
  // still the same document? (the session's navigation log, navigation type, history)
  await p.page.waitForTimeout(3000);
  const info = await p.page.evaluate(() => JSON.stringify({ navlog: sessionStorage.getItem('__navlog'), url: location.href, nav: performance.getEntriesByType('navigation')[0]?.type, hist: history.length, state: history.state })).catch((x) => String(x));
  console.log(`  DESTROYED [${p.devuser}] ${info} errors=${p.errors.join(' | ')}`);
  throw e;
});
const until = (fn, ms = 15000, step = 200) => untilBase(fn, ms, step);
const active = (p, k) => p.api.active(k);
const tap = (p, x, y) => p.api.tap(x, y);
/** Taps the first (or with `last`, the last) visible Button in a scene whose label starts with `label`. */
const tapBtn = (p, sceneKey, label, last = false) => p.api.tapBtn(sceneKey, { label, index: last ? -1 : 0 });
const phase = (p) => ev(p, () => window.__game.scene.getScene('Battle')?.sim?.phase ?? null);
/** The post-battle report on screen (Results scene). */
const report = (p) =>
  ev(p, () => {
    const r = window.__game.scene.getScene('Results').report;
    return r ? { verified: r.verified, online: r.online, result: r.result } : null;
  });
/** Leaves the battle report with its bottom button ("Spoils" first when there is loot, then "Onward"). */
async function leaveReport(p) {
  for (let i = 0; i < 3; i++) {
    const pos = await ev(p, () => {
      const b = window.__game.scene.getScene('Results').primary;
      if (!b?.visible) return null;
      const r = b.getBounds();
      return window.__css(r.centerX, r.centerY);
    });
    if (pos) await tap(p, pos[0], pos[1]);
    if (await until(() => active(p, 'Online'), 4000)) return true;
  }
  return false;
}
const sceneText = (p, k) => p.api.sceneText(k);

// ---------------------------------------------------------------- join
const A = await player(ids[0]);
const B = await player(ids[1]);
for (const p of [A, B]) {
  check(`[${p.devuser}] menu`, await active(p, 'Menu'));
  // the War medallion in the mode tab bar (by its layout id, not its label)
  await p.api.tapBtn('Menu', { id: 'tab.war' });
  check(`[${p.devuser}] online scene`, await until(() => active(p, 'Online'), 5000));
  await until(async () => (await sceneText(p, 'Online')).includes('JOIN'), 8000);
  await tapBtn(p, 'Online', 'Join');
  check(`[${p.devuser}] joined the season, map shown`, await until(() => ev(p, () => !!window.__game.scene.getScene('Online').map), 10000));
}
const prof = await ev(A, () => window.__game.scene.getScene('Online').profile);
check('server-owned starting army', prof.heroes.length === 5 && prof.resources.gold > 0, `${prof.heroes.length} heroes, ${prof.resources.gold} gold`);

// ---------------------------------------------------------------- attack a neighbouring region
const target = await ev(A, () => {
  const s = window.__game.scene.getScene('Online');
  const w = s.world;
  const a = s.profile.army.loc;
  const r = s.map.regions.find((x) => w.adjacent(a, x.loc) && x.occupant === 'npc' && x.owner === null);
  return r ? r.loc : null;
});
check('a neutral region next to home', target !== null);
await ev(A, (h) => window.__game.scene.getScene('Online').select(h), target);
await until(() => ev(A, () => !!window.__game.scene.getScene('Online').detail), 5000);
// the war table pans to the hex and the panel settles (slow frames in software WebGL)
await A.page.waitForTimeout(1500);
await A.page.screenshot({ path: `${out}/23-online-map.png` });
console.log('saved', `${out}/23-online-map.png`);
// A screenshot stalls the page for one long frame; a tap right after it would read as a long-press.
await A.page.waitForTimeout(800);
await tapBtn(A, 'Online', 'Attack');
check('attack ticket -> deployment', await until(() => active(A, 'Battle'), 8000));
await A.page.waitForTimeout(800);
// Timed deployment (15 s): Ready starts an attack at once.
await tapBtn(A, 'Battle', 'Ready');
check('Ready starts the attack', await until(async () => (await phase(A)) === 'battle', 5000));
// Fight it out honestly (orders through the scene; the sim is stepped here at
// full speed instead of at the software-WebGL frame rate): the server replays this exact log.
await ev(A, () => {
  const s = window.__game.scene.getScene('Battle');
  for (const g of s.sim.groups) if (g.side === 0) s.order({ kind: 'order', group: g.id, order: 'charge' });
  for (let i = 0; i < 20 * 300 && s.sim.phase === 'battle'; i++) s.sim.step();
});
check('attack verified and applied (report)', await until(() => active(A, 'Results'), 30000));
const rep = await report(A);
check('report shows the server verdict', rep?.verified === true && rep.online === 'attack', JSON.stringify(rep));
await A.page.waitForTimeout(800);
check('report -> back to the map', await leaveReport(A));
await A.page.waitForTimeout(1000);

// ---------------------------------------------------------------- recruit through the server (also keeps A fit for the duel)
// `void`: scene.start() returns the ScenePlugin, and page.evaluate would serialize that whole
// object graph (the game, its renderer, textures) back to node: 3-9 s of a frozen page, and
// Playwright reports any protocol error on that call as 'Execution context was destroyed'.
await ev(A, () => void window.__game.scene.getScene('Online').scene.start('OnlineArmy', {}));
await until(async () => (await sceneText(A, 'OnlineArmy')).includes('RECRUIT'), 8000);
const before = await ev(A, () => window.__game.scene.getScene('OnlineArmy').profile.heroes.length);
// Wait for state, not time. The recruit sheet slides in at software-WebGL frame rates, so a
// tap a fixed 400 ms after Recruit could land before its Hire button (or on the closing sheet).
// The tap took when the scene holds the hire in its undo window (N21, 4 s of game time);
// then the hire is sent and the profile reloads.
const holdsHire = () => ev(A, () => window.__game.scene.getScene('OnlineArmy').hire !== null);
let held = false;
for (let i = 0; i < 3 && !held; i++) {
  if (!(await A.api.btn('OnlineArmy', { id: 'oarmy.hire' }))) await A.api.tapBtn('OnlineArmy', { id: 'oarmy.recruit' }, { waitMs: 5000 });
  await A.api.tapBtn('OnlineArmy', { id: 'oarmy.hire' }, { waitMs: 5000 }); // the sheet: one Hire per class
  held = await until(holdsHire, 3000);
}
check('Hire took (undo window open)', held);
// The undo window is game time: Phaser caps a frame's delta at 200 ms (fps.min 5), so at 1 fps
// on a loaded machine 4 s of game time take 20 s. Wait for the hire to be sent, then for the profile.
check('hire sent after its undo window', await until(async () => !(await holdsHire()), 90000, 500));
check('recruited a hero on the server', await until(() => ev(A, (n) => window.__game.scene.getScene('OnlineArmy').profile?.heroes.length === n + 1, before), 15000));

// ---------------------------------------------------------------- clan via invite link
// (from the army screen: stop every running scene, then open the clan page)
await ev(A, () => {
  const g = window.__game;
  for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
  g.scene.start('OnlineClan', {});
});
await until(() => active(A, 'OnlineClan'), 5000);
await until(async () => (await sceneText(A, 'OnlineClan')).includes('FOUND A CLAN'), 8000);
// The no-clan card loads its fresco after the first draw and then redraws it,
// rebuilding Found a clan (it used to also move it down by the art's height). On
// a busy machine the jpg landed between locating the button and the tap: the tap
// missed and the prompt never came. So: the fresco has loaded (or was skipped)
// and the entry fade is over, then tap, and tap once more if no prompt shows.
await until(() => ev(A, () => {
  const s = window.__game.scene.getScene('OnlineClan');
  return !s.load.isLoading() && s.ui.alpha === 1;
}), 15000);
for (let i = 0; i < 2; i++) {
  await tapBtn(A, 'OnlineClan', 'Found a clan');
  if (await until(() => ev(A, () => !!document.querySelector('#px-prompt input[name=name]')), 4000)) break;
}
await A.page.waitForSelector('#px-prompt input[name=name]', { timeout: 5000 });
await A.page.fill('#px-prompt input[name=name]', `Lambda ${ids[0] % 1000}`);
await A.page.fill('#px-prompt input[name=tag]', `L${ids[0] % 1000}`);
await A.page.click('#px-prompt button[type=submit]');
check('clan founded', await until(async () => /\bregions?\b.*\bleader\b/i.test(await sceneText(A, 'OnlineClan')), 8000));
await tapBtn(A, 'OnlineClan', 'Invite');
check('invite link made', await until(() => ev(A, () => !!window.__game.scene.getScene('OnlineClan').lastInvite), 5000));
const invite = await ev(A, () => window.__game.scene.getScene('OnlineClan').lastInvite);
check('invite is a startapp=clan_ deep link', /startapp=clan_[A-Za-z0-9]+$/.test(invite.link), invite.link);
// B opens the game through the invite link (start_param clan_<code>).
await B.page.goto(`${base}?devuser=${ids[1]}&startapp=clan_${invite.code}`);
check('invite link opens the clan screen', await until(() => active(B, 'OnlineClan'), 10000));
await until(async () => (await sceneText(B, 'OnlineClan')).includes('CLAN INVITE'), 8000);
await tapBtn(B, 'OnlineClan', 'Join', true);
check('B joined the clan', await until(async () => (await sceneText(B, 'OnlineClan')).includes('MEMBER'), 8000));
await ev(A, () => void window.__game.scene.getScene('OnlineClan').scene.restart());
await until(async () => (await sceneText(A, 'OnlineClan')).includes(`DEV${ids[1]}`), 8000);
await A.page.waitForTimeout(500);
await A.page.screenshot({ path: `${out}/24-clan.png` });
console.log('saved', `${out}/24-clan.png`);

// ---------------------------------------------------------------- live duel
for (const p of [A, B]) {
  await ev(p, () => {
    const g = window.__game;
    for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
    g.scene.start('Online', {});
  });
  // The scene object keeps `map` from the earlier visit, so wait for this visit's hub instead:
  // the map view is up and its rail (Army, Clan, Lobby...) is built.
  check(`[${p.devuser}] back on the war map`, await until(() => ev(p, () => {
    const s = window.__game.scene.getScene('Online');
    return s.sys.isActive() && s.view?.kind === 'map' && !!s.rail;
  }), 15000));
}
check('both online in the shard', await until(() => ev(A, () => (window.__shard?.players?.length ?? 0) >= 2), 8000));
await A.page.waitForTimeout(2000);
// the Lobby button at the map's right edge (the tab bar has a Duels tab too, so not by label)
await A.api.tapBtn('Online', { id: 'online.bar.duels' }, { waitMs: 5000 });
await A.page.waitForTimeout(600);
await A.api.tapBtn('Online', { label: 'Challenge' }, { waitMs: 5000 });
check('challenge delivered', await until(async () => (await sceneText(B, 'Online')).includes('CHALLENGES YOU'), 8000));
await tapBtn(B, 'Online', 'Fight');
check('both in the duel deployment', await until(async () => (await active(A, 'Battle')) && (await active(B, 'Battle')), 10000));
await until(async () => (await phase(A)) === 'deploy' && (await phase(B)) === 'deploy', 5000);
// A deploys: the server keeps the order from B until go.
await ev(A, () => {
  const s = window.__game.scene.getScene('Battle');
  const g = s.sim.groups.find((x) => x.side === s.me && !x.individual);
  s.order({ kind: 'preset', group: g.id, type: 'wedge' });
});
const sides = (p) => ev(p, () => window.__game.scene.getScene('Battle').sim.orderLog.map((o) => o.side));
check('own deployment order applied', await until(async () => (await sides(A)).includes(0), 5000));
await B.page.waitForTimeout(1000);
check("opponent's deployment withheld until go", !(await sides(B)).includes(0), JSON.stringify(await sides(B)));
// A is ready; B lets its 15 s countdown run out (B's client then sends ready itself).
await tapBtn(A, 'Battle', 'Ready');
check('duel started on both (countdown -> lockstep go)', await until(async () => (await phase(A)) === 'battle' && (await phase(B)) === 'battle', 90000, 500));
check("opponent's deployment revealed at go", (await sides(B)).includes(0), JSON.stringify(await sides(B)));
await ev(A, () => {
  const s = window.__game.scene.getScene('Battle');
  for (const g of s.sim.groups) if (g.side === s.me) s.order({ kind: 'order', group: g.id, order: 'advance' });
});
await ev(B, () => {
  const s = window.__game.scene.getScene('Battle');
  for (const g of s.sim.groups) if (g.side === s.me) s.order({ kind: 'order', group: g.id, order: 'charge' });
});
const ticks = () => Promise.all([A, B].map((p) => ev(p, () => window.__game.scene.getScene('Battle').sim.tick)));
// Ticks advance with frames; at ~1 fps on a loaded machine 40 ticks can take more than 30 s.
await until(async () => (await ticks()).every((t) => t > 40), 90000, 500);
const tk = await ticks();
check('both clients advance in lockstep', tk[0] > 40 && tk[1] > 40 && Math.abs(tk[0] - tk[1]) <= 12, tk.join(' / '));
await B.page.screenshot({ path: `${out}/25-duel.png` });
console.log('saved', `${out}/25-duel.png`);
// B sounds the retreat: the duel ends on both clients at the same tick, then the server's verdict.
await ev(B, () => window.__game.scene.getScene('Battle').order({ kind: 'retreat' }));
check('duel over on both (reports)', await until(async () => (await active(A, 'Results')) && (await active(B, 'Results')), 90000, 500));
const ra = await report(A);
const rb = await report(B);
check('A won, server verified', ra?.result === 'victory' && ra.verified === true && ra.online === 'duel', JSON.stringify(ra));
check('B lost, server verified', !!rb && rb.result !== 'victory' && rb.verified === true && rb.online === 'duel', JSON.stringify(rb));
for (const p of [A, B]) check(`[${p.devuser}] report -> back to the map`, await leaveReport(p));

for (const p of [A, B]) check(`[${p.devuser}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
await finish({ browser });
