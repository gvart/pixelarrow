// Civilians (ART-S): write docs/v5/pixellab/CIV/<class>.sheet.json for mobs/build.mjs. South-west and north-west are
// generated; south-east and north-east are their mirrors. Attempts per clip default to a1; override as anim=attempt
// or anim=sw_attempt/nw_attempt.
// Usage: node scripts/art/pixellab/civ/spec.mjs <class> <work anim,...> [anim=attempt ...]
import { writeFileSync } from 'node:fs';

const [cls, works, ...over] = process.argv.slice(2);
const pick = Object.fromEntries(over.map((o) => o.split('=')));
const FPS = { idle: 8, walk: 12, run: 16, die: 10 };
const job = (anim) => {
  const [sw, nw = sw] = (pick[anim] ?? 'a1').split('/');
  return { 'south-east': 'mirror:south-west', 'north-east': 'mirror:north-west', 'south-west': sw, 'north-west': nw };
};
const clips = {};
for (const a of ['idle', 'walk', 'run', ...works.split(','), 'die']) clips[a] = { fps: FPS[a] ?? 8, job: job(a) };
clips.hit = { fps: 12, of: 'die', frames: [1, 2, 2, 1] };
const raw = `docs/v5/pixellab/CIV/raw/${cls}`;
const spec = { class: `civ_${cls}`, raw, rotations: `${raw}/rot`, shrink: 1, scale: 0.55, canvas: [96, 96], pad: [14, 24], clips };
writeFileSync(`docs/v5/pixellab/CIV/${cls}.sheet.json`, JSON.stringify(spec, null, 1) + '\n');
