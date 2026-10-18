// Checks src/ui/mosaic/qrEncode.ts against an independent decoder (V6-LINK-06): macOS CoreImage's
// CIDetectorTypeQRCode. Writes each sample as a PNG, has `swift` read it back, compares the text, and
// prints the golden hash tests/qr.test.ts keeps for it. macOS only (it needs swift and CoreImage).
//
//   node scripts/dev/qr-verify.mjs
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { encodeQr } from '../../src/ui/mosaic/qrEncode.ts';

const SAMPLES = [
  'https://t.me/pixelarrow_bot/play?startapp=link_AAAAAAAAAAAAAAAAAAAAAA',
  'https://t.me/PixelarrowGameBot/play?startapp=link_q3Xh_9-ZkT2bLmN0pR4sVw',
  'https://t.me/' + 'b'.repeat(32) + '/' + 'a'.repeat(30) + '?startapp=link_' + 'Z'.repeat(22),
  'Привязать Telegram ✓',
  'y'.repeat(213),
];

/** A greyscale PNG, `px` pixels per module, 4 quiet modules. */
function png(q, px = 8) {
  const w = (q.size + 8) * px;
  const raw = Buffer.alloc((w + 1) * w, 0xff);
  for (let y = 0; y < w; y++) {
    raw[y * (w + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const mx = Math.floor(x / px) - 4;
      const my = Math.floor(y / px) - 4;
      if (mx >= 0 && my >= 0 && mx < q.size && my < q.size && q.modules[my * q.size + mx]) raw[y * (w + 1) + 1 + x] = 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(b) {
  let c = ~0;
  for (const byte of b) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

const SWIFT = `
import CoreImage
import Foundation
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for path in CommandLine.arguments.dropFirst() {
  let img = CIImage(contentsOf: URL(fileURLWithPath: path))!
  let text = (det.features(in: img).first as? CIQRCodeFeature)?.messageString ?? "<none>"
  print(Data(text.utf8).base64EncodedString())
}
`;

const dir = mkdtempSync(join(tmpdir(), 'qr-verify-'));
const files = [];
const golden = [];
SAMPLES.forEach((s, i) => {
  const q = encodeQr(s);
  const f = join(dir, `${i}.png`);
  writeFileSync(f, png(q));
  files.push(f);
  const rows = Array.from({ length: q.size }, (_, y) => Array.from({ length: q.size }, (_, x) => (q.modules[y * q.size + x] ? '1' : '0')).join(''));
  golden.push([s, q.version, fnv(rows.join(''))]);
});
writeFileSync(join(dir, 'read.swift'), SWIFT);
const r = spawnSync('swift', [join(dir, 'read.swift'), ...files], { encoding: 'utf8' });
rmSync(dir, { recursive: true, force: true });
if (r.status !== 0) {
  console.log('NOT RUN: swift failed', r.stderr.slice(0, 400));
  process.exit(2);
}
const read = r.stdout.trim().split('\n').map((b) => Buffer.from(b, 'base64').toString('utf8'));
let bad = 0;
golden.forEach(([s, v, h], i) => {
  const ok = read[i] === s;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} v${v} ${h} ${JSON.stringify(s.length > 60 ? s.slice(0, 57) + '...' : s)}${ok ? '' : ` read ${JSON.stringify(read[i])}`}`);
});
process.exit(bad ? 1 : 0);
