// Measures the probe Worker (worker.ts) running under local `wrangler dev` (V6-ACCT-01).
//   node scripts/pbkdf2-probe/measure.mjs <base url> [workerd pid] [runs]
// For each iteration count: 2 warm-up requests, then <runs> sequential requests (default 20).
// Wall time is per request, measured here. CPU is the workerd process's CPU-time delta over the
// runs (ps cputime), divided by the run count, so it includes per-request overhead (see the
// iter=1 baseline row). Local numbers only: production cpu_ms must be read on a deployed Worker.
import { execFileSync } from 'node:child_process';

const [base, pid, runsArg] = process.argv.slice(2);
if (!base) throw new Error('usage: measure.mjs <base url> [workerd pid] [runs]');
const runs = Number(runsArg ?? 20);
const COUNTS = [1, 100_000, 100_001, 200_000, 310_000, 400_000, 600_000, 1_000_000];

function cpuSeconds() {
  if (!pid) return NaN;
  // macOS/Linux "time" column: [[dd-]hh:]mm:ss.cc
  const t = execFileSync('ps', ['-o', 'time=', '-p', pid]).toString().trim();
  const parts = t.split(/[-:]/).map(Number);
  return parts.reduce((acc, v) => acc * 60 + v, 0);
}

async function hit(iter) {
  const t0 = performance.now();
  const res = await fetch(`${base}/hash?iter=${iter}`);
  const body = await res.json();
  return { ms: performance.now() - t0, body };
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const rows = [];
for (const iter of COUNTS) {
  const first = await hit(iter);
  await hit(iter);
  if (!first.body.ok) {
    rows.push({ iter, accepted: false, error: first.body.error });
    continue;
  }
  const times = [];
  const c0 = cpuSeconds();
  for (let i = 0; i < runs; i++) times.push((await hit(iter)).ms);
  const cpuMs = ((cpuSeconds() - c0) * 1000) / runs;
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / runs;
  rows.push({
    iter,
    accepted: true,
    runs,
    wallMeanMs: +mean.toFixed(1),
    wallP50Ms: +pct(times, 0.5).toFixed(1),
    wallP95Ms: +pct(times, 0.95).toFixed(1),
    wallMaxMs: +times[runs - 1].toFixed(1),
    cpuMsPerHash: Number.isNaN(cpuMs) ? null : +cpuMs.toFixed(1),
  });
}
console.log(JSON.stringify(rows, null, 2));
