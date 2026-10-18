// Redraw a rotation's upright spear as a levelled one (couched at the hip, tip forward), padded onto a bigger
// canvas: the first frame of a skeleton-v3 thrust, so the model starts from a spear whose head is already at the
// front end (I1b: from an upright spear it carried the head backwards over the shoulder).
// Usage: node scripts/art/pixellab/spear.mjs <in.png> <out.png> --facing south-west --grip 15,36
//          [--box x0,y0,x1,y1] (erase everything in it: the old spear outside the silhouette)
//          [--column x,y0,y1] (repaint the old shaft where it crosses the body: each shaft-coloured pixel takes its
//                              right neighbour's colour; with --head x0,y0,x1,y1 the old spearhead the same way)
//          [--keep x0,y0,x1,y1] (the fist: restored over the new shaft) [--pad 128,128,30,40] [--ahead 38 --behind 20]
//          [--vec dx,dy] (the head's screen direction instead of the facing's levelled forward, e.g. an upright spear)
//          [--over both] (draw both ends over the sprite: a spear held in front of the man)
// Coordinates are in the input sprite's pixels. The part of the spear on the far side of the man is drawn only
// where the sprite is empty, so it passes behind him.
import { readImage, writeImage } from '../lib/png.mjs';
import { blank, paste, hexToRgb } from '../lib/ops.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const nums = (s) => (s ? s.split(',').map(Number) : null);
const [src, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const facing = opt('facing');
const [gx, gy] = nums(opt('grip'));
const [W, H, ox, oy] = nums(opt('pad', '128,128,30,40'));
const ahead = Number(opt('ahead', 38)), behind = Number(opt('behind', 20));

const img = readImage(src);
const get = (x, y) => img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
const SHAFT = new Set(['552c1d', '653722']);
const hex = (p) => [...p.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
const keep = nums(opt('keep'));
const inBox = (x, y, b) => b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const fist = [];
if (keep) for (let y = keep[1]; y <= keep[3]; y++) for (let x = keep[0]; x <= keep[2]; x++) fist.push([x, y, new Uint8Array(get(x, y))]);

const box = nums(opt('box'));
if (box) for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) if (!inBox(x, y, keep)) get(x, y)[3] = 0;
const col = nums(opt('column'));
if (col) for (let y = col[1]; y <= col[2]; y++) if (!inBox(col[0], y, keep) && SHAFT.has(hex(get(col[0], y)))) get(col[0], y).set(get(col[0] + 1, y));
const head = nums(opt('head'));
if (head) for (let y = head[1]; y <= head[3]; y++) for (let x = head[2]; x >= head[0]; x--) get(x, y).set(get(x + 1, y));

// screen direction of the man's forward (model3d camera: field +x down-right, +y down-left), tilted a little down
const F = { 'south-east': [0.894, 0.447], 'south-west': [-0.894, 0.447], 'north-east': [0.894, -0.447], 'north-west': [-0.894, -0.447] }[facing];
const tilt = 0.14;
const vec = nums(opt('vec'));
let [dx, dy] = vec ?? [F[0], F[1] + tilt];
const n = Math.hypot(dx, dy);
dx /= n; dy /= n;
// facing the camera (south-*): the head end is nearer the viewer than the man, the butt end farther; away (north-*): the reverse
const towards = facing.startsWith('south');
const both = opt('over') === 'both';

const o = blank(W, H);
paste(o, img, ox, oy);
const empty = (x, y) => o.data[(y * W + x) * 4 + 3] === 0;
const put = (x, y, rgb, over) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  if (!over && !empty(x, y)) return;
  o.data.set([...rgb, 255], (y * W + x) * 4);
};
const C = { shaft: hexToRgb('#653722'), dark: hexToRgb('#2a1a12'), butt: hexToRgb('#48271a'), line: hexToRgb('#120c0a'), bronze: hexToRgb('#987248'), bronzeD: hexToRgb('#6e4f32') };
const G = [gx + ox, gy + oy];
// shaft from the butt to the head's base; one dark pixel under it where the sprite is empty
for (let t = -behind; t <= ahead - 6; t += 0.5) {
  const over = both || (t >= 0 ? towards : !towards);
  const x = G[0] + dx * t, y = G[1] + dy * t;
  put(x, y + 1, C.dark, false);
  put(x, y, t <= -behind + 1 ? C.butt : C.shaft, over);
}
// a single leaf-shaped head at the front end; the butt end stays plain and blunt
const px = -dy, py = dx; // perpendicular
const half = [0, 1, 1, 2, 1, 1, 0];
for (let k = 0; k < half.length; k++) {
  const t = ahead - k;
  const cx = G[0] + dx * t, cy = G[1] + dy * t;
  for (let s = -half[k] - 1; s <= half[k] + 1; s++) {
    const edge = Math.abs(s) === half[k] + 1;
    put(cx + px * s, cy + py * s, edge ? C.line : s === 0 ? C.bronze : C.bronzeD, (towards || both) && !edge);
  }
}
put(G[0] + dx * (ahead + 1), G[1] + dy * (ahead + 1), C.line, false);
// the fist over the shaft
for (const [x, y, p] of fist) if (p[3]) o.data.set(p, ((y + oy) * W + x + ox) * 4);
writeImage(out, o);
console.log(`${out} ${W}x${H}: ${facing} spear levelled from (${G}) ahead ${ahead} behind ${behind}`);
