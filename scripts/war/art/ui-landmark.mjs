// War UI, rare-good icons (ART-L, WAR.md "Rare goods"): dragonbone, nereid pearl, star iron, asphodel, titan bronze,
// obsidian as res-<good> resource icons in the red-figure kit, made like the crafting goods (ui-craft.mjs): PixelLab pixen
// 32x32 (ids in landmark-jobs.json `icons`), fitted to 32 and 24 (+ @2x) and snapped to the kit palette (no new colours).
// Additive: run after ui.mjs, ui-redfigure.mjs and ui-craft.mjs. Raws: shots/war/pixellab/ui/raw/landmark/ (fetched).
// Usage: node scripts/war/art/ui-landmark.mjs   (ends with the QA gate; exit 1 on any failure)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, paste, resizeNearest, resizeArea, snapToPalette, hardAlpha, trim } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = join(ROOT, 'shots/war/pixellab/ui/raw/landmark'), OUT = join(ROOT, 'public/war/ui');
const jobs = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/landmark-jobs.json'), 'utf8')).icons;
for (const [id, job] of Object.entries(jobs)) {
  const p = join(RAW, `${id}.png`); if (existsSync(p)) continue;
  mkdirSync(RAW, { recursive: true }); const r = await fetch(`https://api.pixellab.ai/mcp/images/${job}/download`);
  if (!r.ok) throw new Error(`fetch ${id}: ${r.status}`); writeFileSync(p, Buffer.from(await r.arrayBuffer()));
}
const manifest = JSON.parse(readFileSync(join(OUT, 'ui.json'), 'utf8')), PAL = manifest.palette;
const save = (rel, img) => { const im = snapToPalette(hardAlpha(img, 128), PAL); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); writeImage(join(OUT, rel + '.png'), im); writeImage(join(OUT, rel + '@2x.png'), resizeNearest(im, im.w * 2, im.h * 2)); return rel + '.png'; };
const fit = (img, size) => { const t = trim(img); const k = Math.min((size - 2) / t.w, (size - 2) / t.h, 1); const r = k < 1 ? hardAlpha(resizeArea(t, Math.max(1, Math.round(t.w * k)), Math.max(1, Math.round(t.h * k))), 110) : t; const o = blank(size, size); paste(o, r, Math.floor((size - r.w) / 2), Math.floor((size - r.h) / 2)); return o; };
// rare good -> its landmark (WAR.md "Rare goods")
const RARE = { 'res-dragonbone': 'krios', 'res-nereid-pearl': 'siren', 'res-star-iron': 'saddle', 'res-asphodel': 'erymanthos', 'res-titan-bronze': 'gorge', 'res-obsidian': 'canyons' };
for (const [id, region] of Object.entries(RARE)) {
  const im = hardAlpha(readImage(join(RAW, `${id}.png`)), 128);
  manifest.icons[id] = { group: 'resource', src: 'pixellab', 32: save(`icons/32/${id}`, fit(im, 32)), 24: save(`icons/24/${id}`, fit(im, 24)), goodTier: 'rare', landmark: region };
}
manifest.landmarkNote = 'ART-L icons: res-<rare good> (group resource, goodTier rare, landmark = the region whose landmark yields it). Built by ui-landmark.mjs after ui-craft.mjs; colours from the kit palette.';
writeFileSync(join(OUT, 'ui.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`ui landmark: ${Object.keys(RARE).length} rare-good icons`);

// ---------- QA (as ui-craft.mjs: sizes, @2x, binary alpha, palette, no background ring) ----------
const fails = [], pal = new Set(PAL.map((h) => parseInt(h.slice(1), 16)));
for (const id of Object.keys(RARE)) for (const sz of [32, 24]) {
  const rel = manifest.icons[id][sz], im = readImage(join(OUT, rel)); if (im.w !== sz || im.h !== sz) fails.push(`${rel}: ${im.w}x${im.h}`);
  let off = 0, semi = 0; for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3]; if (a && a < 255) semi++; if (a === 255 && !pal.has((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2])) off++; }
  if (semi) fails.push(`${rel}: ${semi} semi-transparent px`); if (off) fails.push(`${rel}: ${off} px off the palette`);
  let ring = 0, on = 0; for (let k = 0; k < im.w; k++) for (const p of [k, (im.h - 1) * im.w + k, k * im.w, k * im.w + im.w - 1]) { ring++; if (im.data[p * 4 + 3]) on++; }
  if (on > ring * 0.3) fails.push(`${rel}: ${on}/${ring} border px opaque (background?)`);
  let any = 0; for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) any++; if (any < sz * 2) fails.push(`${rel}: nearly empty`);
  const im2 = readImage(join(OUT, rel.replace('.png', '@2x.png'))); if (im2.w !== im.w * 2) fails.push(`${rel}: @2x is ${im2.w}x${im2.h}`);
}
if (fails.length) { console.log('UI LANDMARK QA FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('UI LANDMARK QA ok');
