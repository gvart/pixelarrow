// Guardians (ART-L): write docs/v5/pixellab/GUARD/<class>.sheet.json for mobs/build.mjs from the clips on disk.
// Generated clips are found under raw/<class>/clips/<anim>/<facing>/<attempt> (the newest attempt wins, or
// <anim>=<attempt> on the command line); a facing without a clip takes the mirror of its west twin, and a west facing
// without one takes the other west facing (big guardians: one south-west die / crash serves every row).
// Derived: hit (die frames 1, 2, 2, 1).
// Usage: node scripts/art/pixellab/guard/spec.mjs <class> [anim=attempt ...]
import { cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const G = 'docs/v5/pixellab/GUARD';
// per class: art scale (manifest `scale`; 0.55 = the soldier's 33 px/m), canvas and clip fps / strike / hold
const CLASSES = {
  bandit_king: { scale: 0.55, canvas: [96, 96] },
  bandit_captain: { scale: 0.55, canvas: [96, 96] },
  bandit_guard: { scale: 0.55, canvas: [96, 96] },
  bandit_archer: { scale: 0.55, canvas: [96, 96] },
  maenad: { scale: 0.55, canvas: [96, 96] },
  maenad_queen: { scale: 0.55, canvas: [96, 96] },
  // 12.1 px/m (256 px = 21 m): wingspan ~20 m, rendered 3 px per art px
  drakon: { scale: 1.5, canvas: [256, 256] },
  // 18 px/m: a 6 m giant is ~110 art px
  brontes: { scale: 1, canvas: [160, 160] },
  gyges: { scale: 1, canvas: [160, 160] },
  chimera: { scale: 0.55, canvas: [128, 128], template: true },
  scylla_head: { scale: 1, canvas: [128, 160] },
};
const FPS = { idle: 8, walk: 10, attack: 12, slash: 12, thrust: 14, shoot: 12, brace: 8, charge: 12, die: 10, block: 10, cheer: 10 };
const STRIKE = { attack: 6, slash: 6, thrust: 6, shoot: 8, charge: 6 };
const HOLD = { brace: 6, die: undefined };

const [cls, ...picks] = process.argv.slice(2);
const c = CLASSES[cls];
if (!c) throw new Error(`unknown guardian ${cls}`);
const raw = join(G, 'raw', cls);
const chosen = Object.fromEntries(picks.map((p) => p.split('=')));
const latest = (anim, dir) => {
  const d = join(raw, 'clips', anim, dir);
  if (!existsSync(d)) return null;
  if (chosen[anim]) return chosen[anim];
  const at = readdirSync(d).filter((a) => existsSync(join(d, a, 'frame_000.png'))).sort();
  return at.at(-1) ?? null;
};
const anims = existsSync(join(raw, 'clips')) ? readdirSync(join(raw, 'clips')) : [];
const ORDER = ['idle', 'walk', 'attack', 'slash', 'thrust', 'shoot', 'brace', 'charge', 'block', 'cheer', 'die'];
const clips = {};
for (const a of ORDER.filter((n) => anims.includes(n))) {
  const sw = latest(a, 'south-west');
  let nw = latest(a, 'north-west');
  if (!sw) continue;
  if (!nw) {
    // one south-west clip serves every row: copied to the north-west folder as attempt "sw"
    cpSync(join(raw, 'clips', a, 'south-west', sw), join(raw, 'clips', a, 'north-west', 'sw'), { recursive: true });
    nw = 'sw';
  }
  const job = { 'south-east': 'mirror:south-west', 'north-east': 'mirror:north-west', 'south-west': sw, 'north-west': nw };
  clips[a] = { fps: FPS[a] ?? 10, job, ...(STRIKE[a] !== undefined ? { strike: STRIKE[a] } : {}), ...(HOLD[a] !== undefined ? { hold: HOLD[a] } : {}) };
}
// run and fallBack / fallFwd are not copied: the player falls back to walk and die (SHEET_FORMAT "Animations")
if (clips.die) clips.hit = { fps: 12, of: 'die', frames: [1, 2, 2, 1] };
// sheets are mob classes (src/war/sim/mobs.ts: a mob kind's sheet is mob_<kind>)
const spec = { class: `mob_${cls}`, raw, rotations: join(raw, 'rot'), shrink: 1, scale: c.scale, canvas: c.canvas, pad: [0, 0], clips };
writeFileSync(join(G, `${cls}.sheet.json`), JSON.stringify(spec, null, 1) + '\n');
console.log(`${G}/${cls}.sheet.json: ${Object.keys(clips).join(' ')}`);
