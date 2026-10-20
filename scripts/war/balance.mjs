// War balance (docs/impl/global-war-rebuild.md M5h6, M7h): the crafting report (time and goods for a home to equip N
// fresh soldiers and one max squad at T1 / T2 / T3 forges, legendaries a master smith makes a play week, the rarity mix
// of crafted items vs drops, power through warStatsOf), then the living-regions report (depth effort vs reward, guardian
// raids fought headless on the real region JSON, the landmark score cap against Omphalos, the rare-good flow).
// Deterministic (expected values and fixed seeds).
// Usage: npm run balance:war      Loads the TypeScript harnesses (src/dev/craftBalance.ts, src/dev/landmarkBalance.ts)
// through Vite's module runner.
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // the repository root
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };

const t0 = Date.now();
const { module } = await runnerImport('/src/dev/craftBalance.ts', opts);
console.log(module.craftBalanceReport());
const { module: lm } = await runnerImport('/src/dev/landmarkBalance.ts', opts);
console.log('');
console.log(lm.landmarkBalanceReport());
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
