// Online features without a real backend or Telegram: a fake Telegram.WebApp and
// mocked /api/* routes. Checks that the game stays playable when the API is down
// (503 / unreachable), then walks the Stars purchase flow and opens the shop (saves
// shots/20-shop.png, git-ignored) against mocked routes.
// Platform modes (scripts/lib/platform.mjs): `telegram` is all of the above (the fake WebApp signs in);
// `web` is a plain web page, signed out: the campaign plays offline and saves locally, the shop
// says "Sign in to play online" (AU-01), and nothing is requested from telegram.org.
// Usage: node scripts/online-smoke.mjs <baseUrl> [outDir] [--platform telegram|web|both]   (needs a running dev/preview server)
import { launch, phoneContext, captureErrors, makePageApi, check, finish, shotsDir, until } from './lib/harness.mjs';
import { fakeTelegram } from './lib/fakeTelegram.mjs';
import { cliArgs, platformMode, applyPlatform, checkPlatform, noTelegramRequests } from './lib/platform.mjs';

const cli = cliArgs(process.argv.slice(2), 'scripts/online-smoke.mjs');
const platform = await platformMode(import.meta.url, cli);
const base = cli.base;
const out = shotsDir('', cli.args.find((a) => !a.startsWith('--')));
if (platform === 'web') await webRun();

/** The web, signed out (see the header); ends the process. */
async function webRun() {
  const browser = await launch();
  const ctx = await phoneContext(browser);
  const plat = await applyPlatform(ctx, 'web');
  const page = await ctx.newPage();
  const netErrors = [];
  const errors = captureErrors(page, { ignoreNetwork: true, network: netErrors });
  // no session cookie: whatever the client asks the API, it is signed out, except the public catalogue
  // (the web can sign in since V6-ACCT-05, so the shop reads it before it finds no session)
  await page.route('**/api/**', (r) =>
    /\/api\/economy\/catalog$/.test(new URL(r.request().url()).pathname)
      ? r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      : r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":"unauthorized","message":"signed out"}}' }),
  );
  const { ev, active, sceneText } = makePageApi(page);
  const startAll = (k) => ev((key) => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start(key, {})), k);
  await page.goto(base, { timeout: 60000 });
  check('[web] menu reached', await until(() => active('Menu'), 60000));
  await checkPlatform(page, 'web');
  const on = await ev(() => ({ status: window.__online.status, id: window.__online.playerId }));
  check('[web] signed out: no player, the save stays local', on.id === null && on.status === 'local', JSON.stringify(on));
  await ev(() => window.__game.scene.getScene('Menu').openShop());
  // GATE02-B1 (fixed): the shop used to stay on "Opening the shop..." here; signed out it shows AU-01
  const gate = await until(async () => (await ev(() => window.__game.scene.isActive('Shop') && window.__game.scene.getScene('Shop').st === 'outside')) && /sign in to play online/i.test(await sceneText('Shop')), 15000);
  check('[web] the shop says "Sign in to play online"', gate, (await sceneText('Shop').catch(() => '')).slice(-60));
  await startAll('Menu');
  await until(() => active('Menu'), 15000);
  await ev(() => window.__game.scene.getScene('Menu').continueCampaign());
  check('[web] the offline campaign: world map playable', await until(() => active('World'), 30000));
  await startAll('Menu');
  await until(() => active('Menu'), 15000);
  await ev(() => window.__state.save());
  check('[web] saved locally', await until(() => ev(() => (window.__state.campaign.data.seq ?? 0) >= 1 && Object.keys(localStorage).length > 0), 10000));
  check('[web] no console/page errors', errors.length === 0, errors.join(' | '));
  noTelegramRequests(plat);
  await finish({ browser });
}

async function session(name, routeApi) {
  const browser = await launch();
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  // The browser itself logs failed HTTP requests; those are expected here (kept apart in netErrors).
  const netErrors = [];
  const errors = captureErrors(page, { ignoreNetwork: true, network: netErrors });
  // launch data, CloudStorage in memory, invoices "paid"
  await ctx.addInitScript(fakeTelegram, { invoices: true });
  await page.route('**/api/**', routeApi);
  await page.goto(base);
  await page.waitForTimeout(3000);
  return { browser, page, errors, netErrors, name };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
/** All bitmap text currently in a scene (nested containers included). */
const sceneText = (page, k) => makePageApi(page).sceneText(k);
const active = (page, k) => makePageApi(page).active(k);

// ---- 1. API configured but down (current production state) and API unreachable
for (const mode of ['503', 'abort']) {
  const s = await session(mode, (route) =>
    mode === 'abort'
      ? route.abort('connectionrefused')
      : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_configured', message: 'database not configured' } }) }),
  );
  const { page } = s;
  check(`[${mode}] menu reached`, await active(page, 'Menu'));
  check(`[${mode}] sync status offline`, (await ev(page, () => window.__online.status)) === 'offline');
  await ev(page, () => window.__game.scene.getScene('Menu').openShop());
  await page.waitForTimeout(1200);
  const shopText = await sceneText(page, 'Shop');
  check(`[${mode}] shop says closed / unreachable`, (await active(page, 'Shop')) && (mode === '503' ? shopText.includes('THE MARKET IS CLOSED') : shopText.includes('CANNOT REACH THE SERVER')), shopText.slice(0, 80));
  await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Menu')));
  await page.waitForTimeout(600);
  await ev(page, () => window.__game.scene.getScene('Menu').continueCampaign());
  await page.waitForTimeout(1500);
  check(`[${mode}] world map playable`, await active(page, 'World'));
  await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Menu')));
  await page.waitForTimeout(800);
  await ev(page, () => window.__state.save());
  await page.waitForTimeout(500);
  check(`[${mode}] saved locally (CloudStorage)`, (await ev(page, () => window.__state.campaign.data.seq ?? 0)) >= 1);
  check(`[${mode}] no console/page errors`, s.errors.length === 0, s.errors.join(' | '));
  console.log(`  (${s.netErrors.length} browser network-failure log lines, expected)`);
  await s.browser.close();
}

// ---- 2. Working API: sync + legacy Stars entitlement + the shop
let owned = false;
let saveRev = 0;
const econ = {
  drachmae: 120,
  inventory: { morale_wine: 1 },
  bought: 0,
};
const consumable = (id, name, use, gold, drachmae, dailyCap) => ({ id, name, desc: `${name} for the smoke test.`, use, gold, drachmae, dailyCap, effect: {} });
const catalog = {
  packs: [{ id: 'drachmae_100', stars: 100, drachmae: 100 }],
  cosmetics: [{ id: 'emblem_owl', slot: 'emblem', name: 'Owl of Athena', drachmae: 60 }],
  slots: ['emblem'],
  consumables: [consumable('morale_wine', 'Morale wine', 'battle', 80, 15, 3), consumable('healing_salve', 'Healing salve', 'heal', 60, 10, 3)],
  pass: { premiumDrachmae: 500, xpPerTier: 100, xp: {}, tiers: [{ tier: 1, xp: 100, free: { kind: 'gold', amount: 45 }, premium: { kind: 'drachmae', amount: 15 } }] },
  market: { feeRate: 0.1, listingHours: 48, maxOpenListings: 20, priceBounds: { gold: { default: [2, 100000] }, drachmae: { default: [2, 10000] } }, resources: ['food', 'wood', 'bronze'] },
};
const profile = () => ({
  season: { id: 1, startedAt: 0, endsAt: Date.now() + 864e5 }, now: Date.now(),
  resources: { gold: 500, food: 100, wood: 50, bronze: 20, recruits: 2 }, energy: 80, energyMax: 100,
  formations: [], heroes: [], stash: [], clan: null, battles: 0, wins: 0,
});
const s = await session('ok', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  switch (`${req.method()} ${url.pathname}`) {
    case 'POST /api/auth/telegram':
      return json(200, { token: 'pa2_test', expiresAt: 0, player: { id: 1, firstName: 'Ana' } });
    case 'GET /api/save':
      return json(200, { revision: saveRev, version: null, data: null, updatedAt: null });
    case 'PUT /api/save':
      return json(200, { revision: ++saveRev, updatedAt: Date.now() });
    case 'GET /api/shop/products':
      return json(200, {
        products: [{ id: 'supporter_banner', title: 'Supporter banner', description: 'A golden supporter banner for your army. Thank you for backing Pixelarrow!', stars: 5, kind: 'entitlement' }],
      });
    case 'POST /api/shop/invoice':
      setTimeout(() => (owned = true), 1200); // the webhook grant lands a bit later
      return json(200, { link: 'https://t.me/$invoice-test', productId: 'supporter_banner', stars: 5 });
    case 'GET /api/entitlements':
      return json(200, { entitlements: owned ? [{ productId: 'supporter_banner', grantedAt: Date.now() }] : [], purchases: [] });
    case 'GET /api/notify/settings':
    case 'PUT /api/notify/settings': // the time zone report after sign-in (bot quiet hours)
      return json(200, { types: [], quiet: true, tzOffset: 0, blocked: false });
    case 'GET /api/economy/catalog':
      return json(200, catalog);
    case 'GET /api/economy/wallet':
      return json(200, { drachmae: econ.drachmae, canSpend: true, ledger: [], cosmetics: [], loadout: {} });
    case 'GET /api/economy/pass':
      return json(200, { season: { id: 1, endsAt: Date.now() + 864e5 }, xp: 120, tier: 1, premium: false, premiumDrachmae: 500, xpPerTier: 100, claimed: [], tiers: catalog.pass.tiers });
    case 'GET /api/online/consumables':
      return json(200, { inventory: econ.inventory, day: '2026-10-07', caps: { morale_wine: { cap: 3, bought: econ.bought }, healing_salve: { cap: 3, bought: 0 } } });
    case 'GET /api/online/profile':
      return json(200, profile());
    case 'POST /api/telemetry/events':
      return json(200, { accepted: JSON.parse(req.postData() ?? '{}').events?.length ?? 0, rejected: [] });
    case 'POST /api/telemetry/errors':
      return json(200, { ok: true, stored: 0, dropped: 0 });
    case 'POST /api/telemetry/consent':
      return json(200, { analytics: JSON.parse(req.postData() ?? '{}').analytics });
    default:
      console.log('  unmocked', req.method(), url.pathname);
      return json(404, { error: { code: 'not_found', message: 'no route' } });
  }
});
const { page } = s;
await page.waitForTimeout(4500);
check('[ok] signed in and synced', (await ev(page, () => [window.__online.signedIn, window.__online.status].join())) === 'true,synced');
check('[ok] save uploaded', saveRev >= 1, `rev ${saveRev}`);
await ev(page, () => window.__game.scene.getScene('Menu').openShop());
await page.waitForTimeout(1500);
check('[ok] shop open with the catalogue, consumables point to the map merchants', (await active(page, 'Shop')) && (await sceneText(page, 'Shop')).includes('OWL OF ATH') && (await sceneText(page, 'Shop')).includes('MERCHANTS'));
await page.screenshot({ path: `${out}/20-shop.png` });
console.log('saved', `${out}/20-shop.png`);
const buy = await ev(page, () => window.__online.buy('supporter_banner'));
check('[ok] purchase granted', buy === 'granted', buy);
await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Army', { from: 'World' })));
await page.waitForTimeout(1200);
check('[ok] supporter cosmetics', await ev(page, () => window.__game.textures.exists('supporter_banner') && window.__online.has('supporter_banner')));
check('[ok] no console/page errors', s.errors.length === 0 && s.netErrors.length === 0, [...s.errors, ...s.netErrors].join(' | '));

// ---- 3. A live duel that ends from outside (opponent left / desync) while a group is selected:
// the battle's own timer hands over to the next scene in the middle of a frame.
await ev(page, () => {
  const g = window.__game;
  for (const sc of g.scene.getScenes(true)) g.scene.stop(sc.scene.key);
  g.scene.start('Battle', { fresh: true });
});
await until(() => active(page, 'Battle'), 30000);
await ev(page, () => {
  const g = window.__game;
  const b = g.scene.getScene('Battle');
  let gone = null;
  window.__duelGone = () => (gone = 'opponent_left');
  const source = {
    setup: JSON.parse(JSON.stringify(b.verifySetup)),
    heroes: [...window.__state.campaign.data.heroes, ...b.enemyHeroes],
    side: 0,
    label: 'vs Test',
    opponent: 'Test',
    lockstep: { attach() {}, issue() {}, ready() {}, canStep: () => true, beforeStep() {}, status: () => null, aborted: () => gone, opponentReady: () => false },
    onFinish() {
      for (const sc of g.scene.getScenes(true)) g.scene.stop(sc.scene.key);
      g.scene.start('Menu');
    },
    onLeave() {},
  };
  for (const sc of g.scene.getScenes(true)) g.scene.stop(sc.scene.key);
  g.scene.start('Battle', { source });
});
const duelUp = await until(() => ev(page, () => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').src?.lockstep), 30000);
await ev(page, () => {
  const b = window.__game.scene.getScene('Battle');
  b.selGroup = b.sim.groups.find((x) => x.side === b.me).id;
  window.__duelGone();
});
// The battle shows why it ends, then its own timer (2.2 s of Phaser time) hands over. That timer
// counts smoothed frame deltas: on a starved machine (frames over 200 ms) Phaser substitutes the
// last sane delta, so the wait stretches well past 2.2 s of wall time. Wait on the real steps.
const banner = await until(async () => (await sceneText(page, 'Battle')).includes('OPPONENT_LEFT'), 15000);
const handedOver = await until(
  () =>
    ev(page, () => {
      const g = window.__game;
      const m = g.scene.getScene('Menu');
      return !g.scene.isActive('Battle') && m.sys.isActive() && !m.cameras.cameras.some((c) => c.fadeEffect.isRunning);
    }),
  60000,
);
check('[duel] aborted duel leaves the battle', duelUp && banner && handedOver, `duel up ${duelUp}, banner ${banner}, menu ${handedOver}`);
await page.waitForTimeout(500);
check('[duel] no page errors after the hand-over', s.errors.length === 0, s.errors.join(' | '));
await finish({ browser: s.browser });
