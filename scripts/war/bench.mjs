// War sim bench (docs/impl/global-war-rebuild.md M1a): 30 squads x 20 units cross the
// test-ridge region (west <-> east over the ford, the bridge and the pass); prints the step time.
// Usage: npm run bench:war [-- ticks]   (default 1200 ticks = 2 min of game time)
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ticks = Number(process.argv[2] ?? 1200);
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
const { module: sim } = await runnerImport('/src/war/sim/index.ts', opts);
const { module: schema } = await runnerImport('/src/war/region/schema.ts', opts);
const region = schema.parseRegion(JSON.parse(readFileSync(`${ROOT}src/war/regions/test-ridge.json`, 'utf8')));

const war = sim.createSim(region, 1);
const shapes = ['line', 'column', 'wedge', 'loose'];
for (let k = 0; k < 30; k++) {
  const west = k % 2 === 0;
  const y = 12 + ((k * 9) % 136);
  const id = war.spawnSquad(`p${k}`, west ? 0 : 1, 'militia', 20, west ? 12 : 148, y);
  war.order({ kind: 'formation', squad: id, shape: shapes[k % 4] });
  war.order({ kind: 'move', squad: id, x: west ? 148 : 12, y: 148 - y + 12 });
}
const ms = [];
const REPATH = 600; // every squad re-paths at once (turns back west/east)
for (let t = 0; t < ticks; t++) {
  if (t === REPATH) for (let k = 0; k < 30; k++) war.order({ kind: 'move', squad: k, x: k % 2 === 0 ? 148 : 12, y: 12 + ((k * 9) % 136) });
  war.step();
  ms.push(war.stats().stepMs);
}
const sorted = [...ms].sort((a, b) => a - b);
const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const moving = war.snapshot().units.filter((u) => u.state === 'move').length;
console.log(`units ${war.stats().units}, ticks ${ticks}: avg ${avg.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${sorted.at(-1).toFixed(2)} ms (first tick ${ms[0].toFixed(2)} ms, 30 re-paths at tick ${REPATH}: ${ms[REPATH].toFixed(2)} ms); still moving ${moving}`);
