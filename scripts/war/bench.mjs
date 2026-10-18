// War sim bench (docs/impl/global-war-rebuild.md M1a, M1c), two runs on the test-ridge region:
//  - march: 30 squads x 20 units cross it (west <-> east over the ford, the bridge and the pass);
//  - brawl: 300 vs 300 (15 bot squads a side, mixed classes) attack-move into each other east of the river.
// Prints the step time of each. Usage: npm run bench:war [-- ticks]   (default 1200 ticks = 2 min of game time)
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ticks = Number(process.argv[2] ?? 1200);
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
const { module: sim } = await runnerImport('/src/war/sim/index.ts', opts);
const { module: bots } = await runnerImport('/src/war/sim/bots.ts', opts);
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
const summary = (ms) => {
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  return `avg ${avg.toFixed(2)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)} ms, max ${sorted.at(-1).toFixed(2)} ms`;
};
const moving = war.snapshot().units.filter((u) => u.state === 'move').length;
console.log(`march: units ${war.stats().units}, ticks ${ticks}: ${summary(ms)} (first tick ${ms[0].toFixed(2)} ms, 30 re-paths at tick ${REPATH}: ${ms[REPATH].toFixed(2)} ms); still moving ${moving}`);

// brawl: 3 rows x 5 squads a side, about 40 tiles apart
const brawl = sim.createSim(region, 2);
const ai = bots.createBots(brawl);
const classes = ['militia', 'hoplite', 'archer', 'celt_sword', 'slinger'];
for (let side = 0; side < 2; side++)
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const x = 114 + col * 10;
      const y = side === 0 ? 60 + row * 6 : 112 - row * 6;
      const id = brawl.spawnSquad(`p${side}-${row}-${col}`, side, classes[(row * 5 + col + side) % 5], 20, x, y);
      ai.set(id, { kind: 'attackMove', x, y: side === 0 ? 106 : 66 });
    }
const bms = [];
for (let t = 0; t < ticks; t++) {
  brawl.step();
  ai.tick();
  bms.push(brawl.stats().stepMs);
}
const snap = brawl.snapshot();
const dead = snap.units.filter((u) => u.state === 'dead');
const left = [0, 1].map((side) => snap.units.filter((u) => u.state !== 'dead' && snap.squads[u.squad].team === side).length);
console.log(`brawl: units ${snap.units.length}, ticks ${ticks}: ${summary(bms)}; fallen ${dead.length} (${dead.filter((u) => u.wounded).length} wounded), left ${left[0]} vs ${left[1]}`);
