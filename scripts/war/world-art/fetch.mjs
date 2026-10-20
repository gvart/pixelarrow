// Downloads the PixelLab raws listed in jobs.json to shots/war/pixellab/worldmap/raw/<group>/<name>.png (skips existing).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './regions.mjs';

const jobs = JSON.parse(readFileSync(new URL('./jobs.json', import.meta.url), 'utf8'));
export const RAW = join(process.env.SHOTS || join(ROOT, 'shots'), 'war/pixellab/worldmap/raw');
for (const group of ['markers', 'banners']) {
  mkdirSync(join(RAW, group), { recursive: true });
  for (const [name, id] of Object.entries(jobs[group])) {
    const out = join(RAW, group, `${name}.png`);
    if (existsSync(out)) continue;
    const res = await fetch(`https://api.pixellab.ai/mcp/images/${id}/download`);
    if (!res.ok) { console.error(`${group}/${name}: HTTP ${res.status}`); continue; }
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`${group}/${name}`);
  }
}
