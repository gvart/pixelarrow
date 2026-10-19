// War sim bench (docs/impl/global-war-rebuild.md M1a, M1c), two runs on the test-ridge region:
//  - march: 30 squads x 20 units cross the map west <-> east (over the ford, the bridge and
//    the pass), all re-pathing at once halfway;
//  - brawl: 300 vs 300 (15 bot squads a side, mixed classes) attack-move into each other on the east field;
//  - build: 30 squads x 20 workers each raise a camp, then a fort (fetching stone and wood from the camp): 30 sites
//    under construction at once (M2a); run twice, the second (JIT warm) is reported.
// Prints the step time of each. Usage: npm run bench:war [-- ticks [regionDir]]   (default 2400 ticks = 4 min of game time;
// regionDir holds a test-ridge.json + test-ridge.spots.ts, e.g. from scripts/war/buildTestRidge.ts 512 <dir>)
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ticks = Number(process.argv[2] ?? 2400);
const dir = process.argv[3] ? resolve(process.argv[3]) : `${ROOT}src/war/regions`;
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
const { module: sim } = await runnerImport('/src/war/sim/index.ts', opts);
const { module: bots } = await runnerImport('/src/war/sim/bots.ts', opts);
const { module: schema } = await runnerImport('/src/war/region/schema.ts', opts);
const { module: spots } = await runnerImport(`${dir}/test-ridge.spots.ts`, opts);
const { fieldE } = spots.SPOTS;
const region = schema.parseRegion(JSON.parse(readFileSync(`${dir}/test-ridge.json`, 'utf8')));

const shapes = ['line', 'column', 'wedge', 'loose'];
const [WX, EX] = [12, region.w - 12];
const ys = (k) => 14 + ((k * 15) % (region.h - 28));
const marchSim = () => {
  const war = sim.createSim(region, 1);
  for (let k = 0; k < 30; k++) {
    const west = k % 2 === 0;
    const id = war.spawnSquad(`p${k}`, west ? 0 : 1, 'militia', 20, west ? WX : EX, ys(k));
    war.order({ kind: 'formation', squad: id, shape: shapes[k % 4] });
    war.order({ kind: 'move', squad: id, x: west ? EX : WX, y: region.h - ys(k) });
  }
  return war;
};
const war = marchSim();
const ms = [];
const REPATH = Math.floor(ticks / 2); // every squad re-paths at once (turns back west/east)
for (let t = 0; t < ticks; t++) {
  if (t === REPATH) for (let k = 0; k < 30; k++) war.order({ kind: 'move', squad: k, x: k % 2 === 0 ? WX : EX, y: ys(k) });
  war.step();
  ms.push(war.stats().stepMs);
}
const summary = (ms) => {
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  return `avg ${avg.toFixed(2)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)} ms, max ${sorted.at(-1).toFixed(2)} ms`;
};
const moving = war.snapshot().units.filter((u) => u.state === 'move').length;
// the same 30 cross-map orders again, JIT warm: the worst search tick a running game sees
const warm = marchSim();
let warmMax = 0;
for (let t = 0; t < 20; t++) warm.step(), (warmMax = Math.max(warmMax, warm.stats().stepMs));
console.log(
  `march: units ${war.stats().units}, ticks ${ticks}: ${summary(ms)} (first tick, cold JIT ${ms[0].toFixed(2)} ms; ` +
    `30 cross-map orders, warm: worst tick ${warmMax.toFixed(2)} ms; 30 re-paths at tick ${REPATH}: ${ms[REPATH].toFixed(2)} ms); still moving ${moving}`,
);

// brawl: 3 rows x 5 squads a side, about 40 tiles apart, on the open field east of the river
const brawl = sim.createSim(region, 2);
const ai = bots.createBots(brawl);
const classes = ['militia', 'hoplite', 'archer', 'celt_sword', 'slinger'];
for (let side = 0; side < 2; side++)
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const x = fieldE[0] - 18 + col * 9;
      const y = fieldE[1] + (side === 0 ? -26 + row * 6 : 26 - row * 6);
      const id = brawl.spawnSquad(`p${side}-${row}-${col}`, side, classes[(row * 5 + col + side) % 5], 20, x, y);
      ai.set(id, { kind: 'attackMove', x, y: fieldE[1] + (side === 0 ? 20 : -20) });
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

// build: 30 claims spread over the map, a camp each, then a fort next to it (stone and wood fetched from the camp)
const buildRun = () => {
  const site = sim.createSim(region, 3);
  const near = (type, x, y) => {
    for (let r = 0; r < 24; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && site.checkPlacement(0, type, x + dx, y + dy).ok) return [x + dx, y + dy];
    return null;
  };
  const crews = [];
  for (let k = 0; k < 30; k++) {
    const x = 40 + (k % 6) * Math.floor((region.w - 80) / 5);
    const y = 40 + Math.floor(k / 6) * Math.floor((region.h - 80) / 4);
    site.claim(0, x, y, 30);
    const camp = near('camp', x, y);
    if (!camp) continue;
    const id = site.spawnSquad(`b${k}`, 0, 'militia', 20, camp[0] + 3, camp[1] + 3);
    site.order({ kind: 'placeBuilding', squad: id, type: 'camp', x: camp[0], y: camp[1] });
    crews.push([id, camp]);
  }
  site.addStock(0, 'wood', 1e6);
  site.addStock(0, 'stone', 1e6);
  const ms = [];
  for (let t = 0; t < ticks; t++) {
    if (t === 400)
      for (const [id, [cx, cy]] of crews) {
        const fort = near('fort', cx + 9, cy);
        if (fort) site.order({ kind: 'placeBuilding', squad: id, type: 'fort', x: fort[0], y: fort[1] });
      }
    site.step();
    ms.push(site.stats().stepMs);
  }
  return { site, ms };
};
buildRun(); // JIT warm-up
const { site, ms: sms } = buildRun();
const bs = site.snapshot().buildings;
const count = (st) => bs.filter((b) => b.state === st).length;
console.log(
  `build (warm): units ${site.stats().units}, ticks ${ticks}: ${summary(sms)}; sites ${bs.length} (done ${count('done')}, ` +
    `scaffold ${count('scaffold')}, foundation ${count('foundation')})`,
);
