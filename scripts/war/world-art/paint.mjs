// World map art v2 (W-42, W-43): one painted continent (Gemini, PROMPTS_ART.md §37c) with the Abyss and its Rim
// Wardens round it; the regions are fitted onto the painting and drawn as an inked overlay. Writes public/war/world/:
// base.png (+ @2x), borders.png (+ @2x), region-ids.png, regions.json, markers/ and banners/ (PixelLab, jobs.json).
// Usage: node scripts/war/world-art/paint.mjs   (source: public/war/world/src/painted.png; raws from fetch.mjs if present)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { LW, LH, SCALE } from './layout.mjs';
import { buildRegions, OUT, ROOT } from './regions.mjs';
import { landMask } from './landmask.mjs';
import { chains, chaikin, dp, inkLayer } from './ink.mjs';
import { ALLIANCES } from './biomes.mjs';

const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const RAW = join(SHOTS, 'war/pixellab/worldmap/raw');
const PAINTED = join(OUT, 'src', 'painted.png');
const MESA = [535, 340]; // the Omphalos mesa in the painting (logical px): the centre the grid is fitted round
const TWIST = [[125, 12, 20]]; // turn the grid's south-west corner off the bay so Pirate Coves still meets the Cape
const jobs = JSON.parse(readFileSync(new URL('./jobs.json', import.meta.url), 'utf8'));

function trimHard(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    img.data[i + 3] = img.data[i + 3] >= 128 ? 255 : 0; // pixel art: hard alpha
    if (img.data[i + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1 + 1) * 4), y * w * 4);
  return { w, h, data };
}
function upscale(img, n) {
  const w = img.w * n, h = img.h * n, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (((y / n) | 0) * img.w + ((x / n) | 0)) * 4;
    data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
  }
  return { w, h, data };
}

// the painting, resampled (lanczos + a light unsharp so it stays crisp) to the map size and twice that; JPEG, since a
// lossless painting would weigh 4 + 12 MB
function resample(w, h, out) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', PAINTED, '-vf', `scale=${w}:${h}:flags=lanczos,unsharp=5:5:0.6`, '-frames:v', '1', '-q:v', '2', out]);
}

export function paint() {
  const painted = readImage(PAINTED);
  const { land } = landMask(painted);
  const { ids, lab, regions } = buildRegions({ land, centre: MESA, twist: TWIST });
  const N = LW * LH;
  mkdirSync(OUT, { recursive: true });
  resample(LW * SCALE, LH * SCALE, join(OUT, 'base.jpg'));
  resample(LW * SCALE * 2, LH * SCALE * 2, join(OUT, 'base@2x.jpg'));

  const lines = chains(lab);
  writeImage(join(OUT, 'borders.png'), inkLayer(lines, LW * SCALE, LH * SCALE, SCALE));
  writeImage(join(OUT, 'borders@2x.png'), inkLayer(lines, LW * SCALE * 2, LH * SCALE * 2, SCALE * 2));
  // smooth outlines to match the inked borders (tints and highlights are filled with these)
  for (const r of Object.values(regions)) { const p = chaikin(r.polygon, 2, true).map(([x, y]) => [Math.round(x), Math.round(y)]); r.polygon = dp([...p, p[0]], 0.6).slice(0, -1); }

  // region ids raster (1 px per logical px, R = 1-based index in regions.json order; 0 = the Abyss) for hit tests
  const idImg = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { idImg[i * 4] = Math.max(0, lab[i]); idImg[i * 4 + 3] = 255; }
  writeImage(join(OUT, 'region-ids.png'), { w: LW, h: LH, data: idImg });

  for (const group of ['markers', 'banners']) {
    mkdirSync(join(OUT, group), { recursive: true });
    mkdirSync(join(OUT, 'src', group), { recursive: true });
    for (const name of Object.keys(jobs[group])) {
      const raw = join(RAW, group, `${name}.png`);
      const im = trimHard(readImage(existsSync(raw) ? raw : join(OUT, 'src', group, `${name}.png`)));
      writeImage(join(OUT, 'src', group, `${name}.png`), im);
      writeImage(join(OUT, group, `${name}.png`), upscale(im, SCALE));
      writeImage(join(OUT, group, `${name}@2x.png`), upscale(im, SCALE * 2));
    }
  }
  const doc = {
    note: 'World map v2 (W-42, W-43). Coordinates are map px of base.jpg (2048x1536; @2x files are the same art at 4096x3072). Layers, bottom up: base.jpg (the painted continent and the Abyss rim), region washes drawn by the view (neutral grey, owner colour, contested hatch), borders.png (inked region borders), labels at label, markers. polygon: outer outline, clockwise; centroid: area centre; label: name anchor; labelRoom: free width on the label row; crossings[neighbour]: point on the shared border where a transfer crosses. region-ids.png: 1024x768, red channel = 1-based index in this file\'s region order (0 = the Abyss), scale by 2 for map px. Built by scripts/war/world-art (regions.mjs, paint.mjs) from docs/WAR.md and src/painted.png; do not hand-edit.',
    size: [LW * SCALE, LH * SCALE],
    alliances: ALLIANCES,
    order: ids,
    regions,
  };
  writeFileSync(join(OUT, 'regions.json'), JSON.stringify(doc, null, 1).replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1,$2]'));
  console.log(`world map: ${ids.length} regions, ${lines.length} border lines`);
}

paint();
