// Sheet packer (I3c): a v2 class sheet (docs/v5/art/SHEET_FORMAT.md, one image of
// frame.w x frame.h cells) to a v3 packed sheet. Pure: images are
// { w, h, data: RGBA Uint8Array }; the CLI (cli.mjs) does the files.
//
//  - Every frame (column x image row) is trimmed to its opaque box. Its cell
//    keeps the box's offset in the frame, so the anchors (frame coordinates)
//    stay exact.
//  - Identical trimmed frames are stored once (a held pose, an animation that
//    reuses another's frames).
//  - The stored frames are shelf-packed into pages of at most 2048 x 2048, per
//    clip group: `core` (what a battle shows) and `extra` (ambient idles and
//    victory, EXTRA_ANIMS), so the runtime loads the extra pages only when one
//    of those clips is first shown. A frame both groups use lives in core.
//
// The packed manifest is the source manifest with version 3, no `image` /
// `wrap`, and a `packed` block:
//   pages  [{ file, w, h, group }]
//   rects  flat, 5 numbers per stored frame: page, x, y, w, h
//   cells  flat, 3 numbers per frame (index col * rows.length + row): rect (-1: empty), dx, dy
//   source { image, w, h, sha1 } of the image it was packed from
import { createHash } from 'node:crypto';

export const MAX_PAGE = 2048;
/** Clips that go on the `extra` pages: ambient idles and victory. */
export const EXTRA_ANIMS = ['look', 'adjust', 'cheer', 'win', 'breathe', 'shift', 'build', 'carry'];

/** Columns of the layout (as sheetManifest.manifestColumns). */
export function manifestColumns(m) {
  let n = 0;
  for (const a of Object.values(m.anims)) n = Math.max(n, a.col + a.frames);
  return n;
}

/** Top-left of a column's frame in an image row of a v2 sheet (as sheetManifest.frameCell). */
export function frameCell(m, col, row) {
  const band = m.wrap ? Math.floor(col / m.wrap) : 0;
  return [(col - band * (m.wrap ?? 0)) * m.frame.w, (band * m.rows.length + row) * m.frame.h];
}

/** RGBA of a w x h region (outside the image: transparent); fully transparent pixels are written as 0,0,0,0. */
function crop(img, x0, y0, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= img.w) continue;
      const si = (sy * img.w + sx) * 4;
      if (!img.data[si + 3]) continue;
      out.set(img.data.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/** Opaque box of a w x h RGBA frame: [x0, y0, x1, y1) or null when empty. */
function opaqueBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

/**
 * Shelf-pack boxes ({ w, h }, sorted tallest first) into pages `width` wide and at most `max` tall.
 * Returns the pages' heights and, per box, [page, x, y].
 */
function shelfPack(boxes, width, max) {
  const at = [];
  const heights = [0];
  let page = 0;
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const b of boxes) {
    if (x + b.w > width) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    if (y + b.h > max) {
      page++;
      heights.push(0);
      x = 0;
      y = 0;
      shelf = 0;
    }
    at.push([page, x, y]);
    x += b.w;
    shelf = Math.max(shelf, b.h);
    heights[page] = Math.max(heights[page], y + shelf);
  }
  return { heights, at };
}

/** The page width (and its packing) that gives the least total page area. */
function bestPack(boxes, max) {
  const area = boxes.reduce((s, b) => s + b.w * b.h, 0);
  const widest = Math.max(...boxes.map((b) => b.w));
  const side = Math.sqrt(area);
  let best = null;
  for (let k = 0.7; k <= 2.01; k += 0.05) {
    const width = Math.min(max, Math.max(widest, Math.ceil(side * k)));
    const p = shelfPack(boxes, width, max);
    const total = p.heights.reduce((s, h) => s + h * width, 0);
    if (!best || p.heights.length < best.p.heights.length || (p.heights.length === best.p.heights.length && total < best.total)) best = { width, p, total };
  }
  return best;
}

/**
 * Pack a v2 sheet. `opts.split` (default true) puts EXTRA_ANIMS on pages of
 * their own; `opts.maxPage` caps a page side (default 2048); `opts.name`
 * prefixes the page files; `opts.sourceHash` is recorded as source.sha1
 * (default: a hash of the pixels).
 * Returns { manifest (v3), pages: [{ file, group, img }] }.
 */
export function packSheet(m, img, opts = {}) {
  const split = opts.split ?? true;
  const max = opts.maxPage ?? MAX_PAGE;
  const name = opts.name ?? m.class;
  if (m.version !== 2) throw new Error(`pack ${m.class}: source manifest must be version 2`);
  const { w: fw, h: fh } = m.frame;
  const nRows = m.rows.length;
  const cols = manifestColumns(m);
  const groupOfCol = new Array(cols).fill(null);
  for (const [a, def] of Object.entries(m.anims)) for (let c = def.col; c < def.col + def.frames; c++) groupOfCol[c] = split && EXTRA_ANIMS.includes(a) ? 'extra' : 'core';

  const stored = []; // { w, h, px, group }
  const byHash = new Map();
  const cells = new Array(cols * nRows * 3).fill(0);
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < nRows; r++) {
      const ci = (c * nRows + r) * 3;
      cells[ci] = -1;
      if (!groupOfCol[c]) continue;
      const [x0, y0] = frameCell(m, c, r);
      const full = crop(img, x0, y0, fw, fh);
      const box = opaqueBox(full, fw, fh);
      if (!box) continue;
      const [bx0, by0, bx1, by1] = box;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      const px = crop({ w: fw, h: fh, data: full }, bx0, by0, bw, bh);
      const hash = createHash('sha1').update(`${bw}x${bh}:`).update(px).digest('hex');
      let idx = byHash.get(hash);
      if (idx === undefined) {
        idx = stored.length;
        stored.push({ w: bw, h: bh, px, group: groupOfCol[c] });
        byHash.set(hash, idx);
      } else if (groupOfCol[c] === 'core') stored[idx].group = 'core';
      cells[ci] = idx;
      cells[ci + 1] = bx0;
      cells[ci + 2] = by0;
    }

  const pages = [];
  const rects = new Array(stored.length * 5).fill(0);
  for (const group of ['core', 'extra']) {
    const ids = stored.map((_, i) => i).filter((i) => stored[i].group === group);
    if (!ids.length) continue;
    ids.sort((a, b) => stored[b].h - stored[a].h || stored[b].w - stored[a].w || a - b);
    const boxes = ids.map((i) => stored[i]);
    const { width, p } = bestPack(boxes, max);
    const first = pages.length;
    for (const h of p.heights) {
      const n = pages.length;
      pages.push({ file: `${name}.${n}.png`, group, img: { w: width, h, data: new Uint8Array(width * h * 4) } });
    }
    ids.forEach((id, k) => {
      const [pg, x, y] = p.at[k];
      const s = stored[id];
      const page = pages[first + pg].img;
      for (let row = 0; row < s.h; row++) page.data.set(s.px.subarray(row * s.w * 4, (row + 1) * s.w * 4), ((y + row) * page.w + x) * 4);
      rects.splice(id * 5, 5, first + pg, x, y, s.w, s.h);
    });
  }

  const out = { ...m, version: 3 };
  delete out.image;
  delete out.wrap;
  out.packed = {
    pages: pages.map((p) => ({ file: p.file, w: p.img.w, h: p.img.h, group: p.group })),
    rects,
    cells,
    source: { image: m.image, w: img.w, h: img.h, sha1: opts.sourceHash ?? createHash('sha1').update(img.data).digest('hex') },
  };
  return { manifest: out, pages };
}

/** A frame of a packed sheet back at full frame size (RGBA, frame.w x frame.h), from its pages' pixels. */
export function unpackFrame(m3, pageImgs, col, row) {
  const { w: fw, h: fh } = m3.frame;
  const out = new Uint8Array(fw * fh * 4);
  const ci = (col * m3.rows.length + row) * 3;
  const [ri, dx, dy] = m3.packed.cells.slice(ci, ci + 3);
  if (ri < 0 || ri === undefined) return out;
  const [pg, x, y, w, h] = m3.packed.rects.slice(ri * 5, ri * 5 + 5);
  const page = pageImgs[pg];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const si = ((y + r) * page.w + x + c) * 4;
      if (!page.data[si + 3]) continue;
      out.set(page.data.subarray(si, si + 4), ((dy + r) * fw + dx + c) * 4);
    }
  return out;
}

/** Throw unless every frame of the packed sheet equals the source's, pixel for pixel (transparent pixels as 0,0,0,0). */
export function verifyPack(m, img, m3, pageImgs) {
  const cols = manifestColumns(m);
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < m.rows.length; r++) {
      const [x0, y0] = frameCell(m, c, r);
      const inAnim = Object.values(m.anims).some((a) => c >= a.col && c < a.col + a.frames);
      const want = inAnim ? crop(img, x0, y0, m.frame.w, m.frame.h) : new Uint8Array(m.frame.w * m.frame.h * 4);
      const got = unpackFrame(m3, pageImgs, c, r);
      if (!Buffer.from(want).equals(Buffer.from(got))) throw new Error(`pack ${m.class}: frame col ${c} row ${r} differs from the source`);
    }
}
