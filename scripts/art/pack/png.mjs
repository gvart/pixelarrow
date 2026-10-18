// Size-optimised lossless PNG encoder for packed sheet pages (no dependencies).
//
// A page of at most 256 distinct RGBA colours (pixel art usually is) is written
// as an indexed PNG (colour type 3, the smallest bit depth that holds the
// palette, a tRNS chunk for the transparent entries); anything else as RGBA.
// Either way the decoded pixels are exactly the input's (fully transparent
// pixels read back as 0,0,0,0). Rows are filtered by each of the five filters
// and by the per-row minimum-sum heuristic, deflated with two strategies, and
// the smallest result is kept. No colour chunks (gAMA, iCCP, sRGB): the browser
// reads the exact colours back.
import { deflateSync, constants } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(kind, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const kb = Buffer.concat([Buffer.from(kind, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kb));
  return Buffer.concat([len, kb, crc]);
}

/** Filter one scanline (`bpp` bytes per pixel, 1 for packed indices) with PNG filter `f`. */
function filterLine(f, line, prev, bpp, out) {
  out[0] = f;
  for (let x = 0; x < line.length; x++) {
    const a = x >= bpp ? line[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = x >= bpp && prev ? prev[x - bpp] : 0;
    let p;
    if (f === 0) p = 0;
    else if (f === 1) p = a;
    else if (f === 2) p = b;
    else if (f === 3) p = (a + b) >> 1;
    else {
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    out[x + 1] = (line[x] - p) & 0xff;
  }
}

/** Filtered image data: every row with filter `mode` (0..4), or the row's cheapest by sum of |signed bytes| ('auto'). */
function filtered(rows, bpp, mode) {
  const stride = rows[0].length;
  const out = Buffer.alloc((stride + 1) * rows.length);
  const tmp = Buffer.alloc(stride + 1);
  for (let y = 0; y < rows.length; y++) {
    const prev = y ? rows[y - 1] : null;
    const dst = out.subarray(y * (stride + 1), (y + 1) * (stride + 1));
    if (mode !== 'auto') {
      filterLine(mode, rows[y], prev, bpp, dst);
      continue;
    }
    let best = Infinity;
    for (let f = 0; f < 5; f++) {
      filterLine(f, rows[y], prev, bpp, tmp);
      let s = 0;
      for (let i = 1; i < tmp.length; i++) s += tmp[i] < 128 ? tmp[i] : 256 - tmp[i];
      if (s < best) {
        best = s;
        tmp.copy(dst);
      }
    }
  }
  return out;
}

/** The smallest deflate of the image rows over the filter choices and two zlib strategies. */
function bestIdat(rows, bpp, modes) {
  let best = null;
  for (const mode of modes) {
    const raw = filtered(rows, bpp, mode);
    for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
      const z = deflateSync(raw, { level: 9, memLevel: 9, strategy });
      if (!best || z.length < best.length) best = z;
    }
  }
  return best;
}

/**
 * Encode { w, h, data: RGBA } to the smallest PNG this encoder finds.
 * Returns { png: Buffer, indexed: boolean, colors: number } (colors: distinct RGBA, 0 when over 256).
 */
export function encodePngSmall({ w, h, data }) {
  // distinct colours (fully transparent pixels are one colour, 0,0,0,0)
  const key = (i) => (data[i + 3] ? ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0 : 0);
  const seen = new Map();
  for (let i = 0; i < data.length && seen.size <= 256; i += 4) {
    const k = key(i);
    if (!seen.has(k)) seen.set(k, 0);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  const parts = [SIG];
  let indexed = false;
  if (seen.size <= 256) {
    indexed = true;
    // non-opaque entries first, so tRNS stops at the last of them
    const pal = [...seen.keys()].sort((a, b) => (a & 255) - (b & 255) || a - b);
    pal.forEach((k, i) => seen.set(k, i));
    const depth = pal.length <= 2 ? 1 : pal.length <= 4 ? 2 : pal.length <= 16 ? 4 : 8;
    const per = 8 / depth;
    const stride = Math.ceil(w / per);
    const rows = [];
    for (let y = 0; y < h; y++) {
      const row = Buffer.alloc(stride);
      for (let x = 0; x < w; x++) {
        const idx = seen.get(key((y * w + x) * 4));
        row[Math.floor(x / per)] |= idx << (8 - depth * ((x % per) + 1));
      }
      rows.push(row);
    }
    ihdr[8] = depth;
    ihdr[9] = 3;
    const plte = Buffer.alloc(pal.length * 3);
    pal.forEach((k, i) => {
      plte[i * 3] = k >>> 24;
      plte[i * 3 + 1] = (k >>> 16) & 255;
      plte[i * 3 + 2] = (k >>> 8) & 255;
    });
    const nTrns = pal.filter((k) => (k & 255) < 255).length;
    parts.push(chunk('IHDR', ihdr), chunk('PLTE', plte));
    if (nTrns) parts.push(chunk('tRNS', Buffer.from(pal.slice(0, nTrns).map((k) => k & 255))));
    // palette images: no filter is usually best, the heuristic sometimes
    parts.push(chunk('IDAT', bestIdat(rows, 1, [0, 'auto', 1, 2])));
  } else {
    ihdr[8] = 8;
    ihdr[9] = 6;
    const rows = [];
    for (let y = 0; y < h; y++) {
      const row = Buffer.alloc(w * 4);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3]) for (let c = 0; c < 4; c++) row[x * 4 + c] = data[i + c];
      }
      rows.push(row);
    }
    parts.push(chunk('IHDR', ihdr), chunk('IDAT', bestIdat(rows, 4, ['auto', 0, 1, 2, 3, 4])));
  }
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return { png: Buffer.concat(parts), indexed, colors: indexed ? seen.size : 0 };
}
