// I4a: upload the 8 rotations of a directory to a PixelLab upload URL (from the MCP get_upload_url, valid 15 min) and
// print the refs as the JSON a v3 import takes: { reference: upload:<south>, direction_images: { <dir>: upload:<id> } }.
// Usage: node scripts/art/pixellab/rollout/upload.mjs <rotations dir> <upload url>
import { readFileSync } from 'node:fs';
import { DIRS8 } from '../sheet.mjs';

const [dir, url] = process.argv.slice(2);
const refs = {};
for (const d of DIRS8) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(`${dir}/${d}.png`)], { type: 'image/png' }), `${d}.png`);
  const res = await fetch(url, { method: 'POST', body: form });
  const j = await res.json();
  if (!j.ref) throw new Error(`${d}: ${JSON.stringify(j)}`);
  refs[d] = j.ref;
}
const { south, ...rest } = refs;
console.log(JSON.stringify({ reference: south, direction_images: rest }));
