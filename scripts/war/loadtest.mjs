// Live war region load test (docs/impl/global-war-rebuild.md M3): N headless clients join the WarRegionDO of
// test-ridge, each with one squad (default 20 men), spread over the 4 alliances, and send random orders (march on a
// field, attack a foe they can see, change formation); a squad that is wiped out rejoins. Clients decode every frame
// (src/war/net/codec.ts). At the end it prints the server tick times (/api/war/<region>/stats, last 60 s), bytes/s and
// frame sizes per client.
//
// Needs a running `wrangler dev` with DEV_AUTH=1 (.dev.vars) and the local D1 migrated, and a cap that fits the run:
//   cd server && npm run migrate:local && npx wrangler dev --config ../wrangler.jsonc --persist-to .wrangler/state --var WAR_CAP:2000
//   node scripts/war/loadtest.mjs [--brawl] [--clients 30] [--squad 20] [--seconds 60] [--url http://localhost:8787] [--cls militia]
// A fresh run needs a fresh region: restart wrangler dev between runs (the DO keeps its armies while it lives).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const N = Number(arg('clients', 30)), SQUAD = Number(arg('squad', 20)), SECONDS = Number(arg('seconds', 60));
const URL_ = arg('url', 'http://localhost:8787'), REGION = arg('region', 'test-ridge');
const CLASSES = (arg('cls', 'militia,hoplite,archer,peltast,slinger')).split(',');
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
const { module: codec } = await runnerImport('/src/war/net/codec.ts', opts);
const { module: proto } = await runnerImport('/src/war/net/protocol.ts', opts);
const SIM = Number(/SIM_VERSION = (\d+)/.exec(readFileSync(`${ROOT}src/sim/version.ts`, 'utf8'))[1]);
// --brawl: everyone marches on the east field and attacks more often (a 600-man melee)
const BRAWL = process.argv.includes('--brawl');
const FIELDS = BRAWL ? [[424, 252]] : [[424, 252], [88, 208], [292, 220], [400, 360], [275, 122], [192, 60], [144, 288], [340, 160], [444, 440]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

async function login(i) {
  for (let tries = 0; tries < 20; tries++) {
    const res = await fetch(`${URL_}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.77.${i >> 8}.${i & 255}` },
      body: JSON.stringify({ dev: { id: 880000 + i, first_name: `Load${i}` } }),
    });
    if (res.status === 200) return res.json();
    if (res.status !== 429) throw new Error(`login ${i}: ${res.status} ${await res.text()}`);
    await sleep(3000);
  }
  throw new Error(`login ${i}: rate limited`);
}

function client(i, token, pid) {
  const team = i % proto.ALLIANCES;
  const c = { i, pid, team, dec: new codec.DeltaDecoder(), bytes: 0, frames: 0, keys: [], sizes: [], squads: [], errors: {}, joined: false, refused: null, queued: false, measuring: false };
  const ws = new WebSocket(`${URL_.replace(/^http/, 'ws')}/ws/war/${REGION}?sim=${SIM}`, ['pixelarrow.v1', token]);
  ws.binaryType = 'arraybuffer';
  c.ws = ws;
  const join = () => ws.send(JSON.stringify({ t: 'join', v: proto.NET_VERSION, region: REGION, playerId: pid, team, army: [{ cls: CLASSES[i % CLASSES.length], count: SQUAD }] }));
  c.join = join;
  c.open = new Promise((ok, fail) => {
    ws.onopen = () => { join(); ok(); };
    ws.onerror = (e) => fail(new Error(`socket ${i}: ${e.message ?? 'error'}`));
  });
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') {
      const m = JSON.parse(e.data);
      if (m.t === 'welcome') { c.joined = true; c.queued = false; c.squads = m.squads; }
      else if (m.t === 'queued') c.queued = true;
      else if (m.t === 'refused') c.refused = m.reason;
      else if (m.t === 'error') c.errors[m.code] = (c.errors[m.code] ?? 0) + 1;
      return;
    }
    const buf = new Uint8Array(e.data);
    c.dec.apply(buf);
    if (!c.measuring) return;
    c.bytes += buf.length;
    c.frames++;
    (buf[0] === 2 ? c.keys : c.sizes).push(buf.length);
  };
  return c;
}

/** One random order for a client's squad. */
function act(c) {
  if (!c.joined) return;
  const units = [...c.dec.units.values()];
  const mine = c.squads.filter((s) => units.some((u) => u.squad === s && u.state !== 'dead'));
  if (!mine.length) {
    // wiped out: bring a new squad
    c.joined = false;
    c.join();
    return;
  }
  const squad = mine[0], r = rnd();
  const foes = [...c.dec.squads.values()].filter((s) => s.team !== c.team && units.some((u) => u.squad === s.id && u.state !== 'dead'));
  let o;
  if (r < (BRAWL ? 0.6 : 0.35) && foes.length) o = { kind: 'attack', squad, target: foes[Math.floor(rnd() * foes.length)].id };
  else if (r < 0.45) o = { kind: 'formation', squad, shape: ['line', 'column', 'wedge', 'loose'][Math.floor(rnd() * 4)] };
  else {
    const [fx, fy] = FIELDS[Math.floor(rnd() * FIELDS.length)];
    o = { kind: 'move', squad, x: fx + (rnd() - 0.5) * 20, y: fy + (rnd() - 0.5) * 20 };
  }
  c.ws.send(JSON.stringify({ t: 'order', o }));
}

const stat = (v) => {
  if (!v.length) return 'n/a';
  const s = [...v].sort((a, b) => a - b), avg = v.reduce((a, b) => a + b, 0) / v.length;
  return `avg ${avg.toFixed(0)}, p95 ${s[Math.floor(s.length * 0.95)].toFixed(0)}, max ${s.at(-1).toFixed(0)}`;
};

console.log(`load test: ${N} clients x ${SQUAD} men on ${REGION} (${URL_}), ${SECONDS} s`);
const clients = [];
for (let i = 0; i < N; i++) {
  const s = await login(i);
  clients.push(client(i, s.token, s.player.id));
}
await Promise.all(clients.map((c) => c.open));
for (let t = 0; t < 100 && clients.some((c) => !c.joined && !c.refused && !c.queued); t++) await sleep(100);
const joined = clients.filter((c) => c.joined).length, queued = clients.filter((c) => c.queued).length, refused = clients.filter((c) => c.refused);
console.log(`joined ${joined}, queued ${queued}, refused ${refused.length}${refused.length ? ` (${refused[0].refused})` : ''}`);
// every client sends an order every 3-6 s (staggered)
const timers = clients.map((c, k) => setTimeout(function again() { act(c); c.t = setTimeout(again, 3000 + rnd() * 3000); }, 200 + k * 97));
await sleep(5000); // warm-up: everyone moving
for (const c of clients) c.measuring = true;
const t0 = Date.now();
const samples = [];
while (Date.now() - t0 < SECONDS * 1000) {
  await sleep(5000);
  const s = await (await fetch(`${URL_}/api/war/${REGION}/stats`)).json();
  samples.push(s.units);
  process.stdout.write(`  t+${Math.round((Date.now() - t0) / 1000)}s units ${s.units}, tick avg ${s.totalMs?.avg} ms p95 ${s.totalMs?.p95} max ${s.totalMs?.max}\n`);
}
const secs = (Date.now() - t0) / 1000;
const stats = await (await fetch(`${URL_}/api/war/${REGION}/stats`)).json();
for (const c of clients) { clearTimeout(c.t); c.ws.close(1000); }
timers.forEach(clearTimeout);
const bps = clients.map((c) => c.bytes / secs);
const errors = {};
for (const c of clients) for (const [k, v] of Object.entries(c.errors)) errors[k] = (errors[k] ?? 0) + v;
const dead = clients.reduce((a, c) => a + [...c.dec.units.values()].filter((u) => u.state === 'dead').length, 0);
console.log(`\nserver (last ${stats.ticks} ticks): units ${stats.units} (during run: ${stat(samples)}), overruns > 100 ms: ${stats.overruns}, dead seen by clients ${dead}`);
for (const k of ['totalMs', 'stepMs', 'snapMs', 'netMs', 'sendMs', 'lateMs']) if (stats[k]) console.log(`  ${k.padEnd(8)} avg ${stats[k].avg} ms, p95 ${stats[k].p95}, max ${stats[k].max}`);
console.log(`  bytes/tick out (all clients) avg ${stats.bytesPerTick?.avg}, max ${stats.bytesPerTick?.max}`);
console.log(`clients: bytes/s per client ${stat(bps)} (${(bps.reduce((a, b) => a + b, 0) / bps.length / 1024).toFixed(1)} KiB/s avg)`);
console.log(`  delta frame bytes ${stat(clients.flatMap((c) => c.sizes))}; keyframe bytes ${stat(clients.flatMap((c) => c.keys))}`);
console.log(`  frames/s per client ${(clients.reduce((a, c) => a + c.frames, 0) / clients.length / secs).toFixed(1)}; order errors ${JSON.stringify(errors)}`);
process.exit(0);
