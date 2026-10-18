// Add a raw-image job's frames (animate_with_skeleton_v3 and the other image tools, which are not stored on the
// character) to a fetched character as one animation direction, so build.mjs treats it like the others.
// Usage: node scripts/art/pixellab/addclip.mjs <job id> <frames> <raw zip dir> <animation> <direction>
// Downloads https://api.pixellab.ai/mcp/images/<job>/download?index=i into
// <zip dir>/<state>/animations/<animation>/<direction>/frame_NNN.png and lists them in metadata.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [job, n, zipDir, anim, dir] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/art/pixellab/addclip.mjs <job id> <frames> <raw zip dir> <animation> <direction>');
  process.exit(2);
}
const metaPath = join(zipDir, 'metadata.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const st = meta.states[0];
const rel = (i) => `${st.folder}/animations/${anim}/${dir}/frame_${String(i).padStart(3, '0')}.png`;
mkdirSync(join(zipDir, st.folder, 'animations', anim, dir), { recursive: true });
const files = [];
for (let i = 0; i < Number(n); i++) {
  const res = await fetch(`https://api.pixellab.ai/mcp/images/${job}/download?index=${i}`);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('png')) throw new Error(`frame ${i}: ${res.status} ${res.headers.get('content-type')}`);
  writeFileSync(join(zipDir, rel(i)), Buffer.from(await res.arrayBuffer()));
  files.push(rel(i));
}
st.frames.animations ??= {};
st.frames.animations[anim] ??= {};
st.frames.animations[anim][dir] = files;
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`${anim} ${dir}: ${files.length} frames -> ${zipDir}`);
