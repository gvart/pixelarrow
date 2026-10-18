// Placeholder sprite sheet for the sheet runtime (src/art/sheetDoll.ts), until the
// PixelLab art lands: renders today's procedural hoplite into the sheet format
// (docs/v5/art/SHEET_FORMAT.md), one image per gear tier, each tier tinted so they
// tell apart on the field, and writes src/dev/sheets/hoplite/.
//
//   node scripts/dev/placeholder-sheet.mjs [class]      (default hoplite)
//
// The metal is drawn at rank 2 (burnished bronze, bright steel) and snapped to those
// ramps, which the manifest lists as its metal colours: the runtime swaps them per
// rarity. Some new animations are left out on purpose (slash, throw, shoot, sling,
// ready, stagger, kneel, adjust), so the battle shows their fallbacks.
// Load it in the dev server with ?sheets=dev.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { ROOT } from '../lib/harness.mjs';

const cls = process.argv[2] ?? 'hoplite';
const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' });
const pd = await server.ssrLoadModule('/src/art/paperdoll.ts');
const mat = await server.ssrLoadModule('/src/art/materials.ts');
const { ANIM, BATTLE_SCALE, DIRS, dollGeom, renderFrame } = pd;

/** Tier looks: gear (art + item def for the tier) and the tint that marks the tier. */
const LOOK = { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicRed' };
const TIERS = {
  basic: { helmet: ['pilos', 'pilos'], armor: ['linothorax', 'linothorax'], weapon: 'dory', shield: 'hoplon', tint: null },
  veteran: { helmet: ['chalcidian', 'chalcidian'], armor: ['cuirass', 'bell_cuirass'], weapon: 'bronze_dory', shield: 'hoplon', tint: 0x2f6ad0 },
  elite: { helmet: ['corinthian', 'corinthian'], armor: ['cuirass', 'cuirass'], weapon: 'bronze_dory', shield: 'aspis', tint: 0xd03a8a },
};
const R = 2; // rank of the drawn metal: every metal surface lands in the glint mask

function spec(t) {
  return {
    look: LOOK,
    weapon: 'spear',
    shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } },
    helmet: { art: t.helmet[0], paint: { field: 'red' } },
    armor: t.armor[0],
    cloak: 'cloakRed',
    seed: 3,
    scale: BATTLE_SCALE,
    gear: { weapon: { def: t.weapon, r: R }, shield: { def: t.shield, r: R }, helmet: { def: t.helmet[1], r: R }, armor: { def: t.armor[1], r: R } },
  };
}

const turn = (dir, a) => {
  const [x, y] = DIRS[dir];
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** Animations of the placeholder: procedural columns (or a turned idle for the look-around). */
const LAYOUT = [
  ['idle', ANIM.idle, 4],
  ['walk', ANIM.walk, 12],
  ['run', ANIM.run, 12],
  ['attack', ANIM.attack, 14],
  ['block', ANIM.block, 4],
  ['hit', ANIM.hit, 8],
  ['die', ANIM.die, 12],
  ['dieB', ANIM.dieB, 12],
  ['rout', ANIM.rout, 11],
  ['win', ANIM.win, 2.6],
  ['thrust', ANIM.attack, 14],
  ['brace', [ANIM.block[0], ANIM.block[0]], 2],
  ['charge', ANIM.run, 12],
  ['cheer', [...ANIM.win, ANIM.idle[0]], 3],
  ['fallFwd', ANIM.die, 12],
  ['fallBack', ANIM.dieB, 12],
  ['look', [[0, 0], [0, 0.5], [0, 0.5], [0, 0], [0, -0.5], [0, -0.5]], 3],
];

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west']; // game rows 0..3 (DEFAULT_FACINGS)

const g = dollGeom(spec(TIERS.basic));
const cols = LAYOUT.reduce((n, [, f]) => n + f.length, 0);
const W = cols * g.fw;
const H = ROWS.length * g.fh;
const BR = mat.bronzeOf(R).ramp;
const IR = mat.ironOf(R).ramp;
const metalCols = [...BR.map((c) => [c, 'b']), ...IR.map((c) => [c, 'i'])];
const isMetal = new Set([...BR, ...IR]);

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const d2 = (a, b) => {
  const [p, q] = [rgb(a), rgb(b)];
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
};

function tierSheet(t) {
  const s = spec(t);
  const out = new Uint8Array(W * H * 4);
  let col = 0;
  for (const [, frames] of LAYOUT) {
    for (const f of frames) {
      for (let dir = 0; dir < ROWS.length; dir++) {
        const mask = new Uint8Array(g.fw * g.fh);
        const px = Array.isArray(f) ? renderFrame(s, ANIM.idle[f[0]], dir, mask, turn(dir, f[1])) : renderFrame(s, f, dir, mask);
        for (let y = 0; y < g.fh; y++)
          for (let x = 0; x < g.fw; x++) {
            const i = (y * g.fw + x) * 4;
            if (!px.data[i + 3]) continue;
            let c = (px.data[i] << 16) | (px.data[i + 1] << 8) | px.data[i + 2];
            if (mask[y * g.fw + x]) {
              // snap the metal to the listed ramps
              let best = metalCols[0][0];
              for (const [m] of metalCols) if (d2(c, m) < d2(c, best)) best = m;
              c = best;
            } else {
              if (t.tint !== null) {
                const [r0, g0, b0] = rgb(c);
                const [r1, g1, b1] = rgb(t.tint);
                c = (Math.round(r0 * 0.6 + r1 * 0.4) << 16) | (Math.round(g0 * 0.6 + g1 * 0.4) << 8) | Math.round(b0 * 0.6 + b1 * 0.4);
              }
              // never a listed metal colour by chance (it would take the rarity swap)
              if (isMetal.has(c)) c ^= 1;
            }
            const o = ((dir * g.fh + y) * W + col * g.fw + x) * 4;
            [out[o], out[o + 1], out[o + 2]] = rgb(c);
            out[o + 3] = px.data[i + 3];
          }
      }
      col++;
    }
  }
  return out;
}

// ---- a minimal PNG writer (RGBA, no colour chunks: the browser reads the exact colours back)
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const dir = join(ROOT, 'src', 'dev', 'sheets', cls);
mkdirSync(dir, { recursive: true });
const anims = {};
let c0 = 0;
for (const [name, frames, fps] of LAYOUT) {
  anims[name] = { col: c0, frames: frames.length, fps };
  c0 += frames.length;
}
const manifest = {
  version: 1,
  class: cls,
  frame: { w: g.fw, h: g.fh },
  anchor: { x: Math.floor(g.fw / 2), y: g.footY },
  scale: 1,
  rows: ROWS,
  tiers: { basic: 'basic.png', veteran: 'veteran.png', elite: 'elite.png' },
  anims,
  metal: [
    { kind: 'bronze', colors: BR.map(hex), slots: ['shield', 'helmet', 'armor'] },
    { kind: 'iron', colors: IR.map(hex), slots: ['weapon'] },
  ],
};
for (const [name, t] of Object.entries(TIERS)) {
  const file = join(dir, `${name}.png`);
  writeFileSync(file, png(W, H, tierSheet(t)));
  console.log(`${file}: ${W} x ${H}`);
}
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await server.close();
