// Local war playtest (docs/PLAYTEST.md): one command for the whole loop on this machine.
//
//   npm run play:war                 migrate the local D1, start wrangler dev (DEV_AUTH=1) and vite, seed, print URLs
//   npm run play:war -- --reset      wipe the local state first (D1, Durable Objects: a fresh world and season)
//   npm run play:war -- --bots       also 3 bot players (one per other alliance) with a squad standing at their homes
//   npm run play:war -- --no-serve   seed only, against servers that already run
//   npm run play:war -- --fast       world travel x0.05 (WAR_TRAVEL_SCALE): transits take seconds (the scripted smoke)
//   PLAY_API_PORT / PLAY_WEB_PORT    other ports than 8787 / 5173
//
// Seeding (idempotent): the dev player (dev id 1, alliance Dodona) gets the design's start: his recruit pool and
// START.food; he recruits a full squad of militia at home for food (no coin, no goods). A fresh state also starts a
// fresh season (POST /api/war/world/dev/season/reset). Ctrl-C stops both servers.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER = join(ROOT, 'server');
const STATE = join(SERVER, '.wrangler/state');
const API_PORT = Number(process.env.PLAY_API_PORT) || 8787, WEB_PORT = Number(process.env.PLAY_WEB_PORT) || 5173;
const API = `http://localhost:${API_PORT}`, WEB = `http://localhost:${WEB_PORT}`;
const DEV_ID = 1;
const has = (f) => process.argv.includes(`--${f}`);
const RESET = has('reset'), BOTS = has('bots'), SERVE = !has('no-serve'), FAST = has('fast');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[play] ${s}`);

const kids = [];
function start(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0', API_PROXY: API } });
  const tag = (d) => process.env.PLAY_VERBOSE && process.stdout.write(String(d).replace(/^/gm, `[${name}] `));
  p.stdout.on('data', tag);
  p.stderr.on('data', (d) => (process.env.PLAY_VERBOSE || /error|✘/i.test(String(d))) && process.stderr.write(String(d).replace(/^/gm, `[${name}] `)));
  p.on('exit', (code) => {
    if (!stopping) {
      log(`${name} exited (${code}); stopping. Run with PLAY_VERBOSE=1 to see its output.`);
      stop(1);
    }
  });
  kids.push(p);
  return p;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of kids) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => (log('stopping'), stop(0)));
process.on('SIGTERM', () => stop(0));

async function up(url, ms = 120_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`${url} did not come up in ${ms / 1000} s`);
}

async function login(id, name) {
  const r = await fetch(`${API}/api/auth/telegram`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.9.0.${id}` }, body: JSON.stringify({ dev: { id, first_name: name } }) });
  if (!r.ok) throw new Error(`dev login ${id}: ${r.status} ${await r.text()}`);
  const s = await r.json();
  const headers = { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' };
  const api = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${j.error?.message ?? JSON.stringify(j)}`);
    return j;
  };
  return { pid: s.player.id, token: s.token, api };
}

/** Alliance, then a full squad of militia recruited at home if fewer than a squad are fit at home. */
async function player(id, name, alliance) {
  const p = await login(id, name);
  const snap = await p.api('GET', '/api/war/world');
  if (snap.you.alliance === null) await p.api('POST', '/api/war/world/dev/alliance', { alliance });
  let ros = await p.api('GET', '/api/war/roster');
  const home = (r) => r.persons.filter((x) => x.state === 'active' && !x.region);
  const want = 12 - home(ros).length;
  if (want > 0 && ros.persons.filter((x) => x.state !== 'dead').length === 0) {
    await p.api('POST', '/api/war/recruit', { town: 'home', count: want });
    ros = await p.api('GET', '/api/war/roster');
    await p.api('POST', '/api/war/squad', { ids: home(ros).slice(0, 12).map((x) => x.id) });
    ros = await p.api('GET', '/api/war/roster');
  }
  return { ...p, roster: ros, alliance: (await p.api('GET', '/api/war/world')).you.alliance };
}

/** A bot's squad joins its home region and stays there (the socket closes; armies stand). */
async function standAtHome(b) {
  const region = ['dodona', 'skythia', 'kyrene', 'elaia'][b.alliance];
  const ids = b.roster.persons.filter((x) => x.state === 'active' && !x.region).map((x) => x.id);
  if (!ids.length) return 'already out';
  const sim = Number(/SIM_VERSION = (\d+)/.exec(readFileSync(join(ROOT, 'src/sim/version.ts'), 'utf8'))[1]);
  const net = Number(/NET_VERSION = (\d+)/.exec(readFileSync(join(ROOT, 'src/war/net/protocol.ts'), 'utf8'))[1]);
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/ws/war/${region}?sim=${sim}`, ['pixelarrow.v1', b.token]);
  const res = await new Promise((ok) => {
    const t = setTimeout(() => ok('timeout'), 20_000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: net, region, playerId: b.pid, team: b.alliance, squads: [ids] }));
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const m = JSON.parse(e.data);
      if (m.t === 'welcome' || m.t === 'refused' || m.t === 'error') (clearTimeout(t), ok(m.t === 'welcome' ? `${ids.length} men in ${region}` : `${m.t}: ${m.reason ?? m.message ?? ''}`));
    };
    ws.onerror = () => (clearTimeout(t), ok('socket error'));
  });
  await sleep(1500); // let the room save the join
  ws.close();
  return res;
}

// ---------------------------------------------------------------- main
if (RESET) {
  rmSync(STATE, { recursive: true, force: true });
  log('local state wiped');
}
const fresh = !existsSync(join(STATE, 'v3/d1'));
if (!existsSync(join(ROOT, '.dev.vars'))) {
  copyFileSync(join(SERVER, '.dev.vars.example'), join(ROOT, '.dev.vars'));
  log('wrote .dev.vars from server/.dev.vars.example (DEV_AUTH=1, local only)');
}
mkdirSync(join(ROOT, 'dist'), { recursive: true }); // wrangler's static assets dir; vite serves the game in dev
for (const dir of [ROOT, SERVER]) if (!existsSync(join(dir, 'node_modules'))) spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });

if (SERVE) {
  log('applying local D1 migrations');
  const m = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'pixelarrow', '--local', '--config', '../wrangler.jsonc', '--persist-to', '.wrangler/state'], { cwd: SERVER, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  if (m.status !== 0) {
    console.error(m.stdout, m.stderr);
    process.exit(1);
  }
  log(`starting wrangler dev :${API_PORT} and vite :${WEB_PORT}`);
  start('api', 'npx', ['wrangler', 'dev', '--config', '../wrangler.jsonc', '--persist-to', '.wrangler/state', '--port', String(API_PORT), '--inspector-port', String(API_PORT + 1000), '--var', 'DEV_AUTH:1', ...(FAST ? ['--var', 'WAR_TRAVEL_SCALE:0.05'] : []), '--show-interactive-dev-session=false'], SERVER);
  start('web', 'npx', ['vite', '--port', String(WEB_PORT), '--strictPort'], ROOT);
}
try {
  await up(`${API}/api/health`);
  log('waiting for vite');
  await up(`${WEB}/world.html`, 600_000);
  log('both servers are up');
  const you = await login(DEV_ID, 'Playtester');
  if (fresh || RESET) log(`fresh season ${(await you.api('POST', '/api/war/world/dev/season/reset')).season}`);
  const me = await player(DEV_ID, 'Playtester', 0);
  const stock = me.roster.stock ?? {};
  log(`you: dev ${DEV_ID}, alliance ${me.alliance}, ${me.roster.persons.length} soldiers, strongroom ${JSON.stringify(stock)}`);
  if (BOTS) {
    for (const a of [1, 2, 3]) {
      const b = await player(1000 + a, `Bot${a}`, a);
      log(`bot ${1000 + a} (alliance ${b.alliance}): ${await standAtHome(b)}`);
    }
  }
  console.log(`
  World map (live):   ${WEB}/world.html?dev=${DEV_ID}
  World map (mock):   ${WEB}/world.html?offline=1
  Sandbox (offline):  ${WEB}/sandbox.html?scenario=free
  API health:         ${API}/api/health
  Guide:              docs/PLAYTEST.md${SERVE ? '\n\n  Ctrl-C stops both servers.' : ''}
`);
  if (!SERVE) process.exit(0);
} catch (e) {
  console.error(`[play] ${e.message}`);
  stop(1);
}
