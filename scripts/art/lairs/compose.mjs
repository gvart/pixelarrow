// W-67 lair art: one den per mob kind, live and cleared, composed from the biome props (public/war/biomes/*,
// public/war/objects) and a few PixelLab parts (./parts/, prompts in docs/playbook/PROMPTS_ART.md §45), at the props' own
// 33 px/m. Writes public/war/lairs/<kind>-<live|cleared>.png and public/war/lairs/lairs.json (anchor = the lair's ground
// point; src/war/view/neutral.ts draws them).
// Usage: node scripts/art/lairs/compose.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../lib/png.mjs';
import { alphaBox, blank, crop } from '../lib/ops.mjs';

const W = 288, H = 200, AX = 144, AY = 140;
const OUT = 'public/war/lairs';
const PARTS = 'scripts/art/lairs/parts';

/** Prop table: biome objects.json anchors (id -> { file, anchor }). */
const props = new Map();
for (const sub of ['biomes/dodona', 'biomes/mountains', 'biomes/kyrene', 'biomes/elaia', 'objects']) {
  const d = JSON.parse(readFileSync(join('public/war', sub, 'objects.json'), 'utf8'));
  for (const o of Array.isArray(d.objects) ? d.objects : Object.values(d.objects ?? d)) if (o?.id && o.file) props.set(`${sub.split('/').pop()}/${o.id}`, { file: join('public/war', sub, o.file), anchor: o.anchor });
}

/** A part or prop by name ("kyrene/thorn-tree", or "part:bones" from ./parts, anchored bottom-centre of its pixels). */
function load(name) {
  if (name.startsWith('part:')) {
    const f = join(PARTS, `${name.slice(5)}.png`);
    if (!existsSync(f)) return null;
    const img = readImage(f), b = alphaBox(img, 40);
    return { img, ax: Math.round(b.x + b.w / 2), ay: b.y + b.h - 1 };
  }
  const p = props.get(name);
  if (!p) throw new Error(`no prop ${name}`);
  return { img: readImage(p.file), ax: p.anchor.x, ay: p.anchor.y };
}

/** Pixels of the grass base PixelLab left under a part (green, fairly saturated): cut. */
function noGreen(img) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (g > r * 1.12 && g > b * 1.15 && g > 50) d[i + 3] = 0;
  }
  // then the base's thin outline ring left behind: pixels with few opaque neighbours, a few passes
  for (let pass = 0; pass < 4; pass++) {
    const cut = [];
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (!d[(y * img.w + x) * 4 + 3]) continue;
      let n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xx = x + i, yy = y + j;
        if ((i || j) && xx >= 0 && yy >= 0 && xx < img.w && yy < img.h && d[(yy * img.w + xx) * 4 + 3]) n++;
      }
      if (n <= 3) cut.push((y * img.w + x) * 4 + 3);
    }
    for (const k of cut) d[k] = 0;
  }
  return img;
}

/** Draw `src` onto `dst` with its anchor at (x, y); flip left-right; alpha scale; grade (cleared: greyed and dimmed). */
function put(dst, { img, ax, ay }, x, y, o = {}) {
  const { flip = false, alpha = 1, scale = 1 } = o;
  const w = Math.round(img.w * scale), h = Math.round(img.h * scale);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const si = Math.min(img.w - 1, Math.floor((flip ? w - 1 - i : i) / scale)), sj = Math.min(img.h - 1, Math.floor(j / scale));
    const s = (sj * img.w + si) * 4, a = (img.data[s + 3] / 255) * alpha;
    if (a < 0.5) continue; // hard alpha (pixel art)
    const dx = Math.round(x - ax * scale + i), dy = Math.round(y - ay * scale + j);
    if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    const d = (dy * dst.w + dx) * 4;
    dst.data.set([img.data[s], img.data[s + 1], img.data[s + 2], 255], d);
  }
}

/** Cleared: the den abandoned, colours drained a little and dimmed. */
function grade(img, sat = 0.3, dim = 0.68) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    for (let c = 0; c < 3; c++) d[i + c] = Math.round((l + (d[i + c] - l) * sat) * dim);
  }
  return img;
}

// [name, dx, dy, opts?]: dx, dy px from the lair's ground point (the iso tile is 64 x 32 px). Drawn back to front.
const LAIRS = {
  wolf: {
    live: [['objects/dead-tree', 58, -34, { scale: 0.7 }], ['objects/boulder-a', -74, -18], ['part:ribs', 4, 6], ['part:bones', -54, 26, { scale: 0.65 }], ['objects/bush-a', 78, 14, { scale: 0.8 }], ['dodona/fern-a', -24, 36]],
    cleared: [['objects/dead-tree', 58, -34, { scale: 0.7 }], ['objects/boulder-a', -74, -18], ['part:ribs', 4, 6], ['part:bones', -54, 26, { scale: 0.65 }]],
  },
  boar: {
    live: [['dodona/log-fallen', -40, -26], ['dodona/stump-moss', 62, -14], ['part:wallow', 0, 14], ['dodona/bramble', 76, 22], ['dodona/fern-c', -74, 18], ['dodona/mushrooms', 40, 30], ['dodona/fern-b', -10, 40]],
    cleared: [['dodona/log-fallen', -40, -26], ['dodona/stump-moss', 62, -14], ['part:wallow', 0, 14, { dry: true }], ['dodona/fern-c', -74, 18]],
  },
  bear: {
    live: [['part:cave', 6, 10], ['dodona/boulder-moss-a', -86, 18], ['part:bones', 46, 34, { scale: 0.6 }], ['dodona/fern-a', -46, 40], ['dodona/fern-b', 84, 30]],
    cleared: [['part:cave', 6, 10], ['dodona/boulder-moss-a', -86, 18], ['part:bones', 46, 34, { scale: 0.6 }]],
  },
  bandit: {
    live: [['part:tent', -36, 4], ['kyrene/amphora-stack', -92, 22, { scale: 0.8 }], ['objects/boulder-b', 82, 8, { scale: 0.7 }], ['part:campfire', 42, 30], ['dodona/stump-a', 8, 40]],
    cleared: [['part:tent-down', -36, 4], ['kyrene/amphora-stack', -92, 22, { scale: 0.8 }], ['objects/boulder-b', 82, 8, { scale: 0.7 }], ['part:campfire-cold', 42, 30]],
  },
  jackal: {
    live: [['kyrene/rocks-red', -58, -12], ['part:burrow', 6, 10], ['kyrene/saltbush', 58, 4], ['kyrene/dry-grass', -30, 30], ['kyrene/dry-grass', 34, 32], ['part:bones', 64, 30, { scale: 0.55 }]],
    cleared: [['kyrene/rocks-red', -58, -12], ['part:burrow', 6, 10], ['kyrene/dry-grass', -30, 30]],
  },
  ibex: {
    live: [['mountains/rockfall', 0, 0, { scale: 0.85 }], ['mountains/juniper', 70, 26], ['mountains/alpine-grass', -60, 32], ['mountains/alpine-grass', 20, 38]],
    cleared: [['mountains/rockfall', 0, 0, { scale: 0.85 }], ['mountains/alpine-grass', -60, 32]],
  },
  lion: {
    live: [['kyrene/thorn-tree', -46, -18], ['kyrene/camelthorn', 62, -2], ['kyrene/dry-grass', -10, 18], ['kyrene/dry-grass', 14, 22], ['kyrene/dry-grass', 40, 16], ['kyrene/dry-grass', -34, 30], ['part:bones', 22, 34, { scale: 0.7 }], ['kyrene/broom', -86, 30, { scale: 0.8 }]],
    cleared: [['kyrene/thorn-tree', -46, -18], ['kyrene/camelthorn', 62, -2], ['part:bones', 22, 34, { scale: 0.7 }], ['kyrene/dry-grass', -34, 30]],
  },
  serpent: {
    live: [['kyrene/reeds', -64, -18], ['kyrene/reeds', 58, -24], ['part:nest', 0, 14, { scale: 1.25 }], ['objects/reeds', -84, 20], ['kyrene/debris-mud', 64, 30, { scale: 0.7 }]],
    cleared: [['kyrene/reeds', -64, -18], ['kyrene/reeds', 58, -24], ['part:nest', 0, 14, { scale: 1.25 }], ['kyrene/debris-mud', 64, 30, { scale: 0.7 }]],
  },
};

mkdirSync(OUT, { recursive: true });
const index = {};
for (const [kind, states] of Object.entries(LAIRS)) {
  index[kind] = {};
  for (const [state, list] of Object.entries(states)) {
    const c = blank(W, H);
    const sorted = [...list].sort((a, b) => a[2] - b[2]);
    for (const [name, dx, dy, o = {}] of sorted) {
      const p = load(name);
      if (!p) {
        console.warn(`${kind} ${state}: missing ${name}`);
        continue;
      }
      if (name === 'part:cave') noGreen(p.img); // its grass base
      if (o.dry) grade(p.img, 0.4, 1.12); // a dried-out wallow: paler, cracked mud
      put(c, p, AX + dx, AY + dy, o);
    }
    if (state === 'cleared') grade(c);
    // trim to the pixels (keep the anchor)
    const b = alphaBox(c, 1), x0 = Math.max(0, b.x - 1), y0 = Math.max(0, b.y - 1), x1 = Math.min(W, b.x + b.w + 1), y1 = Math.min(H, b.y + b.h + 1);
    const out = crop(c, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    const file = `${kind}-${state}.png`;
    writeImage(join(OUT, file), out);
    index[kind][state] = { file, w: out.w, h: out.h, anchor: { x: AX - x0, y: AY - y0 } };
  }
}
writeFileSync(join(OUT, 'lairs.json'), JSON.stringify({ about: 'W-67 lair art per mob kind, live and cleared (scripts/art/lairs/compose.mjs). anchor: the lair ground point in the PNG.', lairs: index }, null, 1) + '\n');
console.log(Object.keys(index).join(' '), '->', OUT);
