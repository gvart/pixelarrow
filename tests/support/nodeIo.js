// File and process helpers for tests that check repo files and node scripts. Plain JS beside a
// .d.ts because the project's tsconfig has no Node types (types: vite/client only).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));

export const readText = (p) => readFileSync(abs(p), 'utf8');
export const sameFile = (a, b) => readFileSync(abs(a)).equals(readFileSync(abs(b)));

/** Every `.ts` file under `dir` (relative to the repo), with its text. */
export function sourceFiles(dir) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));
  return walk(abs(dir)).map((f) => ({ path: f.slice(ROOT.length + 1), text: readFileSync(f, 'utf8') }));
}

export const tempDir = () => mkdtempSync(join(tmpdir(), 'pa-test-'));
export const removeDir = (d) => rmSync(d, { recursive: true, force: true });

/** Run a repo node script; returns its exit status and output. */
export function runNode(script, args) {
  const r = spawnSync(process.execPath, [abs(script), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}
