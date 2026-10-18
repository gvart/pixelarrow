// Download a PixelLab image job's frames (animate_with_skeleton_v3, animate_image_pixminimax, ...) into a folder.
// Usage: node scripts/art/pixellab/getclip.mjs <job id> <frames> <out dir> [--skip 1]
//   frames  how many images the job returns (pixminimax: frame_count + 1, index 0 = the input frame)
//   --skip  leading images to drop (1 for pixminimax: its index 0 is the first frame sent, unchanged)
// Writes <out dir>/frame_NNN.png (0-based after the skip) and job.json { job, frames, skip }.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [job, n, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!out) {
  console.error('usage: node scripts/art/pixellab/getclip.mjs <job id> <frames> <out dir> [--skip 1]');
  process.exit(2);
}
const skip = Number(opt('skip', 0));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (let i = skip; i < Number(n); i++) {
  const res = await fetch(`https://api.pixellab.ai/mcp/images/${job}/download?index=${i}`);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('png')) throw new Error(`frame ${i}: ${res.status} ${res.headers.get('content-type')}`);
  writeFileSync(join(out, `frame_${String(i - skip).padStart(3, '0')}.png`), Buffer.from(await res.arrayBuffer()));
}
writeFileSync(join(out, 'job.json'), JSON.stringify({ job, frames: Number(n) - skip, skip }));
console.log(`${job}: ${Number(n) - skip} frames -> ${out}`);
