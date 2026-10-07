// End-to-end test of the online mode against a real local backend: two fake
// players (DEV_AUTH) in two browser contexts join the season, one attacks a
// hex (server-verified, with the 15 s timed deployment and the battle report),
// they form a clan through an invite link, and fight a live lockstep duel
// (deployment orders withheld from the opponent until go, one side readied by
// its countdown). Saves docs/screenshots/23-online-map.png, 24-clan.png
// and 25-duel.png.
//
// Needs: `npm run dev` in server/ (wrangler dev on :8787 with DEV_AUTH=1 in
// .dev.vars and migrations applied) and `VITE_DEV_AUTH=1 npx vite` (proxying
// /api and /ws to :8787). Usage: node scripts/online-e2e.mjs [viteUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const ids = [Math.floor(Date.now() / 1000) % 100000 + 200000, Math.floor(Date.now() / 1000) % 100000 + 300000];

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();

async function player(devuser, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => (window.__noFirstRun = true)); // no onboarding here (scripts/tutorial-smoke.mjs covers it)
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
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
  const cdp = await ctx.newCDPSession(page);
  const p = { page, ctx, cdp, errors, devuser };
  await page.goto(`${base}?devuser=${devuser}${extra}`);
  await page.waitForTimeout(2500);
  return p;
}

const ev = (p, fn, arg) => p.page.evaluate(fn, arg);
const active = (p, k) => ev(p, (key) => window.__game.scene.isActive(key), k);
async function until(fn, ms = 15000, step = 200) {
  for (let t = 0; t < ms; t += step) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}
/**
 * A tap on the canvas, dispatched inside the page: touchstart now, touchend one
 * animation frame later. Two players in software WebGL run at ~5 fps; touches
 * sent from outside (CDP) then arrive several frames apart and read as a
 * long-press (450 ms of game time), or both in one frame.
 */
async function tap(p, x, y) {
  await ev(
    p,
    ([tx, ty]) =>
      new Promise((done) => {
        const c = window.__game.canvas;
        const touch = new Touch({ identifier: 7, target: c, clientX: tx, clientY: ty, pageX: tx, pageY: ty, screenX: tx, screenY: ty });
        const fire = (type) =>
          c.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
        fire('touchstart');
        requestAnimationFrame(() => {
          fire('touchend');
          requestAnimationFrame(() => done(true));
        });
      }),
    [x, y],
  );
  await p.page.waitForTimeout(250);
}
/** Taps the first visible Button in a scene whose label starts with `label`. */
async function tapBtn(p, sceneKey, label, last = false) {
  const pos = await ev(p, ([k, m, l]) => {
    const s = window.__game.scene.getScene(k);
    const found = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.opts && o.visible && o.opts.label && o.opts.label.toUpperCase().startsWith(m.toUpperCase())) found.push(o);
        if (o.list) walk(o.list);
      }
    };
    walk(s.children.list);
    const b = l ? found[found.length - 1] : found[0];
    if (!b) return null;
    const r = b.getBounds();
    return [r.centerX, r.centerY];
  }, [sceneKey, label, last]);
  if (!pos) {
    const labels = await ev(p, (k) => {
      const o2 = [];
      const walk = (list) => list.forEach((o) => (o.opts && o2.push(`${o.opts.label}:${o.visible}`), o.list && walk(o.list)));
      walk(window.__game.scene.getScene(k).children.list);
      return o2.join(', ');
    }, sceneKey);
    console.log(`  (no button "${label}" in ${sceneKey}: ${labels})`);
    return false;
  }
  await tap(p, pos[0], pos[1]);
  return true;
}
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
      return [r.centerX, r.centerY];
    });
    if (pos) await tap(p, pos[0], pos[1]);
    if (await until(() => active(p, 'Online'), 4000)) return true;
  }
  return false;
}
const sceneText = (p, k) =>
  ev(p, (key) => {
    const outT = [];
    const walk = (list) => list.forEach((o) => (o.text !== undefined && outT.push(o.text), o.list && walk(o.list)));
    walk(window.__game.scene.getScene(key).children.list);
    return outT.join(' ').toUpperCase();
  }, k);

// ---------------------------------------------------------------- join
const A = await player(ids[0]);
const B = await player(ids[1]);
for (const p of [A, B]) {
  check(`[${p.devuser}] menu`, await active(p, 'Menu'));
  await tapBtn(p, 'Menu', 'Online');
  check(`[${p.devuser}] online scene`, await until(() => active(p, 'Online'), 5000));
  await until(async () => (await sceneText(p, 'Online')).includes('JOIN'), 8000);
  await tapBtn(p, 'Online', 'Join');
  check(`[${p.devuser}] joined the season, map shown`, await until(() => ev(p, () => !!window.__game.scene.getScene('Online').map), 10000));
}
const prof = await ev(A, () => window.__game.scene.getScene('Online').profile);
check('server-owned starting army', prof.heroes.length === 5 && prof.resources.gold > 0, `${prof.heroes.length} heroes, ${prof.resources.gold} gold`);

// ---------------------------------------------------------------- attack a neighbouring hex
const target = await ev(A, () => {
  const s = window.__game.scene.getScene('Online');
  const a = s.profile.army;
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const [dq, dr] of dirs) {
    const h = s.map.hexes.find((x) => x.q === a.q + dq && x.r === a.r + dr);
    if (h && h.occupant === 'npc' && h.owner === null) return { q: h.q, r: h.r };
  }
  return null;
});
check('a neutral hex next to home', !!target);
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
await ev(A, () => window.__game.scene.getScene('Online').scene.start('OnlineArmy', {}));
await until(async () => (await sceneText(A, 'OnlineArmy')).includes('RECRUIT'), 8000);
const before = await ev(A, () => window.__game.scene.getScene('OnlineArmy').profile.heroes.length);
await tapBtn(A, 'OnlineArmy', 'Recruit');
await A.page.waitForTimeout(400);
await tapBtn(A, 'OnlineArmy', 'Hire'); // the recruit sheet: one Hire button per class
check('recruited a hero on the server', await until(() => ev(A, (n) => window.__game.scene.getScene('OnlineArmy').profile?.heroes.length === n + 1, before), 8000));

// ---------------------------------------------------------------- clan via invite link
await ev(A, () => window.__game.scene.getScene('Online').scene.start('OnlineClan', {}));
await until(() => active(A, 'OnlineClan'), 5000);
await until(async () => (await sceneText(A, 'OnlineClan')).includes('FOUND A CLAN'), 8000);
await tapBtn(A, 'OnlineClan', 'Found a clan');
await A.page.waitForSelector('#px-prompt input[name=name]');
await A.page.fill('#px-prompt input[name=name]', `Lambda ${ids[0] % 1000}`);
await A.page.fill('#px-prompt input[name=tag]', `L${ids[0] % 1000}`);
await A.page.click('#px-prompt button[type=submit]');
check('clan founded', await until(async () => (await sceneText(A, 'OnlineClan')).includes('HEXES - LEADER'), 8000));
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
await ev(A, () => window.__game.scene.getScene('OnlineClan').scene.restart());
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
  await until(() => ev(p, () => !!window.__game.scene.getScene('Online').map), 10000);
}
check('both online in the shard', await until(() => ev(A, () => (window.__shard?.players?.length ?? 0) >= 2), 8000));
await A.page.waitForTimeout(2000);
await tapBtn(A, 'Online', 'Duels');
await A.page.waitForTimeout(600);
await tapBtn(A, 'Online', 'Challenge');
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
check('duel started on both (countdown -> lockstep go)', await until(async () => (await phase(A)) === 'battle' && (await phase(B)) === 'battle', 30000));
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
await until(async () => (await ticks()).every((t) => t > 40), 30000, 500);
const tk = await ticks();
check('both clients advance in lockstep', tk[0] > 40 && tk[1] > 40 && Math.abs(tk[0] - tk[1]) <= 12, tk.join(' / '));
await B.page.screenshot({ path: `${out}/25-duel.png` });
console.log('saved', `${out}/25-duel.png`);
// B sounds the retreat: the duel ends on both clients at the same tick, then the server's verdict.
await ev(B, () => window.__game.scene.getScene('Battle').order({ kind: 'retreat' }));
check('duel over on both (reports)', await until(async () => (await active(A, 'Results')) && (await active(B, 'Results')), 40000, 500));
const ra = await report(A);
const rb = await report(B);
check('A won, server verified', ra?.result === 'victory' && ra.verified === true && ra.online === 'duel', JSON.stringify(ra));
check('B lost, server verified', !!rb && rb.result !== 'victory' && rb.verified === true && rb.online === 'duel', JSON.stringify(rb));
for (const p of [A, B]) check(`[${p.devuser}] report -> back to the map`, await leaveReport(p));

for (const p of [A, B]) check(`[${p.devuser}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
