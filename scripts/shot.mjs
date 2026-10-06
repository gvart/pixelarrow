// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [deviceScale]
import { chromium } from 'playwright';
const [url, out, w = '390', h = '844', wait = '1500', dsf = '2'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dsf, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: true });
console.log(logs.join('\n'));
await browser.close();
