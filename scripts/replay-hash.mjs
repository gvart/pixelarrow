/**
 * Cross-engine replay check (ST-04, qa-plan-v5 risk "replay non-determinism
 * across engines"): bundles src/sim with Vite, runs every battle of the v2
 * replay fixtures (tests/fixtures/replay-v2*.json, recorded in Node) inside a
 * real browser page, and compares the winner, ticks, final hash and the hash
 * every 100 ticks with the recorded ones. The workerd side is
 * server/test/trainReplay.test.ts.
 *
 *   node scripts/replay-hash.mjs                 # chromium and webkit
 *   node scripts/replay-hash.mjs chromium        # one engine
 *   PW_WEBKIT_PATH=/path/to/pw_run.sh node scripts/replay-hash.mjs webkit
 *
 * An engine that cannot launch is reported as NOT RUN (exit code 2 when no
 * engine ran at all); any hash difference names the battle and the first
 * checkpoint that differs (exit code 1).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium, webkit } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = ['tests/fixtures/replay-v2.json', 'tests/fixtures/replay-v2-offline.json'];

/** Runs in the page: server/src/battle.ts replayBattle's order feeding, with a hash every 100 ticks. */
function replayInPage(rec) {
  const b = new globalThis.ReplayHash.Battle(JSON.parse(JSON.stringify(rec.setup)));
  const orders = rec.orders.map((o, i) => ({ ...o, i }));
  for (const o of orders.slice(0, rec.deployOrders)) b.issue(o.side, o.order);
  const battle = orders.slice(rec.deployOrders).sort((x, y) => x.tick - y.tick || x.i - y.i);
  b.startBattle();
  const checkpoints = [];
  let next = 0;
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks + 1) {
    while (next < battle.length && battle[next].tick === b.tick) b.issue(battle[next].side, battle[next++].order);
    if (b.phase === 'ended') break;
    b.step();
    b.drainEvents();
    if (b.tick % 100 === 0) checkpoints.push([b.tick, b.hash()]);
  }
  return { winner: b.winner ?? -1, ticks: b.tick, hash: b.hash(), checkpoints };
}

/** src/sim/battle.ts and everything it imports as one IIFE (global ReplayHash), built like the game's bundle. */
async function bundle() {
  const out = await build({
    root,
    configFile: false,
    logLevel: 'warn',
    build: { write: false, minify: false, lib: { entry: 'src/sim/battle.ts', formats: ['iife'], name: 'ReplayHash', fileName: () => 'replay.js' } },
  });
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
  return outputs.find((o) => o.type === 'chunk').code;
}

function compare(rec, got) {
  const first = rec.checkpoints.findIndex(([t, h], i) => got.checkpoints[i]?.[0] !== t || got.checkpoints[i]?.[1] !== h);
  const same = first < 0 && got.checkpoints.length === rec.checkpoints.length && got.winner === rec.winner && got.ticks === rec.ticks && got.hash === rec.hash;
  if (same) return null;
  const at = first >= 0 ? `first differing checkpoint: tick ${rec.checkpoints[first][0]}` : 'checkpoints equal';
  return `${rec.name}: ${at}; recorded ${rec.winner}/${rec.ticks}/${rec.hash}, got ${got.winner}/${got.ticks}/${got.hash}`;
}

const engines = { chromium, webkit };
const wanted = process.argv.slice(2).filter((a) => a in engines);
const battles = FIXTURES.flatMap((f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).battles);
const code = await bundle();

let ran = 0;
let failed = 0;
for (const name of wanted.length ? wanted : Object.keys(engines)) {
  let browser;
  try {
    const executablePath = name === 'webkit' ? process.env.PW_WEBKIT_PATH : process.env.PW_CHROMIUM_PATH;
    browser = await engines[name].launch(executablePath ? { executablePath } : {});
  } catch (e) {
    console.log(`${name}: NOT RUN (${String(e.message).split('\n')[0]})`);
    continue;
  }
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>replay</title>');
    await page.addScriptTag({ content: code });
    const ua = await page.evaluate(() => navigator.userAgent);
    const diffs = [];
    for (const rec of battles) {
      const got = await page.evaluate(replayInPage, rec);
      const d = compare(rec, got);
      if (d) diffs.push(d);
    }
    ran++;
    failed += diffs.length;
    console.log(`${name} (${browser.version()}; ${ua}): ${battles.length - diffs.length}/${battles.length} battles match the Node hashes`);
    for (const d of diffs) console.log(`  MISMATCH ${d}`);
  } finally {
    await browser.close();
  }
}
process.exit(failed ? 1 : ran ? 0 : 2);
