// Golden traces of the TS sim for the Godot port (docs/impl/godot-port.md P1): one JSON per catalogue scenario in
// godot/tests/golden/ (generated, not committed), and the per-module vectors (src/dev/godotVectors.ts) in
// godot/tests/golden/vectors/. Deterministic: two runs give the same bytes.
// Usage: npm run traces:godot [-- <scenario id> ...]      Loads src/dev/godotTraces.ts through Vite's module runner.
import { runnerImport } from 'vite';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${ROOT}godot/tests/golden`;
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };

const t0 = Date.now();
const { module: m } = await runnerImport('/src/dev/godotTraces.ts', opts);
const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
mkdirSync(OUT, { recursive: true });
for (const id of ids.length ? ids : m.scenarioIds()) {
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify(m.traceById(id)) + '\n');
  process.stdout.write('.');
}
if (!ids.length) {
  const { module: v } = await runnerImport('/src/dev/godotVectors.ts', opts);
  const { module: j } = await runnerImport('/src/dev/godotJson.ts', opts);
  mkdirSync(`${OUT}/vectors`, { recursive: true });
  for (const [name, data] of Object.entries(v.vectors((b) => createHash('sha256').update(b).digest('hex')))) writeFileSync(`${OUT}/vectors/${name}.json`, j.exactJson(await data) + '\n'); // a module's vectors may be async (world)
}
console.log(`\n${ids.length || m.scenarioIds().length} traces in godot/tests/golden (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
