// Regression: one battle of each kind (QA-02; production/qa/qa-plan-v5.md §5.3 battle-kinds).
// For each kind, through the real battle scene, in fake Telegram with the API down:
//   - it opens on its own data (PLAY B1/B2: a battle never replays the last one's data);
//   - pace (src/ui/input/pace.ts, controls.md R10, A11Y-17/18): campaign, tutorial and
//     practice pause and offer 0.5x-3x; the duel ladder pauses at 0.5x-2x; live duels,
//     raids and war attacks never pause (no Pause key, the menu does not pause them);
//   - the ⋯ battle menu (BTL-01) opens on a tap in every kind with that kind's items, and
//     Back closes it (a fight it paused runs on);
//   - the battle is won and its Results go back to the screen it came from (N1, N8).
// Regression classes from this run: the ⋯ menu handle kept from a battle that ended with
// the menu open (7d3e260; the raid ends with its menu up, the next battle must open its own),
// a replayed last-battle setup (B1/B2), Back from a duel report leaving the hub.
// Usage: node scripts/regression/battle-kinds.mjs [baseUrl]   (needs a running preview server)
import { launch, check, until, baseUrl, openGame, settled, running, pressBack, startScene, tapId, need, flow, done } from './lib.mjs';

const base = baseUrl();
const browser = await launch();
const t0 = Date.now();
const { errors, api, ok } = await openGame(browser, base);
check('boot: the Campaign hub settles', ok);

const B = (body) => api.call('Battle', body);
/** The battle in front: its kind as the scene sees it. */
const battleInfo = () =>
  B("return { phase: s.sim?.phase, pace: s.pace, locked: s.realtimeLocked, paused: s.paused, tutorial: !!s.tutorial, online: !!s.src, menu: s.menu && !s.menu.closed ? [...s.menu.items] : null };");

/** The Battle scene is up with a sim (the deployment drawn). */
const battleUp = () => until(async () => (await settled(api, 'Battle', 1000)) && !!(await B('return !!s.sim && !!s.hud;')), 30000, 200);

/** Deployment -> fight through the Fight (offline) or Ready (online) key. */
async function toFight(name, online) {
  need(`${name}: ${online ? 'Ready' : 'Fight'} tapped`, await tapId(api, 'Battle', online ? 'battle.ready' : 'battle.fight'));
  need(`${name}: the fight starts`, await until(async () => (await battleInfo()).phase === 'battle', 20000, 200), JSON.stringify(await battleInfo()));
}

/** Pace: the Pause key and what it does (A11Y-17); the ⋯ menu's items and whether it pauses (A11Y-18). */
async function paceAndMenu(name, { pace, items, pauses }) {
  const info = await battleInfo();
  check(`${name}: pace ${pace}`, info.pace === pace && info.locked === (pace === 'locked'), JSON.stringify(info));
  const pauseKey = !!(await api.btn('Battle', { id: 'battle.pause' }));
  check(`${name}: ${pace === 'locked' ? 'no' : 'a'} Pause key`, pauseKey === (pace !== 'locked'));
  if (pauseKey) {
    await tapId(api, 'Battle', 'battle.pause');
    check(`${name}: Pause pauses`, await until(async () => (await battleInfo()).paused, 5000, 150));
    await tapId(api, 'Battle', 'battle.play');
    check(`${name}: Play runs on`, await until(async () => !(await battleInfo()).paused, 5000, 150));
  }
  need(`${name}: ⋯ tapped`, await tapId(api, 'Battle', 'battle.menu'));
  need(`${name}: the ⋯ menu opens`, await until(async () => !!(await battleInfo()).menu, 8000, 150), JSON.stringify(await battleInfo()));
  const open = await battleInfo();
  check(`${name}: menu items ${items.join(', ')}`, open.menu.join(',') === items.join(','), JSON.stringify(open.menu));
  check(`${name}: the menu ${pauses ? 'pauses' : 'does not pause'} the fight`, open.paused === pauses, JSON.stringify(open));
}

/** Back closes the menu; a fight it paused runs on. */
async function closeMenu(name) {
  await pressBack(api);
  check(`${name}: Back closes the menu, the fight runs on`, await until(async () => { const i = await battleInfo(); return !i.menu && !i.paused; }, 5000, 150), JSON.stringify(await battleInfo()));
}

/** Win at once: charge, the foe at 1 hp, the sim stepped to the end (as scripts/duel-smoke.mjs does). */
const win = () =>
  B("for (const g of s.sim.groups) if (g.side === s.me) s.sim.issue(s.me, { kind: 'order', group: g.id, order: 'charge' }); s.sim.units.filter((u) => u.side !== s.me && u.state === 'ready').forEach((u) => { u.hp = Math.min(u.hp, 1); }); for (let i = 0; i < 20 * 400 && s.sim.phase === 'battle'; i++) s.sim.step(); return s.sim.phase;");

/** The report is up; its bottom button (Spoils first when unseen, then Onward / Continue) is tapped until `origin` is in front. */
async function leaveReport(name, origin, state) {
  need(`${name}: the report`, await until(() => api.ev(() => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report), 30000, 200));
  for (let i = 0; i < 4 && !(await settled(api, origin, 500)); i++) {
    await settled(api, 'Results', 8000);
    const pos = await api.ev(() => {
      const s = window.__game.scene.getScene('Results');
      const b = s.sys.isActive() && s.primary;
      if (!b?.visible) return null;
      const r = b.getBounds();
      return window.__css(r.centerX, r.centerY);
    });
    if (pos) await api.tap(pos[0], pos[1]);
    await until(async () => (await settled(api, origin, 500)) || !(await api.active('Results')), 6000, 200);
  }
  const back = (await settled(api, origin)) && (await running(api)).join('+') === origin && (!state || (await until(() => api.call(origin, state), 8000, 150)));
  check(`${name}: Results -> ${origin}`, back, JSON.stringify(await running(api)));
}

// The event deck can raise a card on the map after a battle: answer it (scripts/smoke.mjs does the same).
await api.ev(() =>
  setInterval(() => {
    for (const k of ['World', 'Settlement', 'Camp']) {
      const c = window.__game.scene.isActive(k) && window.__game.scene.getScene(k).eventCard;
      if (c && !c.choose(c.freeKey)) c.close();
    }
  }, 200),
);

const OFFLINE = { pace: 'offline', items: ['retreat', 'sound', 'settings'], pauses: true };
const LOCKED = { pace: 'locked', items: ['retreat', 'sound'], pauses: false };

// ---------------------------------------------------------------- campaign: a band on the map
await flow('campaign', async () => {
  const n = '[campaign]';
  need(`${n} Begin the march`, await tapId(api, 'Menu', 'menu.new'));
  need(`${n} World settles`, await settled(api, 'World', 30000));
  const band = await api.call('World', 'const w = s.w; w.stop(); w.s.safeUntil = 1e9; const p = w.s.parties[0]; for (const q of w.s.parties) q.idle = 1e9; s.openEncounter(p.id, true); return p.id;');
  need(`${n} the encounter sheet`, await until(() => api.call('World', 'return !!s.dialog;'), 10000, 150));
  need(`${n} Attack tapped`, await api.tapBtn('World', { label: 'Attack' }));
  need(`${n} the deployment`, await battleUp());
  check(`${n} the battle is against that band (B1)`, (await api.ev(() => window.__state.pending?.partyId)) === band);
  await toFight(n, false);
  await paceAndMenu(n, OFFLINE);
  await closeMenu(n);
  check(`${n} won`, (await win()) === 'ended');
  await leaveReport(n, 'World');
});

// ---------------------------------------------------------------- practice: the Trial fight from the Codex
await flow('practice', async () => {
  const n = '[practice]';
  await startScene(api, 'Codex', {});
  need(`${n} Codex settles`, await settled(api, 'Codex'));
  await api.call('Codex', "s.fight('cyclops'); return 1;");
  need(`${n} the deployment`, await battleUp());
  check(`${n} a Practice battle, not the last one replayed (B1)`, !!(await api.ev(() => window.__state.pending?.practice)), JSON.stringify(await api.ev(() => window.__state.pending)));
  await toFight(n, false);
  await paceAndMenu(n, OFFLINE);
  await closeMenu(n);
  check(`${n} won`, (await win()) === 'ended');
  await leaveReport(n, 'Codex');
});

// ---------------------------------------------------------------- tutorial: replayed from Settings on the Campaign hub
await flow('tutorial', async () => {
  const n = '[tutorial]';
  await startScene(api, 'Menu', {});
  need(`${n} Menu settles`, await settled(api, 'Menu'));
  await api.call('Menu', 's.openSettings(); return 1;');
  // the Account section (with Replay tutorial) is below the fold: scroll the list with a finger until it shows
  for (let i = 0; i < 6 && !(await api.btn('Menu', { id: 'settings.tutorial' })); i++) await api.swipe([[195, 640], [195, 260]], { steps: 10, after: 400 });
  need(`${n} Settings > Replay tutorial tapped`, await tapId(api, 'Menu', 'settings.tutorial'));
  need(`${n} the guided battle`, await battleUp());
  need(`${n} the narrator talks`, await until(() => B('return !!s.tutorial?.talking;'), 15000, 150));
  const info = await battleInfo();
  check(`${n} pace offline, a tutorial`, info.pace === 'offline' && info.tutorial, JSON.stringify(info));
  // the spotlight blocks taps outside the lit control by design (src/ui/tutorial/spotlight.ts), ⋯ included:
  // the menu is opened as its key would, then Back (the player's way out) asks to skip
  await B('s.openMenu(); return 1;');
  need(`${n} the ⋯ menu opens`, await until(async () => !!(await battleInfo()).menu, 8000, 150));
  check(`${n} menu items skip, sound, settings`, (await battleInfo()).menu.join(',') === 'skip,sound,settings', JSON.stringify(await battleInfo()));
  await pressBack(api);
  need(`${n} Back closes the menu`, await until(async () => !(await battleInfo()).menu, 5000, 150));
  await pressBack(api);
  need(`${n} Back asks to skip; Skip tapped`, await api.tapBtn('Battle', { label: 'Skip', index: -1 }));
  // screen-flow §3 S09: a replay from Settings returns to the screen Settings was opened from
  const to = await until(async () => !(await api.active('Battle')), 15000, 200);
  const where = await running(api);
  check(`${n} skipping a replay leaves the battle`, to, JSON.stringify(where));
  // QA02-B1 (fixed): skip used to open FirstRun whatever started the tutorial
  check(`${n} a replay skipped from the Campaign hub returns there (screen-flow S09)`, where.join('+') === 'Menu', JSON.stringify(where));
});

// ---------------------------------------------------------------- duels: ladder floor, ranked match, raid (the in-memory demo army)
const DUEL_READY = "return s.st === 'ready' && !!s.profile && Date.now() - s.openedAt >= 600;";
async function duelHub(n, data) {
  await startScene(api, 'Duel', { preview: true, ...data });
  need(`${n} Duels hub settles`, (await settled(api, 'Duel')) && (await until(() => api.call('Duel', DUEL_READY), 15000, 150)));
}

await flow('ladder', async () => {
  const n = '[ladder]';
  await duelHub(n, { tab: 'ladder' });
  need(`${n} Fight next floor tapped`, await tapId(api, 'Duel', 'duel.fightNext'));
  need(`${n} the deployment`, await battleUp());
  await toFight(n, true);
  await paceAndMenu(n, { pace: 'ladder', items: ['retreat', 'sound', 'settings'], pauses: true });
  await closeMenu(n);
  check(`${n} won`, (await win()) === 'ended');
  await leaveReport(n, 'Duel', "return s.tab === 'ladder';");
});

await flow('ranked', async () => {
  const n = '[ranked]';
  await duelHub(n, { tab: 'ranked' });
  await api.call('Duel', "s.src.findDelayMs = 300; s.foundHoldMs = 300; s.findMatch('ranked'); return 1;");
  need(`${n} matched, the deployment`, await battleUp());
  await B('s.startFight(); return 1;');
  need(`${n} the fight starts`, await until(async () => (await battleInfo()).phase === 'battle', 20000, 200));
  await paceAndMenu(n, LOCKED);
  await closeMenu(n);
  check(`${n} won`, (await win()) === 'ended');
  await leaveReport(n, 'Duel', "return s.tab === 'ranked';");
});

await flow('raid', async () => {
  const n = '[raid]';
  await duelHub(n, { tab: 'ranked' });
  await api.call('Duel', "s.openArena('raid'); return 1;");
  need(`${n} the raid picks`, await until(() => api.call('Duel', 'return !!s.asyncView;'), 15000, 150));
  await api.call('Duel', 'void s.raid(s.asyncView.candidates[0].pid); return 1;');
  need(`${n} the deployment`, await battleUp());
  await B('s.startFight(); return 1;');
  need(`${n} the fight starts`, await until(async () => (await battleInfo()).phase === 'battle', 20000, 200));
  await paceAndMenu(n, LOCKED);
  // the menu stays open while a locked fight ends (7d3e260: the next battle must open a menu of its own)
  check(`${n} won with the menu still open`, (await win()) === 'ended');
  await leaveReport(n, 'Duel', "return s.arenaTab === 'raid';");
});

// ---------------------------------------------------------------- war attack: an online source stub (the server's part is scripts/online-e2e.mjs)
await flow('war attack', async () => {
  const n = '[war attack]';
  await api.ev(() => {
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  need(`${n} a skirmish`, await battleUp());
  await B("const source = { setup: s.verifySetup, heroes: s.views.map((v) => v.hero), side: 0, label: 'vs Brigands', opponent: 'Hektor', onFinish() {}, onLeave() {} }; s.scene.restart({ source }); return 1;");
  need(`${n} the attack's deployment`, await until(async () => (await battleUp()) && (await battleInfo()).online, 30000, 200));
  await toFight(n, true);
  await paceAndMenu(n, LOCKED);
  await closeMenu(n);
});

check('no page or console errors', errors.length === 0, errors.join(' | ').slice(0, 2000));
console.log(`battle-kinds: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await done(browser);
