// Region room memory (server/src/war/room.ts on server/src/war/regions.ts's parse): per region the retained heap (after
// GC) of the parsed region and of a fresh wild room (sim, bots, mobs, guardians, first snapshot) plus its saved state,
// the heap allocated on the way (garbage included: what a no-GC heap delta shows), the typed arrays' backing stores (off
// the JS heap, `arrayBuffers`; the grid search scratch among them is one per isolate), and the parse and init ms. A
// warm-up room on test-ridge runs first, so the first region does not pay for compiling the sim.
// Usage: node --expose-gc scripts/war/regions/mem.mjs [region ...]   (default ammon omphalos)
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['ammon', 'omphalos'];
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
const { module: schema } = await runnerImport('/src/war/region/schema.ts', opts);
const { module: roomMod } = await runnerImport('/server/src/war/room.ts', opts);
if (!global.gc) throw new Error('run with node --expose-gc');
const gc = () => { for (let i = 0; i < 3; i++) global.gc(); return process.memoryUsage().heapUsed; };
const used = () => process.memoryUsage().heapUsed;
const mb = (b) => (b / 1e6).toFixed(1);
const keep = [];
const ab = () => process.memoryUsage().arrayBuffers;
{ const { visual: _v, biomes: _b, ...r } = schema.parseRegion(JSON.parse(readFileSync(`${ROOT}src/war/regions/test-ridge.json`, 'utf8'))); JSON.stringify(new roomMod.WarRoom({ region: r, seed: 1, cap: 600, wild: true }).saveState()); }
for (const id of ids) {
  const raw = readFileSync(`${ROOT}src/war/regions/${id}.json`, 'utf8');
  const h0 = gc(), b0 = ab(), t0 = performance.now();
  const { visual: _v, biomes: _b, ...region } = schema.parseRegion(JSON.parse(raw)); // as server/src/war/regions.ts
  const t1 = performance.now(), a1 = used() - h0, h1 = gc(), t2 = performance.now();
  const room = new roomMod.WarRoom({ region, seed: 1, cap: 600, wild: true });
  const t3 = performance.now(), a2 = used() - h1, h2 = gc(), b2 = ab();
  const state = JSON.stringify(room.saveState()).length;
  keep.push(region, room);
  console.log(`${id}: heap: region ${mb(h1 - h0)} MB + room ${mb(h2 - h1)} MB = ${mb(h2 - h0)} MB retained (allocated ${mb(a1)} + ${mb(a2)} MB); typed arrays ${mb(b2 - b0)} MB; saved state ${mb(state)} MB; parse ${(t1 - t0).toFixed(0)} ms, room ${(t3 - t2).toFixed(0)} ms`);
}
