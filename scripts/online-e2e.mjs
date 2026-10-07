// End-to-end test of the online mode against a real local backend: two fake
// players (DEV_AUTH) in two browser contexts join the season, one attacks a
// hex (server-verified), they form a clan through an invite link, and fight a
// live lockstep duel. Saves docs/screenshots/23-online-map.png, 24-clan.png
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
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
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
const sceneText = (p, k) =>
  ev(p, (key) => {
    const outT = [];
    const walk = (list) => list.forEach((o) => (o.text !== undefined && outT.push(o.text), o.list && walk(o.list)));
    walk(window.__game.scene.getScene(key).children.list);
    return outT.join(' ');
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
await tapBtn(A, 'Battle', 'Fight');
await A.page.waitForTimeout(500);
// Fight it out honestly (orders through the scene, the sim runs fast): the server replays this exact log.
await ev(A, () => {
  const s = window.__game.scene.getScene('Battle');
  for (const g of s.sim.groups) if (g.side === 0) s.order({ kind: 'order', group: g.id, order: 'charge' });
  for (let i = 0; i < 20 * 300 && s.sim.phase === 'battle'; i++) s.sim.step();
});
check('attack verified and applied', await until(() => active(A, 'Online'), 15000));
await A.page.waitForTimeout(1500);
const verdict = await sceneText(A, 'Online');
check('result shows the server verdict', /VERIFIED BY THE SERVER/.test(verdict), verdict.slice(0, 120));

// ---------------------------------------------------------------- recruit through the server (also keeps A fit for the duel)
await ev(A, () => window.__game.scene.getScene('Online').scene.start('OnlineArmy', {}));
await until(async () => (await sceneText(A, 'OnlineArmy')).includes('RECRUIT'), 8000);
const before = await ev(A, () => window.__game.scene.getScene('OnlineArmy').profile.heroes.length);
await tapBtn(A, 'OnlineArmy', 'Recruit');
await A.page.waitForTimeout(400);
await tapBtn(A, 'OnlineArmy', 'hoplite');
check('recruited a hoplite on the server', await until(() => ev(A, (n) => window.__game.scene.getScene('OnlineArmy').profile?.heroes.length === n + 1, before), 8000));

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
await tapBtn(A, 'Online', 'Duel');
await A.page.waitForTimeout(600);
await tapBtn(A, 'Online', 'Challenge');
check('challenge delivered', await until(async () => (await sceneText(B, 'Online')).includes('CHALLENGES YOU'), 8000));
await tapBtn(B, 'Online', 'Fight');
check('both in the duel deployment', await until(async () => (await active(A, 'Battle')) && (await active(B, 'Battle')), 10000));
await A.page.waitForTimeout(1000);
await tapBtn(A, 'Battle', 'Fight');
await tapBtn(B, 'Battle', 'Fight');
check('duel started on both (lockstep go)', await until(async () => (await ev(A, () => window.__game.scene.getScene('Battle').sim.phase)) === 'battle' && (await ev(B, () => window.__game.scene.getScene('Battle').sim.phase)) === 'battle', 8000));
await ev(A, () => {
  const s = window.__game.scene.getScene('Battle');
  for (const g of s.sim.groups) if (g.side === s.me) s.order({ kind: 'order', group: g.id, order: 'advance' });
});
await ev(B, () => {
  const s = window.__game.scene.getScene('Battle');
  for (const g of s.sim.groups) if (g.side === s.me) s.order({ kind: 'order', group: g.id, order: 'charge' });
});
await A.page.waitForTimeout(5000);
const ticks = await Promise.all([A, B].map((p) => ev(p, () => window.__game.scene.getScene('Battle').sim.tick)));
check('both clients advance in lockstep', ticks[0] > 40 && Math.abs(ticks[0] - ticks[1]) <= 12, ticks.join(' / '));
await B.page.screenshot({ path: `${out}/25-duel.png` });
console.log('saved', `${out}/25-duel.png`);
// B sounds the retreat: the duel ends on both clients at the same tick.
await ev(B, () => window.__game.scene.getScene('Battle').order({ kind: 'retreat' }));
check('duel over on both', await until(async () => (await active(A, 'Online')) && (await active(B, 'Online')), 20000));
await A.page.waitForTimeout(1000);
const ta = await sceneText(A, 'Online');
const tb = await sceneText(B, 'Online');
check('A won, server verified', /DUEL WON/.test(ta) && /VERIFIED BY THE SERVER/.test(ta), ta.slice(0, 100));
check('B lost, server verified', /DUEL LOST/.test(tb) && /VERIFIED BY THE SERVER/.test(tb), tb.slice(0, 100));

for (const p of [A, B]) check(`[${p.devuser}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
