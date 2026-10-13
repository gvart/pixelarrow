// What is in the JS chunks (QA-05, docs/v5/qa/PERF.md): builds the game with the project's Vite
// config into a temp dir and prints each chunk's size and its biggest modules (rendered length:
// the module's code in the chunk before minification, so shares, not minified bytes).
// Usage: node scripts/dev/bundle-stats.mjs [--top 25]
import { build } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const top = Number(args.includes('--top') ? args[args.indexOf('--top') + 1] : 25);
const out = mkdtempSync(join(tmpdir(), 'pa-bundle-'));
const rows = [];
try {
  await build({
    root,
    logLevel: 'warn',
    build: { outDir: out, emptyOutDir: true },
    plugins: [
      {
        name: 'bundle-stats',
        generateBundle(_o, bundle) {
          for (const [file, c] of Object.entries(bundle)) {
            if (c.type !== 'chunk') continue;
            const mods = Object.entries(c.modules).map(([id, m]) => ({ id: id.replace(/.*node_modules\/([^/]+).*/, 'npm:$1').replace(root, ''), len: m.renderedLength }));
            rows.push({ file, bytes: Buffer.byteLength(c.code), mods });
          }
        },
      },
    ],
  });
} finally {
  rmSync(out, { recursive: true, force: true });
}
const kb = (n) => `${(n / 1024).toFixed(0)} KiB`;
for (const c of rows.sort((a, b) => b.bytes - a.bytes)) {
  if (c.bytes < 50 * 1024) continue;
  console.log(`\n${c.file}: ${kb(c.bytes)} minified`);
  const by = new Map();
  for (const m of c.mods) by.set(m.id, (by.get(m.id) ?? 0) + m.len);
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  for (const [id, len] of [...by].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${((len / total) * 100).toFixed(1).padStart(5)}%  ${kb(len).padStart(7)}  ${id}`);
}
