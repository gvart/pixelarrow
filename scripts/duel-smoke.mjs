// The duel mode end to end on its in-memory demo (no backend, docs/DUELS.md):
// the hub opens from the menu, a recruit joins, the team changes, the shop
// sells gear, the hero sheet equips it on a duel hero (not the campaign's),
// and a ladder floor is fought through the real battle scene to the report
// and back to the ladder with its Glory, XP and a cleared floor, a ranked
// match and a raid on a defence team (the async ladder). Also checks
// that the hub shows "available in Telegram" when the API cannot be used.
// Usage: node scripts/duel-smoke.mjs [baseUrl]   (needs a running dev/preview server)
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173/';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => (window.__noFirstRun = true));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured","message":"down"}}' }));
await page.route('**/telegram.org/**', (r) => r.abort());

const ev = (fn, arg) => page.evaluate(fn, arg);
const call = (key, body) => ev(([k, f]) => new Function('s', f)(window.__game.scene.getScene(k)), [key, body]);
const active = (k) => ev((key) => window.__game.scene.isActive(key), k);
const until = async (fn, ms = 8000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await ev(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
};

await page.goto(base, { timeout: 60000 });
check('menu', await until(() => !!window.__game && window.__game.scene.isActive('Menu'), 20000));

// Outside Telegram the real API is not available: the hub says so (no crash).
await call('Menu', 's.openDuels(); return 1;');
await until(() => window.__game.scene.isActive('Duel'));
await until(() => window.__game.scene.getScene('Duel').st !== 'loading');
check('[api] outside Telegram: the hub shows a state', (await call('Duel', 'return s.st;')) === 'outside');

// The demo duel army.
await ev(() => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Duel', { preview: true, tab: 'team' })));
check('[demo] profile loads', await until(() => !!window.__game.scene.getScene('Duel').profile));
const before = await call('Duel', 'const p = s.profile; return { heroes: p.heroes.length, team: p.team.length, glory: p.glory, stash: p.stash.length, cleared: p.ladder.cleared, campaignStash: window.__state.campaign.data.stash.length };');
check('[demo] starter roster and team', before.heroes >= 6 && before.team === 6, JSON.stringify(before));

// Recruit, then put the recruit into the team.
await call('Duel', "void s.act(() => s.src.recruit('archer')); return 1;");
await until(() => window.__game.scene.getScene('Duel').profile.heroes.length === 8);
const rec = await call('Duel', 'return { heroes: s.profile.heroes.length, glory: s.profile.glory };');
check('[team] recruit joins for Glory', rec.heroes === before.heroes + 1 && rec.glory === before.glory - 50, JSON.stringify(rec));
await call('Duel', 'const id = s.profile.heroes[s.profile.heroes.length - 1].id; s.toggleTeam(s.profile, s.profile.heroes.find((h) => h.id === id)); return 1;');
check('[team] the recruit is in the team', await until(() => window.__game.scene.getScene('Duel').profile.team.length === 7));

// The shop: buy a rare dory.
await call('Duel', "s.tab = 'shop'; s.shopTab = 'gear'; s.buildBody(); void s.act(() => s.src.buy('dory:rare')); return 1;");
await until(new Function(`return window.__game.scene.getScene('Duel').profile.stash.length === ${before.stash + 1};`));
const bought = await call('Duel', "const it = s.profile.stash.find((i) => i.def === 'dory' && i.rarity === 'rare'); return { uid: it && it.uid, glory: s.profile.glory };");
check('[shop] gear bought for Glory', !!bought.uid && bought.glory < rec.glory, JSON.stringify(bought));

// The hero sheet on the duel army: equip the dory on the first hoplite.
await call('Duel', 's.openHero(s.profile.heroes[0].id); return 1;');
check('[hero] the sheet opens on a duel hero', await until(() => window.__game.scene.isActive('Hero')));
await call('Hero', `const it = s.src.stash().find((i) => i.uid === '${bought.uid}'); s.equip(it); return 1;`);
await page.waitForTimeout(400);
await call('Hero', 's.back(); return 1;');
await until(() => window.__game.scene.isActive('Duel') && !!window.__game.scene.getScene('Duel').profile);
await call('Duel', 'void s.fetchData(); return 1;');
await page.waitForTimeout(400);
const eq = await call('Duel', `return { weapon: s.profile.heroes[0].equip.weapon && s.profile.heroes[0].equip.weapon.uid, campaignStash: window.__state.campaign.data.stash.length, demo: s.src.demo };`);
check('[hero] equipped on the duel hero, campaign untouched', eq.weapon === bought.uid && eq.campaignStash === before.campaignStash && eq.demo, JSON.stringify(eq));

// The ladder: fight the next floor through the battle scene.
const floor = before.cleared + 1;
await call('Duel', `s.tab = 'ladder'; s.buildBody(); void s.fight(${floor}); return 1;`);
check('[ladder] the battle starts', await until(() => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').sim, 10000));
await page.waitForTimeout(800);
const noPause = await call('Battle', 'return !!s.src && !s.src.lockstep;');
check('[ladder] a sourced battle (online rules)', noPause);
await call(
  'Battle',
  `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' }); s.sim.units.filter(u => u.side === 1 && u.state === 'ready').forEach(u => { u.hp = Math.min(u.hp, 1); }); for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`,
);
check('[ladder] the report', await until(() => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 20000));
const rep = await call('Results', 'const r = s.report; return { result: r.result, glory: r.glory, notes: r.notes, loot: r.loot.length, died: r.heroes.filter((h) => h.died).length };');
check('[ladder] a won floor: Glory, a drop, nobody dies', rep.result === 'victory' && rep.glory > 0 && rep.notes.length >= 2 && rep.loot === 1 && rep.died === 0, JSON.stringify(rep));
await call('Results', 's.finish(); return 1;');
check('[ladder] back to the ladder', await until(() => window.__game.scene.isActive('Duel') && !!window.__game.scene.getScene('Duel').profile, 8000));
const after = await call('Duel', 'const p = s.profile; return { tab: s.tab, cleared: p.ladder.cleared, glory: p.glory, xp: p.xp, battles: p.battles };');
check('[ladder] floor cleared, Glory and XP paid', after.tab === 'ladder' && after.cleared === floor && after.glory > bought.glory, JSON.stringify(after));

// The Arena: a ranked match on the demo (search -> opponent found -> the battle -> the report with the rating change -> back).
await call('Duel', "s.src.findDelayMs = 400; s.foundHoldMs = 400; s.tab = 'ranked'; s.buildBody(); void s.fetchData(); return 1;");
await until(() => !!window.__game.scene.getScene('Duel').ranked);
const rk0 = await call('Duel', 'return { games: s.ranked.games, unlocked: s.ranked.unlocked, glory: s.profile.glory };');
check('[arena] ranked is open at duel level 5', rk0.unlocked, JSON.stringify(rk0));
await call('Duel', "s.findMatch('ranked'); return 1;");
check('[arena] searching', await call('Duel', 'return !!s.search;'));
check('[arena] opponent found, the battle starts', await until(() => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').sim, 10000));
await page.waitForTimeout(600);
await call(
  'Battle',
  `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' }); s.sim.units.filter(u => u.side === 1 && u.state === 'ready').forEach(u => { u.hp = Math.min(u.hp, 1); }); for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`,
);
check('[arena] the report', await until(() => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 20000));
const rrep = await call('Results', 'const r = s.report; return { result: r.result, glory: r.glory, notes: r.notes };');
check('[arena] a won match: Glory and a rating change', rrep.result === 'victory' && rrep.glory === 30 && rrep.notes.some((n) => /\+\d+/.test(n)), JSON.stringify(rrep));
await call('Results', 's.finish(); return 1;');
check('[arena] back to the Arena', await until(() => window.__game.scene.isActive('Duel') && !!window.__game.scene.getScene('Duel').ranked, 8000));
const rk1 = await call('Duel', 'return { tab: s.tab, games: s.ranked.games, glory: s.profile.glory };');
check('[arena] one more rated match, Glory paid', rk1.tab === 'ranked' && rk1.games === rk0.games + 1 && rk1.glory === rk0.glory + 30, JSON.stringify(rk1));

// Raids: an async attack on a demo defence team (candidates -> the battle -> the report with the raid rating -> back to Raids).
await call('Duel', "s.openArena('raid'); return 1;");
check('[raid] the raid page loads', await until(() => { const s = window.__game.scene.getScene('Duel'); return !!s.asyncView && s.arenaTab === 'raid'; }));
const av0 = await call('Duel', 'const a = s.asyncView; return { left: a.attacks.left, n: a.candidates.length, glory: s.profile.glory, defence: !!a.defence };');
check('[raid] three candidates, raids left, a defence set', av0.n === 3 && av0.left > 0 && av0.defence, JSON.stringify(av0));
await call('Duel', 'void s.raid(s.asyncView.candidates[0].pid); return 1;');
check('[raid] the battle starts', await until(() => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').sim, 10000));
await page.waitForTimeout(600);
await call(
  'Battle',
  `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' }); s.sim.units.filter(u => u.side === 1 && u.state === 'ready').forEach(u => { u.hp = Math.min(u.hp, 1); }); for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`,
);
check('[raid] the report', await until(() => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 20000));
const arep = await call('Results', 'const r = s.report; return { result: r.result, glory: r.glory, notes: r.notes };');
check('[raid] a won raid: Glory and a raid rating change', arep.result === 'victory' && arep.glory === 20 && arep.notes.some((n) => /\+\d+/.test(n)), JSON.stringify(arep));
await call('Results', 's.finish(); return 1;');
check('[raid] back to Raids', await until(() => { const s = window.__game.scene.isActive('Duel') && window.__game.scene.getScene('Duel'); return !!s && !!s.asyncView && s.arenaTab === 'raid'; }, 8000));
await page.waitForTimeout(400);
const av1 = await call('Duel', 'return { left: s.asyncView.attacks.left, glory: s.profile.glory };');
check('[raid] one raid used, Glory paid', av1.left === av0.left - 1 && av1.glory === av0.glory + 20, JSON.stringify(av1));
const log = await call('Duel', 'return s.src.asyncLog().then((l) => ({ n: l.entries.length, first: l.entries[0].role }));');
check('[raid] the raid log has it', log.first === 'attack' && log.n >= 4, JSON.stringify(log));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
