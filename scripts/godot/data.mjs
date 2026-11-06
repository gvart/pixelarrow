// Data for the Godot port (docs/impl/godot-port.md P3) into godot/data/ (generated, not committed):
//   tables/<src path>.json   the JSON-safe exports of src/data, src/war/sim and src/war/world modules
//   regions/<id>.json        a parsed region without its layers; regions/<id>.cells: one u16 per tile
//   manifest.json            what was written (export kinds, dropped functions, region sizes and sha256), the Godot tests' check
// Usage: npm run data:godot      Loads src/dev/godotData.ts through Vite's module runner.
import { runnerImport } from 'vite';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${ROOT}godot/data`;
const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };

const t0 = Date.now();
const { module: m } = await runnerImport('/src/dev/godotData.ts', opts);
rmSync(OUT, { recursive: true, force: true });
const write = (rel, data) => { mkdirSync(dirname(`${OUT}/${rel}`), { recursive: true }); writeFileSync(`${OUT}/${rel}`, data); };

const manifest = { terrain: m.TERRAIN, tables: {}, regions: {} };
const tables = m.tables();
manifest.floats = m.tableFloats(tables);
for (const t of tables) {
  write(`tables/${t.name}.json`, t.json + '\n');
  manifest.tables[t.name] = { exports: t.exports, dropped: t.dropped };
}
for (const r of m.regions()) {
  write(`regions/${r.id}.json`, r.json + '\n');
  write(`regions/${r.id}.cells`, r.cells);
  manifest.regions[r.id] = { w: r.w, h: r.h, sha256: createHash('sha256').update(r.cells).digest('hex'), sample: r.sample };
}
write('manifest.json', JSON.stringify(manifest, null, 1) + '\n');
console.log(`${Object.keys(manifest.tables).length} tables, ${Object.keys(manifest.regions).length} regions in godot/data (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
