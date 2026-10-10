// WCAG contrast check of the v5 palette pairs (docs/v5/art/palette.json).
// Text pairs need 4.5:1 (DECISIONS V5-013), non-text UI pairs 3:1.
// Usage: node scripts/art/contrast.mjs [--md]   (--md prints a markdown table for the art bible)
// Exit code 1 when any pair fails.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pal = JSON.parse(readFileSync(join(ROOT, 'docs/v5/art/palette.json'), 'utf8'));

const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const rows = [];
let failed = 0;
for (const p of pal.pairs) {
  const fg = pal.ui[p.fg];
  const bg = pal.ui[p.bg];
  if (!fg || !bg) {
    rows.push({ ...p, r: NaN, min: 0, ok: false, note: `unknown token ${!fg ? p.fg : p.bg}` });
    failed++;
    continue;
  }
  const min = p.kind === 'text' ? 4.5 : 3;
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  rows.push({ ...p, fgHex: fg, bgHex: bg, r, min, ok });
}

if (process.argv.includes('--md')) {
  console.log('| Foreground | Background | Use | Ratio | Needs | Result |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const x of rows) console.log(`| \`${x.fg}\` ${x.fgHex ?? ''} | \`${x.bg}\` ${x.bgHex ?? ''} | ${x.use} | ${x.r.toFixed(2)}:1 | ${x.min}:1 | ${x.ok ? 'pass' : '**FAIL**'} |`);
} else {
  for (const x of rows) console.log(`${x.ok ? 'ok  ' : 'FAIL'} ${x.r.toFixed(2).padStart(5)} >= ${x.min}  ${x.fg} on ${x.bg}  (${x.use})${x.note ? ' ' + x.note : ''}`);
}
console.log(`${rows.length} pairs, ${failed} failing`);
process.exit(failed ? 1 : 0);
