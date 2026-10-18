// Placeholder sprite sheet for the sheet runtime (src/art/sheetDoll.ts), until the
// PixelLab art lands: renders today's procedural hoplite into the sheet format
// (docs/v5/art/SHEET_FORMAT.md, v2): ONE image, basic tier colours, whose colour
// groups (cloak, crest, trim, skin) are snapped to exact ramps and listed in the
// manifest, so the runtime recolours them per tier (veteran: crimson cloak, white
// crest, ochre hem; elite: black cloak, gilded crest and hem) and per man (skin
// tone, cloak / crest shade). Writes src/dev/sheets/hoplite/.
//
//   node scripts/dev/placeholder-sheet.mjs [class]      (default hoplite)
//
// Each group is found by drawing the frame twice, with and without a change to
// that part alone (another cloak, crest, skin, the gold hem off): the pixels that
// differ are the group. The metal is drawn at rank 2 (burnished bronze, bright
// steel) and snapped to those ramps, which the manifest lists as its metal colours:
// the runtime swaps them per rarity. Some new animations are left out on purpose
// (slash, throw, shoot, sling, ready, stagger, kneel, adjust), so the battle shows
// their fallbacks. Load it in the dev server with ?sheets=dev.
//
// `companion` renders the procedural rider instead (a mounted sheet): the gallop,
// lance thrust, rear (hit), both falls, rout and victory, in a frame padded with
// headroom and off-centre per row (the rows facing right stand left of centre),
// so the runtime's mounted path (frame box, per-row anchors, scale) is exercised.
import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { ROOT } from '../lib/harness.mjs';

const cls = process.argv[2] ?? 'hoplite';
const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' });
const pd = await server.ssrLoadModule('/src/art/paperdoll.ts');
const mat = await server.ssrLoadModule('/src/art/materials.ts');
const { ANIM, BATTLE_SCALE, DIRS, dollGeom, renderFrame } = pd;

const LOOK = { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicRed' };
const R = 2; // rank of the drawn metal: every metal surface lands in the glint mask

/** Per class: the body, the colour groups found on it, the tiers, the layout, and the frame padding (art px). */
const RIDER = cls === 'companion';

/** The rider: lance, Boeotian helm, linothorax, purple cloak with a hem, on a horse (coat 0). */
function riderSpec(o = {}) {
  return {
    look: { ...LOOK, ...(o.look ?? {}) },
    weapon: 'lance',
    helmet: { art: 'boeotian' },
    armor: 'linothorax',
    cloak: o.cloak ?? 'cloakPurple',
    cloakTrim: o.trim ?? true,
    mount: 'horse',
    coat: 0,
    seed: 3,
    scale: BATTLE_SCALE,
    gear: { weapon: { def: 'xyston', r: R }, helmet: { def: 'boeotian', r: R }, armor: { def: 'linothorax', r: R } },
    cls,
  };
}

/** The one body: basic gear (the gear tier only recolours), a crested helmet, a red cloak with a hem. */
function spec(o = {}) {
  if (RIDER) return riderSpec(o);
  return {
    look: { ...LOOK, ...(o.look ?? {}) },
    weapon: 'spear',
    shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } },
    helmet: { art: 'chalcidian', paint: { field: 'red' } },
    armor: 'linothorax',
    cloak: o.cloak ?? 'cloakRed',
    crest: o.crest ?? 'red',
    cloakTrim: o.trim ?? true,
    seed: 3,
    scale: BATTLE_SCALE,
    gear: { weapon: { def: 'dory', r: R }, shield: { def: 'hoplon', r: R }, helmet: { def: 'pilos', r: R }, armor: { def: 'linothorax', r: R } },
  };
}

const dl = (ramp) => [...ramp].reverse(); // material ramps are light to dark; colour groups dark to light
/** Colour groups, in the order a pixel is claimed: the drawn ramp each snaps to, and the variant that finds it. */
const GROUPS_FOOT = [
  // the gold hem is drawn, then written as a plain dark hem (the basic look); tiers gild it
  { name: 'trim', alt: { trim: false }, find: dl(mat.GOLD.ramp), ramp: dl(mat.CLOTH.cloakBrown.ramp) },
  { name: 'crest', alt: { crest: 'blue' }, ramp: dl(mat.CREST.red.ramp) },
  { name: 'skin', alt: { look: { skin: 3 } }, ramp: dl(mat.SKIN[1].ramp) },
  { name: 'cloak', alt: { cloak: 'cloakBlue' }, ramp: dl(mat.CLOTH.cloakRed.ramp) },
];
const GROUPS_RIDER = [
  { name: 'trim', alt: { trim: false }, find: dl(mat.GOLD.ramp), ramp: dl(mat.CLOTH.cloakBrown.ramp) },
  { name: 'skin', alt: { look: { skin: 3 } }, ramp: dl(mat.SKIN[1].ramp) },
  { name: 'cloak', alt: { cloak: 'cloakBlue' }, ramp: dl(mat.CLOTH.cloakPurple.ramp) },
];
const GROUPS = RIDER ? GROUPS_RIDER : GROUPS_FOOT;
const TIERS_RIDER = {
  basic: {},
  veteran: { cloak: dl(mat.CLOTH.cloakCrimson.ramp), trim: dl(mat.CLOTH.tunicOchre.ramp) },
  elite: { cloak: dl(mat.CLOTH.cloakBlack.ramp), trim: dl(mat.GOLD.ramp) },
};
const TIERS_FOOT = {
  basic: {},
  veteran: { cloak: dl(mat.CLOTH.cloakCrimson.ramp), crest: dl(mat.CREST_EXTRA.white.ramp), trim: dl(mat.CLOTH.tunicOchre.ramp) },
  elite: { cloak: dl(mat.CLOTH.cloakBlack.ramp), crest: dl(mat.GOLD.ramp), trim: dl(mat.GOLD.ramp) },
};

const TIERS = RIDER ? TIERS_RIDER : TIERS_FOOT;

const turn = (dir, a) => {
  const [x, y] = DIRS[dir];
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** Animations of the placeholder: procedural columns (or a turned idle for the look-around); [name, frames, fps, hold?]. */
const LAYOUT_FOOT = [
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
  // brace: step into the stance (idle, block), then hold it
  ['brace', [ANIM.idle[0], ANIM.block[0], ANIM.block[0]], 6, 2],
  ['charge', ANIM.run, 12],
  ['cheer', [...ANIM.win, ANIM.idle[0]], 3],
  ['fallFwd', ANIM.die, 12],
  ['fallBack', ANIM.dieB, 12],
  ['look', [[0, 0], [0, 0.5], [0, 0.5], [0, 0], [0, -0.5], [0, -0.5]], 3],
];

/** Riders: the gallop is their run (ANIM.gallop); `hit` the horse rearing; no brace, look or block. */
const LAYOUT_RIDER = [
  ['idle', ANIM.idle, 4],
  ['walk', ANIM.walk, 12],
  ['gallop', ANIM.gallop, 14],
  ['thrust', ANIM.attack, 14],
  ['hit', ANIM.hit, 8],
  ['fallFwd', ANIM.die, 10],
  ['fallBack', ANIM.dieB, 10],
  ['rout', ANIM.gallop, 16],
  ['cheer', [...ANIM.win, ANIM.idle[0]], 3],
];
const LAYOUT = RIDER ? LAYOUT_RIDER : LAYOUT_FOOT;

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west']; // game rows 0..3 (DEFAULT_FACINGS)

const pg = dollGeom(spec());
/** Padding of the art frame around the procedural one: headroom on top; per row, where the figure sits across (left of centre facing right). */
const PAD = RIDER ? { top: 20, side: 16, rowX: [0, 0, 16, 16] } : { top: 0, side: 0, rowX: [0, 0, 0, 0] };
const g = { fw: pg.fw + PAD.side, fh: pg.fh + PAD.top, footY: pg.footY + PAD.top };
const cols = LAYOUT.reduce((n, [, f]) => n + f.length, 0);
const W = cols * g.fw;
const H = ROWS.length * g.fh;
const BR = mat.bronzeOf(R).ramp;
const IR = mat.ironOf(R).ramp;
const metalCols = [...BR, ...IR];
const taken = new Set([...metalCols, ...GROUPS.flatMap((gr) => gr.ramp)]);

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const d2 = (a, b) => {
  const [p, q] = [rgb(a), rgb(b)];
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
};
const nearest = (c, list) => list.reduce((best, m) => (d2(c, m) < d2(c, list[best]) ? list.indexOf(m) : best), 0);
const colorAt = (px, i) => (px.data[i] << 16) | (px.data[i + 1] << 8) | px.data[i + 2];

function sheet() {
  const out = new Uint8Array(W * H * 4);
  const base = spec();
  const alts = GROUPS.map((gr) => spec(gr.alt));
  let col = 0;
  for (const [, frames] of LAYOUT) {
    for (const f of frames) {
      for (let dir = 0; dir < ROWS.length; dir++) {
        const draw = (s, mask) => (Array.isArray(f) ? renderFrame(s, ANIM.idle[f[0]], dir, mask, turn(dir, f[1])) : renderFrame(s, f, dir, mask));
        const mask = new Uint8Array(pg.fw * pg.fh);
        const px = draw(base, mask);
        const alt = alts.map((s) => draw(s));
        for (let y = 0; y < pg.fh; y++)
          for (let x = 0; x < pg.fw; x++) {
            const i = (y * pg.fw + x) * 4;
            if (!px.data[i + 3]) continue;
            let c = colorAt(px, i);
            const gi = GROUPS.findIndex((_, k) => alt[k].data[i + 3] !== px.data[i + 3] || colorAt(alt[k], i) !== c);
            if (gi >= 0) {
              // a colour group: snapped to its ramp (found by its drawn ramp, written as its listed one)
              const gr = GROUPS[gi];
              c = gr.ramp[Math.min(gr.ramp.length - 1, nearest(c, gr.find ?? gr.ramp))];
            } else if (mask[y * pg.fw + x]) {
              // metal: snapped to the listed ramps
              c = metalCols[nearest(c, metalCols)];
            } else {
              // never a listed colour by chance (it would take a swap)
              while (taken.has(c)) c ^= 1;
            }
            const o = ((dir * g.fh + y + PAD.top) * W + col * g.fw + x + PAD.rowX[dir]) * 4;
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
for (const old of ['basic.png', 'veteran.png', 'elite.png']) rmSync(join(dir, old), { force: true });
const anims = {};
let c0 = 0;
for (const [name, frames, fps, hold] of LAYOUT) {
  anims[name] = { col: c0, frames: frames.length, fps, ...(hold ? { hold } : {}) };
  c0 += frames.length;
}
const manifest = {
  version: 2,
  class: cls,
  image: `${cls}.png`,
  frame: { w: g.fw, h: g.fh },
  anchor: { x: Math.floor(pg.fw / 2), y: g.footY },
  ...(RIDER ? { anchors: Object.fromEntries(ROWS.map((r, i) => [r, { x: Math.floor(pg.fw / 2) + PAD.rowX[i], y: g.footY }])) } : {}),
  scale: 1,
  rows: ROWS,
  colorGroups: Object.fromEntries(GROUPS.map((gr) => [gr.name, gr.ramp.map(hex)])),
  tiers: Object.fromEntries(Object.entries(TIERS).map(([t, rc]) => [t, Object.fromEntries(Object.entries(rc).map(([k, v]) => [k, v.map(hex)]))])),
  anims,
  metal: [
    { kind: 'bronze', colors: BR.map(hex), slots: ['shield', 'helmet', 'armor'] },
    { kind: 'iron', colors: IR.map(hex), slots: ['weapon'] },
  ],
  // the PixelLab riders' coats share the rider's skin colours: their manifests turn the skin tone off (this one shows the flag)
  ...(RIDER ? { variation: { skin: false } } : {}),
};
const file = join(dir, manifest.image);
writeFileSync(file, png(W, H, sheet()));
console.log(`${file}: ${W} x ${H}`);
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await server.close();
