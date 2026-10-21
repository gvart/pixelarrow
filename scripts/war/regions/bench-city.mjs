// W-48 city bench: a landmark region with its full pre-built city, 600 units (50 squads of 12) marching across it
// and 300 vs 300 brawling, as scripts/war/bench.mjs. Prints the pre-built count, the region's gzipped size, parse time
// and heap, and the step time. Usage: node scripts/war/regions/bench-city.mjs [region=ammon] [ticks=1200]
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const id = process.argv[2] ?? 'ammon', ticks = Number(process.argv[3] ?? 1200);
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
const { module: sim } = await runnerImport('/src/war/sim/index.ts', opts);
const { module: bots } = await runnerImport('/src/war/sim/bots.ts', opts);
const { module: schema } = await runnerImport('/src/war/region/schema.ts', opts);
const raw = readFileSync(`${ROOT}src/war/regions/${id}.json`, 'utf8');
global.gc?.();
const heap0 = process.memoryUsage().heapUsed, t0 = performance.now();
const region = schema.parseRegion(JSON.parse(raw));
const parseMs = performance.now() - t0;
const probe = sim.createSim(region, 1);
const createMs = performance.now() - t0;
global.gc?.(); // retained, not the garbage of the parse (without --expose-gc: a no-GC delta, garbage included)
const heap = (process.memoryUsage().heapUsed - heap0) / 1e6;
void probe;
const summary = (ms) => { const s = [...ms].sort((a, b) => a - b), avg = ms.reduce((a, b) => a + b, 0) / ms.length; return `avg ${avg.toFixed(2)} ms, p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)} ms, max ${s.at(-1).toFixed(2)} ms`; };
console.log(`${id}: prebuilt ${region.prebuilt?.length ?? 0}, json ${(raw.length / 1e6).toFixed(2)} MB, gzip ${(gzipSync(raw).length / 1e6).toFixed(2)} MB, parse ${parseMs.toFixed(0)} ms, parse+sim ${createMs.toFixed(0)} ms, heap ~${heap.toFixed(0)} MB${global.gc ? '' : ' (no GC: run with --expose-gc)'}; per room see scripts/war/regions/mem.mjs`);
// open walkable tiles near the landmark's claim (its streets), for spawn points
const cp = region.claimPoints.at(-1);
const W = region.w, open = (x, y) => { const i = y * W + x; return region.water[i] !== 2 && region.terrain[i] !== 'rock'; };
const busy = new Set();
for (const e of region.prebuilt ?? []) for (let n = 0; n < (e.tiles ?? []).length; n += 2) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) busy.add((e.tiles[n + 1] + dy) * W + e.tiles[n] + dx);
const cand = [];
for (let y = 4; y < region.h - 4; y += 3) for (let x = 4; x < W - 4; x += 3) if (Math.hypot(x - cp.x, y - cp.y) < 240 && open(x, y) && !busy.has(y * W + x)) cand.push([x, y, Math.hypot(x - cp.x, y - cp.y)]);
cand.sort((a, b) => a[2] - b[2]);
const ring = [];
for (const c of cand) if (ring.length < 50 && ring.every((r) => Math.hypot(r[0] - c[0], r[1] - c[1]) > 7)) ring.push(c);
{
  const war = sim.createSim(region, 1), ms = [];
  ring.forEach(([x, y], k) => { const s = war.spawnSquad(`p${k}`, 0, 'militia', 12, x, y); war.order({ kind: 'move', squad: s, x: 2 * cp.x - x, y: 2 * cp.y - y }); });
  for (let t = 0; t < ticks; t++) war.step(), ms.push(war.stats().stepMs);
  console.log(`march across the city: squads ${ring.length}, units ${war.stats().units}: ${summary(ms)}`);
}
{
  const war = sim.createSim(region, 2), ai = bots.createBots(war), ms = [];
  ring.forEach(([x, y], k) => { const s = war.spawnSquad(`b${k}`, k % 2, ['militia', 'hoplite', 'archer', 'celt_sword', 'slinger'][k % 5], 12, x, y); ai.set(s, { kind: 'attackMove', x: cp.x, y: cp.y }); });
  for (let t = 0; t < ticks; t++) war.step(), ai.tick(), ms.push(war.stats().stepMs);
  console.log(`brawl in the city: units ${war.stats().units}: ${summary(ms)}`);
}
