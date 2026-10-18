// I5a: insert or extend the I5a section of docs/v5/ASSET_LOG.md and docs/playbook/PROMPTS_ART.md from text files, so the
// shared logs only change inside I5a's own sections.
// Usage: node scripts/art/pixellab/i5a/insertlog.mjs asset <file.md>   (first call: the section head goes after "## Done";
//                                                                        later calls: appended at the end of the I5a section)
//        node scripts/art/pixellab/i5a/insertlog.mjs prompts <file.md> (appended at the end of the I5a section)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [kind, file] = process.argv.slice(2);
const add = readFileSync(file, 'utf8').trimEnd() + '\n';
if (kind === 'prompts') {
  const p = join(ROOT, 'docs/playbook/PROMPTS_ART.md');
  // the end of the I5a section: the next '## ' heading after it (other agents' sections follow it)
  const lines = readFileSync(p, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && l.endsWith('(I5a)'));
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  while (end > start && lines[end - 1].trim() === '') end--;
  lines.splice(end, 0, '', ...add.trimEnd().split('\n'), '');
  writeFileSync(p, lines.join('\n'));
} else {
  const p = join(ROOT, 'docs/v5/ASSET_LOG.md');
  const lines = readFileSync(p, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('### I5a '));
  if (start < 0) {
    const done = lines.findIndex((l) => l.startsWith('## Done'));
    lines.splice(done + 2, 0, ...add.split('\n'));
  } else {
    let end = lines.findIndex((l, i) => i > start && l.startsWith('### '));
    if (end < 0) end = lines.length;
    while (end > start && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, '', ...add.trimEnd().split('\n'));
  }
  writeFileSync(p, lines.join('\n'));
}
console.log(`${kind}: +${add.split('\n').length} lines`);
