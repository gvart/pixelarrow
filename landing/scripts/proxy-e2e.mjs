#!/usr/bin/env node
// V6-STATS-03: the landing proxy against the real game Worker, both run locally by `wrangler dev`
// (ADR-0007, ADR-0010 §3–§4). Two processes on one private dev registry, so the landing's GAME
// service binding reaches the game's PublicApi RPC entrypoint exactly as in production, and the
// game can be stopped to prove the last-good fallback.
//
//   node scripts/proxy-e2e.mjs                 # the checks (about 6 min: it waits out the 300 s edge copy)
//   node scripts/proxy-e2e.mjs --write-fixture # also writes src/fixtures/summary.v1.json from the run
//
// Ports (V6-002 slot 3): game 6131, landing 6132, inspectors 6133/6134. Logs, local D1, caches and
// the dev registry go to landing/.wrangler/e2e/ (gitignored). Only the processes started here are
// stopped. Needs ../server/node_modules (wrangler) and a landing build (npm run build).
// The sign-up step calls Cloudflare's Turnstile siteverify with the published always-pass testing
// secret, so it needs the network.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANDING = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(LANDING, '..');
const WRANGLER = join(ROOT, 'server/node_modules/.bin/wrangler');
const WORK = join(LANDING, '.wrangler/e2e');
const PORTS = { game: 6131, landing: 6132, gameInspector: 6133, landingInspector: 6134 };
const GAME = `http://127.0.0.1:${PORTS.game}`;
const LAND = `http://127.0.0.1:${PORTS.landing}`;
const SUMMARY = '/api/public/v1/summary';
const EDGE_TTL_S = 300; // the landing's s-maxage on the edge copy (landing/worker/index.ts)
const WRITE_FIXTURE = process.argv.includes('--write-fixture');

const env = { ...process.env, WRANGLER_REGISTRY_PATH: join(WORK, 'registry'), WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' };
const started = [];
let failures = 0;

function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portFree(port) {
  return new Promise((res) => {
    const s = createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}

function wrangler(args) {
  return execFileSync(WRANGLER, args, { cwd: LANDING, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Starts a `wrangler dev` in its own process group (it spawns workerd), logging to WORK/<name>.log. */
function startDev(name, args) {
  const log = openSync(join(WORK, `${name}.log`), 'a');
  const child = spawn(WRANGLER, ['dev', ...args], { cwd: LANDING, env, detached: true, stdio: ['ignore', log, log] });
  started.push({ name, child });
  writeFileSync(join(WORK, 'pids.txt'), started.map((s) => `${s.name} ${s.child.pid}`).join('\n') + '\n');
  console.log(`started ${name}: pid ${child.pid}`);
  return child;
}

async function stopDev(name) {
  const i = started.findIndex((s) => s.name === name);
  if (i < 0) return;
  const { child } = started[i];
  started.splice(i, 1);
  if (child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  await Promise.race([exited, sleep(10_000)]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  console.log(`stopped ${name}: pid ${child.pid}`);
}

async function waitFor(url, accept, what, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (accept(res.status)) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`${what} did not come up on ${url}`);
}

/** SQL against the game's local D1 (the same persisted database the running game uses). */
function sql(command) {
  const out = wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', join(WORK, 'game-state'), '-c', join(ROOT, 'wrangler.jsonc'), '--json', '--command', command]);
  return JSON.parse(out)[0]?.results ?? [];
}

async function api(path, init = {}) {
  const res = await fetch(GAME + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const runCron = () => fetch(`${GAME}/__scheduled?cron=${encodeURIComponent('*/5 * * * *')}`).then((r) => r.text());

// Obvious fixture names: no real player is ever presented (brief: stats come from real data).
const PLAYERS = [
  'FixtureHoplite', 'FixtureArcher', 'FixturePeltast', 'FixtureCavalry', 'FixtureSlinger', 'FixtureMarine',
  'FixtureScout', 'FixtureMedic', 'FixtureEngineer', 'FixtureGuard', 'FixtureRaider', 'FixtureHerald',
];
const CLANS = [['Fixture Wolves', 'FXW'], ['Fixture Ravens', 'FXR'], ['Fixture Lions', 'FXL']];

/** Real players through the real routes (dev log-in, rename, join the war, found clans), then rows the routes can't make quickly. */
async function seed() {
  const ps = [];
  for (const [i, name] of PLAYERS.entries()) {
    const login = await api('/api/auth/telegram', { method: 'POST', json: { dev: { id: 990_001 + i, first_name: 'Fixture' } } });
    await api('/api/account/name', { method: 'PUT', token: login.token, json: { name } });
    if (i < 9) await api('/api/online/profile', { method: 'POST', token: login.token });
    ps.push({ id: login.player.id, token: login.token });
  }
  for (const [i, [name, tag]] of CLANS.entries()) await api('/api/online/clans', { method: 'POST', token: ps[i].token, json: { name, tag } });

  const now = Date.now();
  const d = new Date(now);
  const duelSeason = (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth(); // src/duel/season.ts seasonId
  const war = sql("SELECT season_id AS s, shard_id AS sh FROM online_profiles LIMIT 1")[0];
  const rows = [];
  const live = [2140, 1930, 1760, 1610, 1480, 1350, 1220];
  live.forEach((r, i) => rows.push(`INSERT INTO duel_ratings (player_id, ladder, rating, games, season, updated_at, played_at) VALUES (${ps[i].id}, 'live', ${r}, ${40 - i * 4}, ${duelSeason}, ${now}, ${now})`));
  [1710, 1560, 1420, 1260].forEach((r, i) => rows.push(`INSERT INTO duel_ratings (player_id, ladder, rating, games, season, updated_at, played_at) VALUES (${ps[i + 5].id}, 'async', ${r}, ${30 - i * 5}, ${duelSeason}, ${now}, ${now})`));
  [[0, 'legend', 2210], [3, 'strategos', 1880]].forEach(([p, league, peak], i) =>
    rows.push(`INSERT INTO duel_season_rewards (player_id, season, ladder, league, peak, glory, cosmetic, created_at) VALUES (${ps[p].id}, ${duelSeason - 1 - i}, 'live', '${league}', ${peak}, 0, 'none', ${now})`));
  rows.push(`INSERT INTO duel_season_rewards (player_id, season, ladder, league, peak, glory, cosmetic, created_at) VALUES (${ps[6].id}, ${duelSeason - 1}, 'async', 'hoplite', 1650, 0, 'none', ${now})`);
  rows.push(`INSERT INTO season_rewards (season_id, player_id, shard_id, rank, score, clan_name, title, created_at) VALUES (${war.s - 1}, ${ps[2].id}, 1, 1, 410, NULL, 'Basileus', ${now})`);
  // War season 1 (src/war/world/alliances.ts WAR_SEASON): alliances, fight tallies and region bosses slain (src/data/warBosses.ts).
  ps.slice(0, 8).forEach((p, i) => rows.push(`INSERT INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (1, ${p.id}, ${i % 4}, ${now})`));
  ps.slice(0, 9).forEach((p, i) => rows.push(`INSERT INTO war_player_stats (season, player_id, kills, fights, wins, honours, bosses) VALUES (1, ${p.id}, ${40 - i * 4}, ${12 - i}, ${8 - i % 5}, ${i % 3}, ${i < 3 ? 3 - i : 0})`));
  [['scylla', 1, 0], ['scylla', 0, 1], ['glacier_titan', 2, 2], ['moor_bear', 3, 1]].forEach(([boss, alliance, p], i) =>
    rows.push(`INSERT INTO war_boss_kills (id, season, region, boss, alliance, player_id, at) VALUES ('fx${i}', 1, 'fx', '${boss}', ${alliance}, ${ps[p].id}, ${now - (4 - i) * 3_600_000})`));
  for (let i = 0; i < 6; i++) rows.push(`INSERT INTO battle_log (season_id, shard_id, kind, winner, ticks, verified, created_at) VALUES (${war.s}, ${war.sh}, 'attack', 0, 100, 1, ${now})`);
  for (let i = 0; i < 4; i++) rows.push(`INSERT INTO duel_matches (id, mode, seed, player_a, player_b, setup, teams, status, created_at) VALUES ('fx${i}', 'ranked', 1, ${ps[i].id}, ${ps[i + 1].id}, '{}', '[]', 'done', ${now - 7_200_000})`);
  sql(rows.join('; '));
  return ps;
}

function parseSetCookie(header) {
  const [pair, ...attrs] = header.split(';').map((s) => s.trim());
  const name = pair.slice(0, pair.indexOf('='));
  const a = new Map(attrs.map((x) => { const eq = x.indexOf('='); return eq < 0 ? [x.toLowerCase(), ''] : [x.slice(0, eq).toLowerCase(), x.slice(eq + 1)]; }));
  return { name, pair, a };
}

/** A real web session cookie from the game: email sign-up, the link from the dev outbox, verify. */
async function realSessionCookie() {
  const origin = { origin: `http://localhost:${PORTS.game}` };
  const email = `fixture-${Date.now()}@example.test`;
  await api('/api/auth/signup', { method: 'POST', headers: origin, json: { email, password: 'fixture-pass-phrase-9137', turnstile: 'XXXX.DUMMY.TOKEN.XXXX' } });
  let token = null;
  for (let i = 0; i < 20 && !token; i++) {
    const row = sql(`SELECT text FROM dev_outbox WHERE to_addr = '${email}' ORDER BY id DESC LIMIT 1`)[0];
    token = row?.text.match(/#t=([A-Za-z0-9_-]+)/)?.[1] ?? null;
    if (!token) await sleep(500);
  }
  if (!token) throw new Error('no verify link in the dev outbox');
  const res = await fetch(`${GAME}/api/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', ...origin }, body: JSON.stringify({ token }) });
  if (res.status !== 200) throw new Error(`verify: ${res.status} ${await res.text()}`);
  return res.headers.get('set-cookie');
}

async function get(base, path, init) {
  const res = await fetch(base + path, { redirect: 'manual', ...init });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

async function main() {
  for (const [k, p] of Object.entries(PORTS)) if (!(await portFree(p))) throw new Error(`port ${p} (${k}) is busy; pick another slot`);
  if (!existsSync(WRANGLER)) throw new Error(`no wrangler at ${WRANGLER}`);
  if (!existsSync(join(LANDING, 'dist/index.html'))) throw new Error('build the landing first: npm run build');
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  // The game config serves ../dist (the game build); the API alone needs none of it.
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  // Local-only values (server/.dev.vars.example): dev log-in, the dev outbox, the always-pass Turnstile testing secret.
  writeFileSync(join(WORK, 'game.dev.vars'), [
    'DEV_AUTH=1', 'DEV_EMAIL=1', `DEV_ORIGINS=http://localhost:${PORTS.game}`,
    `PASSWORD_PEPPER=${randomBytes(32).toString('base64')}`, 'PASSWORD_PEPPER_ID=1',
    'TURNSTILE_SECRET=1x0000000000000000000000000000000AA',
    'TELEGRAM_BOT_TOKEN=123456:local-e2e', 'TELEGRAM_WEBHOOK_SECRET=local-e2e',
  ].join('\n') + '\n');

  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', join(WORK, 'game-state'), '-c', join(ROOT, 'wrangler.jsonc')]);
  const gameArgs = ['-c', join(ROOT, 'wrangler.jsonc'), '--ip', '127.0.0.1', '--port', String(PORTS.game), '--inspector-port', String(PORTS.gameInspector),
    '--persist-to', join(WORK, 'game-state'), '--env-file', join(WORK, 'game.dev.vars'), '--test-scheduled', '--show-interactive-dev-session=false'];
  const landingArgs = (state) => ['-c', join(LANDING, 'wrangler.jsonc'), '--ip', '127.0.0.1', '--port', String(PORTS.landing), '--inspector-port', String(PORTS.landingInspector),
    '--persist-to', join(WORK, state), '--show-interactive-dev-session=false'];

  startDev('game', gameArgs);
  await waitFor(GAME + SUMMARY, (s) => s === 503 || s === 200, 'the game Worker');
  startDev('landing', landingArgs('landing-state'));
  await waitFor(LAND + '/api/public/v1/nope', (s) => s === 404, 'the landing Worker');

  console.log('\n# Before the first snapshot');
  let g = await get(GAME, SUMMARY);
  let l = await get(LAND, SUMMARY);
  check(g.status === 503 && JSON.parse(g.text).status === 'warming', 'game HTTP route: 503 warming', `${g.status} ${g.text}`);
  check(l.status === 503 && JSON.parse(l.text).status === 'warming' && l.headers.get('retry-after') === '60', 'landing: 503 warming through the PublicApi entrypoint', `${l.status} ${l.text}`);

  console.log('\n# Seed obvious fixture players through the real routes, then run the cron');
  const ps = await seed();
  console.log(`seeded ${ps.length} fixture players, ${CLANS.length} clans`);
  await runCron();
  g = await get(GAME, SUMMARY);
  check(g.status === 200, 'game HTTP route: 200 after the cron', String(g.status));

  console.log('\n# The proxy');
  const first = await get(LAND, SUMMARY);
  check(first.status === 200, 'landing GET: 200', String(first.status));
  check(first.text === g.text, 'landing body is byte-identical to the game snapshot');
  check(first.headers.get('etag') === g.headers.get('etag'), 'landing ETag equals the game ETag', String(first.headers.get('etag')));
  check(!first.headers.get('access-control-allow-origin'), 'no CORS header');
  // A new snapshot on the game; the landing must keep serving its edge copy (a cache hit, no RPC).
  await sleep(1100);
  await runCron();
  const newer = await get(GAME, SUMMARY);
  const second = await get(LAND, SUMMARY + '?bust=' + Date.now());
  check(newer.headers.get('etag') !== g.headers.get('etag'), 'the game moved on to a newer snapshot', String(newer.headers.get('etag')));
  check(second.status === 200 && second.headers.get('etag') === first.headers.get('etag'), 'second landing call (query ignored) is a cache hit: the first copy, not the newer one');
  const head = await get(LAND, SUMMARY, { method: 'HEAD' });
  check(head.status === 200 && head.text === '' && head.headers.get('etag') === first.headers.get('etag'), 'landing HEAD: 200, no body, same ETag');
  const notModified = await get(LAND, SUMMARY, { headers: { 'if-none-match': first.headers.get('etag') } });
  check(notModified.status === 304 && notModified.text === '', 'landing If-None-Match: 304');
  const post = await get(LAND, SUMMARY, { method: 'POST' });
  check(post.status === 405 && post.headers.get('allow') === 'GET, HEAD', 'landing POST: 405, Allow: GET, HEAD');
  check((await get(LAND, '/api/public/v1/players')).status === 404, 'landing other /api/public path: 404');

  console.log('\n# Cookie isolation (play.pixelarrow.app vs the apex)');
  const setCookie = await realSessionCookie();
  const c = parseSetCookie(setCookie ?? '');
  check(c.name === '__Host-pa_sid', 'the game issues its session cookie', c.name);
  check(c.a.has('secure') && c.a.get('path') === '/' && !c.a.has('domain'), '__Host- cookie is host-only (Secure, Path=/, no Domain): a browser never sends it to pixelarrow.app');
  check(c.a.has('httponly') && c.a.get('samesite')?.toLowerCase() === 'lax', 'HttpOnly, SameSite=Lax');
  const withCookie = { headers: { cookie: c.pair } };
  const answers = {
    'GET summary': await get(LAND, SUMMARY, withCookie),
    'HEAD summary': await get(LAND, SUMMARY, { ...withCookie, method: 'HEAD' }),
    'GET /': await get(LAND, '/', withCookie),
    'GET /?startapp=clan_x': await get(LAND, '/?startapp=clan_x', withCookie),
    'GET /privacy.html': await get(LAND, '/privacy.html', withCookie),
    'GET /api/x': await get(LAND, '/api/x', withCookie),
  };
  for (const [what, r] of Object.entries(answers)) check(r.headers.get('set-cookie') === null && !/cookie/i.test(r.headers.get('vary') ?? ''), `landing ${what}: no Set-Cookie, no Vary: Cookie`, String(r.status));
  check(answers['GET summary'].text === first.text, 'a cookie-bearing request gets the same shared copy (nothing per visitor)');
  const redirect = answers['GET /?startapp=clan_x'];
  check(redirect.status === 302 && redirect.headers.get('location') === 'https://play.pixelarrow.app/?startapp=clan_x', '/?startapp=clan_x: 302 to play', `${redirect.status} ${redirect.headers.get('location')}`);
  const gameWithCookie = await get(GAME, SUMMARY, withCookie);
  check(gameWithCookie.status === 200 && gameWithCookie.headers.get('set-cookie') === null, 'the game public route ignores the cookie and sets none');

  if (WRITE_FIXTURE) {
    const out = join(LANDING, 'src/fixtures/summary.v1.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(JSON.parse(first.text), null, 2) + '\n');
    console.log(`\nwrote ${out}`);
  }

  console.log('\n# The game stops');
  await stopDev('game');
  const down = await get(LAND, SUMMARY);
  check(down.status === 200 && !down.headers.get('x-stale') && down.text === first.text, 'game down, edge copy still fresh: served from the cache');
  console.log(`waiting for the ${EDGE_TTL_S} s edge copy to expire…`);
  const until = Date.now() + (EDGE_TTL_S + 90) * 1000;
  let stale = null;
  while (Date.now() < until) {
    await sleep(15_000);
    const r = await get(LAND, SUMMARY);
    if (r.headers.get('x-stale') === '1') { stale = r; break; }
  }
  check(stale?.status === 200 && stale.text === first.text, 'game down, edge copy expired: the last-good copy with X-Stale: 1', stale ? `${stale.status}` : 'never stale');

  console.log('\n# No copy at all');
  await stopDev('landing');
  startDev('landing-empty', landingArgs('landing-state-empty'));
  await waitFor(LAND + '/api/public/v1/nope', (s) => s === 404, 'the landing Worker (empty cache)');
  const none = await get(LAND, SUMMARY);
  check(none.status === 503 && JSON.parse(none.text).status === 'unavailable' && none.headers.get('retry-after') === '60', 'game down, no copy: 503 unavailable', `${none.status} ${none.text}`);
}

let fatal = null;
try {
  await main();
} catch (e) {
  fatal = e;
  console.error(`\nERROR ${e instanceof Error ? e.message : e}`);
} finally {
  for (const s of [...started]) await stopDev(s.name);
}
console.log(`\n${failures === 0 && !fatal ? 'ALL PASS' : `${failures} FAILED${fatal ? ' (aborted)' : ''}`}  logs: ${WORK}`);
process.exit(failures === 0 && !fatal ? 0 : 1);
