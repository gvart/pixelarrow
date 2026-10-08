// Online features without a real backend or Telegram: a fake Telegram.WebApp and
// mocked /api/* routes. Checks that the game stays playable when the API is down
// (503 / unreachable), then walks the Stars purchase flow, opens the shop (saves
// docs/screenshots/20-shop.png) and buys a consumable from a map merchant against
// mocked routes.
// Usage: node scripts/online-smoke.mjs [baseUrl] [outDir]   (needs a running dev/preview server)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
};

/** Minimal Telegram.WebApp: launch data, CloudStorage in memory, invoices "paid". */
function fakeTelegram() {
  const store = new Map();
  window.Telegram = {
    WebApp: {
      initData: 'query_id=AA&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Ana%22%7D&auth_date=1&hash=00',
      initDataUnsafe: { user: { first_name: 'Ana' } },
      version: '8.0',
      platform: 'ios',
      colorScheme: 'dark',
      themeParams: {},
      isVersionAtLeast: () => true,
      ready() {},
      expand() {},
      setHeaderColor() {},
      setBackgroundColor() {},
      disableVerticalSwipes() {},
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
      CloudStorage: {
        getItem: (k, cb) => setTimeout(() => cb(null, store.get(k) ?? '')),
        setItem: (k, v, cb) => setTimeout(() => (store.set(k, v), cb?.(null, true))),
        removeItem: (k, cb) => setTimeout(() => (store.delete(k), cb?.(null, true))),
      },
      openInvoice: (link, cb) => setTimeout(() => cb(link.includes('invoice') ? 'paid' : 'failed'), 300),
    },
  };
}

async function session(name, routeApi) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => (window.__noFirstRun = true)); // no onboarding here (scripts/tutorial-smoke.mjs covers it)
  const page = await ctx.newPage();
  const errors = [];
  const netErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The browser itself logs failed HTTP requests; those are expected here.
    if (/Failed to load resource/.test(m.text())) netErrors.push(m.text());
    else errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await ctx.addInitScript(fakeTelegram);
  await page.route('**/api/**', routeApi);
  await page.goto(base);
  await page.waitForTimeout(3000);
  return { browser, page, errors, netErrors, name };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
/** All bitmap text currently in a scene (nested containers included). */
const sceneText = (page, k) =>
  ev(page, (key) => {
    const out = [];
    const walk = (list) => list.forEach((o) => (o.text !== undefined && out.push(o.text), o.list && walk(o.list)));
    walk(window.__game.scene.getScene(key).children.list);
    return out.join(' ').toUpperCase();
  }, k);
const active = (page, k) => ev(page, (key) => window.__game.scene.isActive(key), k);

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
  await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Online', {})));
  await page.waitForTimeout(1500);
  check(`[${mode}] online mode says unavailable`, (await sceneText(page, 'Online')).includes('ONLINE UNAVAILABLE'), (await sceneText(page, 'Online')).slice(0, 80));
  await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Menu')));
  await page.waitForTimeout(800);
  await ev(page, () => window.__state.save());
  await page.waitForTimeout(500);
  check(`[${mode}] saved locally (CloudStorage)`, (await ev(page, () => window.__state.campaign.data.seq ?? 0)) >= 1);
  check(`[${mode}] no console/page errors`, s.errors.length === 0, s.errors.join(' | '));
  console.log(`  (${s.netErrors.length} browser network-failure log lines, expected)`);
  await s.browser.close();
}

// ---- 2. Working API: sync + legacy Stars entitlement + a consumable bought from a map merchant
let owned = false;
let saveRev = 0;
const buys = [];
const econ = {
  drachmae: 120,
  inventory: { morale_wine: 1 },
  bought: 0,
  gold: 500,
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
const offer = (id, kind, ref, rarity, slot, gold, drachmae, dailyCap, bought) => ({ id, kind, ref, rarity, slot, gold, drachmae, dailyCap, price: { gold, drachmae }, bought });
const merchantView = () => ({
  loc: 7, kind: 'town', region: 'crete', day: '2026-10-07', now: Date.now(), resetsAt: Date.now() + 3 * 3600e3,
  reach: true, discount: false, discountRate: 0.1, holderCutRate: 0.05, holder: { id: 9, name: 'Kleon', you: false }, earned: 0,
  gold: econ.gold, drachmae: econ.drachmae,
  offers: [offer('c:morale_wine', 'consumable', 'morale_wine', 'rare', 'base', 80, 15, 3, econ.bought), offer('i:cretan_bow:uncommon', 'item', 'cretan_bow', 'uncommon', 'region', 225, null, 1, 0)],
});
const profile = () => ({
  season: { id: 1, startedAt: 0, endsAt: Date.now() + 864e5 }, shard: { id: 1, map: 'test30' }, now: Date.now(),
  resources: { gold: econ.gold, food: 100, wood: 50, bronze: 20, recruits: 2 }, energy: 80, energyMax: 100, home: 1,
  army: { loc: 1, marching: false, dest: null, arriveAt: null }, formations: [], heroes: [], stash: [], clan: null, battles: 0, wins: 0,
  income: { pending: { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 }, regions: 0 },
});
const s = await session('ok', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  switch (`${req.method()} ${url.pathname}`) {
    case 'POST /api/auth/telegram':
      return json(200, { token: 'pa1.test', expiresAt: 0, player: { id: 1, firstName: 'Ana' } });
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
    case 'GET /api/online/merchant/7':
      return json(200, merchantView());
    case 'POST /api/online/merchant/buy': {
      const body = JSON.parse(req.postData() ?? '{}');
      buys.push(body);
      if (body.offer !== 'c:morale_wine' || body.currency !== 'gold' || body.loc !== 7) return json(409, { error: { code: 'insufficient_funds', message: 'no' } });
      econ.gold -= 80;
      econ.bought++;
      econ.inventory.morale_wine = (econ.inventory.morale_wine ?? 0) + 1;
      return json(200, { order: { requestId: body.requestId, offer: body.offer, currency: 'gold', price: 80, discount: false, holderCut: 4, itemUid: null }, replayed: false, gold: econ.gold, drachmae: econ.drachmae });
    }
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
// a town merchant on the war map: buy a consumable with gold; the request carries an idempotency key and the screen redraws from the server
await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Merchant', { loc: 7, back: { scene: 'Menu' } })));
await page.waitForTimeout(1200);
check('[ok] merchant open with its stock', (await active(page, 'Merchant')) && (await sceneText(page, 'Merchant')).includes('MORALE WINE') && (await sceneText(page, 'Merchant')).includes('CRETAN BOW'));
const okBuy = await ev(page, () => {
  const m = window.__game.scene.getScene('Merchant');
  return m.buy(m.view.offers[0], 'Morale wine', 'gold');
});
await page.waitForTimeout(800);
check('[ok] consumable bought against the API', okBuy === true && buys.length === 1 && buys[0].offer === 'c:morale_wine' && buys[0].currency === 'gold' && /^[A-Za-z0-9_-]{8,64}$/.test(buys[0].requestId), JSON.stringify(buys));
check('[ok] merchant shows the new count and gold', (await sceneText(page, 'Merchant')).includes('TODAY 1/3') && (await sceneText(page, 'Merchant')).includes('420'));
await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Menu')));
await page.waitForTimeout(600);
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
await page.waitForTimeout(1500);
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
await page.waitForTimeout(1500);
await ev(page, () => {
  const b = window.__game.scene.getScene('Battle');
  b.selGroup = b.sim.groups.find((x) => x.side === b.me).id;
  window.__duelGone();
});
check('[duel] aborted duel leaves the battle', await (async () => {
  for (let i = 0; i < 20; i++) {
    if (await active(page, 'Menu')) return true;
    await page.waitForTimeout(250);
  }
  return false;
})());
await page.waitForTimeout(500);
check('[duel] no page errors after the hand-over', s.errors.length === 0, s.errors.join(' | '));
await s.browser.close();

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
