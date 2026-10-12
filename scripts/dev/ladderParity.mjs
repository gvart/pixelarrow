// Ladder parity scan (V5-052): every floor vs its frozen pre-EC-05 copy, see src/dev/ladderParity.ts.
// Usage: npm run balance:ladder [-- N [FROM-TO]]   (N = paired seeds per floor, default 300; e.g. 300 29-36)
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // the repository root

const n = Number(process.argv[2] ?? 300);
const [from, to] = (process.argv[3] ?? '1-50').split('-').map(Number);
const t0 = Date.now();
const { module } = await runnerImport('/src/dev/ladderParity.ts', { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } });
console.log(module.ladderParityReport(n, from, to ?? from));
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
