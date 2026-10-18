// Polish: fetch the first frame a stored I5b clip job was started from (pixminimax returns it unchanged as image 0),
// so a clip can be re-run from exactly the same frame without rebuilding the first-frame canvases.
// Usage: node scripts/art/pixellab/polish/first.mjs <class> <anim> <dir> <attempt> <out.png>
//   dir: se ne sw nw (or the full name)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../../lib/manifest.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const [cls, anim, d, attempt, out] = process.argv.slice(2);
const dir = D[d] ?? d;
const jobs = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/I5b', `${cls}.jobs.json`), 'utf8'));
const j = jobs.find((x) => x.anim === anim && x.dir === dir && x.attempt === attempt);
if (!j) throw new Error(`${cls} ${anim} ${dir} ${attempt}: no such job`);
if (j.mode !== 'pixminimax') throw new Error(`${j.job}: not a pixminimax job (no input frame stored)`);
const res = await fetch(`https://api.pixellab.ai/mcp/images/${j.job}/download?index=0`);
if (!res.ok) throw new Error(`${j.job}: ${res.status}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await res.arrayBuffer()));
console.log(`${cls} ${anim} ${dir} ${attempt} (${j.first}) -> ${out}`);
