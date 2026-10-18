// Re-render the landing hero diorama from the game's own art code (P5-LAND-ART, docs/v6/landing/ASSET_SPEC.md).
// Writes the 1x slab layers (all / ground / props) and the 2x formation layers into landing/assets-staging/hero/.
// Usage: node scripts/art/landing/diorama.mjs   (needs node_modules; encodes lossless WebP with cwebp when present)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { encodePng } from '../lib/png.mjs';
import { ROOT } from '../lib/manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'landing/assets-staging/hero');
// Field 18x18, battlefield seed 11 (a river ford with copses and rocks), slab sides 36 px, woods 0.3.
const F = 18, SEED = 11, DEPTH = 36, WOODS = 0.3;

mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: ROOT, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const slab = await server.ssrLoadModule(join(HERE, 'slab.ts'));
const units = await server.ssrLoadModule(join(HERE, 'units.ts'));
const write = (name, r) => {
  const png = join(OUT, name + '.png');
  writeFileSync(png, encodePng({ w: r.w, h: r.h, data: new Uint8Array(r.data.buffer) }));
  spawnSync('cwebp', ['-quiet', '-lossless', '-z', '9', '-metadata', 'none', png, '-o', join(OUT, name + '.webp')]);
  console.log(name, `${r.w}x${r.h}`);
};
write('landing_hero_terrain_1x', slab.render(F, SEED, DEPTH, WOODS, true, true));
write('landing_hero_terrain_ground_1x', slab.render(F, SEED, DEPTH, WOODS, false, true));
write('landing_hero_terrain_props_1x', slab.render(F, SEED, DEPTH, WOODS, true, false));
const cfg = JSON.parse(readFileSync(join(HERE, 'units.json'), 'utf8'));
for (const [side, blocks] of Object.entries(cfg.layers)) write(`landing_hero_units_${side}_2x`, units.render(F, cfg.h1, blocks));
await server.close();
