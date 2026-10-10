// Preload hook for scripts/art/preview.mjs: makes every Playwright browser context serve candidate
// art in place of the game's own files, so the real game (and the layout check's real fixtures)
// render the staged asset without anything being written under public/.
// ART_OVERRIDES is JSON: { "<url path suffix the game loads, e.g. ui/banner_campaign.jpg>": "<absolute file>" }.
// Used as: node --import ./scripts/art/lib/override-hook.mjs scripts/layout-check.mjs ...
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const overrides = Object.entries(JSON.parse(process.env.ART_OVERRIDES || '{}'));
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', json: 'application/json' };

async function applyRoutes(ctx) {
  for (const [suffix, file] of overrides) {
    const body = readFileSync(file);
    const type = TYPES[file.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
    await ctx.route((url) => url.pathname.endsWith('/' + suffix), (route) => route.fulfill({ status: 200, contentType: type, body }));
  }
}

if (overrides.length) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...a) => {
    const browser = await launch(...a);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...o) => {
      const ctx = await newContext(...o);
      await applyRoutes(ctx);
      return ctx;
    };
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...o) => {
      const page = await newPage(...o);
      await applyRoutes(page.context());
      return page;
    };
    return browser;
  };
  console.log(`[art override] serving ${overrides.map(([s]) => s).join(', ')}`);
}
