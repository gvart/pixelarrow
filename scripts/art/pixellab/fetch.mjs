// Download a PixelLab character (rotations + every animation) as its zip and unpack it.
// Usage: node scripts/art/pixellab/fetch.mjs <character id> <out dir>
//   <out dir> should be under docs/v5/pixellab/<job>/raw/ (gitignored, V5-086).
// Writes <out dir>/char.zip and unpacks it to <out dir>/zip/ (metadata.json, <state>/rotations/*.png,
// <state>/animations/<name>/<direction>/frame_NNN.png).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [id, out] = process.argv.slice(2);
if (!id || !out) {
  console.error('usage: node scripts/art/pixellab/fetch.mjs <character id> <out dir>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const res = await fetch(`https://api.pixellab.ai/mcp/characters/${id}/download`);
if (!res.ok || !(res.headers.get('content-type') ?? '').includes('zip')) {
  console.error(`FAIL ${res.status} ${res.headers.get('content-type')}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const zip = join(out, 'char.zip');
writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
const dir = join(out, 'zip');
rmSync(dir, { recursive: true, force: true });
execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
console.log(execFileSync('unzip', ['-l', zip]).toString().trim().split('\n').slice(-1)[0].trim(), '->', dir);
