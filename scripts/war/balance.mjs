// War crafting balance (docs/impl/global-war-rebuild.md M5h6): time and goods for a home to equip N fresh soldiers and
// one max squad at T1 / T2 / T3 forges, legendaries a master smith makes a play week, the rarity mix of crafted items
// vs drops, and power through warStatsOf. Deterministic (expected values, no dice).
// Usage: npm run balance:war      Loads the TypeScript harness (src/dev/craftBalance.ts) through Vite's module runner.
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // the repository root

const t0 = Date.now();
const { module } = await runnerImport('/src/dev/craftBalance.ts', { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } });
console.log(module.craftBalanceReport());
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
