// Guardians (ART-L): upload local PNGs to a PixelLab upload URL (get_upload_url) and print { file: "upload:<id>" }.
// Usage: node scripts/art/pixellab/guard/upload.mjs <upload url> <png...>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [url, ...files] = process.argv.slice(2);
const out = {};
for (const f of files) {
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(f)], { type: 'image/png' }), basename(f));
  const r = await (await fetch(url, { method: 'POST', body: fd })).json();
  out[f] = r.ref;
}
console.log(JSON.stringify(out, null, 1));
