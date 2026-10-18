// GIF of one or more clips side by side at real fps (each clip a folder of frame_NNN.png or a strip + frame width).
// Usage: node scripts/art/pixellab/gif.mjs <out.gif> --fps 14 [--scale 4] [--bg #8f8a42] <clip> [<clip> ...]
//   clip   a folder of frame_NNN.png, or <strip.png>:<frame width>
// Clips of different lengths loop on their own; cells are as big as the biggest frame, feet aligned at the bottom.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../lib/png.mjs';
import { blank, crop, hexToRgb } from '../lib/ops.mjs';
import { blit } from './sheet.mjs';

export function loadClip(spec) {
  const m = spec.match(/^(.*\.png):(\d+)$/);
  if (m) {
    const s = readImage(m[1]);
    const w = Number(m[2]);
    return Array.from({ length: Math.round(s.w / w) }, (_, i) => crop(s, { x: i * w, y: 0, w, h: s.h }));
  }
  return readdirSync(spec).filter((f) => /^frame_\d+\.png$/.test(f)).sort().map((f) => readImage(join(spec, f)));
}

/** Writes a looping GIF of rows of clips (rows: [[frames...], ...] per cell, one row). */
export function writeGif(out, clips, { fps = 10, scale = 4, bg = '#8f8a42' } = {}) {
  const cw = Math.max(...clips.flatMap((c) => c.map((f) => f.w))), ch = Math.max(...clips.flatMap((c) => c.map((f) => f.h)));
  const n = Math.max(...clips.map((c) => c.length));
  const tmp = `${out}.frames`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const bgc = hexToRgb(bg);
  for (let f = 0; f < n; f++) {
    const img = blank(clips.length * cw * scale, ch * scale);
    for (let i = 0; i < img.w * img.h; i++) img.data.set([...bgc, 255], i * 4);
    clips.forEach((c, i) => {
      const fr = c[f % c.length];
      blit(img, fr, (i * cw + Math.floor((cw - fr.w) / 2)) * scale, (ch - fr.h) * scale, scale);
    });
    writeImage(join(tmp, `f${String(f).padStart(3, '0')}.png`), img);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, 'f%03d.png'),
    '-vf', 'split[a][b];[a]palettegen=reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', out]);
  rmSync(tmp, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
  const [out, ...specs] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  writeGif(out, specs.map(loadClip), { fps: Number(opt('fps', 10)), scale: Number(opt('scale', 4)), bg: opt('bg', '#8f8a42') });
  console.log(out);
}
