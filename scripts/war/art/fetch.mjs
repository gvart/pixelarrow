// Download PixelLab raws for the war region art (ART-4) into a git-ignored raw dir.
// Usage:
//   node scripts/war/art/fetch.mjs tiles <tiles_pro id> <out dir>     -> <out dir>/tile_0..15.png (tile_i = mask i)
//   node scripts/war/art/fetch.mjs url <image url> <out file>          -> one PNG (map objects)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const USER = '8842657e-a1a9-4211-968e-4924a65fa8ac'; // PixelLab storage owner of the tiles
const [kind, id, out] = process.argv.slice(2);

async function get(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

if (kind === 'tiles' && id && out) {
  for (let i = 0; i < 16; i++)
    await get(`https://backblaze.pixellab.ai/file/pixellab-tiles/${USER}/${id}/tile_${i}.png`, join(out, `tile_${i}.png`));
  console.log('16 tiles ->', out);
} else if (kind === 'url' && id && out) {
  await get(id, out);
  console.log('->', out);
} else {
  console.error('usage: fetch.mjs tiles <id> <dir> | url <url> <file>');
  process.exit(2);
}
