// I5c: promote a mounted class end to end: derive.mjs, sheetbuild.mjs, finish.mjs, anchorcheck.mjs, qc.mjs (with
// the spec, so its stature applies), and a count of the QC warnings by kind.
// Usage: node scripts/art/pixellab/i5c/build.mjs <class> --qc <qc out dir> [--gifs <dir>]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const cls = args[0];
const spec = join(ROOT, 'docs/v5/pixellab/I5c', `${cls}.sheet.json`);
const man = join(ROOT, 'src/assets/sheets', cls, 'manifest.json');
const here = new URL('.', import.meta.url).pathname;
const run = (script, a) => execFileSync('node', [script, ...a], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
process.stdout.write(run(join(here, 'derive.mjs'), [cls]));
process.stdout.write(run(join(here, '../sheetbuild.mjs'), [spec]).split('\n').filter((l) => !l.includes('drifted')).join('\n'));
process.stdout.write(run(join(here, 'finish.mjs'), [spec]));
process.stdout.write(run(join(here, 'anchorcheck.mjs'), [man]));
const qcOut = opt('qc');
let qcText;
try {
  qcText = run(join(here, '../qc.mjs'), [man, '--spec', spec, '--out', qcOut]);
} catch (e) {
  qcText = e.stdout?.toString() ?? '';
}
console.log(qcText.split('\n').filter((l) => !l.startsWith('warn')).join('\n'));
const q = JSON.parse(readFileSync(join(qcOut, `${cls}_qc.json`), 'utf8'));
const kinds = {};
for (const w of q.warnList) {
  const k = w.replace(/^(\S+ \S+) f\d+ /, '$1 ').replace(/\d+(\.\d+)?/g, 'N');
  kinds[k] = (kinds[k] ?? 0) + 1;
}
for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} ${k}`);
if (opt('gifs')) run(join(here, '../sheetgifs.mjs'), [man, opt('gifs'), '--scale', '2', '--strips']);
