// Layout check (docs/DESIGN_V2.md "UX principles", docs/UI_KIT.md "Layout check").
//
// Visits every screen across the v6 screen matrix (scripts/lib/layoutMatrix.mjs: phone
// 390x844, 360x780, 320x693; landscape 844x390, 1024x768, 1280x800, 1440x900, 1920x1080;
// tablet 768x1024, 820x1180), in a plain browser and, at phone sizes, inside a fake
// full-screen Telegram (safe-area insets: portrait top 59 + 46, bottom 34; at 844x390
// sides 59, top 46, bottom 21), in English and Russian, and fails when
//   - interactive elements overlap (or sit closer than 4 pt),
//   - text overflows its box or overlaps other text, or is cut at the side of a scroll area,
//   - an element falls outside the safe area (the canvas),
//   - a touch target is smaller than 44 pt (A11Y-06),
//   - text that carries meaning is under 13 CSS px = 6.5 UI px (A11Y-09; map labels are exempt),
//   - a tap where a control is drawn misses its hit area (the tap probe: every interactive
//     element, v3 buttons included, is pressed at its centre and towards each corner through
//     Phaser's own hit test; MECH §3).
// The rules are src/ui/layoutCheck.ts (unit-tested in tests/ui.test.ts, tests/inputContract.test.ts).
// Element bounds come from the game's debug UI registry (window.__layout,
// src/ui/layout.ts). Known violations are listed in scripts/layout-allowlist/<story>.json,
// one file per owner story; anything not listed fails the run. An entry
// `screen|check|*` allows that check on the whole screen (used for the text-size floor,
// which arrived after the screens: one entry per screen, owned by the screen's story);
// a trailing `@WxH` scopes an entry to one size.
// Screenshots: shots/layout/<lang>-<plain|tg>/<WxH>/<screen>.png and a summary
// in shots/layout/index.md (git-ignored; CI uploads shots/layout as an artifact).
//
// Usage: node scripts/layout-check.mjs [baseUrl] [options]   (needs a running dev/preview server)
//   --quick [base]       story default (V6-030): the screens the branch's changes can affect (--changed)
//                        at every matrix size, plus a smoke subset (QUICK in scripts/lib/layoutScenes.mjs)
//                        at 390x844 and 1280x800
//   --changed [base]     only the screens the files changed since the merge base with `base` (default v6,
//                        else main; uncommitted and untracked files count) can affect; conservative
//   --scenes a,kit-*     only these screens (ids or globs; opt-in screens only when a glob names no other)
//   --screens a,b        the same (the older name)
//   --update-allowlist   write the current violations into the allowlist (owners from the screen table)
//   --sizes 390x844,320x568   only these sizes (wins over --matrix)
//   --matrix phone|tablet|landscape|all|v5   size groups, comma-separated (default all: the ten
//                        matrix sizes; v5 = the v5 phone sizes outside the matrix, run by CI too)
//   --langs en           only these languages        --insets plain|tg          only one safe-area variant
//   --jobs 4             parallel browser contexts (default: half the CPUs, 2 to 6)
//   --no-shots           skip screenshots
//   --shard 3/10         only every 10th configuration, starting with the 3rd (CI shards by --sizes instead)
//   --split 2            split each configuration's screens into 2 contiguous runs (each in its own context, in parallel)
//   --dpr 3              device pixel ratio of the screenshots (default 1)
//   --fixed-waits        sleep the full staging waits instead of waiting for the game to be quiet (scripts/lib/settle.mjs)
//   --list               print the screens each size would visit and stop (no browser)
//   --timing             print where the time went (browser, boot, staging, waits, check, shots, scroll)
//   --verbose            print every violation with its detail
//   --no-retry           do not re-run screens with new violations (by default a new violation must show twice)
// Besides index.md it writes shots/layout/found.json: every violation key with the configurations it showed in.
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { ROOT as root, launch, captureErrors, apiDown, makePageApi, shotsDir } from './lib/harness.mjs';
import { fakeTelegram } from './lib/fakeTelegram.mjs';
import { KNOWN_CRASHES, MATRIX, TG, allows, configsFor, loadAllowlist, rewriteAllowlist, sizesFor, splitEntry, staleEntries, storyOf } from './lib/layoutMatrix.mjs';
import { QUICK, matchScreens, sceneKeysOf, screensForChanges } from './lib/layoutScenes.mjs';
import { installSettle, settle } from './lib/settle.mjs';
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
/** A flag with an optional value (`--changed`, `--changed main`): undefined when absent, '' when bare. */
const optional = (n) => {
  const i = args.indexOf(`--${n}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  return v && !v.startsWith('--') && !/^https?:/.test(v) ? v : '';
};
const base = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5173/';
const outDir = shotsDir('layout');
const allowDir = join(root, 'scripts/layout-allowlist');

const QUICK_MODE = optional('quick') !== undefined;
const CHANGED = QUICK_MODE ? (optional('quick') || optional('changed') || '') : optional('changed');
const SIZES = sizesFor(opt('matrix', 'all'), opt('sizes', ''));
const LANGS = opt('langs', 'en,ru').split(',');
const INSETS = opt('insets', 'plain,tg').split(',');
const JOBS = Number(opt('jobs', String(Math.min(6, Math.max(2, Math.floor(availableParallelism() / 2))))));
const DPR = Number(opt('dpr', '1'));
const [SHARD, SHARDS] = opt('shard', '1/1').split('/').map(Number);
const SPLIT = Math.max(1, Number(opt('split', '1')));
const FIXED_WAITS = flag('fixed-waits');

// ------------------------------------------------------------------ timing (--timing)
/** Milliseconds spent per phase, summed over every context. */
const T = { browser: 0, load: 0, boot: 0, stage: 0, staging: 0, waits: 0, settle: 0, check: 0, shots: 0, scroll: 0 };
const timed = async (phase, fn) => {
  const t = Date.now();
  try {
    return await fn();
  } finally {
    T[phase] += Date.now() - t;
  }
};

// ------------------------------------------------------------------ screens
// owner: F = UI foundation (must stay clean), A = battle + results, B = army /
// hero / stash / shop / pass / market / settlement, C = world and hex maps.
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const start = (page, key, data) => makePageApi(page).start(key, data);
const call = (page, key, body) => makePageApi(page).call(key, body);
/** A staging wait: up to `ms`, over as soon as the game is quiet (scripts/lib/settle.mjs) unless --fixed-waits. */
const wait = (page, ms) => timed('waits', () => (FIXED_WAITS ? page.waitForTimeout(ms) : settle(page, ms)));
const until = (page, fn, ms = 8000) => makePageApi(page).untilPage(fn, ms, 150);
const activeIs = (k) => new Function(`return window.__game.scene.isActive(${JSON.stringify(k)})`);

/**
 * A fresh skirmish in deployment. online = 'attack' | 'duel' restarts it as an
 * online battle (the same setup through a BattleSource; a duel with a stub
 * lockstep driver whose opponent is ready).
 */
async function battle(p, online) {
  await ev(p, () => {
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  await until(p, activeIs('Battle'));
  await wait(p, 600);
  if (!online) return;
  await ev(p, (mode) => {
    const s = window.__game.scene.getScene('Battle');
    const source = { setup: s.verifySetup, heroes: s.views.map((v) => v.hero), side: 0, label: new URL(location.href).searchParams.get('lang') === 'ru' ? 'против: Разбойники' : 'vs Brigands', opponent: 'Hektor', onFinish() {}, onLeave() {} };
    if (mode === 'duel')
      source.lockstep = { attach() {}, issue() {}, ready() {}, canStep: () => false, beforeStep() {}, status: () => null, aborted: () => null, opponentReady: () => true };
    s.scene.restart({ source });
  }, online);
  await wait(p, 600);
}

/** The doctrines the Codex has met (src/ui/sheets/doctrine.ts keeps them in local storage). */
const codexMet = (p, ids) => ev(p, (ids) => localStorage.setItem('pixelarrow:codex.doctrines', JSON.stringify(ids)), ids);

/** A won skirmish, run to the end: the report. */
async function results(p) {
  await battle(p);
  await call(
    p,
    'Battle',
    `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' }); s.sim.units.filter(u => u.side === 1 && u.state === 'ready').forEach(u => { u.hp = Math.min(u.hp, 1); }); s.paused = false; for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`,
  );
  // slow machines: the battle ends 1.8 s after the last blow, then the report animates in
  await until(p, () => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 20000);
  return wait(p, 3000);
}

/** Every class with a painted bust (src/ui/army/layout.ts SHIPPED_BUSTS): the opt-in army-bust-<class> screens. */
const BUST_CLASSES = ['militia', 'hoplite', 'thureophoros', 'celt_sword', 'rhomphaia', 'archer', 'slinger', 'javelineer', 'horse_archer', 'peltast', 'falx', 'gallic', 'fanatic', 'companion', 'thessalian', 'chariot', 'royal_guard', 'sacred_band', 'wolf', 'boar', 'bear'];

const SCREENS = [
  { id: 'menu', owner: 'F', run: async (p) => (await start(p, 'Menu'), wait(p, 700)) },
  { id: 'menu-settings', owner: 'F', run: async (p) => (await start(p, 'Menu'), await wait(p, 500), await call(p, 'Menu', 's.openSettings(); return 1;'), wait(p, 400)) },
  // Settings → Notifications (demo switches) and Settings → About (legal pages)
  { id: 'menu-settings-notify', owner: 'F', run: async (p) => (await start(p, 'Menu'), await wait(p, 500), await call(p, 'Menu', 's.openNotifications(true); return 1;'), wait(p, 500)) },
  { id: 'menu-settings-about', owner: 'F', run: async (p) => (await start(p, 'Menu'), await wait(p, 500), await call(p, 'Menu', 's.openAboutPage(); return 1;'), wait(p, 400)) },
  { id: 'menu-reset', owner: 'F', run: async (p) => (await start(p, 'Menu'), await wait(p, 500), await call(p, 'Menu', 's.confirmReset(); return 1;'), wait(p, 400)) },
  { id: 'codex', owner: 'F', run: async (p) => (await codexMet(p, []), await start(p, 'Codex'), wait(p, 900)) },
  // the Codex (CDX-01): a beast sheet with the Trial fight, the Doctrines segment (four met, one locked), a doctrine sheet
  { id: 'codex-beast', owner: 'F', run: async (p) => (await start(p, 'Codex', { open: 'hydra' }), wait(p, 900)) },
  { id: 'codex-doctrines', owner: 'F', run: async (p) => (await codexMet(p, ['steady', 'rush', 'hammer', 'swarm']), await start(p, 'Codex', { seg: 'doctrines' }), wait(p, 900)) },
  { id: 'codex-doctrine', owner: 'F', run: async (p) => (await codexMet(p, ['steady', 'rush', 'hammer', 'swarm', 'fury']), await start(p, 'Codex', { doctrine: 'fury' }), wait(p, 900)) },
  { id: 'kit-controls', owner: 'F', run: async (p) => (await start(p, 'Kit', { tab: 0 }), wait(p, 1500)) },
  { id: 'kit-items', owner: 'F', run: async (p) => (await start(p, 'Kit', { tab: 1 }), wait(p, 700)) },
  { id: 'kit-lists', owner: 'F', run: async (p) => (await start(p, 'Kit', { tab: 2 }), wait(p, 700)) },
  { id: 'kit-mosaic', owner: 'F', run: async (p) => (await start(p, 'Kit', { tab: 4 }), wait(p, 900)) },
  { id: 'kit-parts', owner: 'F', run: async (p) => (await start(p, 'Kit', { tab: 5 }), wait(p, 1200)) },
  { id: 'kit-shell', owner: 'F', run: async (p) => (await start(p, 'Kit', { tab: 6 }), wait(p, 700)) },
  // F-05: the v5 design-system pages (src/scenes/kit/catalog.ts KIT_PAGES) and overlay samples opened from the Kit
  { id: 'kit-tokens', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'tokens' }), wait(p, 1200)) },
  { id: 'kit-type', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'type' }), wait(p, 900)) },
  { id: 'kit-states', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'states' }), wait(p, 1200)) },
  { id: 'kit-overlays', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'overlays' }), wait(p, 900)) },
  { id: 'kit-icons', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'icons' }), wait(p, 1200)) },
  { id: 'kit-army', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'army' }), wait(p, 1500)) },
  // 'confirm-over' then 'destructive': a destructive confirm over the sheet that asked (one sheet plus one confirm)
  ...[['sheet'], ['sheet-actions'], ['decision'], ['footer-close'], ['confirm-over', 'destructive'], ['item'], ['purchase']].map((samples) => ({
    id: `kit-overlay-${samples[0]}`,
    owner: 'F',
    run: async (p) => (await start(p, 'Kit', { page: 'overlays' }), await wait(p, 600), await call(p, 'Kit', `${samples.map((x) => `s.openSample(${JSON.stringify(x)});`).join(' ')} return 1;`), wait(p, 700)),
  })),
  { id: 'kit-pages', owner: 'F', run: async (p) => (await start(p, 'Kit', { page: 'tokens' }), await wait(p, 600), await call(p, 'Kit', 's.pageList(); return 1;'), wait(p, 500)) },
  // the shop with the API down (503): the "closed" state
  { id: 'menu-shop', owner: 'B', run: async (p) => (await start(p, 'Menu'), await wait(p, 500), await call(p, 'Menu', 's.openShop(); return 1;'), wait(p, 1200)) },
  // economy screens on the in-memory demo economy (src/ui/econ/demo.ts)
  ...['shop', 'pass', 'wallet'].map((tab) => ({ id: `shop-${tab}`, owner: 'B', run: async (p) => (await start(p, 'Shop', { demo: true, tab }), wait(p, 900)) })),
  {
    id: 'shop-cosmetic',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Shop', { demo: true, tab: 'shop' });
      await wait(p, 800);
      await call(p, 'Shop', `s.openCosmetic(s.loaded.cat.cosmetics[2]); return 1;`);
      return wait(p, 400);
    },
  },
  // the online army: API down (503), then a demo profile (roster, stash, recruit, garrison)
  { id: 'online-army-closed', owner: 'B', run: async (p) => (await start(p, 'OnlineArmy', {}), wait(p, 1200)) },
  ...[
    ['online-army', 'roster', ''],
    ['online-army-stash', 'stash', ''],
    ['online-army-recruit', 'roster', 's.openRecruit(s.profile);'],
    ['online-army-garrison', 'roster', ''],
  ].map(([id, tab, after]) => ({
    id,
    owner: 'B',
    run: async (p) => {
      await start(p, 'OnlineArmy', id === 'online-army-garrison' ? { garrison: 1 } : { tab });
      await wait(p, 600);
      await call(
        p,
        'OnlineArmy',
        `const c = window.__state.campaign.data; const now = Date.now();
         const heroes = c.heroes.slice(0, 8).map((h, i) => ({ hero: h, garrison: i === 3 ? 1 : null, woundedUntil: i === 5 ? now + 3600e3 : 0, busy: i === 6 }));
         s.fetchData({ season: { id: 3, startedAt: now, endsAt: now + 864e5 }, shard: { id: 1, radius: 34 }, now, resources: { gold: 1240, food: 380, wood: 210, bronze: 95, recruits: 3 }, energy: 72, energyMax: 100, home: { q: 0, r: 0 }, army: { q: 0, r: 0, marching: false, dest: null, arriveAt: null }, formations: [], heroes, stash: c.stash, clan: null, battles: 4, wins: 3, income: { pending: { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 }, hexes: 3 } });
         ${after} return 1;`,
      );
      return wait(p, 600);
    },
  })),
  {
    // the one-per-battle consumable picker of attacks and duels (src/ui/econ/consumablePicker.ts)
    id: 'consumable-picker',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Shop', { demo: true, tab: 'shop' });
      await wait(p, 800);
      await call(p, 'Shop', `s.previewPicker(); return 1;`);
      return wait(p, 400);
    },
  },
  // the duel hub (src/scenes/duel/DuelScene.ts): API down (503), then the demo duel army
  { id: 'duel-closed', owner: 'B', run: async (p) => (await start(p, 'Duel', { preview: false }), wait(p, 1200)) },
  ...[
    // the hub (header: Glory, duel level, Team and Shop; the Ladder | Arena switch)
    ['duel-ladder', { tab: 'ladder' }, ''],
    ['duel-ladder-open', { tab: 'ladder' }, 's.toggleChapter(2);'],
    ['duel-floor', { tab: 'ladder' }, 's.openFloor(s.profile, 5);'],
    ['duel-floor-farm', { tab: 'ladder' }, 's.openFloor(s.profile, 3);'],
    ['duel-chest', { tab: 'ladder' }, 'void s.claimChest(1, 1);'],
    ['duel-chest-item', { tab: 'ladder' }, 's.openChestReward({ chapter: 1, tier: 3, glory: 200, item: s.profile.stash[1], replayed: false, profile: s.profile });'],
    // Team (presets, uses, the heroes with their attention badges) and Shop (offer cards) as full views
    ['duel-team', { tab: 'team' }, ''],
    ['duel-team-presets', { tab: 'team' }, 'void (async () => { for (let i = 0; i < 3; i++) await s.src.createLoadout({ from: 1 }); await s.fetchData(); })();'],
    ['duel-team-delete', { tab: 'team' }, 's.deletePreset(s.profile.loadout);'],
    ['duel-recruit', { tab: 'team' }, 's.openRecruit();'],
    ['duel-dismiss', { tab: 'team' }, 's.openDismiss();'],
    // DUE-01: the Preset sheet behind the edited preset, the roster symbols, the duel level sheet
    ['duel-preset', { tab: 'team' }, 's.openPresetSheet(s.profile.loadout);'],
    ['duel-symbols', { tab: 'team' }, 's.openSymbols();'],
    ['duel-level', { tab: 'ladder' }, 's.openLevel();'],
    ['duel-shop-offers', { tab: 'shop', shop: 'offers' }, ''],
    ['duel-shop-gear', { tab: 'shop', shop: 'gear' }, ''],
    ['duel-shop-sell', { tab: 'shop', shop: 'sell' }, ''],
    ['duel-hero', { tab: 'team' }, 's.openHero(s.profile.heroes[6].id);'],
    // the Arena: the Live PvP and Raids cards, the level gate, the search and the opponent found
    ['duel-ranked', { tab: 'ranked', arena: 'home' }, ''],
    ['duel-ranked-locked', { tab: 'ranked', arena: 'home', demoXp: 0 }, ''],
    ['duel-searching', { tab: 'ranked', arena: 'home' }, "s.src.findDelayMs = 1e8; s.findMatch('ranked');"],
    ['duel-searching-unranked', { tab: 'ranked', arena: 'home' }, "s.src.findDelayMs = 1e8; s.findMatch('unranked');"],
    ['duel-found', { tab: 'ranked', arena: 'home' }, "s.src.findDelayMs = 0; s.foundHoldMs = 1e8; s.findMatch('ranked');"],
    // raids (the async defence ladder): the defender picks, the defence, the log; the leaderboards
    ['duel-raid', { tab: 'ranked', arena: 'raid' }, ''],
    ['duel-raid-locked', { tab: 'ranked', arena: 'raid', demoXp: 0 }, ''],
    ['duel-defence', { tab: 'ranked', arena: 'raid' }, 's.openDefence();'],
    ['duel-raid-log', { tab: 'ranked', arena: 'raid' }, 'void s.openRaidLog();'],
    ['duel-board-live', { tab: 'ranked', arena: 'board', board: 'live' }, ''],
    ['duel-board-legend', { tab: 'ranked', arena: 'board', board: 'legend' }, ''],
    ['duel-board-raids', { tab: 'ranked', arena: 'board', board: 'async' }, ''],
    [
      'duel-season-reward',
      { tab: 'ranked', arena: 'home' },
      "const id = s.season.season.id - 1; s.src.async.rewards = [{ season: id, ladder: 'live', league: 'strategos', glory: 400, cosmetic: 'duel_banner_strategos', pick: 'sacred_band' }, { season: id, ladder: 'async', league: 'gold', glory: 90, cosmetic: 'duel_emblem_gold', pick: null }]; void s.src.season().then((v) => s.openSeasonRewards(v));",
    ],
    // the Strategos / Legend reward's set piece of choice
    [
      'duel-season-pick',
      { tab: 'ranked', arena: 'home' },
      "const id = s.season.season.id - 1; s.src.async.rewards = [{ season: id, ladder: 'live', league: 'legend', glory: 600, cosmetic: 'duel_banner_legend', pick: 'sacred_band' }]; void s.src.season().then((v) => s.openSeasonPick(v.rewards[0]));",
    ],
  ].map(([id, data, after]) => ({
    id,
    owner: 'B',
    run: async (p) => {
      await start(p, 'Duel', { demoXp: 560, ...data, preview: true });
      if (data.tab === 'ranked') await until(p, () => !!window.__game.scene.getScene('Duel').ranked && !!window.__game.scene.getScene('Duel').season, 4000);
      if (data.tab === 'ranked' && data.arena !== 'board') await until(p, () => !!window.__game.scene.getScene('Duel').asyncView, 4000);
      if (data.arena === 'board') await until(p, () => !!window.__game.scene.getScene('Duel').boardView, 4000);
      await until(p, () => !!window.__game.scene.getScene('Duel').profile, 4000);
      await wait(p, 300);
      if (after) await call(p, 'Duel', `${after} return 1;`);
      return wait(p, 600);
    },
  })),
  {
    // the report of a won raid on the demo
    id: 'duel-raid-result',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Duel', { tab: 'ranked', arena: 'raid', preview: true, demoXp: 560 });
      await until(p, () => !!window.__game.scene.getScene('Duel').profile, 4000);
      await wait(p, 600);
      await call(p, 'Duel', 's.previewRaidResult(); return 1;');
      await until(p, () => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 8000);
      return wait(p, 3000);
    },
  },
  {
    // DUE-01: the report of a ladder floor reported after its 30-minute ticket (verified, paid nothing)
    id: 'duel-ladder-expired',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Duel', { tab: 'ladder', preview: true, demoXp: 560 });
      await until(p, () => !!window.__game.scene.getScene('Duel').profile, 4000);
      await wait(p, 600);
      await call(p, 'Duel', 's.previewLadderResult(true); return 1;');
      await until(p, () => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 8000);
      return wait(p, 3000);
    },
  },
  {
    // the report of a ranked match (rating change, promotion) on the demo
    id: 'duel-ranked-result',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Duel', { tab: 'ranked', arena: 'home', preview: true, demoXp: 560 });
      await until(p, () => !!window.__game.scene.getScene('Duel').profile, 4000);
      await wait(p, 600); // (the scene object keeps its last profile while it restarts)
      await call(p, 'Duel', 's.previewMatchResult(); return 1;');
      await until(p, () => window.__game.scene.isActive('Results') && !!window.__game.scene.getScene('Results').report, 8000);
      return wait(p, 3000);
    },
  },
  ...['browse', 'mine', 'sell'].map((tab) => ({ id: `market-${tab}`, owner: 'B', run: async (p) => (await start(p, 'Market', { demo: true, tab }), wait(p, 1000)) })),
  {
    id: 'market-detail',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Market', { demo: true, tab: 'browse' });
      await wait(p, 900);
      await call(p, 'Market', `s.openListing(s.base, s.listings[0]); return 1;`);
      return wait(p, 400);
    },
  },
  {
    id: 'market-goods',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Market', { demo: true, tab: 'browse' });
      await wait(p, 900);
      await call(p, 'Market', `s.openListing(s.base, s.listings.find((l) => l.kind !== 'item')); return 1;`);
      return wait(p, 400);
    },
  },
  {
    id: 'market-sell-form',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Market', { demo: true, tab: 'sell' });
      await wait(p, 1000);
      await call(p, 'Market', `s.openSellForm(s.base, { kind: 'item', item: s.base.profile.stash[0] }); return 1;`);
      return wait(p, 400);
    },
  },
  // MKT-01: the goods form (quantity row), a filter's option sheet and the numeric price entry
  {
    id: 'market-goods-form',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Market', { demo: true, tab: 'sell' });
      await wait(p, 1000);
      await call(p, 'Market', `s.openSellForm(s.base, { kind: 'resource', id: 'wood', have: 340 }); return 1;`);
      return wait(p, 400);
    },
  },
  {
    id: 'market-filter',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Market', { demo: true, tab: 'browse' });
      await wait(p, 900);
      await call(p, 'Market', `s.openFilter('sort'); return 1;`);
      return wait(p, 400);
    },
  },
  {
    id: 'market-price',
    owner: 'B',
    run: async (p) => {
      await start(p, 'Market', { demo: true, tab: 'sell' });
      await wait(p, 1000);
      await call(p, 'Market', `s.openNumberSheet({ title: 'Price', value: 21, min: 2, max: 5000, icon: 'wargold', presets: [1, 2, 5].map((n) => ({ label: 'x' + n, tip: 'x' + n, value: 21 * n })), info: (v) => 'You get ' + v, id: 'market.priceSheet', onDone: () => {} }); return 1;`);
      return wait(p, 400);
    },
  },
  { id: 'world', owner: 'C', run: async (p) => (await start(p, 'World'), wait(p, 1500)) },
  // the event card (EV-03, campaign-events.md R4): the longest body with a gamble, and three choices with costs; the journal full
  ...[
    ['world-event', 'deserters'],
    ['world-event-costs', 'plague_town'],
  ].map(([id, evId]) => ({
    id,
    owner: 'C',
    run: async (p) => {
      await ev(p, (e) => {
        const w = window.__state.campaign.world;
        w.stop();
        w.s.safeUntil = 1e9;
        w.s.pendingEvent = { id: e, seed: 7 };
      }, evId);
      await start(p, 'World');
      await until(p, () => !!window.__game.scene.getScene('World').eventCard, 8000);
      return wait(p, 600);
    },
  })),
  {
    id: 'world-journal',
    owner: 'C',
    run: async (p) => {
      await ev(p, () => {
        const w = window.__state.campaign.world;
        delete w.s.pendingEvent; // the card fixtures above leave one pending
        const lines = ['deserters:take', 'shrine_ares:offer', 'plague_town:help:fail', 'caravan:escort', 'rival_challenge:refuse'];
        for (let i = 0; i < 20; i++) w.logJournal(lines[i % lines.length]);
      });
      await start(p, 'World');
      await wait(p, 1200);
      await call(p, 'World', 's.openJournal(); return 1;');
      return wait(p, 500);
    },
  },
  {
    id: 'world-encounter',
    owner: 'C',
    run: async (p) => {
      await start(p, 'World');
      await wait(p, 1200);
      await ev(p, () => {
        const s = window.__game.scene.getScene('World');
        const w = s.w;
        w.stop();
        w.s.safeUntil = 0;
        const party = w.s.parties[0];
        const t = w.nearestPassable(Math.floor(w.s.x) + 2, Math.floor(w.s.y), 3);
        party.x = t.x + 0.5;
        party.y = t.y + 0.5;
        party.idle = 0;
        party.power = s.info.power * 1.05;
        s.setWaiting(true);
      });
      await until(p, () => !!window.__game.scene.getScene('World').dialog, 6000);
      return wait(p, 400);
    },
  },
  // the isometric camp scene (src/scenes/CampScene.ts): the field camp staged with every structure, a placement, the muster, the forge
  ...[
    ['camp', ''],
    ['camp-place', "s.startPlacing('tent');"],
    ['camp-muster', 's.openMuster();'],
    ['camp-temper', 's.openTemper();'],
    ['camp-build', 's.openBuild();'],
    ['camp-supplies', 's.openSupplies();'],
  ].map(([id, after]) => ({
    id,
    owner: 'C',
    run: async (p) => {
      await ev(p, () => {
        const c = window.__state.campaign;
        const w = c.world;
        const m = w.map;
        if (!w.camp) {
          // the nearest tile to the start where the party may camp
          const st = m.settlements[m.start];
          let best = null;
          for (let y = 2; y < m.h - 2; y++)
            for (let x = 2; x < m.w - 2; x++) {
              w.s.x = x + 0.5;
              w.s.y = y + 0.5;
              if (w.campBlocker()) continue;
              const d = Math.hypot(x - st.x, y - st.y);
              if (!best || d < best.d) best = { x, y, d };
            }
          w.s.x = best.x + 0.5;
          w.s.y = best.y + 0.5;
          w.s.safeUntil = 1e9;
          w.addSupplies(120);
          w.makeCamp();
          const build = (id) => {
            for (const i of w.camp.zone) if (w.build(id, i % m.w, Math.floor(i / m.w)) === null) return;
          };
          for (const id of ['fire', 'tent', 'forge', 'training', 'palisade']) build(id);
          c.data.heroes[1].wound = 20;
        }
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Camp', { mode: 'field' }));
      });
      await until(p, activeIs('Camp'));
      await wait(p, 900);
      if (after) await call(p, 'Camp', `${after} return 1;`);
      return wait(p, 500);
    },
  })),
  // the War camp's Buildings list (CMP-01) on the demo shard's camp preview
  {
    id: 'camp-war-build',
    owner: 'C',
    run: async (p) => {
      await start(p, 'Online', { preview: 'camp' });
      await until(p, activeIs('Camp'), 25000);
      await until(p, () => !!window.__game.scene.getScene('Camp').layout, 10000);
      await call(p, 'Camp', 's.openBuild(); return 1;');
      return wait(p, 600);
    },
  },
  { id: 'army', owner: 'B', run: async (p) => (await start(p, 'Army', { from: 'World' }), wait(p, 900)) },
  { id: 'army-stash', owner: 'B', run: async (p) => (await start(p, 'Army', { from: 'World', tab: 'stash' }), wait(p, 900)) },
  // the Army template's states (ARM-01): a full roster of 20 with a slinger selected, a wounded militiaman,
  // the Drillmaster's pick mode (a peltast), and an army with no one left
  ...[
    ['army-full', 'World', 4, (c) => {
      c.data.gold = 9999;
      for (let i = 0; i < 40 && c.data.heroes.length < 20; i++) c.recruit();
      c.data.heroes.forEach((h, i) => (h.group = i % 4));
    }],
    ['army-wounded', 'Menu', 8, (c) => (c.data.heroes[8].wound = 14)],
    ['army-pick', 'Settlement', 6, null],
    ['army-empty', 'World', -1, (c) => (c.data.heroes.length = 0)],
    // opt-in (run by name only): the hero card's class bust for every class (AS-07, scripts/art/preview.mjs)
    ...BUST_CLASSES.map((cls) => [`army-bust-${cls}`, 'World', 0, `(c) => (c.data.heroes[0].cls = '${cls}')`]),
  ].map(([id, from, sel, prep]) => ({
    id,
    owner: 'B',
    ...(id.startsWith('army-bust-') ? { optIn: true } : {}),
    run: async (p) => {
      await ev(
        p,
        ([f, s, pick, body]) => {
          const c = window.__state.campaign;
          // the staged campaign serves the screens after this one: put the army back when the Army closes
          const snap = JSON.stringify({ heroes: c.data.heroes, gold: c.data.gold });
          window.__armyRestore = () => Object.assign(c.data, JSON.parse(snap));
          if (body) new Function('c', body)(c);
          const data = { from: f, heroId: c.data.heroes[s]?.id, ...(f === 'Settlement' ? { id: c.world.map.start } : {}), ...(pick ? { pick: 'retrain' } : {}) };
          window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Army', data));
        },
        [from, sel, id === 'army-pick', prep ? `(${prep})(c)` : null],
      );
      await wait(p, 900);
      return ev(p, () => void window.__game.scene.getScene('Army').events.once('shutdown', window.__armyRestore));
    },
  })),
  {
    // the stash in a town: compare with sell, repair and equip
    id: 'army-town-item',
    owner: 'B',
    run: async (p) => {
      await ev(p, () => {
        const w = window.__state.campaign.world;
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Army', { from: 'Settlement', id: w.map.start, tab: 'stash' }));
      });
      await wait(p, 800);
      await call(p, 'Army', `s.openStashItem(window.__state.campaign.data.stash[2]); return 1;`);
      return wait(p, 500);
    },
  },
  ...[
    ['hero', 'stats'],
    ['hero-gear', 'gear'],
    ['hero-perks', 'perks'],
    ['hero-skills', 'skills'],
  ].map(([id, tab]) => ({
    id,
    owner: 'B',
    run: async (p) => {
      await ev(p, (tb) => {
        const h = window.__state.campaign.data.heroes[0];
        h.points = Math.max(h.points, 3);
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Hero', { heroId: h.id, back: { from: 'World' }, tab: tb }));
      }, tab);
      return wait(p, 900);
    },
  })),
  {
    // a stash item compared with what the hero carries (the compare popup)
    id: 'stash-compare',
    owner: 'B',
    run: async (p) => {
      await ev(p, () => {
        const h = window.__state.campaign.data.heroes[0];
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Hero', { heroId: h.id, back: { from: 'World' }, tab: 'gear' }));
      });
      await wait(p, 700);
      await call(p, 'Hero', `const st = window.__state.campaign.data.stash; s.openStashItem(st[0]); return 1;`);
      return wait(p, 500);
    },
  },
  {
    // an equipped item's card (take off, repair)
    id: 'stash-detail',
    owner: 'B',
    run: async (p) => {
      await ev(p, () => {
        const h = window.__state.campaign.data.heroes[0];
        if (h.equip.armor) h.equip.armor.cond = 55;
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Hero', { heroId: h.id, back: { from: 'World' }, tab: 'gear' }));
      });
      await wait(p, 700);
      await call(p, 'Hero', `s.tapSlot(window.__state.campaign.data.heroes[0].equip.armor ? 'armor' : 'weapon'); return 1;`);
      return wait(p, 500);
    },
  },
  {
    id: 'village',
    owner: 'B',
    run: async (p) => {
      await ev(p, () => {
        const w = window.__state.campaign.world;
        const v = w.map.settlements.filter((x) => x.kind === 'village').sort((a, b) => Math.hypot(a.x - w.s.x, a.y - w.s.y) - Math.hypot(b.x - w.s.x, b.y - w.s.y))[0];
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: v.id }));
      });
      return wait(p, 900);
    },
  },
  {
    id: 'town-market',
    owner: 'B',
    run: async (p) => {
      await ev(p, () => {
        const w = window.__state.campaign.world;
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: w.map.start, tab: 'market' }));
      });
      return wait(p, 900);
    },
  },
  ...['recruits', 'sell', 'rest'].map((tab) => ({
    id: `town-${tab}`,
    owner: 'B',
    run: async (p) => {
      await ev(p, (tb) => {
        const c = window.__state.campaign;
        if (tb === 'rest') c.data.heroes.slice(2, 6).forEach((h, i) => (h.wound = 3 + i * 5));
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: c.world.map.start, tab: tb }));
      }, tab);
      return wait(p, 900);
    },
  })),
  {
    // a volunteer's class card
    id: 'town-recruit-card',
    owner: 'B',
    run: async (p) => {
      await ev(p, () => {
        const c = window.__state.campaign;
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: c.world.map.start, tab: 'recruits' }));
      });
      await wait(p, 800);
      await call(p, 'Settlement', `const c = window.__state.campaign; const r = c.world.recruits(s.id, c.data.heroes)[0]; if (r) s.openRecruit(r.index); return 1;`);
      return wait(p, 500);
    },
  },
  // the Smith's forge (EC-01): the item list, one item, and one the purse cannot pay for
  ...[
    ['town-forge', 1240, ''],
    ['town-forge-item', 1240, 's.openForgeItem("lc-forge-1");'],
    ['town-forge-poor', 100, 's.openForgeItem("lc-forge-1");'],
  ].map(([id, gold, open]) => ({
    id,
    owner: 'B',
    run: async (p) => {
      await ev(p, (g) => {
        const c = window.__state.campaign;
        c.data.gold = g;
        if (!c.data.stash.some((i) => i.uid === 'lc-forge-1')) {
          c.data.stash.push({ uid: 'lc-forge-1', def: 'falcata', rarity: 'legendary', cond: 90 }, { uid: 'lc-forge-2', def: 'linothorax', rarity: 'rare', cond: 100 });
          c.data.heroes[0].equip.helmet = { uid: 'lc-forge-3', def: c.data.heroes[0].equip.helmet?.def ?? 'pilos', rarity: 'epic', cond: 100 };
        }
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: c.world.map.start, tab: 'rest' }));
      }, gold);
      await wait(p, 800);
      await call(p, 'Settlement', `s.openForge(); ${open} return 1;`);
      return wait(p, 500);
    },
  })),
  // ---- battle (owner A): deployment, the command panel, group assignment, retreat, online rules, the report
  { id: 'battle-deploy', owner: 'A', run: async (p) => (await battle(p), wait(p, 700)) },
  {
    id: 'battle-deploy-formation',
    owner: 'A',
    // the shape sheet (deployment)
    run: async (p) => (await battle(p), await call(p, 'Battle', `s.openCategory('formation'); return 1;`), wait(p, 400)),
  },
  { id: 'battle-groups', owner: 'A', run: async (p) => (await battle(p), await call(p, 'Battle', 's.openGroups(); return 1;'), wait(p, 500)) },
  {
    id: 'battle-fight',
    owner: 'A',
    run: async (p) => {
      await battle(p);
      await call(p, 'Battle', `s.startFight(); s.command({kind:'order', group:-1, order:'advance'}); for (let i = 0; i < 20 * 6 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.hideBanner(); s.buildHud(); return 1;`);
      return wait(p, 700);
    },
  },
  ...[
    // the radial ring round the selected group (a hero with abilities: the ability row shows) and the shape sheet
    ['battle-ring', 'u.group', '-1', ''],
    ['battle-ring-soldier', 'u.group', 'u.id', ''],
    ['battle-shapes', 'u.group', '-1', "s.shapeOpen = true;"],
  ].map(([id, group, unit, extra]) => ({
    id,
    owner: 'A',
    run: async (p) => {
      await battle(p);
      await call(p, 'Battle', `s.startFight(); for (let i = 0; i < 20 * 2; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.hideBanner(); const u = s.sim.units.find((x) => x.side === 0 && x.abil.length > 0) || s.sim.units.find((x) => x.side === 0); s.selGroup = ${group}; s.selUnit = ${unit}; ${extra} s.buildHud(); return 1;`);
      return wait(p, 500);
    },
  })),
  { id: 'battle-retreat', owner: 'A', run: async (p) => (await battle(p), await call(p, 'Battle', `s.startFight(); s.openRetreat(); return 1;`), wait(p, 500)) },
  {
    // BTL-01 (A11Y-16): Left-hand mirrors the medallion rail, the eye and the top bar's ends
    id: 'battle-lefthand',
    owner: 'A',
    run: async (p) => {
      await ev(p, () => (window.__state.campaign.data.settings.leftHand = true));
      await battle(p);
      await call(p, 'Battle', `s.startFight(); for (let i = 0; i < 20 * 2; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.hideBanner(); const u = s.sim.units.find((x) => x.side === 0 && x.abil.length > 0) || s.sim.units.find((x) => x.side === 0); s.selGroup = u.group; s.selUnit = -1; s.buildHud(); return 1;`);
      await wait(p, 500);
      await ev(p, () => delete window.__state.campaign.data.settings.leftHand);
    },
  },
  // BTL-01: the ⋯ battle menu in deployment, in the fight (it pauses) and in a battle that cannot pause (Retreat and Sound only)
  { id: 'battle-menu-deploy', owner: 'A', run: async (p) => (await battle(p), await call(p, 'Battle', `s.hideBanner(); s.openMenu(); return 1;`), wait(p, 500)) },
  { id: 'battle-menu', owner: 'A', run: async (p) => (await battle(p), await call(p, 'Battle', `s.startFight(); s.hideBanner(); s.openMenu(); return 1;`), wait(p, 500)) },
  {
    id: 'battle-menu-locked',
    owner: 'A',
    run: async (p) => (await battle(p, 'attack'), await call(p, 'Battle', `s.startFight(); s.hideBanner(); s.openMenu(); return 1;`), wait(p, 500)),
  },
  // ---- field works (FW-03): the tray with a stakes line, a ditch and a laager laid; placing a ghost; a lair assault's walls
  ...[
    ['battle-works', `s.pickWork('stakes'); s.placeWork(); s.pickWork('ditch'); s.worksGhost.x -= 5; s.placeWork(); s.pickWork('laager'); s.worksGhost.x += 5; s.placeWork(); s.hideBanner(); s.buildHud();`],
    ['battle-works-place', `s.pickWork('stakes'); s.worksGhost.x -= 3; s.hideBanner(); s.buildHud();`],
    // the same works on the open field, tray closed (the works art preview, ASSET_PIPELINE step 6)
    ['battle-works-field', `s.pickWork('stakes'); s.placeWork(); s.pickWork('ditch'); s.worksGhost.x -= 5; s.placeWork(); s.pickWork('laager'); s.worksGhost.x += 5; s.placeWork(); s.openWorks(false); s.hideBanner(); s.buildHud();`],
  ].map(([id, body]) => ({
    id,
    owner: 'A',
    run: async (p) => {
      await ev(p, () => {
        const w = window.__state.campaign.world;
        w.s.supplies = 40;
        w.setFlag('@works', 1);
      });
      await battle(p);
      await call(p, 'Battle', `s.openWorks(true); ${body} return 1;`);
      return wait(p, 500);
    },
  })),
  {
    id: 'battle-assault',
    owner: 'A',
    run: async (p) => {
      // a lair assault as campaignBattle.startLairAssault builds it (the map's Assault sheet is WLD-02's)
      await ev(p, () => {
        const st = window.__state;
        const c = st.campaign;
        const lair = c.world.map.settlements.find((x) => x.kind === 'lair');
        st.pending = { enemy: c.garrisonEnemy(lair.id), seed: 4242, label: lair.name, site: c.assaultSite(lair.id), lairId: lair.id, byPlayer: true };
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', {}));
      });
      await until(p, activeIs('Battle'));
      await wait(p, 600);
      await call(p, 'Battle', `s.hideBanner(); s.recentre('foe'); return 1;`);
      return wait(p, 700);
    },
  },
  { id: 'battle-online-deploy', owner: 'A', run: async (p) => (await battle(p, 'attack'), wait(p, 900)) },
  { id: 'battle-duel-deploy', owner: 'A', run: async (p) => (await battle(p, 'duel'), await call(p, 'Battle', 's.startFight(); return 1;'), wait(p, 900)) },
  {
    id: 'battle-online-fight',
    owner: 'A',
    run: async (p) => {
      await battle(p, 'attack');
      await call(p, 'Battle', `s.startFight(); for (let i = 0; i < 20 * 4 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.hideBanner(); s.buildHud(); return 1;`);
      return wait(p, 500);
    },
  },
  { id: 'results', owner: 'A', run: async (p) => (await results(p), wait(p, 300)) },
  { id: 'results-heroes', owner: 'A', run: async (p) => (await results(p), await call(p, 'Results', `s.showPage('heroes'); return 1;`), wait(p, 2500)) },
  { id: 'results-spoils', owner: 'A', run: async (p) => (await results(p), await call(p, 'Results', `s.showPage('spoils'); return 1;`), wait(p, 3500)) },
  // RES-01: the Spoils empty state (painted chest) and the arc's Victory variant (company roll, set piece)
  { id: 'results-empty', owner: 'A', run: async (p) => (await results(p), await call(p, 'Results', `s.report.loot.length = 0; s.report.picks = 0; s.showPage('spoils'); return 1;`), wait(p, 600)) },
  {
    id: 'results-arc',
    owner: 'A',
    run: async (p) => {
      await results(p);
      await call(p, 'Results', `const st = window.__state; window.__arcWas = st.campaign.world.s.arc; st.campaign.world.s.arc = { stage: 'won' }; st.last.partyId = 1; s.report.loot.unshift({ uid: 'arc1', def: 'achilles_helm', rarity: 'legendary', cond: 100 }); s.scene.restart({}); return 1;`);
      await wait(p, 1500);
      // the variant is on show: put the arc back so the later screens see the fixture's campaign
      await call(p, 'Results', `window.__state.campaign.world.s.arc = window.__arcWas; return 1;`);
      return wait(p, 200);
    },
  },
  {
    id: 'results-inspect',
    owner: 'A',
    // the demo battle does not always drop loot: make sure the report holds one item to inspect
    run: async (p) => (await results(p), await call(p, 'Results', `if (!s.report.loot.length) s.report.loot.push({ uid: 'inspect1', def: 'chalcidian', rarity: 'rare', cond: 80 }); s.showPage('spoils'); return 1;`), await wait(p, 600), await call(p, 'Results', `s.report.loot.forEach((_, i) => s.revealed.add(i)); s.showPage('spoils'); s.inspect(0); return 1;`), wait(p, 500)),
  },
  {
    id: 'results-online',
    owner: 'A',
    run: async (p) => {
      await results(p);
      await call(p, 'Results', `const r = { ...s.report, online: 'attack', verified: true, picks: 0, lootInStash: true, notes: ['Hex taken!'] }; s.scene.restart({ report: r, done: () => {} }); return 1;`);
      return wait(p, 3500);
    },
  },
  // ---- mythical beasts (owner A): a beast battle with the boss bar, its Trial fight started from the Codex beast sheet
  {
    id: 'battle-beast',
    owner: 'A',
    run: async (p) => {
      await start(p, 'Codex');
      await wait(p, 600);
      await call(p, 'Codex', `s.fight('cyclops'); return 1;`);
      await until(p, activeIs('Battle'));
      await wait(p, 700);
      await call(p, 'Battle', `s.startFight(); for (let i = 0; i < 20 * 6 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.hideBanner(); s.buildHud(); return 1;`);
      return wait(p, 600);
    },
  },
  {
    // BTL-01 (BTL-1): paused with an auto-pause banner up, the boss bar stays in sight above it
    id: 'battle-beast-paused',
    owner: 'A',
    run: async (p) => {
      await start(p, 'Codex');
      await wait(p, 600);
      await call(p, 'Codex', `s.fight('cyclops'); return 1;`);
      await until(p, activeIs('Battle'));
      await wait(p, 700);
      await call(p, 'Battle', `s.startFight(); for (let i = 0; i < 20 * 6 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.buildHud(); s.showBanner('Contact!', 0); return 1;`);
      return wait(p, 600);
    },
  },
  { id: 'online', owner: 'C', run: async (p) => (await start(p, 'Online'), wait(p, 1800)) },
  // The war-table hex map on the local demo shard (src/online/demoShard.ts): HUD, hex panel states, dialogs.
  ...[
    ['online-map', 'map'],
    ['online-hex-neutral', 'neutral'],
    ['online-hex-far', 'far'],
    ['online-hex-own', 'own'],
    ['online-hex-rival', 'rival'],
    ['online-hex-town', 'town'],
    ['online-march', 'march'],
    ['online-lobby', 'lobby'],
    ['online-challenge', 'challenge'],
    ['online-result', 'result'],
    ['online-join', 'join'],
    ['online-lair', 'lair'],
    ['online-lair-info', 'lairInfo'],
    ['online-boss', 'boss'],
    ['online-boss-info', 'bossInfo'],
    ['online-hex-market', 'market'],
    ['online-hex-post', 'post'],
    ['online-camp', 'camp'],
  ].map(([id, preview]) => ({
    id,
    owner: 'C',
    run: async (p) => {
      await start(p, 'Online', { preview });
      if (preview === 'camp') {
        // the camp preview opens the camp scene on the demo shard
        await until(p, activeIs('Camp'), 25000);
        await until(p, () => !!window.__game.scene.getScene('Camp').layout, 10000);
        return wait(p, 900);
      }
      await until(p, new Function(`const s = window.__game.scene.getScene('Online'); return ${preview === 'join' ? "s.sys.isActive()" : '!!s.map'};`), 8000);
      if (['neutral', 'far', 'own', 'rival', 'town', 'lair', 'lairInfo', 'boss', 'bossInfo', 'market', 'post'].includes(preview)) await until(p, () => !!window.__game.scene.getScene('Online').detail, 4000);
      if (preview === 'lairInfo' || preview === 'bossInfo') {
        // the info panel opens once the hex detail is in
        await wait(p, 300);
        await call(p, 'Online', `if (!s.modal && s.selected) s.openBeast(s.selected); return 1;`);
      }
      if (preview === 'march') {
        // the march answer shows a toast over the top bar: let it fade
        await until(p, () => !!window.__game.scene.getScene('Online').profile?.army.marching, 6000);
        await until(
          p,
          () => {
            const texts = [];
            const walk = (list) => list.forEach((o) => (o.text !== undefined && texts.push(o.text), o.list && walk(o.list)));
            walk(window.__game.scene.getScene('Online').children.list);
            return !texts.some((x) => /:.*\d+.*,/.test(x) && x.length > 18);
          },
          15000,
        );
        return wait(p, 400);
      }
      return wait(p, 900);
    },
  })),
  // The clan screen (src/scenes/online/ClanScene.ts) with a staged clan (the API is not reached).
  ...[
    ['online-clan', ''],
    ['online-clan-manage', 's.manage(s.clan.members[1]);'],
    ['online-clan-leave', 's.confirmLeave();'],
    ['online-clan-none', 's.clan = null; s.render();'],
  ].map(([id, after]) => ({
    id,
    owner: 'C',
    run: async (p) => {
      await start(p, 'OnlineClan', {});
      await wait(p, 600);
      await call(p, 'OnlineClan', `s.loaded = true; s.me = 1; s.role = 'leader'; s.clan = { id: 1, name: 'Sons of Lambda', tag: 'LMB', shard: 1, regions: 7, members: [{ id: 1, name: 'Leonidas', role: 'leader', joinedAt: 0, regions: 4 }, { id: 2, name: 'Brasidas', role: 'officer', joinedAt: 0, regions: 2 }, { id: 3, name: 'Myrto of Corinth', role: 'member', joinedAt: 0, regions: 1 }] }; s.render(); ${after} return 1;`);
      return wait(p, 500);
    },
  })),
  // Map merchants (src/scenes/online/MerchantScene.ts) on the demo shard: a town in reach with the clan's
  // discount, a trading post out of reach, the buy dialog and a piece of gear's card.
  ...[
    ['merchant-town', { demo: 'held', spot: 'market' }, ''],
    ['merchant-post', { demo: 'far', spot: 'post' }, ''],
    ['merchant-buy', { demo: 'held', spot: 'market' }, "const o = s.view.offers[1]; s.askBuy(o, s.offerName(o), o.price.gold, 'gold');"],
    ['merchant-item', { demo: 'far', spot: 'post' }, "s.showOffer(s.view.offers.find((o) => o.slot === 'rare'));"],
  ].map(([id, data, after]) => ({
    id,
    owner: 'C',
    run: async (p) => {
      await start(p, 'Merchant', data);
      await until(p, () => !!window.__game.scene.getScene('Merchant').view, 4000);
      await wait(p, 300);
      if (after) await call(p, 'Merchant', `${after} return 1;`);
      return wait(p, 500);
    },
  })),
  // ---- onboarding (owner F): first-run screens, the tutorial battle's narrator and spotlight, the online coach marks
  ...['offer', 'resume', 'modes'].map((mode) => ({ id: `first-run-${mode}`, owner: 'F', run: async (p) => (await start(p, 'FirstRun', { mode }), wait(p, 700)) })),
  {
    id: 'first-run-reward',
    owner: 'F',
    run: async (p) => (await start(p, 'FirstRun', { mode: 'reward', item: { uid: 'tr1', def: 'chalcidian', rarity: 'common', cond: 100 } }), wait(p, 1600)),
  },
  { id: 'first-run-skip', owner: 'F', run: async (p) => (await start(p, 'FirstRun', { mode: 'resume' }), await wait(p, 500), await call(p, 'FirstRun', 's.confirmSkip(); return 1;'), wait(p, 400)) },
  // tutorial steps: [screen, steps already learned (a resumed run starts at the first one not learned), start the battle]
  // (TUT-02: Undo comes back with the drag it takes back, Then… with its move; the later steps are in scripts/tutorial-smoke.mjs)
  ...[
    ['tutorial-intro', [], false],
    ['tutorial-select', ['intro'], false],
    ['tutorial-pan', ['intro', 'select'], false],
    ['tutorial-sling', ['intro', 'select', 'pan', 'zoom'], false],
    ['tutorial-fight', ['intro', 'select', 'pan', 'zoom', 'sling', 'undo'], false],
    ['tutorial-loose', ['intro', 'select', 'pan', 'zoom', 'sling', 'undo', 'fight'], true],
    ['tutorial-focus', ['intro', 'select', 'pan', 'zoom', 'sling', 'undo', 'fight', 'loose'], true],
    ['tutorial-play', ['intro', 'select', 'pan', 'zoom', 'sling', 'undo', 'fight', 'loose', 'focus'], true],
    ['tutorial-move', ['intro', 'select', 'pan', 'zoom', 'sling', 'undo', 'fight', 'loose', 'focus', 'play'], true],
  ].map(([id, done, fight]) => ({
    id,
    owner: 'F',
    run: async (p) => {
      await ev(p, (d) => {
        window.__state.campaign.data.settings.tutorial = { status: d.length ? 'active' : 'offer', done: d };
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { tutorial: {} }));
      }, done);
      await until(p, () => !!window.__game.scene.getScene('Battle')?.tutorial?.talking, 8000);
      if (fight) {
        await call(p, 'Battle', 's.startFight(); return 1;');
        await until(p, () => { const t = window.__game.scene.getScene('Battle').tutorial; return t.talking && t.step !== 'fight'; }, 15000);
      }
      await call(p, 'Battle', 's.tutorial.narrator.finishTyping(); return 1;');
      return wait(p, 600);
    },
  })),
  {
    id: 'tutorial-skip',
    owner: 'F',
    run: async (p) => {
      await ev(p, () => {
        window.__state.campaign.data.settings.tutorial = { status: 'active', done: ['intro'] };
        window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { tutorial: {} }));
      });
      await until(p, () => !!window.__game.scene.getScene('Battle')?.tutorial?.talking, 8000);
      await call(p, 'Battle', 's.tutorial.narrator.finishTyping(); s.tutorial.askSkip(); return 1;');
      return wait(p, 500);
    },
  },
  ...[
    ['home', 'map'],
    ['neighbour', 'map'],
    ['defenders', 'neutral'],
    ['march', 'neutral'],
    ['attack', 'neutral'],
    ['collect', 'map'],
    ['clan', 'map'],
  ].map(([coach, preview]) => ({
    id: `online-coach-${coach}`,
    owner: 'F',
    run: async (p) => {
      await start(p, 'Online', { preview, coach });
      await until(p, () => !!window.__game.scene.getScene('Online').map, 8000);
      if (preview === 'neutral') await until(p, () => !!window.__game.scene.getScene('Online').detail, 4000);
      return wait(p, 900);
    },
  })),
];

// ------------------------------------------------------------------ page setup

/**
 * Deterministic randomness so element ids are stable between runs: game seeds
 * (crypto) come from their own stream, re-seeded before every screen
 * (window.__reseed), apart from Math.random (effects, used every frame).
 */
function seededRandom() {
  const gen = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  };
  Math.random = gen(0x9e3779b9);
  let seeds = gen(0x51ed2701);
  window.__reseed = (n) => (seeds = gen(n));
  const orig = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (a) => {
    if (a instanceof Uint32Array || a instanceof Uint8Array || a instanceof Uint16Array || a instanceof Int32Array) {
      const max = a instanceof Uint8Array ? 256 : a instanceof Uint16Array ? 65536 : 4294967296;
      for (let i = 0; i < a.length; i++) a[i] = Math.floor(seeds() * max);
      return a;
    }
    return orig(a);
  };
}

async function runConfig(browser, cfg, screens) {
  const [W, H] = cfg.size;
  const { ctx, page, errors } = await timed('browser', async () => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => (window.__noFirstRun = true)); // no onboarding here (scripts/tutorial-smoke.mjs covers it)
    await ctx.addInitScript(seededRandom);
    if (!FIXED_WAITS) await installSettle(ctx);
    // a full-screen Telegram with the insets already reported
    if (cfg.insets === 'tg') await ctx.addInitScript(fakeTelegram, { insets: cfg.tg, fullscreen: 'launch', languageCode: 'en' });
    const page = await ctx.newPage();
    const errors = captureErrors(page, { ignoreNetwork: true });
    await apiDown(page);
    await page.route('**/telegram.org/**', (r) => r.abort());
    return { ctx, page, errors };
  });
  const url = `${base}${base.includes('?') ? '&' : '?'}lang=${cfg.lang}${cfg.insets === 'tg' ? '#tgWebAppVersion=8.0&tgWebAppPlatform=ios' : ''}`;
  // a busy machine can be slow to serve the first load: one more try
  await timed('load', () => page.goto(url, { timeout: 60000 }).catch(() => page.goto(url, { timeout: 60000 })));
  await timed('boot', () => until(page, () => !!window.__game && window.__game.scene.isActive('Menu'), 15000));
  // A fixed campaign, staged like the screenshot tour: more heroes, gold, perks; no one-time hints.
  await timed('stage', () => ev(page, async () => {
    const st = window.__state;
    st.campaign = st.campaign.constructor.fresh(20261006);
    st.hasSave = true;
    const c = st.campaign;
    c.data.settings.seenGestureHint = true;
    c.data.settings.seenHints = ['*'];
    c.data.gold = 2000;
    while (c.data.heroes.length < 9) c.recruit();
    c.data.heroes.forEach((h, i) => {
      h.group = i < 7 ? 0 : 1;
      h.level = i < 4 ? 6 : 2;
    });
    c.data.gold = 240;
    // a stash with every slot and rarity (stash, compare, market screens)
    const defs = ['bronze_dory', 'falcata', 'cretan_bow', 'aspis', 'celtic_shield', 'corinthian', 'chalcidian', 'scale', 'mail', 'laurel', 'owl_amulet', 'xiphos', 'pilos', 'leather'];
    const rar = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    c.data.stash = defs.map((def, i) => ({ uid: `lc${i}`, def, rarity: rar[i % 5], cond: 100 - ((i * 17) % 60) }));
    await st.save();
  }));
  const results = [];
  for (const sc of screens) {
    let violations = [];
    let elements = 0;
    let error = null;
    try {
      await ev(page, (n) => window.__reseed(n), [...sc.id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7));
      const w0 = T.waits;
      await timed('staging', () => sc.run(page));
      T.staging -= T.waits - w0; // staging is the screen's own work, its waits are counted apart
      // let finite tweens end (a sheet sliding in, a fade): on a slow software renderer they can
      // outlast the screen's fixed wait, and a half-open sheet reads as "outside the safe area"
      await timed('settle', () => until(page, () => window.__game.scene.getScenes(true).every((s) => s.tweens.getTweens().every((t) => !t.isPlaying() || t.loop === -1 || t.data.some((d) => d.repeat === -1))), 3000));
      // let tooltips / toasts from staging fade, then measure
      const r = await timed('check', () => ev(page, () => {
        const x = window.__layout.check();
        return { violations: x.violations, elements: x.elements.length, scenes: window.__game.scene.getScenes(true).map((s) => s.scene.key) };
      }));
      violations = r.violations;
      elements = r.elements;
      const dir = join(outDir, `${cfg.lang}-${cfg.insets}`, `${W}x${H}`);
      if (!flag('no-shots'))
        await timed('shots', () => {
          mkdirSync(dir, { recursive: true });
          return page.screenshot({ path: join(dir, `${sc.id}.png`) });
        });
      // Scroll every list to its end and check the rest of the content too.
      await timed('scroll', async () => {
        if (!(await ev(page, () => window.__layout.scrollAll(1e6)))) return;
        await (FIXED_WAITS ? page.waitForTimeout(250) : settle(page, 250));
        const r2 = await ev(page, () => window.__layout.check().violations);
        const seen = new Set(violations.map((v) => [v.check, ...v.ids].join('|')));
        for (const v of r2) if (!seen.has([v.check, ...v.ids].join('|'))) violations.push(v);
        if (!flag('no-shots')) await page.screenshot({ path: join(dir, `${sc.id}-end.png`) });
        await ev(page, () => window.__layout.scrollAll(0));
      });
    } catch (e) {
      error = String(e && e.message ? e.message : e).split('\n')[0];
    }
    results.push({ screen: sc.id, owner: sc.owner, violations, elements, error });
  }
  await timed('browser', () => ctx.close());
  return { cfg, results, errors };
}

// ------------------------------------------------------------------ which screens

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
/** Files changed since the merge base with `ref` (default v6, else main), uncommitted and untracked ones included, with their diffs. */
function changedFiles(ref) {
  const refs = ref ? [ref] : ['v6', 'main'];
  const found = refs.find((r) => {
    try {
      git('rev-parse', '--verify', '--quiet', `${r}^{commit}`);
      return true;
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`--changed: no ref ${refs.join(' or ')}`);
  const mb = git('merge-base', 'HEAD', found).trim();
  const paths = [...new Set([...git('diff', '--name-only', mb).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))];
  return { ref: found, files: paths.map((path) => ({ path, diff: path.startsWith('scripts/layout-allowlist/') ? git('diff', mb, '--', path) : '' })) };
}
/** Every src/ file's text, by repository-relative path. */
function sourceTexts() {
  const out = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.set(relative(root, p).split('\\').join('/'), readFileSync(p, 'utf8'));
    }
  };
  walk(join(root, 'src'));
  return out;
}

// opt-in screens (art previews) run only when named
const DEFAULT_SCREENS = SCREENS.filter((s) => !s.optIn);
const byId = new Map(SCREENS.map((s) => [s.id, s]));
const pick = (ids) => ids.map((id) => byId.get(id));
for (const id of QUICK.smoke) if (!byId.has(id)) throw new Error(`QUICK.smoke names ${id}, which is not a screen`);
const onlyScreens = opt('scenes', opt('screens', ''));
const named = onlyScreens ? matchScreens(DEFAULT_SCREENS.map((s) => s.id), onlyScreens, SCREENS.filter((s) => s.optIn).map((s) => s.id)) : null;
let screens = named ? pick(named) : DEFAULT_SCREENS;
/** Per size, extra screens to run there only (--quick's smoke subset). */
const extraAt = new Map();
if (CHANGED !== undefined) {
  const { ref, files } = changedFiles(CHANGED);
  const sources = sourceTexts();
  const known = [...new Set([...sources.values()].map((t) => /\bsuper\(\s*'([A-Z]\w*)'\s*\)/.exec(t)?.[1]).filter(Boolean))];
  const helpers = { battle: battle.toString(), results: results.toString(), codexMet: codexMet.toString() };
  // --changed alone narrows --scenes; --quick adds the named screens to the changed ones
  const pool = QUICK_MODE ? DEFAULT_SCREENS : screens;
  const hit = screensForChanges(files, sources, pool.map((s) => ({ id: s.id, keys: sceneKeysOf(s.run.toString(), helpers, known) })));
  console.log(`--changed: ${files.length} files changed since the merge base with ${ref}; ${hit.all ? `every screen (${hit.why})` : `${hit.ids.length} screens${hit.ids.length ? `: ${hit.ids.join(', ')}` : ''}`}`);
  if (!QUICK_MODE) screens = pick(hit.ids);
  else {
    // a change that reaches every screen: the smoke subset at every size instead (the full matrix is the integrator's)
    const ids = new Set([...(hit.all ? QUICK.smoke : hit.ids), ...(named ?? [])]);
    if (hit.all) console.log(`--quick: the change reaches every screen, so this runs the smoke subset at every size${named ? ' plus --scenes' : ''}; name the screens you changed with --scenes, and the integrator runs the full matrix`);
    screens = SCREENS.filter((s) => ids.has(s.id));
    for (const size of QUICK.sizes) extraAt.set(size, pick(QUICK.smoke.filter((id) => !ids.has(id))));
  }
}
const screensAt = (size) => [...screens, ...(extraAt.get(size) ?? [])];

// ------------------------------------------------------------------ run

const configs = configsFor(SIZES, LANGS, INSETS).filter((c) => screensAt(c.size.join('x')).length);
if (SHARDS > 1) configs.splice(0, configs.length, ...configs.filter((_, k) => k % SHARDS === SHARD - 1));
if (!configs.length) {
  console.log('No screens to check.\nLAYOUT CHECK PASSED');
  process.exit(0);
}
if (flag('list')) {
  for (const size of [...new Set(configs.map((c) => c.size.join('x')))]) console.log(`${size} (${configs.filter((c) => c.size.join('x') === size).length} configs): ${screensAt(size).map((s) => s.id).join(', ')}`);
  console.log(`${configs.length} configs, ${configs.reduce((a, c) => a + screensAt(c.size.join('x')).length, 0)} screen visits`);
  process.exit(0);
}
// work units: a configuration and a contiguous run of screens (each unit is a fresh context)
const units = [];
const skipped = [];
for (const cfg of configs) {
  const crash = (s) => KNOWN_CRASHES[`${s.id}@${cfg.size.join('x')}/${cfg.insets}`];
  const here = screensAt(cfg.size.join('x'));
  for (const s of here.filter(crash)) skipped.push(`${cfg.lang}-${cfg.insets}-${cfg.size.join('x')} ${s.id}: ${crash(s)}`);
  const list = here.filter((s) => !crash(s));
  const per = Math.ceil(list.length / SPLIT);
  for (let c = 0; c < SPLIT; c++) if (c * per < list.length) units.push({ cfg, screens: list.slice(c * per, (c + 1) * per), part: c });
}

/** Runs the units on one browser, JOBS contexts at a time; `log` prints each unit's line. */
async function runAll(list, log = true) {
  const browser = await launch();
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(JOBS, list.length) }, async () => {
      while (next < list.length) {
        const u = list[next++];
        const t = Date.now();
        const r = await runConfig(browser, u.cfg, u.screens);
        r.ms = Date.now() - t;
        out.push(r);
        const n = r.results.reduce((a, x) => a + x.violations.length, 0);
        if (log) console.log(`${u.cfg.lang} ${u.cfg.insets} ${u.cfg.size.join('x')}${SPLIT > 1 ? ` part ${u.part + 1}/${SPLIT}` : ''}: ${u.screens.length} screens, ${n} violations${r.errors.length ? `, ${r.errors.length} page errors` : ''}`);
      }
    }),
  );
  await browser.close();
  return out;
}

const t0 = Date.now();
const runs = await runAll(units);
if (flag('timing')) {
  const total = Object.values(T).reduce((a, b) => a + b, 0);
  console.log(`\nWhere the time went (context seconds, summed over ${units.length} contexts; wall ${Math.round((Date.now() - t0) / 1000)} s, ${FIXED_WAITS ? 'fixed waits' : 'state waits'}):`);
  for (const [k, ms] of Object.entries(T)) console.log(`  ${k.padEnd(8)} ${String(Math.round(ms / 1000)).padStart(6)} s  ${String(Math.round((100 * ms) / total)).padStart(3)} %`);
}

// ------------------------------------------------------------------ compare with the allowlist

const keyOf = (screen, v) => [screen, v.check, ...v.ids].join('|');
const sizeOf = (cfg) => cfg.size.join('x');
const tagOf = (cfg) => `${cfg.lang}-${cfg.insets}-${sizeOf(cfg)}`;
const found = new Map(); // key -> { owner, screen, configs: [], sizes: Set, detail }
const pageErrors = [];
const screenErrors = [];
for (const r of runs) {
  const tag = tagOf(r.cfg);
  for (const e of r.errors) pageErrors.push(`${tag}: ${e}`);
  for (const x of r.results) {
    if (x.error) screenErrors.push(`${tag} ${x.screen}: ${x.error}`);
    for (const v of x.violations) {
      const k = keyOf(x.screen, v);
      if (!found.has(k)) found.set(k, { owner: x.owner, screen: x.screen, configs: [], sizes: new Set(), detail: v.detail });
      found.get(k).configs.push(tag);
      found.get(k).sizes.add(sizeOf(r.cfg));
    }
  }
}
// every violation with the configurations it showed in: two runs compare with a plain diff
writeFileSync(join(outDir, 'found.json'), JSON.stringify(Object.fromEntries([...found].sort().map(([k, x]) => [k, x.configs.sort()])), null, 1) + '\n');
const allowed = loadAllowlist(allowDir);
/** New violations: `key@WxH` for every size a key shows at without an allowlist entry. */
let fresh = [...found].flatMap(([k, x]) => [...x.sizes].filter((size) => !allows(allowed, k, size)).map((size) => `${k}@${size}`)).sort();
const flaky = [];
if (fresh.length && !flag('update-allowlist') && !flag('no-retry')) {
  // Timing differs on slow machines (CI): a new violation only counts when the
  // same screen in the same configuration shows it again on a second run.
  const redo = new Map();
  for (const e of fresh) {
    const { key, size } = splitEntry(e);
    for (const tag of found.get(key).configs.filter((t) => t.endsWith(`-${size}`))) {
      if (!redo.has(tag)) redo.set(tag, { cfg: configs.find((c) => tagOf(c) === tag), ids: new Set() });
      redo.get(tag).ids.add(found.get(key).screen);
    }
  }
  const again = new Set();
  for (const r of await runAll([...redo.values()].map(({ cfg, ids }) => ({ cfg, screens: SCREENS.filter((s) => ids.has(s.id)) })), false))
    for (const x of r.results) for (const v of x.violations) again.add(`${keyOf(x.screen, v)}@${sizeOf(r.cfg)}`);
  flaky.push(...fresh.filter((e) => !again.has(e)));
  fresh = fresh.filter((e) => again.has(e));
}
const ran = {
  screens: new Set(configs.flatMap((c) => screensAt(sizeOf(c)).map((s) => s.id))),
  sizes: new Set(configs.map(sizeOf)),
  pairs: new Set(configs.flatMap((c) => screensAt(sizeOf(c)).map((s) => `${s.id}@${sizeOf(c)}`))),
};
const stale = staleEntries(allowed, found, ran);

if (flag('update-allowlist')) {
  const owners = Object.fromEntries(SCREENS.map((s) => [s.id, s.owner]));
  const out = rewriteAllowlist(allowed, found, ran, owners);
  mkdirSync(allowDir, { recursive: true });
  for (const story of [...new Set([...allowed.values(), ...Object.keys(out)])].sort()) {
    const file = join(allowDir, `${story}.json`);
    const entries = out[story] ?? [];
    // a story's file goes when its list is empty: the lists only shrink
    if (!entries.length) {
      if (existsSync(file)) unlinkSync(file);
      continue;
    }
    const doc = `Known layout violations owned by ${story} (scripts/layout-check.mjs, docs/UI_KIT.md "Layout check"). Fix them and remove the entries; delete this file when it is empty. Keys: screen|check|element ids, or screen|check|* for the whole screen (text-size only); a trailing @WxH scopes an entry to one size.`;
    writeFileSync(file, JSON.stringify({ _doc: doc, entries }, null, 2) + '\n');
  }
  console.log(`allowlist written: ${Object.entries(out).map(([st, e]) => `${st} ${e.length}`).join(', ') || 'empty'}`);
}

// ------------------------------------------------------------------ per-size summary

const SIZE_LIST = [...ran.sizes];
const freshSet = new Set(fresh);
/** Per size: screens (summed over configurations) clean, with only allowlisted violations (known), or failed; context seconds. */
const perSize = Object.fromEntries(SIZE_LIST.map((size) => [size, { configs: configs.filter((c) => sizeOf(c) === size).length, s: 0, clean: 0, known: 0, failed: 0 }]));
for (const r of runs) {
  const size = sizeOf(r.cfg);
  const row = perSize[size];
  row.s += r.ms / 1000;
  for (const x of r.results) {
    const keys = x.violations.map((v) => `${keyOf(x.screen, v)}@${size}`);
    if (x.error || keys.some((k) => freshSet.has(k))) row.failed++;
    else if (keys.length) row.known++;
    else row.clean++;
  }
}
const groupOf = (size) => Object.keys(MATRIX).find((g) => g !== 'all' && MATRIX[g].includes(size)) ?? '-';

// ------------------------------------------------------------------ index

const counts = {};
for (const r of runs)
  for (const x of r.results) {
    counts[x.screen] ??= {};
    counts[x.screen][`${r.cfg.lang}-${r.cfg.insets}`] = (counts[x.screen][`${r.cfg.lang}-${r.cfg.insets}`] ?? 0) + x.violations.length;
  }
const variants = [];
for (const lang of LANGS) for (const insets of INSETS) variants.push(`${lang}-${insets}`);
const md = [
  '# Layout check',
  '',
  'Generated by `node scripts/layout-check.mjs` (see docs/UI_KIT.md). Screenshots are written next to this file',
  '(`<lang>-<plain|tg>/<W>x<H>/<screen>.png`; CI uploads them as the `layout-<size>` artifacts).',
  '',
  `Sizes: ${SIZE_LIST.join(', ')}. Telegram insets (phones only): portrait top ${TG.safeTop} + ${TG.contentTop}, bottom ${TG.safeBottom}; 844x390 sides 59, top 46, bottom 21.`,
  '',
  '## Per size',
  '',
  'Screens summed over languages and safe-area variants: clean, only allowlisted violations (known), failed (a new violation or a staging error). Seconds are browser-context time.',
  '',
  '| Size | Group | Configs | Clean | Known | Failed | Seconds |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...SIZE_LIST.map((size) => {
    const r = perSize[size];
    return `| ${size} | ${groupOf(size)} | ${r.configs} | ${r.clean} | ${r.known} | ${r.failed} | ${Math.round(r.s)} |`;
  }),
  '',
  '## Violations per screen (all sizes)',
  '',
  `| Screen | Owner | ${variants.join(' | ')} |`,
  `| --- | --- | ${variants.map(() => '---').join(' | ')} |`,
  ...SCREENS.filter((s) => counts[s.id]).map((s) => `| ${s.id} | ${storyOf(s.id) ?? s.owner} | ${variants.map((v) => counts[s.id][v] ?? '-').join(' | ')} |`),
  '',
  `Distinct violations: ${found.size}; new (key@size): ${fresh.length}.`,
  '',
];
writeFileSync(join(outDir, 'index.md'), md.join('\n'));

// ------------------------------------------------------------------ report

const verbose = flag('verbose');
const show = (e) => {
  const { key, size } = splitEntry(e);
  const f = found.get(key);
  const cfgs = size ? f.configs.filter((t) => t.endsWith(`-${size}`)) : f.configs;
  return `  ${e}  [${cfgs.length} configs, e.g. ${cfgs[0]}]${verbose ? `\n      ${f.detail}` : ''}`;
};
if (verbose) {
  console.log('\nAll violations:');
  for (const k of [...found.keys()].sort()) console.log(show(k));
}
if (flaky.length) {
  console.log('\nSeen once but not on a second run (timing; ignored):');
  for (const k of flaky) console.log(show(k));
}
if (stale.length) {
  console.log('\nFixed but still allowlisted (remove from scripts/layout-allowlist/<story>.json):');
  for (const k of stale) console.log(`  ${k}  (${allowed.get(k)})`);
}
if (skipped.length) {
  console.log('\nKnown crashes, skipped (KNOWN_CRASHES in scripts/lib/layoutMatrix.mjs; the owner fixes them):');
  for (const s of skipped) console.log(`  ${s}`);
}
if (pageErrors.length) {
  console.log('\nPage errors:');
  for (const e of [...new Set(pageErrors)].slice(0, 20)) console.log(`  ${e}`);
}
if (screenErrors.length) {
  console.log('\nScreens that failed to stage:');
  for (const e of screenErrors.slice(0, 20)) console.log(`  ${e}`);
}
const failNew = fresh.length > 0 && !flag('update-allowlist');
if (failNew) {
  console.log(`\nNEW layout violations (not in the allowlist): ${fresh.length}`);
  for (const k of fresh) console.log(show(k));
}
console.log('\nPer size (screens: clean / known / failed; context seconds):');
for (const size of SIZE_LIST) {
  const r = perSize[size];
  console.log(`  ${size.padEnd(9)} ${groupOf(size).padEnd(9)} ${String(r.clean).padStart(4)} / ${String(r.known).padStart(4)} / ${String(r.failed).padStart(4)}   ${Math.round(r.s)} s`);
}
console.log(`\n${configs.length} configs${SHARDS > 1 ? ` (shard ${SHARD}/${SHARDS})` : ''} x ${screens.length} screens${extraAt.size ? ` (+ the smoke subset at ${QUICK.sizes.join(', ')})` : ''} in ${Math.round((Date.now() - t0) / 1000)} s; ${found.size} distinct violations, ${fresh.length} new.`);
const failed = failNew || pageErrors.length > 0 || screenErrors.length > 0;
console.log(failed ? 'LAYOUT CHECK FAILED' : 'LAYOUT CHECK PASSED');
process.exit(failed ? 1 : 0);
