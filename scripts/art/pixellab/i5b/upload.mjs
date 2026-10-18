// I5b: upload PNGs to a PixelLab upload URL (MCP get_upload_url, valid 15 min) and merge their refs into a JSON map
// { "<file path>": "upload:<id>" } so a clip job can name its first frame by file.
// Usage: node scripts/art/pixellab/i5b/upload.mjs <refs.json> <upload url> <png> [<png> ...]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [refsPath, url, ...files] = process.argv.slice(2);
const refs = existsSync(refsPath) ? JSON.parse(readFileSync(refsPath, 'utf8')) : {};
for (const f of files) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(f)], { type: 'image/png' }), basename(f));
  const res = await fetch(url, { method: 'POST', body: form });
  const j = await res.json();
  if (!j.ref) throw new Error(`${f}: ${JSON.stringify(j)}`);
  refs[f] = j.ref;
  console.log(`${f} ${j.ref}`);
}
writeFileSync(refsPath, JSON.stringify(refs, null, 1));
