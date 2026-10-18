// Render the living hero's sprite atlas from the game's own figure code (V6-LAND-02).
// Writes landing/public/hero/landing_hero_sprites_2x.webp (lossless) and the frame table
// landing/src/scripts/hero/atlas.json that the lazy hero module imports. Deterministic.
// Usage: node scripts/art/landing/sprites.mjs   (needs the root node_modules and cwebp)
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { encodePng } from '../lib/png.mjs';
import { ROOT } from '../lib/manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IMG = join(ROOT, 'landing/public/hero');
const META = join(ROOT, 'landing/src/scripts/hero');
mkdirSync(META, { recursive: true });
const server = await createServer({ root: ROOT, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const sprites = await server.ssrLoadModule(join(HERE, 'sprites.ts'));
const cfg = JSON.parse(readFileSync(join(HERE, 'units.json'), 'utf8'));
const r = sprites.render(cfg.layers);
const png = join(IMG, 'landing_hero_sprites_2x.png');
writeFileSync(png, encodePng({ w: r.w, h: r.h, data: new Uint8Array(r.data.buffer) }));
spawnSync('cwebp', ['-quiet', '-lossless', '-z', '9', '-metadata', 'none', png, '-o', join(IMG, 'landing_hero_sprites_2x.webp')]);
rmSync(png);
writeFileSync(join(META, 'atlas.json'), JSON.stringify({ w: r.w, h: r.h, ...r.meta }) + '\n');
console.log('atlas', `${r.w}x${r.h}`, r.meta.frames.length, 'frames,', r.meta.men.length, 'men');
await server.close();
