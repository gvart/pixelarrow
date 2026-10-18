// A fetched PixelLab character -> the bake-off's processed strips, a contact sheet and GIFs.
// Usage: node scripts/art/pixellab/build.mjs <variant> <raw zip dir> <out dir> [--sheets dir] [--scale 4]
//   <raw zip dir>  what fetch.mjs unpacked (has metadata.json)
//   <out dir>      e.g. docs/v5/pixellab/I1/processed/<variant>; gets, for the first state:
//                    rot.png              the 8 rotations left to right (S SE E NE N NW W SW)
//                    <anim>_<dir>.png     one strip per animation and direction, frames left to right
//                    snap/ or remap/      the same files snapped to PA-WORLD, or remapped ramp-aware to PA-WORLD-DARK (--post)
//                    info.json            canvas, frame counts, figure boxes, colour counts raw vs snapped
//   --fps a=n,b=m  GIF frame rate per animation (default 10), e.g. walk_pixminimax=20,thrust=14
//   --sheets dir   also writes <variant>_sheet.png (rows: rotations, every animation in the 4 game
//                  facings, raw then snapped) and <variant>_<anim>.gif (4 facings, raw over snapped).
// The game's 4 true facings (src/art/paperdoll.ts DIRS rows 0..3): south-east, north-east, south-west, north-west.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../lib/png.mjs';
import { blank, snapToPalette, hardAlpha, paste, hexToRgb } from '../lib/ops.mjs';
import { ROOT } from '../lib/manifest.mjs';
import { bbox, colors } from './measure.mjs';
import { buildSheet, blit, DIRS8 } from './sheet.mjs';
import { remap, loadRamps } from './remap.mjs';

export const GAME_DIRS = ['south-east', 'north-east', 'south-west', 'north-west'];
const PAL = Object.entries(JSON.parse(readFileSync(join(ROOT, 'docs/v5/art/palette.json'), 'utf8')).world)
  .filter(([k]) => !k.startsWith('$')).flatMap(([, v]) => v);

export const snap = (img) => hardAlpha(snapToPalette(hardAlpha(img), PAL));

function strip(frames) {
  const out = blank(frames[0].w * frames.length, frames[0].h);
  frames.forEach((f, i) => paste(out, f, i * f.w, 0));
  return out;
}

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
/** --post snap (PA-WORLD nearest colour, I1) or remap (ramp-aware to PA-WORLD-DARK, I1b): the second set of strips. */
const POST = opt('post', 'snap');
const RAMPS = POST === 'remap' ? loadRamps() : null;
const post = POST === 'remap' ? (img) => remap(img, RAMPS) : snap;
const [variant, zipDir, outDir] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!variant || !zipDir || !outDir) {
  console.error('usage: node scripts/art/pixellab/build.mjs <variant> <raw zip dir> <out dir> [--sheets dir] [--scale 4]');
  process.exit(2);
}
const sheets = opt('sheets');
const scale = Number(opt('scale', 4));
const fps = Object.fromEntries((opt('fps', '') || '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
const meta = JSON.parse(readFileSync(join(zipDir, 'metadata.json'), 'utf8'));
const st = meta.states[0];
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, POST), { recursive: true });

const info = { variant, id: st.character.id, view: st.character.view, canvas: st.character.size, rot: {}, anims: {} };
const rot = DIRS8.map((d) => readImage(join(zipDir, st.frames.rotations[d])));
DIRS8.forEach((d, i) => (info.rot[d] = { box: bbox(rot[i]), colors: colors(rot[i]), post: colors(post(rot[i])) }));
writeImage(join(outDir, 'rot.png'), strip(rot));
writeImage(join(outDir, POST, 'rot.png'), strip(rot.map(post)));

const anims = {};
for (const [name, byDir] of Object.entries(st.frames.animations ?? {})) {
  anims[name] = {};
  info.anims[name] = {};
  for (const [dir, files] of Object.entries(byDir)) {
    const fr = files.map((f) => readImage(join(zipDir, f)));
    anims[name][dir] = fr;
    writeImage(join(outDir, `${name}_${dir}.png`), strip(fr));
    writeImage(join(outDir, POST, `${name}_${dir}.png`), strip(fr.map(post)));
    const boxes = fr.map((f) => bbox(f)).filter(Boolean);
    info.anims[name][dir] = {
      frames: fr.length, w: fr[0].w, h: fr[0].h,
      feetY: [Math.min(...boxes.map((b) => b.y + b.h - 1)), Math.max(...boxes.map((b) => b.y + b.h - 1))],
      colors: Math.max(...fr.map(colors)),
    };
  }
}
writeFileSync(join(outDir, 'info.json'), JSON.stringify(info, null, 1));
console.log(`${variant}: rot + ${Object.keys(anims).map((a) => `${a}[${Object.keys(anims[a]).length}]`).join(' ')} -> ${outDir}`);

if (sheets) {
  mkdirSync(sheets, { recursive: true });
  const rows = [
    { label: `${variant} ${info.view} raw: S SE E NE N NW W SW`, imgs: rot },
    { label: `${variant} ${POST === 'snap' ? 'snapped to PA-WORLD' : 'remapped to PA-WORLD-DARK'}`, imgs: rot.map(post) },
  ];
  for (const [name, byDir] of Object.entries(anims)) for (const d of GAME_DIRS) if (byDir[d]) {
    rows.push({ label: `${name} ${d} raw`, imgs: byDir[d] });
    rows.push({ label: `${name} ${d} ${POST}`, imgs: byDir[d].map(post) });
  }
  writeImage(join(sheets, `${variant}_sheet.png`), buildSheet(rows, { scale }));
  // GIF per animation: the 4 game facings side by side, raw on top, snapped below
  for (const [name, byDir] of Object.entries(anims)) {
    const dirs = GAME_DIRS.filter((d) => byDir[d]);
    const n = Math.max(...dirs.map((d) => byDir[d].length));
    const fw = byDir[dirs[0]][0].w, fh = byDir[dirs[0]][0].h;
    const tmp = join(sheets, `.gif_${variant}_${name}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp);
    const bg = hexToRgb('#8f8a42');
    for (let f = 0; f < n; f++) {
      const W = dirs.length * fw * scale, H = 2 * fh * scale;
      const img = blank(W, H);
      for (let i = 0; i < W * H; i++) img.data.set([...bg, 255], i * 4);
      dirs.forEach((d, i) => {
        const fr = byDir[d][f % byDir[d].length];
        blit(img, fr, i * fw * scale, 0, scale);
        blit(img, post(fr), i * fw * scale, fh * scale, scale);
      });
      writeImage(join(tmp, `f${String(f).padStart(3, '0')}.png`), img);
    }
    const gif = join(sheets, `${variant}_${name}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps[name] ?? 10), '-i', join(tmp, 'f%03d.png'),
      '-vf', 'split[a][b];[a]palettegen=reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
    rmSync(tmp, { recursive: true, force: true });
    console.log(`  ${gif}`);
  }
}
