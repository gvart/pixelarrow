// WebP twins of the shipped icon atlases (QA-05, docs/v5/qa/PERF.md): BootScene loads
// public/icons/<name>.webp and falls back on the PNG when the browser cannot decode WebP.
// Near-lossless 60: every channel within 2/255 of the PNG (the pixel-art cells come out
// exact), about half the bytes of the PNG for the painted 160 px cells.
// scripts/art/webp-lock.json records the sha256 of the PNG each WebP was made from;
// tests/iconAtlas.test.ts fails when a PNG changes without its WebP.
// scripts/art/atlas.mjs runs this after it ships an atlas.
//
// Usage: node scripts/art/webp.mjs [ui] [items]   (no names = both)
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/manifest.mjs';

export const WEBP_ARGS = ['-near_lossless', '60', '-z', '9', '-metadata', 'none', '-quiet'];
export const LOCK = join(ROOT, 'scripts/art/webp-lock.json');

/** Encode public/icons/<name>.webp from its PNG and record the PNG's hash; false when cwebp is missing. */
export function encodeWebp(name) {
  const png = join(ROOT, 'public/icons', `${name}.png`);
  const webp = join(ROOT, 'public/icons', `${name}.webp`);
  const r = spawnSync('cwebp', [...WEBP_ARGS, png, '-o', webp], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.log(`FAIL: cwebp could not write ${name}.webp (${r.error?.message ?? r.stderr.trim()}); install libwebp, then run node scripts/art/webp.mjs ${name}`);
    return false;
  }
  const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
  lock[`${name}.png`] = createHash('sha256').update(readFileSync(png)).digest('hex');
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
  console.log(`${name}.webp: ${readFileSync(webp).length} B (png ${readFileSync(png).length} B)`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = process.argv.slice(2);
  const ok = (names.length ? names : ['ui', 'items']).map(encodeWebp).every(Boolean);
  process.exit(ok ? 0 : 1);
}
