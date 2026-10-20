// Download the ART-T PixelLab raws listed in trade-jobs.json into the git-ignored raw dir (skips files already there).
// Usage: node scripts/war/art/trade-fetch.mjs [pixellab dir]   -> <dir>/trade/raw/<name>.png
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const RAW = join(PIX, 'trade/raw'), J = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/trade-jobs.json'), 'utf8'));
mkdirSync(RAW, { recursive: true });
const get = async (url, file) => { if (existsSync(file)) return; const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); writeFileSync(file, Buffer.from(await r.arrayBuffer())); console.log('->', file); };
for (const [n, id] of Object.entries(J.objects)) await get(`https://api.pixellab.ai/mcp/map-objects/${id}/download`, join(RAW, `${n}.png`));
for (const [n, id] of Object.entries(J.states)) await get(`https://api.pixellab.ai/mcp/images/${id}/download`, join(RAW, `${n}.png`));
const Mu = J.mule; if (Mu?.walk) {
  for (const d of Object.keys(Mu.walk)) {
    mkdirSync(join(RAW, 'mule/rotations'), { recursive: true }); await get(`${Mu.base}rotations/${d}.png`, join(RAW, 'mule/rotations', `${d}.png`));
    mkdirSync(join(RAW, 'mule/walk', d), { recursive: true }); for (let i = 0; i < 8; i++) await get(`${Mu.base}animations/${Mu.walk[d]}/${d}/${i}.png`, join(RAW, 'mule/walk', d, `${i}.png`));
  }
}
// the warehouse's raws also feed the buildings pipeline (buildings/raw/objects/)
const BR = join(PIX, 'buildings/raw/objects'); mkdirSync(BR, { recursive: true });
for (const n of ['warehouse', 'warehouse-scaffold', 'warehouse-damaged']) if (existsSync(join(RAW, `${n}.png`)) && !existsSync(join(BR, `${n}.png`))) writeFileSync(join(BR, `${n}.png`), readFileSync(join(RAW, `${n}.png`)));
