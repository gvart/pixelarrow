/**
 * The QR encoder of src/ui/mosaic/qr.ts (V6-LINK-06, accounts-v6.md §12 QrCode). Reference vectors:
 * ISO/IEC 18004's format and version information tables, the Reed-Solomon codewords of the standard
 * "HELLO WORLD" 1-M example, and golden matrices of two t.me links that macOS CoreImage
 * (CIDetectorTypeQRCode, an independent decoder) read back as the same text (scripts/dev/qr-verify.mjs).
 * The test's own reader checks every block's syndromes and the byte-mode payload for many inputs.
 */
import { describe, expect, it } from 'vitest';
import { encodeQr, formatBits, rsEcc, versionBits, type QrMatrix } from '../src/ui/mosaic/qrEncode';

describe('QR building blocks match ISO/IEC 18004', () => {
  it('format information (error level M and L, every mask) matches the table', () => {
    const M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
    M.forEach((bits, mask) => expect(formatBits('M', mask).toString(2).padStart(15, '0')).toBe(bits));
    expect(formatBits('L', 0).toString(2).padStart(15, '0')).toBe('111011111000100');
    expect(formatBits('L', 3).toString(2).padStart(15, '0')).toBe('111100010011101');
  });

  it('version information for versions 7 to 10 matches the table', () => {
    expect(versionBits(7).toString(16)).toBe('7c94');
    expect(versionBits(8).toString(16)).toBe('85bc');
    expect(versionBits(9).toString(16)).toBe('9a99');
    expect(versionBits(10).toString(16)).toBe('a4d3');
  });

  it('Reed-Solomon codewords of the HELLO WORLD 1-M example', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsEcc(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

// ------------------------------------------------------------------ a small reader (the test's own)

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
/** Every syndrome of a block (data then EC codewords) is zero when it is a codeword. */
const syndromesZero = (block: number[], ec: number) => {
  for (let i = 0; i < ec; i++) {
    let s = 0;
    for (const c of block) s = gmul(s, EXP[i]) ^ c;
    if (s) return false;
  }
  return true;
};
const BLOCKS: Record<number, [number, [number, number][]]> = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const MASKS = [
  (x: number, y: number) => (x + y) % 2 === 0,
  (_x: number, y: number) => y % 2 === 0,
  (x: number) => x % 3 === 0,
  (x: number, y: number) => (x + y) % 3 === 0,
  (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Reads a matrix back: format info (both copies agree), unmasks, de-interleaves, checks RS, parses byte mode. */
function read(q: QrMatrix): string {
  const n = q.size;
  const v = (n - 17) / 4;
  const at = (x: number, y: number) => q.modules[y * n + x] === 1;
  let f1 = 0;
  let f2 = 0;
  const one = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  one.forEach(([x, y], i) => (f1 |= (at(x, y) ? 1 : 0) << i));
  for (let i = 0; i < 8; i++) f2 |= (at(n - 1 - i, 8) ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) f2 |= (at(8, n - 15 + i) ? 1 : 0) << i;
  expect(f1).toBe(f2);
  const fmt = f1 ^ 0x5412;
  expect(fmt >> 13).toBe(0); // level M
  const mask = (fmt >> 10) & 7;
  // the function modules, as the standard draws them
  const fn = new Uint8Array(n * n);
  const mark = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && (fn[y * n + x] = 1);
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) mark(cx + dx, cy + dy);
  for (let i = 0; i < n; i++) (mark(6, i), mark(i, 6));
  const align = v === 1 ? [] : (({ 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] }) as Record<number, number[]>)[v];
  for (const ay of align) for (const ax of align) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === n - 7) || (ax === n - 7 && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(ax + dx, ay + dy);
  }
  for (let i = 0; i < 9; i++) (mark(8, i), mark(i, 8));
  for (let i = 0; i < 8; i++) (mark(n - 1 - i, 8), mark(8, n - 1 - i));
  if (v >= 7) for (let i = 0; i < 18; i++) (mark(n - 11 + (i % 3), Math.floor(i / 3)), mark(Math.floor(i / 3), n - 11 + (i % 3)));
  const bits: number[] = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
        if (!fn[y * n + x]) bits.push((at(x, y) ? 1 : 0) ^ (MASKS[mask](x, y) ? 1 : 0));
      }
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const [ec, groups] = BLOCKS[v];
  const lens = groups.flatMap(([c, l]) => Array<number>(c).fill(l));
  const blocks = lens.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < Math.max(...lens); i++) lens.forEach((l, b) => i < l && blocks[b].push(words[k++]));
  for (let i = 0; i < ec; i++) blocks.forEach((b) => b.push(words[k++]));
  blocks.forEach((b) => expect(syndromesZero(b, ec)).toBe(true));
  const data = blocks.flatMap((b, i) => b.slice(0, lens[i]));
  const db = data.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (w >> s) & 1));
  const num = (from: number, len: number) => db.slice(from, from + len).reduce((a, b) => (a << 1) | b, 0);
  expect(num(0, 4)).toBe(0b0100); // byte mode
  const cc = v < 10 ? 8 : 16;
  const len = num(4, cc);
  const bytes = Array.from({ length: len }, (_, i) => num(4 + cc + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const rows = (q: QrMatrix) => Array.from({ length: q.size }, (_, y) => Array.from({ length: q.size }, (_, x) => (q.modules[y * q.size + x] ? '1' : '0')).join(''));

describe('encodeQr', () => {
  it('draws finders, timing and the dark module, and picks the smallest version', () => {
    const q = encodeQr('https://t.me/pixelarrow_bot/play?startapp=link_AAAAAAAAAAAAAAAAAAAAAA')!;
    expect(q.size).toBe(17 + 4 * q.version);
    expect(q.version).toBe(5); // 69 bytes: 4-M holds 62, 5-M 84
    const r = rows(q);
    expect(r[0].slice(0, 7)).toBe('1111111');
    expect(r[2].slice(0, 7)).toBe('1011101');
    expect(r[6].slice(8, q.size - 8)).toMatch(/^(10)*1$/);
    expect(r[4 * q.version + 9][8]).toBe('1');
  });

  it('reads back as the same text, with valid Reed-Solomon blocks, from version 1 to 10', () => {
    const texts = ['a', 'Pixelarrow', 'https://t.me/b/play?startapp=link_x', 'Привязать Telegram ✓', 'x'.repeat(100), 'https://t.me/' + 'b'.repeat(32) + '/' + 'a'.repeat(30) + '?startapp=link_' + 'Z'.repeat(22), 'y'.repeat(213)];
    const seen = new Set<number>();
    for (const s of texts) {
      const q = encodeQr(s)!;
      seen.add(q.version);
      expect(read(q)).toBe(s);
    }
    expect(seen.has(1) && seen.has(10) && [...seen].some((v) => v >= 7)).toBe(true);
  });

  it('returns null past what version 10-M holds', () => {
    expect(encodeQr('z'.repeat(214))).toBeNull();
  });

  it('matches the golden matrices CoreImage decoded (scripts/dev/qr-verify.mjs)', () => {
    for (const [text, hash] of GOLDEN) expect(fnv(rows(encodeQr(text)!).join(''))).toBe(hash);
  });
});

/** FNV-1a of the module rows: a compact golden value. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

const GOLDEN: [string, string][] = [
  ['https://t.me/pixelarrow_bot/play?startapp=link_AAAAAAAAAAAAAAAAAAAAAA', '413799d1'],
  ['https://t.me/PixelarrowGameBot/play?startapp=link_q3Xh_9-ZkT2bLmN0pR4sVw', '4a359fed'],
  ['https://t.me/' + 'b'.repeat(32) + '/' + 'a'.repeat(30) + '?startapp=link_' + 'Z'.repeat(22), 'a04c7cec'],
  ['Привязать Telegram ✓', '1dbc8f5c'],
  ['y'.repeat(213), '6d70758e'],
];
