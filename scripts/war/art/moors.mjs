// Grey Moors ground (regions-look, PROMPTS_ART §49): the moors biome's tile sets are the global grass sets recoloured,
// no new generations. Each global grass-X sheet becomes heath-X: every top-diamond pixel that is the global grass fill
// (or nearer to it than to X's fill) is mapped through the heath colour map, X's pixels through X's own map (dirt ->
// peat, marsh -> black bog; road, rock, sand and water unchanged, so their full tiles stay the global ones). The side
// band keeps the global earth. Variants: var-grass -> var-heath, var-dirt -> var-peat, var-marsh -> var-bog.
// The walls are the mountains' granite cliff (copied). Out: public/war/biomes/moors/ (the PNGs, tiles.json; objects.json is kept, see moors-objects.mjs).
// Rerun after scripts/war/art/build.mjs rebuilds the global tiles:  node scripts/war/art/moors.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { rgbToHex } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const GT = join(ROOT, 'public/war/tiles'), OUT = join(ROOT, 'public/war/biomes/moors');
const G = JSON.parse(readFileSync(join(GT, 'tiles.json')));
const TW = 64, TH = 48, HW = 32, HH = 16;
const inTop = (x, y) => Math.abs(x + 0.5 - HW) / HW + Math.abs(y + 0.5 - HH) / HH <= 1;

// ---- colour maps (HSL in, HSL out): lightness keeps the fill's texture, hue and saturation set the moor's palette
const hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
const rgb = ([h, s, l]) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round((v + m) * 255))));
};
// heath: dark brown peat ground under heather; the fill's light blades turn rust and dull mauve (heather in flower)
const heath = (c) => { const [, , l] = hsl(c); const t = Math.min(1, Math.max(0, (l - 0.12) / 0.28)); return rgb([t > 0.85 ? 350 : 26 - 18 * t, 0.16 + 0.08 * t, l * (0.6 + 0.12 * t)]); };
// peat: black-brown cut peat (the global dirt, darker and colder)
const peat = (c) => { const [, , l] = hsl(c); return rgb([22, 0.22, l * 0.45]); };
// bog: the marsh as black peat water and sodden moss
const bog = (c) => { const [, , l] = hsl(c); return rgb([52, 0.16, l * 1.05]); };
const same = (c) => c;
const MAP = { heath, peat, bog };

const px = (im, x, y) => (y * im.w + x) * 4;
const get = (im, i) => [im.data[i], im.data[i + 1], im.data[i + 2]];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const frame = (im, n) => ({ w: TW, h: TH, at: (x, y) => px(im, n * TW + x, y) });

// out sheet: global source sheet (grass first), new names, the map of each side
const SHEETS = [
  { pair: 'heath-peat', first: 'heath', second: 'peat', src: 'grass-dirt', m1: heath, m2: peat },
  { pair: 'heath-bog', first: 'heath', second: 'bog', src: 'grass-marsh', m1: heath, m2: bog },
  { pair: 'heath-road', first: 'heath', second: 'road', src: 'grass-road', m1: heath, m2: same },
  { pair: 'heath-rock', first: 'heath', second: 'rock', src: 'grass-rock', m1: heath, m2: same },
  { pair: 'heath-sand', first: 'heath', second: 'sand', src: 'grass-sand', m1: heath, m2: same },
  { pair: 'heath-shallow', first: 'heath', second: 'shallow', src: 'grass-shallow', m1: heath, m2: same },
];
const VARS = [['heath', 'grass'], ['peat', 'dirt'], ['bog', 'marsh']];

mkdirSync(OUT, { recursive: true });
const colours = new Set(G.palette);
const keep = (c) => { colours.add(rgbToHex(c)); return c; };
const sheets = [];
for (const s of SHEETS) {
  const gs = G.sheets.find((q) => q.pair === s.src), im = readImage(join(GT, gs.file)), out = { w: im.w, h: im.h, data: new Uint8Array(im.data) };
  const m2f = gs.maskToFrame, f1 = frame(im, m2f[15]), f2 = frame(im, m2f[0]);
  for (let n = 0; n < 16; n++) {
    const f = frame(im, n);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const i = f.at(x, y);
      if (!im.data[i + 3]) continue;
      const c = get(im, i);
      let m;
      if (inTop(x, y)) {
        const a = get(im, f1.at(x, y)), b = get(im, f2.at(x, y));
        m = d2(c, a) <= d2(c, b) ? s.m1 : s.m2;
      } else m = same; // the side band: the global earth
      out.data.set(keep(m(c)), i);
    }
  }
  const file = `${s.pair}.png`;
  writeImage(join(OUT, file), out);
  sheets.push({ pair: s.pair, first: s.first, second: s.second, file, frames: 16, frame: { w: TW, h: TH }, maskToFrame: m2f, source: `recoloured global ${s.src} (moors.mjs)` });
}
const variants = [];
for (const [t, g] of VARS) {
  const gv = G.variants.find((v) => v.terrain === g), im = readImage(join(GT, gv.file)), out = { w: im.w, h: im.h, data: new Uint8Array(im.data) };
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = px(im, x, y);
    if (im.data[i + 3] && inTop(x % TW, y)) out.data.set(keep(MAP[t](get(im, i))), i);
  }
  const file = `var-${t}.png`;
  writeImage(join(OUT, file), out);
  variants.push({ terrain: t, file, frames: gv.frames, frame: { w: TW, h: TH }, sources: [`recoloured global ${gv.file}`], note: `full ${t} tiles: the global ${g} variants recoloured (moors.mjs)` });
}
// the tors' and the moor's walls: the mountains' granite cliff (its file copied: a biome's first cliff is its material)
const MT = JSON.parse(readFileSync(join(ROOT, 'public/war/biomes/mountains/tiles.json')));
const granite = MT.cliffs.find((c) => c.id === 'granite');
copyFileSync(join(ROOT, 'public/war/biomes/mountains', granite.file), join(OUT, granite.file));
{ const g = readImage(join(OUT, granite.file)); for (let i = 0; i < g.data.length; i += 4) if (g.data[i + 3]) keep(get(g, i)); }
const T = {
  biome: 'moors',
  extends: 'public/war/tiles/tiles.json',
  note: 'Grey Moors set: the global grass sets recoloured (scripts/war/art/moors.mjs): heath (heather over peat) for grass, peat for dirt, black bog for marsh; palette = the global palette + these colours',
  tile: G.tile, mask: G.mask, anchor: G.anchor,
  palette: [...colours],
  sheets, variants,
  cliffs: [{ ...granite, source: `${granite.source}, copied from mountains (moors.mjs)` }],
  fallback: {
    note: 'Same rule as the global tiles.json fallback; the land buffer is heath (grass, forest and any terrain this set does not know draw as heath). Pairs with no sheet (peat-bog, peat-rock, ...) get a heath verge.',
    order: ['deep', 'shallow', 'bog', 'sand', 'peat', 'snow', 'rock', 'road', 'paving', 'heath'],
    buffer: { water: 'shallow', land: 'heath' },
  },
};
writeFileSync(join(OUT, 'tiles.json'), JSON.stringify(T, null, 1) + '\n');
if (!existsSync(join(OUT, 'objects.json'))) {
  const GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
  writeFileSync(join(OUT, 'objects.json'), JSON.stringify({ biome: 'moors', pxPerMetre: 33, palette: GO.palette, objects: [] }, null, 1) + '\n');
}
console.log(`moors: ${sheets.length} sheets, ${variants.length} variant fills, ${colours.size - G.palette.length} own colours`);
