/**
 * The QR encoder behind QrCode (qr.ts; design/ux/accounts-v6.md §12), with no Phaser so tests run it:
 * ISO/IEC 18004, byte mode, error level M, versions 1 to 10 (up to 213 bytes, plenty for a t.me link).
 * Reference vectors and an independent decoder check: tests/qr.test.ts, scripts/dev/qr-verify.mjs.
 */

export interface QrMatrix {
  version: number;
  /** Modules per side: 17 + 4 × version. */
  size: number;
  /** Row-major, 1 = dark. */
  modules: Uint8Array;
}

// ------------------------------------------------------------------ GF(256) and Reed-Solomon

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The `n` error correction codewords of `data` (generator ∏ (x − αⁱ), i < n). */
export function rsEcc(data: number[], n: number): number[] {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((g, j) => {
      next[j] ^= g;
      next[j + 1] ^= mul(g, EXP[i]);
    });
    gen = next;
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ (rem.shift() ?? 0);
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}

// ------------------------------------------------------------------ tables (level M)

/** Per version: EC codewords per block, and [block count, data codewords per block] groups. */
const BLOCKS_M: [number, [number, number][]][] = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const LEVEL = { L: 1, M: 0, Q: 3, H: 2 } as const;

/** The 15 format bits for a level and mask (BCH(15,5), then the 0x5412 mask). */
export function formatBits(level: keyof typeof LEVEL, mask: number): number {
  const data = (LEVEL[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** The 18 version bits (BCH(18,6)), for versions 7 and up. */
export function versionBits(v: number): number {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | (rem & 0xfff);
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// ------------------------------------------------------------------ encoding

/** The codewords of `bytes` at version `v` (data then EC, interleaved), or null when they don't fit. */
function codewords(bytes: Uint8Array, v: number): number[] | null {
  const [ec, groups] = BLOCKS_M[v - 1];
  const lens = groups.flatMap(([c, l]) => new Array<number>(c).fill(l));
  const cap = lens.reduce((a, b) => a + b, 0) * 8;
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  if (bits.length + bytes.length * 8 > cap) return null;
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const blocks: number[][] = [];
  let k = 0;
  for (const l of lens) blocks.push(words.slice(k, (k += l)));
  const ecc = blocks.map((b) => rsEcc(b, ec));
  const out: number[] = [];
  for (let i = 0; i < Math.max(...lens); i++) blocks.forEach((b) => i < b.length && out.push(b[i]));
  for (let i = 0; i < ec; i++) ecc.forEach((e) => out.push(e[i]));
  return out;
}

/** The penalty of a masked matrix (the standard's four rules). */
function penalty(m: Uint8Array, n: number): number {
  let p = 0;
  const at = (x: number, y: number) => m[y * n + x];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      const line: number[] = [];
      for (let b = 0; b < n; b++) line.push(pass ? at(a, b) : at(b, a));
      for (let b = 1; b <= n; b++) {
        if (b < n && line[b] === line[b - 1]) run++;
        else {
          if (run >= 5) p += 3 + run - 5;
          run = 1;
        }
      }
      // a finder-like 1:1:3:1:1 with four light modules on one side
      const s = line.join('');
      for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      dark += at(x, y);
      if (x < n - 1 && y < n - 1) {
        const c = at(x, y);
        if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) p += 3;
      }
    }
  const total = n * n;
  return p + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

/** Where the 15 format bits go, both copies: [x, y, bit]. */
function formatPositions(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) out.push([8, i, i]);
  out.push([8, 7, 6], [8, 8, 7], [7, 8, 8]);
  for (let i = 9; i < 15; i++) out.push([14 - i, 8, i]);
  for (let i = 0; i < 8; i++) out.push([n - 1 - i, 8, i]);
  for (let i = 8; i < 15; i++) out.push([8, n - 15 + i, i]);
  return out;
}

/** `text` (UTF-8) as a QR code at error level M in the smallest version that holds it; null past version 10. */
export function encodeQr(text: string): QrMatrix | null {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  let data: number[] | null = null;
  for (; v <= 10 && !(data = codewords(bytes, v)); v++);
  if (!data) return null;
  const n = 17 + 4 * v;
  const mod = new Uint8Array(n * n);
  const fn = new Uint8Array(n * n);
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    mod[y * n + x] = dark ? 1 : 0;
    fn[y * n + x] = 1;
  };
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]])
    for (let dy = -1; dy <= 7; dy++)
      for (let dx = -1; dx <= 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        set(cx + dx, cy + dy, ring !== 2 && ring <= 3);
      }
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const al = ALIGN[v - 1];
  for (const ay of al)
    for (const ax of al) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === n - 7) || (ax === n - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const format = formatPositions(n);
  for (const [x, y] of format) set(x, y, false); // reserved; each mask writes its own bits
  set(8, n - 8, true); // the dark module
  if (v >= 7) {
    const vb = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const dark = ((vb >>> i) & 1) === 1;
      set(n - 11 + (i % 3), Math.floor(i / 3), dark);
      set(Math.floor(i / 3), n - 11 + (i % 3), dark);
    }
  }
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
        if (fn[y * n + x]) continue;
        if (i < data.length * 8) mod[y * n + x] = (data[i >>> 3] >>> (7 - (i & 7))) & 1;
        i++;
      }
  }
  let best: Uint8Array | null = null;
  let bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = mod.slice();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y * n + x] && MASKS[mask](x, y)) m[y * n + x] ^= 1;
    const f = formatBits('M', mask);
    for (const [x, y, bit] of format) m[y * n + x] = (f >>> bit) & 1;
    const p = penalty(m, n);
    if (p < bestP) {
      bestP = p;
      best = m;
    }
  }
  return { version: v, size: n, modules: best! };
}

