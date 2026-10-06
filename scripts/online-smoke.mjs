// Online features without a real backend or Telegram: a fake Telegram.WebApp and
// mocked /api/* routes. Checks that the game stays playable when the API is down
// (503 / unreachable), then walks the shop purchase flow and saves
// docs/screenshots/20-shop.png.
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
    return out.join(' ');
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
  await page.waitForTimeout(800);
  check(`[${mode}] shop shows closed`, (await sceneText(page, 'Menu')).includes('SHOP IS CLOSED'));
  await ev(page, () => window.__game.scene.getScene('Menu').continueCampaign());
  await page.waitForTimeout(1500);
  check(`[${mode}] world map playable`, await active(page, 'World'));
  await ev(page, () => window.__state.save());
  await page.waitForTimeout(500);
  check(`[${mode}] saved locally (CloudStorage)`, (await ev(page, () => window.__state.campaign.data.seq ?? 0)) >= 1);
  check(`[${mode}] no console/page errors`, s.errors.length === 0, s.errors.join(' | '));
  console.log(`  (${s.netErrors.length} browser network-failure log lines, expected)`);
  await s.browser.close();
}

// ---- 2. Working API: sync + shop purchase
let owned = false;
let saveRev = 0;
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
    default:
      return json(404, { error: { code: 'not_found', message: 'no route' } });
  }
});
const { page } = s;
await page.waitForTimeout(4500);
check('[ok] signed in and synced', (await ev(page, () => [window.__online.signedIn, window.__online.status].join())) === 'true,synced');
check('[ok] save uploaded', saveRev >= 1, `rev ${saveRev}`);
await ev(page, () => window.__game.scene.getScene('Menu').openShop());
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/20-shop.png` });
console.log('saved', `${out}/20-shop.png`);
const buy = await ev(page, () => window.__online.buy('supporter_banner'));
check('[ok] purchase granted', buy === 'granted', buy);
await ev(page, () => window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Army', { from: 'World' })));
await page.waitForTimeout(1200);
check('[ok] supporter cosmetics', await ev(page, () => window.__game.textures.exists('supporter_banner') && window.__online.has('supporter_banner')));
check('[ok] no console/page errors', s.errors.length === 0 && s.netErrors.length === 0, [...s.errors, ...s.netErrors].join(' | '));
await s.browser.close();

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
