// Minimal PNG codec for the art tools (no dependencies): decode 8-bit and
// palette PNGs (non-interlaced) to RGBA, encode RGBA to PNG. JPEG, WebP and
// interlaced PNG inputs are converted to PNG first with macOS `sips`.
// An image is { w, h, data: Uint8Array (RGBA, row-major) }.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

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

/** Decode a PNG buffer to RGBA. Throws on interlaced or 16-bit files. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let p = 8;
  let w, h, depth, type, interlace;
  let palette = null;
  let trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('ascii', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG: convert it first (sips -s format png)');
  if (depth === 16) throw new Error('16-bit PNG is not supported: export 8-bit');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
    prev = out;
  }
  const data = new Uint8Array(w * h * 4);
  const sample = (row, i) => {
    if (depth === 8) return row[i];
    const per = 8 / depth;
    const byte = row[Math.floor(i / per)];
    const shift = 8 - depth * ((i % per) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const i = sample(row, x);
        data[o] = palette[i * 3];
        data[o + 1] = palette[i * 3 + 1];
        data[o + 2] = palette[i * 3 + 2];
        data[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (type === 0 || type === 4) {
        const g = type === 0 ? sample(row, x) * (255 / ((1 << depth) - 1)) : row[x * 2];
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = type === 4 ? row[x * 2 + 1] : 255;
      } else {
        const s = x * channels;
        data[o] = row[s];
        data[o + 1] = row[s + 1];
        data[o + 2] = row[s + 2];
        data[o + 3] = channels === 4 ? row[s + 3] : 255;
      }
    }
  }
  return { w, h, data };
}

function chunk(kind, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const kb = Buffer.concat([Buffer.from(kind, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kb));
  return Buffer.concat([len, kb, crc]);
}

/** Encode RGBA to a PNG buffer (colour type 6, filter 0 per row). */
export function encodePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Read any image file (PNG directly; JPEG / WebP / interlaced PNG through macOS sips). */
export function readImage(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).equals(SIG)) {
    try {
      return decodePng(buf);
    } catch (e) {
      if (!/interlaced|16-bit/.test(e.message)) throw e;
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'art-'));
  try {
    const out = join(dir, 'in.png');
    execFileSync('sips', ['-s', 'format', 'png', '-s', 'formatOptions', 'default', path, '--out', out], { stdio: 'ignore' });
    return decodePng(readFileSync(out));
  } catch (e) {
    throw new Error(`cannot read ${path} (${extname(path)}): ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeImage(path, img) {
  writeFileSync(path, encodePng(img));
}
