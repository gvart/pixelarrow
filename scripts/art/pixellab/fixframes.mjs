// Frame fixes after the per-frame review (I1b), applied to a fetched character's frames, listed in a JSON file
// so they can be re-run after a re-fetch: [{ "anim", "dir", "frame", "op", ... , "why" }]
//   op "copy"     replace the frame with frame `from` of the same clip (a rejected frame inside a hold)
//   op "clear"    make the pixels in `box` [x0,y0,x1,y1] transparent; with `light: true` only light pixels
//                 (luma > 110): stray scraps and specks
//   op "clip"     use clip `fromAnim` for this direction instead (a whole direction redone under another name);
//                 metadata.json is rewritten
//   op "recolor"  in `box`, light bronze pixels (luma > 110, red > blue) become `color` (e.g. the shaft's):
//                 a metallic glint on the butt end
// Usage: node scripts/art/pixellab/fixframes.mjs <raw zip dir> <fixes.json>
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../lib/png.mjs';
import { hexToRgb } from '../lib/ops.mjs';

const [zipDir, fixesPath] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(join(zipDir, 'metadata.json'), 'utf8'));
const frames = meta.states[0].frames.animations;
const luma = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
for (const f of JSON.parse(readFileSync(fixesPath, 'utf8'))) {
  if (f.op === 'clip') {
    frames[f.anim][f.dir] = frames[f.fromAnim][f.dir];
    writeFileSync(join(zipDir, 'metadata.json'), JSON.stringify(meta, null, 2));
    console.log(`${f.anim} ${f.dir}: clip from ${f.fromAnim} — ${f.why}`);
    continue;
  }
  const list = frames[f.anim]?.[f.dir];
  if (!list) throw new Error(`no ${f.anim} ${f.dir}`);
  const path = join(zipDir, list[f.frame]);
  if (f.op === 'copy') copyFileSync(join(zipDir, list[f.from]), path);
  else {
    const img = readImage(path);
    const [x0, y0, x1, y1] = f.box;
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * img.w + x) * 4;
      if (!img.data[i + 3]) continue;
      if (f.op === 'clear' && (!f.light || luma(img.data, i) > 110)) { img.data[i + 3] = 0; n++; }
      if (f.op === 'recolor' && luma(img.data, i) > 110 && img.data[i] > img.data[i + 2]) { img.data.set(hexToRgb(f.color), i); n++; }
    }
    writeImage(path, img);
    f.pixels = n;
  }
  console.log(`${f.anim} ${f.dir} f${f.frame}: ${f.op}${f.from !== undefined ? ` from f${f.from}` : ''}${f.pixels !== undefined ? ` (${f.pixels} px)` : ''} — ${f.why}`);
}
