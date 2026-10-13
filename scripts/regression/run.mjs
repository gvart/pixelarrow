// The regression suite runner (QA-02; manifest: tests/regression/SUITE.md).
//
//   npm run regression -- --port 6150     # builds dist if missing, serves it with vite preview on that port
//   npm run regression -- http://127.0.0.1:6150/   # against a server already running
//   npm run regression -- <url> --platform web     # one platform mode (default both: telegram, then web)
//   npm run regression -- <url> --all     # also the browser smokes (smoke-check scope)
//   npm run regression -- <url> --only hub-flows,battle-kinds
//
// A URL or --port is required: there is no default port (each agent and CI job its own, V6-035).
// Platform modes (V6-GATE-02, scripts/lib/platform.mjs): every browser script runs once per mode, as a
// Telegram Mini App (fake WebApp) and as a plain web page; the summary has one row per script and mode.
// A failure is never retried: a script that fails in one run is reported FAIL with both modes' rows, and a
// suspected flake goes into docs/v6/qa/FLAKY.md (re-run it and record every result, never hide it).
//
// Runs each script in turn with a time limit (a hung script is killed and fails), prints a
// summary with times, stops the preview server it started, and exits
//   0  every script passed (KNOWN bug checks are named in the summary, never as a pass),
//   1  a script failed or timed out,
//   2  nothing failed but a script could not run (NOT ASSESSED: e.g. no browser engine for the
//      cross-engine replay check). A run that could not look is not a run that found nothing.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const given = args.find((a) => /^https?:/.test(a)) ?? process.env.BASE_URL;
const PORT = Number(opt('port', '0'));
if (!given && !PORT) {
  console.log('NOT RUN: give the URL of a running server or --port <port> to serve dist on (no default port, V6-035)');
  process.exit(2);
}
const PLATFORM = opt('platform', process.env.SMOKE_PLATFORM || process.env.PLATFORM || 'both');
if (!['telegram', 'web', 'both'].includes(PLATFORM)) {
  console.log(`NOT RUN: --platform must be telegram, web or both (got ${PLATFORM})`);
  process.exit(2);
}
const MODES = PLATFORM === 'both' ? ['telegram', 'web'] : [PLATFORM];
const only = opt('only', '')
  .split(',')
  .filter(Boolean);

/**
 * The suite: name, script, its arguments (BASE = the server URL), time limit in minutes. A script with
 * BASE runs in the browser and once per platform mode; one without (replay-hash) runs once.
 */
const SUITE = [
  { name: 'hub-flows', script: 'scripts/regression/hub-flows.mjs', args: ['BASE'], min: 10 },
  { name: 'battle-kinds', script: 'scripts/regression/battle-kinds.mjs', args: ['BASE'], min: 12 },
  { name: 'sheet-layout', script: 'scripts/regression/sheet-layout.mjs', args: ['BASE'], min: 10 },
  { name: 'controls', script: 'scripts/regression/controls.mjs', args: ['BASE'], min: 10 },
  // the v2 replay fixtures hashed in Chromium against the Node hashes (ST-04; exit 2 = engine NOT RUN)
  { name: 'replay-hash', script: 'scripts/replay-hash.mjs', args: ['chromium'], min: 10 },
];
/** --all: the browser smokes too (online-e2e needs wrangler with DEV_AUTH and stays out). */
const SMOKES = [
  { name: 'smoke', script: 'scripts/smoke.mjs', args: ['BASE'], min: 15 },
  { name: 'tutorial-smoke', script: 'scripts/tutorial-smoke.mjs', args: ['BASE'], min: 15 },
  { name: 'duel-smoke', script: 'scripts/duel-smoke.mjs', args: ['BASE'], min: 10 },
  { name: 'online-smoke', script: 'scripts/online-smoke.mjs', args: ['BASE'], min: 10 },
  { name: 'fullscreen-smoke', script: 'scripts/fullscreen-smoke.mjs', args: ['BASE'], min: 10 },
  { name: 'audio-smoke', script: 'scripts/audio-smoke.mjs', args: ['BASE'], min: 10 },
];
const jobs = [...SUITE, ...(args.includes('--all') ? SMOKES : [])]
  .filter((j) => !only.length || only.includes(j.name))
  .flatMap((j) => (j.args.includes('BASE') ? MODES.map((mode) => ({ ...j, mode, args: [...j.args, '--platform', mode] })) : [j]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vite = join(ROOT, 'node_modules', '.bin', 'vite');

/** Serves dist/ with vite preview on PORT (builds it first when missing); resolves the server process and URL. */
async function serve() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.log('dist/ missing: vite build');
    const b = spawnSync(vite, ['build', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  const url = `http://127.0.0.1:${PORT}/`;
  const proc = spawn(vite, ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (out += d));
  for (let i = 0; i < 120; i++) {
    if (proc.exitCode !== null) throw new Error(`vite preview exited: ${out.trim().split('\n').slice(-3).join(' | ')}`);
    const ok = await fetch(url).then((r) => r.ok, () => false);
    if (ok) return { proc, url };
    await sleep(500);
  }
  proc.kill('SIGTERM');
  throw new Error(`vite preview did not answer on ${url} within 60 s`);
}

/** Runs one job; its output streams through, prefixed. Resolves { code, ms, known, verdict line }. */
function run(job, base) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [join(ROOT, job.script), ...job.args.map((a) => (a === 'BASE' ? base : a))], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const tag = job.mode ? `${job.name} ${job.mode}` : job.name;
    let known = 0;
    let last = '';
    let buf = '';
    const line = (l) => {
      if (/^KNOWN /.test(l)) known++;
      if (l.trim()) last = l.trim();
      console.log(`[${tag}] ${l}`);
    };
    const feed = (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach(line);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const timer = setTimeout(() => {
      console.log(`[${tag}] TIMEOUT after ${job.min} min: killed`);
      child.kill('SIGKILL');
    }, job.min * 60_000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (buf) line(buf);
      resolve({ code: signal ? 'timeout' : code, ms: Date.now() - t0, known, last });
    });
  });
}

let server = null;
const stop = () => server?.proc.kill('SIGTERM');
process.on('SIGINT', () => (stop(), process.exit(130)));
process.on('SIGTERM', () => (stop(), process.exit(143)));

const t0 = Date.now();
const results = [];
try {
  if (!given) server = await serve();
  const base = given ?? server.url;
  console.log(`regression suite against ${base} (platform ${PLATFORM}): ${jobs.map((j) => (j.mode ? `${j.name} ${j.mode}` : j.name)).join(', ')}`);
  for (const job of jobs) results.push({ job, ...(await run(job, base)) });
} catch (e) {
  console.log(`SUITE ERROR ${e.message}`);
  results.push({ job: { name: 'setup' }, code: 1, ms: 0, known: 0, last: e.message });
} finally {
  stop();
}

const verdict = (r) => (r.code === 0 ? (r.known ? `PASS, ${r.known} KNOWN` : 'PASS') : r.code === 2 ? 'NOT ASSESSED' : r.code === 'timeout' ? 'FAIL (timeout)' : 'FAIL');
console.log('\n| script | platform | verdict | time |\n| --- | --- | --- | --- |');
for (const r of results) console.log(`| ${r.job.name} | ${r.job.mode ?? 'any'} | ${verdict(r)} | ${(r.ms / 1000).toFixed(0)} s |`);
const failed = results.filter((r) => r.code !== 0 && r.code !== 2).length;
const unassessed = results.filter((r) => r.code === 2).length;
const known = results.reduce((a, r) => a + r.known, 0);
console.log(`\nsuite: ${((Date.now() - t0) / 1000).toFixed(0)} s; ${failed ? `FAIL (${failed} script(s))` : unassessed ? `NOT ASSESSED (${unassessed} script(s) could not run)` : known ? `PASS except ${known} KNOWN bug check(s)` : 'PASS'}`);
process.exit(failed ? 1 : unassessed ? 2 : 0);
