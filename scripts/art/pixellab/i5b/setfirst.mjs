// I5b: promote a clip frame to a first frame (e.g. the guard: the last frame of the "takes guard" clip), also on the
// attack canvas (gatk), and upload both. Usage:
//   node scripts/art/pixellab/i5b/setfirst.mjs <class> <name> <upload url> <dir>:<anim>/<attempt>:<frame> [...]
//   dir: se ne sw nw. Writes first/<name>_<dir>.png (tall canvas) and first/<name>atk_<dir>.png... for name=guard: gatk_<dir>.png
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../../lib/manifest.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const [cls, name, url, ...items] = process.argv.slice(2);
const raw = join(ROOT, 'docs/v5/pixellab/I5b/raw', cls);
const files = [];
for (const it of items) {
  const [d, clip, f] = it.split(':');
  const dir = D[d];
  const [anim, att] = clip.split('/');
  const dst = join(raw, 'first', `${name}_${dir}.png`);
  copyFileSync(join(raw, 'clips', anim, dir, att, `frame_${String(f).padStart(3, '0')}.png`), dst);
  files.push(dst);
}
const atkName = name === 'guard' ? 'gatk' : `${name}atk`;
execFileSync('node', [join(ROOT, 'scripts/art/pixellab/i5b/repad.mjs'), cls, name, 'tall', 'atk', atkName], { stdio: 'inherit' });
for (const f of [...files]) files.push(f.replace(`${name}_`, `${atkName}_`));
execFileSync('node', [join(ROOT, 'scripts/art/pixellab/i5b/upload.mjs'), join(ROOT, 'docs/v5/pixellab/I5b/raw/refs.json'), url, ...files], { stdio: 'inherit' });
