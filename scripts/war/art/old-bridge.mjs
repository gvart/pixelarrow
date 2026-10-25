// The old stone bridge over a region road's crossing (scripts/war/regions/kit.ts Kit.oldBridge): the rows of the
// diagonal stone bridge kit (public/war/buildings/bridge-stone-diag-done.png, screen-vertical v3 rows: deck and the
// two ramp rows at each end) copied as map objects into the elaia library as `old-bridge-v3-*` (composed, no generation).
// Each sprite stands at the back of its row (Kit.oldBridge puts it 0.2 tiles back along the line, so units on the
// row draw over it), and a deck row on the deck level the region's visual layer raises one level over the water: its
// anchor is the kit's row origin moved up by those amounts. Colours the elaia palette lacks are appended to it.
//
// Usage: node scripts/war/art/old-bridge.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { alphaBox, crop, rgbToHex } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'public/war/biomes/elaia');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const B = read('public/war/buildings/objects.json'), kit = B.kits.find((k) => k.id === 'bridge-stone-diag');
const sheet = readImage(join(ROOT, 'public/war/buildings', kit.states.done));
const ET = read('public/war/biomes/elaia/tiles.json'), EO = read('public/war/biomes/elaia/objects.json');
const HH = 16, LH = 32, BACK = 0.4; // half a tile's height (px), a visual level (px), the depth shift (tiles summed)
const PIECES = { deck: 'v3-deck', endp: 'v3-end+', endm: 'v3-end-', outp: 'v3-out+', outm: 'v3-out-' };
const defs = [], used = new Set();
for (const [name, piece] of Object.entries(PIECES)) {
  const f = kit.pieces.indexOf(piece), cols = kit.columns, { w, h } = kit.frame;
  const fr = crop(sheet, { x: (f % cols) * w, y: Math.floor(f / cols) * h, w, h }), b = alphaBox(fr, 1), im = crop(fr, b);
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) used.add(rgbToHex([im.data[i], im.data[i + 1], im.data[i + 2]]));
  const id = `old-bridge-${name}`, lift = Math.round(BACK * HH + (name === 'deck' ? LH : 0));
  writeImage(join(OUT, `${id}.png`), im);
  defs.push({
    id, kind: 'prop', file: `${id}.png`, w: im.w, h: im.h, metres: +(im.h / B.pxPerMetre).toFixed(2),
    anchor: { x: kit.tileOrigin.x - b.x, y: kit.tileOrigin.y - b.y - lift }, footprint: [1, 1], blocksMovement: false,
    source: `bridge-stone-diag ${piece} (done), composed (scripts/war/art/old-bridge.mjs)`,
  });
}
const own = new Set([...ET.palette, ...EO.palette]);
const add = [...used].filter((c) => !own.has(c));
EO.objects = [...EO.objects.filter((d) => !d.id.startsWith('old-bridge-')), ...defs];
EO.palette = [...EO.palette, ...add];
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(EO, null, 1) + '\n');
console.log(`old bridge: ${defs.length} sprites, palette +${add.length}`);
