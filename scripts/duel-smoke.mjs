// The duel mode end to end on its in-memory demo (no backend, docs/DUELS.md):
// the hub opens from the menu, Team and Shop open from the header and go back
// to the mode they came from, a recruit joins, the team changes, presets are
// made, renamed, duplicated, assigned and deleted, the shop sells gear, the
// hero sheet equips it on a duel hero (not the campaign's), a chapter chest
// is claimed, and a ladder floor is fought through the real battle scene to
// the report (with its stars) and back to the ladder with its Glory, XP and a
// cleared floor, a ranked match, a raid on a defence team (the async ladder)
// and the leaderboards. Also checks that the hub shows "available in
// Telegram" when the API cannot be used.
// Regressions: switching views does not pile up listeners, a second Back or
// Continue after a report lands on the hub (not the menu), a new screen size
// keeps the view and the queue search, and the hub is drawn after every match.
// Usage: node scripts/duel-smoke.mjs [baseUrl]   (needs a running dev/preview server)
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, finish } from './lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';

const browser = await launch();
const ctx = await phoneContext(browser);
const page = await ctx.newPage();
const errors = captureErrors(page, { ignoreNetwork: true });
await apiDown(page);
await page.route('**/telegram.org/**', (r) => r.abort());

const { ev, call, active, untilPage: until } = makePageApi(page);
const shown = () => call('Duel', "return window.__game.scene.getScenes(true).map((x) => x.scene.key).join('+') === 'Duel' && s.st === 'ready' && s.body.list.length > 3;");

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

// Team and Shop open from the header; their back arrow (and Back) return to the mode they came from.
await call('Duel', "s.openMode('ladder'); s.openView('team'); return 1;");
check('[hub] Team opens from the header', (await call('Duel', 'return s.tab;')) === 'team');
await call('Duel', 's.up(); return 1;');
check('[hub] its back arrow returns to the Ladder', (await call('Duel', 'return s.tab;')) === 'ladder');
await call('Duel', "s.openMode('ranked'); s.openView('shop'); return 1;");
await page.waitForTimeout(700); // past the hub's Back guard
await ev(() => window.__nav.back());
await page.waitForTimeout(200);
const fromShop = await call('Duel', 'return { tab: s.tab, arena: s.arenaTab, active: window.__game.scene.isActive("Duel") };');
check('[hub] Back from the Shop lands on the Arena (not the menu)', fromShop.active && fromShop.tab === 'ranked' && fromShop.arena === 'home', JSON.stringify(fromShop));

// Presets: a new empty one, renamed through the text prompt, a hero added, used on the ladder, duplicated, deleted.
await call('Duel', "s.openView('team'); s.newPreset(); return 1;");
check('[presets] a new empty preset is edited', await until(() => { const p = window.__game.scene.getScene('Duel').profile; return p.loadouts.length === 3 && p.team.length === 0 && p.loadout === 3; }));
await call('Duel', 'void s.renamePreset(s.profile.loadout); return 1;');
await page.waitForSelector('#px-prompt input', { timeout: 4000 });
await page.fill('#px-prompt input', '  Phalanx  ');
await page.click('#px-prompt button[type=submit]');
check('[presets] renamed (trimmed)', await until(() => { const p = window.__game.scene.getScene('Duel').profile; return p.loadouts.find((l) => l.slot === p.loadout).name === 'Phalanx'; }));
await call('Duel', 's.toggleTeam(s.profile, s.profile.heroes[0]); return 1;');
await until(() => window.__game.scene.getScene('Duel').profile.team.length === 1);
await call('Duel', "s.assignUse('ladder'); return 1;");
check('[presets] used on the ladder', await until(() => { const p = window.__game.scene.getScene('Duel').profile; return p.use.ladder === 3; }));
await call('Duel', 's.duplicatePreset(3); return 1;');
check('[presets] duplicated', await until(() => { const p = window.__game.scene.getScene('Duel').profile; return p.loadouts.length === 4 && p.loadouts.find((l) => l.slot === 4).team.length === 1; }));
await call('Duel', 'void s.act(() => s.src.deleteLoadout(4)); return 1;');
await until(() => window.__game.scene.getScene('Duel').profile.loadouts.length === 3);
await call('Duel', 'void s.act(() => s.src.deleteLoadout(3)); return 1;');
const pr = await call('Duel', 'return new Promise((r) => setTimeout(() => r({ n: s.profile.loadouts.length, ladder: s.profile.use.ladder, edit: s.profile.loadout, team: s.profile.team.length }), 300));');
check('[presets] deleted: its uses and the edit move to the first one left', pr.n === 2 && pr.ladder === 1 && pr.edit === 1 && pr.team === 7, JSON.stringify(pr));
check('[presets] the Team view is drawn', await shown());

// The shop: buy a rare dory.
await call('Duel', "s.openView('shop'); s.shopTab = 'gear'; s.buildBody(); void s.act(() => s.src.buy('dory:rare')); return 1;");
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

// Tab switches rebuild the page: listeners must not pile up (they fired once per old list).
const listeners = () => call('Duel', "return s.events.listenerCount('shutdown') + s.events.listenerCount('update') + s.input.listenerCount('pointerdown');");
const l0 = await listeners();
await call('Duel', "for (let i = 0; i < 12; i++) { s.openMode('ladder'); s.openMode('ranked'); s.openView('team'); s.openView('shop'); s.openBoard('live'); s.openArena('raid'); s.up(); } s.openMode('ladder'); return 1;");
await page.waitForTimeout(400);
const l1 = await listeners();
check('[hub] view switches do not pile up listeners', l1 <= l0, `${l0} -> ${l1}`);

// A chapter chest: chapter 1 has 10 stars in the demo, its first chest is ready.
const g0 = await call('Duel', 'return s.profile.glory;');
await call('Duel', 'void s.claimChest(1, 1); return 1;');
check('[ladder] the chapter chest is claimed', await until(() => window.__game.scene.getScene('Duel').profile.ladder.chests.some((c) => c.chapter === 1 && c.tier === 1)));
const g1 = await call('Duel', 'return s.profile.glory;');
check('[ladder] the chest paid its Glory', g1 === g0 + 60, `${g0} -> ${g1}`);
await ev(() => window.__nav.back()); // the reward popup
await page.waitForTimeout(200);

// The ladder: fight the next floor through the battle scene.
const floor = before.cleared + 1;
await call('Duel', `s.tab = 'ladder'; s.buildBody(); void s.fight(${floor}); return 1;`);
check('[ladder] the battle starts', await until(() => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').sim, 10000));
await page.waitForTimeout(800);
const noPause = await call('Battle', 'return !!s.src && !s.src.lockstep;');
check('[ladder] a sourced battle (online rules)', noPause);
// Back in the deployment asks to leave; the battle starting under that dialog closes it (its Leave would quit the fight)
await ev(() => window.__nav.back());
const asked = await call('Battle', 'return !!s.overlay;');
await call('Battle', 's.startFight(); return 1;');
await until(() => window.__game.scene.getScene('Battle').sim.phase === 'battle', 10000);
check('[ladder] the leave dialog goes when the battle starts', asked && (await call('Battle', 'return !s.overlay && !s.leaveDialog;')));
await call('Battle', 's.leaveDeploy(); return 1;');
check('[ladder] no leaving a battle that started', await active('Battle'));
// Select a group, then tap its card again: the order row empties (this rebuilt the HUD forever: a frozen game)
const frames0 = await call('Battle', "s.selGroup = s.cards[0].gid; s.selUnit = -1; s.buildHud(); const p = { x: 0, y: 0 }; s.cards[0].card.emit('pointerdown', p); s.cards[0].card.emit('pointerup', p); return window.__game.loop.frame;").catch((e) => (errors.push(String(e).slice(0, 200)), -1));
await page.waitForTimeout(600);
check('[ladder] deselecting in battle keeps the game running', frames0 >= 0 && (await call('Battle', 'return s.selGroup;')) === -1 && (await ev(() => window.__game.loop.frame)) > frames0 + 3 && !errors.some((e) => /call stack/i.test(e)), errors.join(' | '));
await call(
  'Battle',
  `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' }); s.sim.units.filter(u => u.side === 1 && u.state === 'ready').forEach(u => { u.hp = Math.min(u.hp, 1); }); for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`,
);
check('[ladder] the report', await until(() => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 20000));
const rep = await call('Results', 'const r = s.report; return { result: r.result, glory: r.glory, notes: r.notes, loot: r.loot.length, died: r.heroes.filter((h) => h.died).length };');
check('[ladder] a won floor: Glory, a drop, nobody dies', rep.result === 'victory' && rep.glory > 0 && rep.notes.length >= 2 && rep.loot === 1 && rep.died === 0, JSON.stringify(rep));
check('[ladder] the report says the stars', rep.notes.some((n) => /Stars: [123] of 3/.test(n)), JSON.stringify(rep.notes));
// Continue tapped twice: one way out (the second must not open the campaign's Army)
await call('Results', 's.finish(); s.finish(); return 1;');
check('[ladder] back to the ladder', await until(() => window.__game.scene.isActive('Duel') && !!window.__game.scene.getScene('Duel').profile, 8000));
await page.waitForTimeout(300);
check('[ladder] the hub is drawn (and alone)', await shown());
const after = await call('Duel', 'const p = s.profile; return { tab: s.tab, cleared: p.ladder.cleared, glory: p.glory, xp: p.xp, battles: p.battles, stars: p.ladder.stars[p.ladder.cleared - 1] };');
check('[ladder] floor cleared, Glory and XP paid, stars kept', after.tab === 'ladder' && after.cleared === floor && after.glory > bought.glory && after.stars >= 1, JSON.stringify(after));

// The Arena: a ranked match on the demo (search -> opponent found -> the battle -> the report with the rating change -> back).
await call('Duel', "s.src.findDelayMs = 400; s.foundHoldMs = 400; s.openMode('ranked'); void s.fetchData(); return 1;");
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
// Back twice (Telegram's header button): the report goes, the hub stays (not the menu)
await ev(() => { window.__nav.back(); window.__nav.back(); });
check('[arena] back to the Arena', await until(() => window.__game.scene.isActive('Duel') && !!window.__game.scene.getScene('Duel').ranked, 8000));
await page.waitForTimeout(300);
check('[arena] a second Back stays on the hub', await shown(), JSON.stringify(await ev(() => window.__game.scene.getScenes(true).map((x) => x.scene.key))));
const rk1 = await call('Duel', 'return { tab: s.tab, arena: s.arenaTab, games: s.ranked.games, glory: s.profile.glory };');
check('[arena] one more rated match, Glory paid, back on the Arena', rk1.tab === 'ranked' && rk1.arena === 'home' && rk1.games === rk0.games + 1 && rk1.glory === rk0.glory + 30, JSON.stringify(rk1));

// The leaderboards: Live (with its Legend filter) and Raids, each a view of its own.
await call('Duel', "s.openBoard('live'); return 1;");
check('[boards] the Live board loads', await until(() => { const s = window.__game.scene.getScene('Duel'); return s.arenaTab === 'board' && s.boardView && s.boardView.board === 'live'; }));
await call('Duel', "s.openBoard('legend'); return 1;");
check('[boards] the Legend filter', await until(() => { const s = window.__game.scene.getScene('Duel'); return s.boardView && s.boardView.board === 'legend'; }));
await call('Duel', 's.up(); return 1;');
check('[boards] back to the Arena', (await call('Duel', 'return s.arenaTab;')) === 'home');

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
check('[raid] back to Raids (drawn)', (await until(() => { const s = window.__game.scene.isActive('Duel') && window.__game.scene.getScene('Duel'); return !!s && !!s.asyncView && s.arenaTab === 'raid'; }, 8000)) && (await shown()));
await page.waitForTimeout(400);
const av1 = await call('Duel', 'return { left: s.asyncView.attacks.left, glory: s.profile.glory };');
check('[raid] one raid used, Glory paid', av1.left === av0.left - 1 && av1.glory === av0.glory + 20, JSON.stringify(av1));
const log = await call('Duel', 'return s.src.asyncLog().then((l) => ({ n: l.entries.length, first: l.entries[0].role }));');
check('[raid] the raid log has it', log.first === 'attack' && log.n >= 4, JSON.stringify(log));

// A new screen size (rotation, Telegram's viewport) rebuilds the hub where it was, still searching.
await call('Duel', "s.src.findDelayMs = 60000; s.findMatch('unranked'); return 1;");
await page.setViewportSize({ width: 400, height: 800 });
await page.waitForTimeout(1200);
const rl = await call('Duel', 'return { search: !!s.search, tab: s.tab, arena: s.arenaTab, ready: s.st };');
check('[hub] a resize keeps the view and the queue search', rl.search && rl.tab === 'ranked' && rl.arena === 'home' && rl.ready === 'ready', JSON.stringify(rl));
await call('Duel', 's.cancelSearch(); return 1;');

check('no page errors', errors.length === 0, errors.join(' | '));
await finish({ browser });
