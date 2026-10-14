// Stats check (V6-LAND-04). Serves dist/ itself and answers /api/public/v1/summary per case through
// Playwright, then asserts in Chromium:
//  1. Lazy: neither the stats module nor the summary is requested on the first view.
//  2. 200 with the fixture (src/fixtures/summary.v1.json): exactly one request; the counters, both
//     ledgers and the "as of" time equal the fixture's values exactly; ten ruled lines per ledger.
//  3. Count-up: a large total starts low and lands on the exact value; reduced motion shows it at once.
//  4. Names are text: a name holding markup renders as those characters, never as an element.
//  5. Empty state, no invented numbers: a 503, a failed request, a bad body, empty boards and small
//     totals all show "—" counters and "The war is just beginning…", with no digit anywhere in them.
//     One empty board alone keeps its ruled ledger with a one-line note.
//  6. Fixed slots: the ledgers are the same size before and after the rows arrive, and a deep link
//     with a slow answer records no layout shift; no horizontal overflow at 320, 390 and 1440.
// With SHOTS_DIR set, it saves the section filled and empty at the six widths.
//
// Usage (in landing/, after `npm run build`): npm run test:stats (STATS_TEST_PORT picks the port,
// default 6144). Playwright comes from the repository root's node_modules.
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const FIXTURE = JSON.parse(await readFile(new URL('../src/fixtures/summary.v1.json', import.meta.url), 'utf8'));
const PORT = Number(process.env.STATS_TEST_PORT ?? 6144);
const SHOTS = process.env.SHOTS_DIR;
const WIDTHS = [[320, 640], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4' };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok, no) => server.once('error', no).listen(PORT, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${PORT}/`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
const fmt = new Intl.NumberFormat('en-US').format;
const clone = () => structuredClone(FIXTURE);
const emptyBoards = (s) => Object.assign(s, { duels: { ...s.duels, live: [], async: [] }, war: { ...s.war, players: [], clans: [] } });

/** A page whose summary request is answered by `answer` ({status, body} | 'abort'); counts requests. */
async function open(browser, answer, { width = 1440, height = 900, hash = '', delay = 0, ...opts } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, ...opts });
  const hits = { summary: 0, module: 0 };
  page.on('pageerror', (e) => check(false, `no page error (${e.message})`));
  page.on('request', (r) => { if (/\/_astro\/stats-[^/]+\.js$/.test(r.url())) hits.module++; });
  await page.route('**/api/public/v1/summary', async (route) => {
    hits.summary++;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (answer === 'abort') return route.abort();
    await route.fulfill({
      status: answer.status,
      contentType: 'application/json',
      headers: answer.status === 503 ? { 'retry-after': '60' } : {},
      body: typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body),
    });
  });
  await page.goto(URL_ + hash, { waitUntil: 'load' });
  return { page, hits };
}
const toStats = async (page) => {
  await page.$eval('#leaderboards', (e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForSelector('#leaderboards:not(.is-loading) .stats__boards', { timeout: 5000 });
};
const settled = (page) => page.waitForTimeout(1600); // past the 1.1 s count-up
const tally = (page) => page.$$eval('#leaderboards .tally__n', (els) => els.map((e) => e.textContent));
const rows = (page, id) => page.$$eval(`#leaderboards table[aria-labelledby="${id}"] tbody tr`, (trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent)));

const browser = await chromium.launch();
try {
  // 1. Lazy
  for (const [width, height] of [[412, 823], [1440, 900]]) {
    const { page, hits } = await open(browser, { status: 200, body: FIXTURE }, { width, height });
    await page.waitForTimeout(1500);
    check(hits.module === 0 && hits.summary === 0, `${width}px: no stats module or summary request on the first view (${hits.module}, ${hits.summary})`);
    await page.close();
  }

  // 2. 200 with the fixture
  {
    const { page, hits } = await open(browser, { status: 200, body: FIXTURE });
    await toStats(page);
    await settled(page);
    check(hits.summary === 1 && hits.module === 1, `one module and one summary request (${hits.module}, ${hits.summary})`);
    const t = FIXTURE.totals;
    const got = await tally(page);
    check(got.join('|') === [t.players, t.onlineBattles, t.clans].map(fmt).join('|'), `counters equal the fixture's players, online battles and clans (${got.join(', ')})`);
    const labels = await page.$$eval('#leaderboards .tally__label', (els) => els.map((e) => e.textContent));
    check(labels.join() === 'Players,Online battles,Clans', `counter labels (${labels.join()})`);
    const duels = await rows(page, 'stats-duels');
    const wantDuels = FIXTURE.duels.live.map((r) => [String(r.rank), r.name, `${r.league[0].toUpperCase()}${r.league.slice(1)}${r.rating === null ? '' : ` ${fmt(r.rating)}`}`]);
    check(duels.length === 10, `the duelists ledger has ten lines (${duels.length})`);
    check(JSON.stringify(duels.slice(0, wantDuels.length)) === JSON.stringify(wantDuels), 'duelists: rank, name and league equal the fixture\'s live ladder (Legend with its rating)');
    check(duels.slice(wantDuels.length).every((r) => r.every((c) => c === '')), 'the lines past the last duelist are blank');
    const war = await rows(page, 'stats-war');
    const wantWar = FIXTURE.war.clans.map((r) => [String(r.rank), r.name, fmt(r.score), fmt(r.members)]);
    check(war.length === 10 && JSON.stringify(war.slice(0, wantWar.length)) === JSON.stringify(wantWar), 'war standings: rank, clan, score and members equal the fixture');
    const subs = await page.$$eval('#leaderboards .ledger__sub', (els) => els.map((e) => e.textContent));
    check(subs.join('|') === `Live ladder, season ${FIXTURE.duels.season.id}|Clans, season ${FIXTURE.war.season.id}`, `ledger captions name the season (${subs.join(' | ')})`);
    const d = new Date(FIXTURE.generatedAt);
    const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
    const lead = await page.$eval('#leaderboards .stats__lead', (e) => e.textContent);
    check(lead.includes(hhmm) && lead.startsWith('From the game server, updated every few minutes.'), `"as of" comes from generatedAt (${lead})`);
    check(await page.$('#leaderboards .stats__empty') === null, 'no empty state with data');
    const terra = await page.$$eval('#leaderboards a', (as) => as.filter((a) => getComputedStyle(a).backgroundColor === 'rgb(168, 67, 44)').length);
    check(terra === 0, 'the section adds no terracotta button');
    await page.close();
  }

  // 3. Count-up
  {
    const big = clone();
    Object.assign(big.totals, { players: 56789, onlineBattles: 123456, clans: 40 });
    const { page } = await open(browser, { status: 200, body: big });
    await page.$eval('#leaderboards', (e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => document.querySelector('#leaderboards .tally__n[data-value]')?.textContent !== '—');
    await page.waitForTimeout(250);
    const mid = await tally(page);
    check(Number(mid[0].replace(/,/g, '')) < 56789, `counters count up on view (players at ${mid[0]} mid-way)`);
    await settled(page);
    const end = await tally(page);
    check(end.join('|') === '56,789|123,456|40', `count-up lands on the exact values (${end.join(', ')})`);
    await page.close();
  }
  {
    const big = clone();
    Object.assign(big.totals, { players: 56789, onlineBattles: 123456, clans: 40 });
    const { page } = await open(browser, { status: 200, body: big }, { reducedMotion: 'reduce' });
    await toStats(page);
    const now = await tally(page);
    check(now.join('|') === '56,789|123,456|40', `reduced motion: the counters are static at their values (${now.join(', ')})`);
    const anim = await page.$eval('#leaderboards .ledger', (e) => getComputedStyle(e).animationName);
    check(anim === 'none', `reduced motion: no loading animation (${anim})`);
    await page.close();
  }

  // 4. Names are text
  {
    const evil = clone();
    const name = '<img src=x onerror="window.__pwned=1">';
    evil.duels.live[0].name = name;
    evil.war.clans[0].name = '<b>Clan</b>';
    const { page } = await open(browser, { status: 200, body: evil });
    await toStats(page);
    const duels = await rows(page, 'stats-duels');
    check(duels[0][1] === name, 'a name with markup shows as text');
    const els = await page.$$eval('#leaderboards img, #leaderboards b', (e) => e.length);
    const pwned = await page.evaluate(() => window.__pwned === 1);
    check(els === 0 && !pwned, `no element or script comes from a name (${els} elements)`);
    await page.close();
  }

  // 5. Empty states
  const small = clone();
  Object.assign(small.totals, { players: 4, onlineBattles: 2, clans: 1 });
  emptyBoards(small);
  const cases = [
    ['503 warming', { status: 503, body: { status: 'warming' } }],
    ['503 unavailable', { status: 503, body: { status: 'unavailable' } }],
    ['500', { status: 500, body: '' }],
    ['network failure', 'abort'],
    ['bad body', { status: 200, body: { v: 2 } }],
    ['empty boards and small totals', { status: 200, body: small }],
  ];
  for (const [label, answer] of cases) {
    const { page, hits } = await open(browser, answer);
    await toStats(page);
    await settled(page);
    const t = await tally(page);
    check(t.every((v) => v === '—'), `${label}: counters show "—" (${t.join(', ')})`);
    const empty = await page.$eval('#leaderboards .stats__empty', (e) => e.textContent).catch(() => '');
    check(empty.includes('The war is just beginning…') && empty.includes('Play in browser'), `${label}: the empty state invites the visitor to play`);
    // the lead may carry the snapshot's real "as of" time; nothing else may hold a digit
    const text = await page.$eval('#leaderboards', (e) => [...e.querySelectorAll('.stats__tally, .stats__boards')].map((x) => x.textContent).join(' '));
    check(!/\d/.test(text), `${label}: no number in the counters or the boards`);
    check(await page.$('#leaderboards table') === null, `${label}: no ledger rows`);
    check(hits.summary === 1, `${label}: one request, no retry (${hits.summary})`);
    await page.close();
  }
  {
    const s = clone();
    Object.assign(s.totals, { players: 300, onlineBattles: 4000, clans: 12 });
    emptyBoards(s);
    const { page } = await open(browser, { status: 200, body: s });
    await toStats(page);
    await settled(page);
    const t = await tally(page);
    check(t.join('|') === '300|4,000|12' && (await page.$('#leaderboards .stats__empty')) !== null, `empty boards with real totals: the totals show, the boards show the empty state (${t.join(', ')})`);
    await page.close();
  }
  {
    const s = clone();
    s.duels.live = [];
    s.duels.async = [];
    const { page } = await open(browser, { status: 200, body: s });
    await toStats(page);
    const duels = await rows(page, 'stats-duels');
    const note = await page.$eval('#leaderboards .ledger__none', (e) => e.textContent);
    const war = await rows(page, 'stats-war');
    check(duels.length === 10 && duels.every((r) => r.every((c) => c === '')) && note === 'No ranked duelists yet this season.', 'one empty board: blank ruled ledger with a one-line note');
    check(war[0][1] === s.war.clans[0].name, 'the other board still shows its rows');
    await page.close();
  }
  {
    const s = clone();
    s.duels.live = [];
    const { page } = await open(browser, { status: 200, body: s });
    await toStats(page);
    const duels = await rows(page, 'stats-duels');
    const sub = await page.$eval('#leaderboards .ledger__sub', (e) => e.textContent);
    check(duels[0][1] === s.duels.async[0].name && sub.startsWith('Async ladder'), `an empty live ladder falls back to the async ladder (${sub})`);
    await page.close();
  }

  // 6. Fixed slots and layout
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const { page } = await open(browser, { status: 200, body: FIXTURE }, { width, height, delay: 800 });
    await page.$eval('#leaderboards', (e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForSelector('#leaderboards.is-loading .ledger');
    const before = await page.$$eval('#leaderboards .ledger, #leaderboards .tally', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.top - e.closest('section').getBoundingClientRect().top)}+${Math.round(r.height)}`; }));
    await page.waitForSelector('#leaderboards:not(.is-loading)');
    const after = await page.$$eval('#leaderboards .ledger, #leaderboards .tally', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.top - e.closest('section').getBoundingClientRect().top)}+${Math.round(r.height)}`; }));
    check(before.join() === after.join(), `${width}px: slots keep their place and size when the rows arrive (${before.join()} -> ${after.join()})`);
    await page.close();
  }
  {
    // measured from the loading slots on (the moment the section's module has drawn them) to the rows
    const { page } = await open(browser, { status: 200, body: FIXTURE }, { hash: '#leaderboards', delay: 600 });
    await page.waitForSelector('#leaderboards.is-loading .ledger');
    await page.evaluate(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: false });
    });
    await page.waitForSelector('#leaderboards:not(.is-loading)');
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() => window.__cls);
    check(cls < 0.01, `#leaderboards deep link: no layout shift when the data arrives (CLS ${cls.toFixed(4)})`);
    await page.close();
  }
  {
    const heights = [];
    for (const answer of [{ status: 200, body: FIXTURE }, { status: 503, body: { status: 'warming' } }]) {
      const { page } = await open(browser, answer);
      await toStats(page);
      heights.push(await page.$eval('#leaderboards .stats__boards', (e) => Math.round(e.getBoundingClientRect().height)));
      await page.close();
    }
    check(heights[0] === heights[1], `1440px: the empty page is as tall as the ledgers it stands in for (${heights.join(' vs ')})`);
  }
  for (const [width, height] of [[320, 640], [390, 844], [1440, 900]]) {
    for (const [label, answer] of [['filled', { status: 200, body: FIXTURE }], ['empty', { status: 503, body: { status: 'warming' } }]]) {
      const { page } = await open(browser, answer, { width, height });
      await toStats(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(over <= 0, `${width}px ${label}: no horizontal overflow (${over}px)`);
      await page.close();
    }
  }

  if (SHOTS) {
    await mkdir(SHOTS, { recursive: true });
    for (const [width, height] of WIDTHS) {
      for (const [label, answer] of [['filled', { status: 200, body: FIXTURE }], ['empty', { status: 503, body: { status: 'warming' } }]]) {
        const { page } = await open(browser, answer, { width, height });
        await toStats(page);
        await settled(page);
        await page.addStyleTag({ content: '.nav, .skip { visibility: hidden !important; }' });
        await page.locator('#leaderboards').screenshot({ path: join(SHOTS, `stats-${label}-${width}.png`) });
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall stats checks passed');
