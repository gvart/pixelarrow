// Raw Gemini image -> processed, exact-size staged PNG (docs/v5/art/ASSET_PIPELINE.md, steps 2-4).
// The recipe comes from the asset's `kind` in docs/v5/art/asset-manifest.json:
//   painted   opaque illustration (fresco, vignette): cover-crop at the anchor, area downscale
//   cutout    painted art on #FF00FF (bust, chest, laurel): key, trim, contain at the anchor
//   icon      painted icon on #FF00FF: key, trim, contain, centred, `fill` of the square
//   frame     9-slice painted chrome on #FF00FF (frame, button, plaque): key, exact cover
//   pixel     pixel art on #FF00FF: hard key, trim, detect the fake-pixel grid, unscale,
//             snap to PA-WORLD, binary alpha, padded (never scaled) into the exact canvas
// Usage: node scripts/art/process.mjs <asset id> <raw image> [--ax 0.5] [--ay 0.5] [--tol 60] [--fringe 3] [--grid n] [--out file]
//        node scripts/art/process.mjs <name> <raw image> --kind pixel --size 32x32 [--out file]   (ad hoc, not in the manifest)
// Output: docs/v5/art/staging/<file>.png (nothing under public/ is touched; scripts/art/promote.mjs ships it).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage, writeImage } from './lib/png.mjs';
import { keyOut, trim, fit, detectGrid, unscale, snapToPalette, hardAlpha, blank, paste, countColors, alphaStats, keyResidue } from './lib/ops.mjs';
import { findAsset, stagedPath, ROOT } from './lib/manifest.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const [id, rawPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!id || !rawPath) {
  console.error('usage: node scripts/art/process.mjs <asset id> <raw image> [--ax 0.5] [--ay 0.5] [--tol 60] [--grid n] [--out file]');
  process.exit(2);
}
// --kind k --size WxH: an ad-hoc asset not in the manifest yet (trials, world pixel art from a GDD)
const a = opt('kind') ? { id, file: `${id}.png`, kind: opt('kind'), size: opt('size').split('x').map(Number) } : findAsset(id);
const [W, H] = a.size;
const ax = Number(opt('ax', a.anchor?.[0] ?? 0.5));
const ay = Number(opt('ay', a.anchor?.[1] ?? 0.5));
const tol = Number(opt("tol", 60));
const fringe = Number(opt("fringe", 3));
process.on('uncaughtException', (e) => {
  console.error(`FAIL ${a.id}: ${e.message}`);
  process.exit(1);
});
const raw = readImage(rawPath);
console.log(`${a.id} ${a.file}: raw ${raw.w}x${raw.h} -> ${a.kind} ${W}x${H}`);

let out;
switch (a.kind) {
  case 'painted':
    out = fit(raw, W, H, { mode: 'cover', ax, ay });
    for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
    break;
  case 'cutout':
  case 'icon': {
    const fill = a.fill ?? (a.kind === 'icon' ? 0.9 : 1);
    const cut = trim(keyOut(raw, { tol, fringe }));
    const iw = Math.round(W * fill);
    const ih = Math.round(H * fill);
    const inner = fit(cut, iw, ih, { mode: 'contain', ax, ay });
    out = paste(blank(W, H), inner, Math.round((W - iw) / 2), a.kind === 'cutout' && ay === 1 ? H - ih : Math.round((H - ih) / 2));
    break;
  }
  case 'frame':
    out = fit(keyOut(raw, { tol, fringe }), W, H, { mode: 'cover', ax, ay });
    break;
  case 'pixel': {
    const pal = JSON.parse(readFileSync(join(ROOT, 'docs/v5/art/palette.json'), 'utf8')).world;
    const colours = Object.entries(pal).filter(([k]) => !k.startsWith('$')).flatMap(([, v]) => v);
    const cut = trim(keyOut(raw, { tol, fringe, hard: true }));
    const g = opt('grid') ? { n: Number(opt('grid')), px: 0, py: 0, fit: NaN } : detectGrid(cut);
    console.log(`  grid: ${g.n} px per art pixel (edge share on the grid ${(g.fit * 100).toFixed(0)}%)`);
    if (g.n < 2) throw new Error('no pixel grid found: this is not pixel art (regenerate, or pass --grid n)');
    const art = trim(hardAlpha(snapToPalette(unscale(cut, g.n, g.px, g.py), colours)));
    if (art.w > W || art.h > H) throw new Error(`pixel art is ${art.w}x${art.h}, larger than its ${W}x${H} canvas: regenerate at the grid size (never scale pixel art down)`);
    // feet / base on the bottom edge, centred: the anchor of world sprites
    out = paste(blank(W, H), art, Math.floor((W - art.w) / 2), H - art.h);
    break;
  }
  default:
    throw new Error(`unknown kind ${a.kind}`);
}

const dest = opt('out', stagedPath(a));
mkdirSync(dirname(dest), { recursive: true });
writeImage(dest, out);
const st = alphaStats(out);
console.log(`  wrote ${dest.replace(ROOT + '/', '')}: ${out.w}x${out.h}, ${countColors(out)} colours, alpha clear/partial/opaque ${st.clear}/${st.partial}/${st.opaque}, key residue ${keyResidue(out)} px`);
console.log(`  next: node scripts/art/check.mjs ${a.id} && node scripts/art/preview.mjs ${a.id}`);
