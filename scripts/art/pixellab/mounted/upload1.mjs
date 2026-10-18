// I4b: upload PNGs to a PixelLab upload URL (MCP get_upload_url, valid 15 min) and print each one's upload:<id> ref.
// Usage: node scripts/art/pixellab/mounted/upload1.mjs <upload url> <a.png> [b.png ...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [url, ...files] = process.argv.slice(2);
for (const f of files) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(f)], { type: 'image/png' }), basename(f));
  const res = await fetch(url, { method: 'POST', body: form });
  const j = await res.json();
  if (!j.ref) throw new Error(`${f}: ${JSON.stringify(j)}`);
  console.log(`${f} ${j.ref}`);
}
