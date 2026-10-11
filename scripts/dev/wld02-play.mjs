// WLD-02 play-through with real touch taps (dev tool, not a gate): the campaign arc on the world map.
// Open a lair, assault and win, see the burnt lair and "Lairs 1/6"; fell the rest and see the host muster
// and march; fight it; reach the post-game with reborn lairs. Staging (teleports, a worn-out enemy) only
// sets the scene: every sheet, chip and button is tapped as a player would.
// Usage: node scripts/dev/wld02-play.mjs <baseUrl> <lang> <width>x<height> [outDir]
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from '../lib/harness.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4877/';
const lang = process.argv[3] ?? 'en';
const [W, H] = (process.argv[4] ?? '390x844').split('x').map(Number);
const out = process.argv[5] ?? 'shots/wld02';
mkdirSync(out, { recursive: true });
const tag = `${lang}-${W}x${H}`;

const browser = await launch();
const ctx = await phoneContext(browser, { viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errors = captureErrors(page);
const { ev, wait, tap, active, until, btn, tapBtn, call } = makePageApi(page, { tapWait: 200, btnIndex: -1, btnWaitMs: 15000 });
const shot = (name) => page.screenshot({ path: `${out}/${name}-${tag}.jpg`, type: 'jpeg', quality: 70 });
async function need(name, ok, detail = '') {
  check(name, ok, detail);
  if (!ok) await finish({ browser });
}

await page.goto(`${base}?lang=${lang}`);
await ev(() => localStorage.clear());
await page.goto(`${base}?lang=${lang}`);
await need('menu', await until(() => ev(() => !!window.__game?.scene.isActive('Menu')), 60000));
await until(() => ev(() => window.__game.scene.getScene('Menu').ui.alpha === 1), 15000, 100);
// answer any event card with its free choice (the deck is covered elsewhere)
await ev(() => setInterval(() => {
  for (const k of ['World', 'Settlement']) {
    const c = window.__game.scene.isActive(k) && window.__game.scene.getScene(k).eventCard;
    if (c && !c.choose(c.freeKey)) c.close();
  }
}, 250));

// a strong company so the walk-through is about the UI, not the dice
await ev(() => {
  const c = window.__state.campaign;
  for (const h of c.data.heroes) h.level = 6;
  c.data.gold = 900;
});
await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('World', {})));
await need('world', await until(() => active('World'), 20000));
await wait(1200);

/** Page point of world tile (x, y) through the World camera. */
const tileCss = (x, y) => call('World', `const cam = s.cameras.main; const gx = ((${x} * 8 - cam.worldView.x) * cam.zoom); const gy = ((${y} * 8 - cam.worldView.y) * cam.zoom); return window.__css(gx, gy);`);
/** Stand the army next to lair or host and centre the camera there. */
const standAt = (x, y) => ev(([x, y]) => {
  const s = window.__game.scene.getScene('World');
  const w = window.__state.campaign.world;
  const t = w.nearestPassable(Math.floor(x), Math.floor(y), 4);
  w.stop();
  w.s.x = t.x + 0.5;
  w.s.y = t.y + 0.5;
  w.reveal(w.s.x, w.s.y, 6);
  // the bands near the lair stand idle: the walk-through is about the lair
  for (const p of w.s.parties) if (p.kind !== 'host') p.idle = 48;
  w.s.safeUntil = w.s.time + 6;
  s.cameras.main.centerOn(w.s.x * 8, w.s.y * 8);
  return t;
}, [x, y]);
/** Win the running battle (the enemy worn out, ours unbreakable) and take the spoils back to the map. */
async function winBattle(label) {
  await need(`${label}: deployment`, await until(() => active('Battle'), 30000));
  await wait(1500);
  await tapBtn('Battle', { id: 'battle.fight' });
  await need(`${label}: battle started`, await until(async () => (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle', 20000, 100));
  const ff = await ev(() => {
    const s = window.__game.scene.getScene('Battle');
    s.sim.units.filter((u) => u.side === 1).forEach((u) => { u.hp = 1; u.morale = Math.min(u.morale, u.stats.morale * 0.3); });
    for (const g of s.sim.groups) if (g.side === 0 && !g.disbanded) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' });
    const mine = s.sim.units.filter((u) => u.side === 0 && u.state === 'ready');
    for (let i = 0; i < 20 * 400 && s.sim.phase === 'battle'; i++) {
      for (const u of mine) if (u.state === 'ready') { u.hp = Math.max(u.hp, u.stats.maxHp); u.morale = u.stats.morale; }
      s.sim.step();
    }
    return { winner: s.sim.winner, tick: s.sim.tick };
  });
  await need(`${label}: results`, await until(() => active('Results'), 60000), JSON.stringify(ff));
  await until(() => ev(() => !!window.__game.scene.getScene('Results').report), 20000);
  await wait(800);
  await shot(`${label}-results`);
  if (await btn('Results', { icon: 'chest' })) {
    await tapBtn('Results', { icon: 'chest' });
    await wait(2500);
  }
  await tapBtn('Results', { icon: 'check' });
  await need(`${label}: back on the map`, await until(() => active('World'), 30000));
  await wait(1500);
}

// ---- the arc chip states the goal
const chip0 = await call('World', 'return s.arcChip?.opts?.label ?? null;');
check('arc chip reads Lairs 0/6', /0\/6/.test(chip0 ?? ''), chip0);
await call('World', 's.startCoach(0); return 1;');
await wait(500);
await shot('01-coach-goal');
await tapBtn('World', { id: 'coach.next' });
await tapBtn('World', { id: 'coach.next' });
await tapBtn('World', { id: 'coach.next' });
check('coach marks run and close', await until(() => call('World', 'return s.coachStep === null;'), 3000));

// ---- open a lair by tapping it
const lair = await ev(() => {
  const w = window.__state.campaign.world;
  const sx = w.map.settlements[w.map.start];
  const l = w.map.settlements.filter((s) => s.kind === 'lair').sort((a, b) => Math.hypot(a.x - sx.x, a.y - sx.y) - Math.hypot(b.x - sx.x, b.y - sx.y))[0];
  return { id: l.id, x: l.x, y: l.y, name: l.name };
});
await standAt(lair.x, lair.y + 2);
await wait(2000);
await call('World', 's.refreshLairs(); return 1;');
await shot('02-lair-plate');
const siteCss = (id) => call('World', `const st = s.w.map.settlements[${id}]; const site = s.siteOf(${id}); const wx = site ? site.lx : st.x * 8 + 4; const wy = site ? site.ly + 19 : st.y * 8 + 26; const cam = s.cameras.main; return window.__css((wx - cam.worldView.x) * cam.zoom, (wy - cam.worldView.y) * cam.zoom);`);
let p = await siteCss(lair.id);
await tap(p[0], p[1]);
const opened = await until(() => call('World', 'return !!s.assaultSheet;'), 4000);
await need('tapping a lair opens the Assault sheet', opened);
await wait(400);
await shot('03-assault-sheet');
check('in reach: the primary is Assault', (await call('World', 'return s.assaultSheet.primary;')) === 'assault');
await tapBtn('World', { id: 'assault.doctrine.info' });
await wait(400);
await shot('04-assault-doctrine');
await call('World', 's.assaultSheet.back(); return 1;');
await wait(300);
await tapBtn('World', { id: 'assault.assault' });
await winBattle('05-lair');
const after = await ev((id) => ({ fallen: window.__state.campaign.world.lairFallen(id), n: window.__state.campaign.world.lairsFallen }), lair.id);
check('the lair is burnt', after.fallen && after.n === 1, JSON.stringify(after));
const chip1 = await call('World', 'return s.arcChip?.opts?.label ?? null;');
check('arc chip reads Lairs 1/6', /1\/6/.test(chip1 ?? ''), chip1);
await standAt(lair.x, lair.y + 2);
await call('World', 's.refreshLairs(); return 1;');
await wait(600);
await shot('06-burnt-lair');

// ---- the Arc sheet from the chip
await tapBtn('World', { id: 'world.arc' });
await need('the chip opens the Arc sheet', await until(() => call('World', 'return !!s.arcSheet;'), 4000));
await wait(400);
await shot('07-arc-lairs');
await tapBtn('World', { id: 'arc.tabs.journal' });
await wait(300);
await shot('08-arc-journal');
check('journal tab', (await call('World', 'return s.arcSheet.current;')) === 'journal');
await tapBtn('World', { id: 'arc.tabs.lairs' });
await wait(200);
await tapBtn('World', { id: `arc.lair.${lair.id}` });
check('a lair row centres the map and closes the sheet', await until(() => call('World', 'return !s.arcSheet && !s.follow;'), 4000));

// ---- the other five fall: the host musters and marches
await ev(() => {
  const c = window.__state.campaign;
  for (const st of c.world.map.settlements) if (st.kind === 'lair' && !c.world.lairFallen(st.id)) c.data.stash.push(...c.razeLair(st.id));
});
await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('World', {})));
await until(() => active('World'), 20000);
await wait(1200);
const arc = await ev(() => ({ stage: window.__state.campaign.world.s.arc.stage, host: !!window.__state.campaign.world.host }));
check('six lairs down: the host musters', arc.stage === 'host' && arc.host, JSON.stringify(arc));
const chip2 = await call('World', 'return s.arcChip?.opts?.label ?? null;');
check('arc chip reads the host stage', !!chip2 && !/\//.test(chip2), chip2);
await call('World', 's.focusOn(-1); return 1;');
await wait(900);
await shot('09-host-march');
await tapBtn('World', { id: 'world.arc' });
await wait(500);
await shot('10-arc-host');
await call('World', 's.arcSheet.close(); return 1;');
await wait(300);

// ---- fight the host: stand by it, tap it, attack
const host = await ev(() => { const h = window.__state.campaign.world.host; return { id: h.id, x: h.x, y: h.y }; });
await ev((h) => {
  const w = window.__state.campaign.world;
  const hp = w.party(h.id);
  const t = w.nearestPassable(Math.floor(hp.x) + 1, Math.floor(hp.y), 3);
  w.stop();
  w.s.x = t.x + 0.5;
  w.s.y = t.y + 0.5;
  w.s.safeUntil = 0;
  hp.idle = 0;
  window.__game.scene.getScene('World').cameras.main.centerOn(w.s.x * 8, w.s.y * 8);
}, host);
await wait(600);
const hp = await ev((id) => { const h = window.__state.campaign.world.party(id); return { x: h.x, y: h.y }; }, host.id);
p = await tileCss(hp.x, hp.y - 0.5);
await tap(p[0], p[1]);
await need('the host engages (encounter sheet)', await until(() => call('World', 'return !!s.dialog;'), 30000));
await wait(400);
await shot('11-host-encounter');
await tapBtn('World', { id: 'encounter.attack' });
await winBattle('12-host');
const won = await ev(() => window.__state.campaign.world.s.arc.stage);
check('the host is beaten: post-game', won === 'won' || won === 'post', won);
const chip3 = await call('World', 'return s.arcChip?.opts?.label ?? null;');
check('arc chip reads the win', !!chip3 && !/\//.test(chip3), chip3);

// ---- ten days on: reborn lairs rise
await ev(() => {
  const w = window.__state.campaign.world;
  const info = window.__state.campaign.playerInfo();
  w.clearPendingEvent();
  w.s.time += 11 * 24;
  w.s.safeUntil = w.s.time + 2;
  w.advance(0.1, info, true);
});
await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('World', {})));
await until(() => active('World'), 20000);
await wait(1200);
const reborn = await ev(() => { const w = window.__state.campaign.world; return w.map.settlements.filter((s) => s.kind === 'lair' && w.isReborn(s.id) && !w.lairFallen(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y })); });
check('two reborn lairs stand', reborn.length === 2, JSON.stringify(reborn));
if (reborn[0]) {
  await standAt(reborn[0].x, reborn[0].y + 2);
  await call('World', 's.refreshLairs(); return 1;');
  await wait(700);
  await shot('13-reborn-lair');
  await call('World', `s.openAssault(${reborn[0].id}); return 1;`);
  await wait(500);
  await shot('14-reborn-assault');
  await call('World', 's.assaultSheet.back(); return 1;');
  await wait(300);
}
await tapBtn('World', { id: 'world.arc' });
await wait(500);
await shot('15-arc-post');

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish({ browser });
