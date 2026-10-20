// War sim bench (docs/impl/global-war-rebuild.md M1a, M1c), two runs on the test-ridge region:
//  - march: 50 squads x 12 units (SQUAD_MAX) cross the map west <-> east (over the ford, the bridge and
//    the pass), all re-pathing at once halfway;
//  - brawl: 300 vs 300 (25 bot squads a side, mixed classes) attack-move into each other on the east field;
//  - build: 50 squads x 12 workers each raise a camp, then a fort (fetching stone and wood from the camp): 50 sites
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
const SQUADS = 50, N = 12;
const ys = (k) => 14 + ((k * 9) % (region.h - 28));
const marchSim = () => {
  const war = sim.createSim(region, 1);
  for (let k = 0; k < SQUADS; k++) {
    const west = k % 2 === 0;
    const id = war.spawnSquad(`p${k}`, west ? 0 : 1, 'militia', N, west ? WX : EX, ys(k));
    war.order({ kind: 'formation', squad: id, shape: shapes[k % 4] });
    war.order({ kind: 'move', squad: id, x: west ? EX : WX, y: region.h - ys(k) });
  }
  return war;
};
const war = marchSim();
const ms = [];
const REPATH = Math.floor(ticks / 2); // every squad re-paths at once (turns back west/east)
for (let t = 0; t < ticks; t++) {
  if (t === REPATH) for (let k = 0; k < SQUADS; k++) war.order({ kind: 'move', squad: k, x: k % 2 === 0 ? WX : EX, y: ys(k) });
  war.step();
  ms.push(war.stats().stepMs);
}
const summary = (ms) => {
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  return `avg ${avg.toFixed(2)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)} ms, max ${sorted.at(-1).toFixed(2)} ms`;
};
const moving = war.snapshot().units.filter((u) => u.state === 'move').length;
// the same 50 cross-map orders again, JIT warm: the worst search tick a running game sees
const warm = marchSim();
let warmMax = 0;
for (let t = 0; t < 20; t++) warm.step(), (warmMax = Math.max(warmMax, warm.stats().stepMs));
console.log(
  `march: units ${war.stats().units}, ticks ${ticks}: ${summary(ms)} (first tick, cold JIT ${ms[0].toFixed(2)} ms; ` +
    `50 cross-map orders, warm: worst tick ${warmMax.toFixed(2)} ms; 50 re-paths at tick ${REPATH}: ${ms[REPATH].toFixed(2)} ms); still moving ${moving}`,
);

// brawl: 5 rows x 5 squads a side, about 40 tiles apart, on the open field east of the river
const brawl = sim.createSim(region, 2);
const ai = bots.createBots(brawl);
const classes = ['militia', 'hoplite', 'archer', 'celt_sword', 'slinger'];
for (let side = 0; side < 2; side++)
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const x = fieldE[0] - 18 + col * 9;
      const y = fieldE[1] + (side === 0 ? -30 + row * 5 : 30 - row * 5);
      const id = brawl.spawnSquad(`p${side}-${row}-${col}`, side, classes[(row * 5 + col + side) % 5], N, x, y);
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

// build: 50 claims spread over the map, a camp each, then a fort next to it (stone and wood fetched from the camp)
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
  for (let k = 0; k < SQUADS; k++) {
    const x = 40 + (k % 10) * Math.floor((region.w - 80) / 9);
    const y = 40 + Math.floor(k / 10) * Math.floor((region.h - 80) / 4);
    site.claim(0, x, y, 30);
    const camp = near('camp', x, y);
    if (!camp) continue;
    const id = site.spawnSquad(`b${k}`, 0, 'militia', N, camp[0] + 3, camp[1] + 3);
    site.order({ kind: 'placeBuilding', squad: id, type: 'camp', x: camp[0], y: camp[1] });
    crews.push([id, camp]);
  }
  site.addStock(0, 'wood', 1e6);
  site.addStock(0, 'stone', 1e6);
  const ms = [];
  for (let t = 0; t < ticks; t++) {
    if (t === 800) // camps take 6 workers at once: about 600 ticks
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

// neutral: the region's lairs (mobs.ts) against 8 squads sent at them from the claim point (neutral-clear)
{
  const war = sim.createSim(region, 1);
  war.spawnMobs();
  const cp = region.claimPoints[0], lairs = region.lairs;
  for (let k = 0; k < 8; k++) {
    const id = war.spawnSquad('you', 0, ['hoplite', 'archer', 'celt_sword', 'militia'][k % 4], N, cp.x + (k % 4) * 4, cp.y + 4 + Math.floor(k / 4) * 4);
    const l = lairs[cp.lairs[k % cp.lairs.length]];
    war.order({ kind: 'move', squad: id, x: l.x, y: l.y });
  }
  const ms = [];
  for (let t = 0; t < ticks; t++) war.step(), ms.push(war.stats().stepMs);
  const ls = war.snapshot().lairs;
  console.log(`neutral: units ${war.stats().units}, ticks ${ticks}: ${summary(ms)}; lairs ${ls.length} (cleared ${ls.filter((l) => l.state === 'cleared').length})`);
}

// fog (W-39): 600 units in 4 teams (50 squads of N, mixed classes) cross the map from its four sides: the vision update's share
{
  const war = sim.createSim(region, 4);
  const cls = ['militia', 'archer', 'hoplite', 'slinger'];
  const sides = [[WX, null], [EX, null], [null, 12], [null, region.h - 12]];
  for (let k = 0; k < SQUADS; k++) {
    const team = k % 4, [sx, sy] = sides[team], o = 30 + Math.floor(k / 4) * Math.floor((region.w - 60) / 12);
    const [x, y] = sx === null ? [o, sy] : [sx, o];
    const id = war.spawnSquad(`f${k}`, team, cls[k % 4], N, x, y);
    war.order({ kind: 'move', squad: id, x: region.w - x, y: region.h - y });
  }
  const ms = [], vms = [];
  for (let t = 0; t < ticks; t++) war.step(), ms.push(war.stats().stepMs), vms.push(war.stats().visionMs ?? 0);
  const g = war.teamGrid(0), seen = g.state.filter((s) => s > 0).length;
  console.log(`fog: units ${war.stats().units}, teams 4, ticks ${ticks}: step ${summary(ms)}; vision ${summary(vms)}; team 0 explored ${((seen / g.state.length) * 100).toFixed(1)}%`);
}

// craft (M5h2): 40 forges raised on open ground, 60 smiths working their queues (kept full), 480 builders then 240 of
// them fighting 60 foes: 600 units with 40 workplaces on the civilian loop
{
  const { module: roster } = await runnerImport('/src/war/sim/roster.ts', opts);
  const n = 200, flat = { id: 'f', name: 'f', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [] };
  const war = sim.createSim(flat, 5);
  war.claim(0, 70, 70, 70);
  for (const [r, v] of Object.entries({ wood: 1e5, stone: 1e5, iron: 1e5, charcoal: 1e5 })) war.addStock(0, r, v);
  const camp = war.spawnSquad('b', 0, 'militia', N, 46, 20);
  war.order({ kind: 'placeBuilding', squad: camp, type: 'camp', x: 46, y: 16 });
  for (let k = 0; k < 40; k++) {
    const x = 30 + (k % 8) * 12, y = 30 + Math.floor(k / 8) * 12;
    const id = war.spawnSquad(`b${k}`, 0, 'militia', N, x, y + 4);
    war.order({ kind: 'placeBuilding', squad: id, type: 'forge', x, y });
  }
  const forges = () => war.snapshot().buildings.filter((b) => b.type === 'forge' && b.state === 'done');
  let t0 = 0;
  for (; t0 < 12000 && forges().length < 40; t0 += 50) for (let i = 0; i < 50; i++) war.step();
  let done = forges();
  // 60 smiths: 20 forges get two, 20 get one (spawned before any foe, so the whole civilian quota is the team's)
  let pid = 0;
  done.forEach((b, i) => {
    const ps = Array.from({ length: i < 20 ? 2 : 1 }, () => roster.makePerson(`s${pid++}`, 'civ_smith', { level: 3 }));
    const s = war.spawnSquad(`c${i}`, 0, 'civ_smith', ps.length, b.x, b.y + 3, ps);
    war.order({ kind: 'civWork', squad: s, building: b.id });
  });
  for (let k = 0; k < 5; k++) war.spawnSquad(`e${k}`, 1, 'hoplite', N, 150 + k * 6, 150);
  for (let k = 2; k <= 40; k += 2) war.order({ kind: 'attackMove', squad: k, x: 150, y: 150 });
  const cms = [];
  let made = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 50 === 0) {
      done = forges();
      for (const b of done) for (let q = b.queue?.length ?? 0; q < 5; q++) war.order({ kind: 'craft', team: 0, building: b.id, recipe: 'item:dory' });
    }
    war.step();
    cms.push(war.stats().stepMs);
    made += war.events().filter((e) => e.kind === 'crafted').length;
  }
  console.log(`craft: units ${war.stats().units}, workplaces ${done.length} (built in ${t0} ticks), ticks ${ticks}: ${summary(cms)}; items made ${made}`);
}
