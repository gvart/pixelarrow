// I5b review: one contact sheet of several clips of a class, every frame numbered (clipsheet.mjs), for the
// frame-by-frame check. Usage: node scripts/art/pixellab/i5b/rv.mjs <class> <out.png> <anim>/<dir>/<attempt> ... [--scale 3] [--wrap 8]
//   dir: se ne sw nw or the full name
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../../lib/manifest.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, out, ...clips] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const specs = clips.map((c) => {
  const [anim, dir, att] = c.split('/');
  return `${anim}-${dir}-${att}=${join(ROOT, 'docs/v5/pixellab/I5b/raw', cls, 'clips', anim, D[dir] ?? dir, att)}`;
});
execFileSync('node', [join(ROOT, 'scripts/art/pixellab/clipsheet.mjs'), out, '--scale', opt('scale', '3'), '--wrap', opt('wrap', '8'), ...specs], { stdio: 'inherit' });
