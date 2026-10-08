// Headless balance report: many seeded bot-vs-bot battles plus targeted rule tests.
// Usage: npm run balance [-- N]   (N = matched battles, default 200)
// Loads the TypeScript harness (src/dev/balance.ts) through Vite's module runner.
import { runnerImport } from 'vite';

const n = Number(process.argv[2] ?? 200);
const t0 = Date.now();
const { module } = await runnerImport('/src/dev/balance.ts', { configFile: false, logLevel: 'error', server: { hmr: false } });
console.log(module.balanceReport(n));
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
