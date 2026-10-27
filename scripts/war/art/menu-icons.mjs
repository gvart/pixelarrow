// The HUD menu icons the kit had none for (crown, replay, sound), drawn in code in the kit's treatment: 1 px dark
// outline, three-tone shading lit from the top left; @2x is the same pixels doubled.
// Usage: node scripts/war/art/menu-icons.mjs [outDir] (default public/war/ui/icons/24)
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'public/war/ui/icons/24';
const PAL = {
  o: [0x24, 0x15, 0x0a], H: [0xff, 0xe7, 0xa3], G: [0xe0, 0xb8, 0x67], S: [0x9a, 0x6c, 0x2c], D: [0x6b, 0x47, 0x1c],
  R: [0xb4, 0x2c, 0x22], r: [0xff, 0x9a, 0x5a], P: [0xf3, 0xdc, 0xb0], Q: [0xd9, 0xa8, 0x6a], T: [0x9a, 0x6a, 0x3a],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(grid, scale) {
  const h = grid.length * scale, w = grid[0].length * scale;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const ch = grid[Math.floor(y / scale)][Math.floor(x / scale)], i = y * (w * 4 + 1) + 1 + x * 4;
      if (ch !== ' ') { const c = PAL[ch]; raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Outline every empty pixel touching a filled one (8 neighbours). */
function outline(g) {
  const a = g.map((r) => r.split(''));
  const b = a.map((r) => [...r]);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    if (a[y][x] !== ' ') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (a[y + dy]?.[x + dx] && a[y + dy][x + dx] !== ' ' && a[y + dy][x + dx] !== 'o') b[y][x] = 'o';
  }
  return b.map((r) => r.join(''));
}
const save = (name, g) => {
  for (const r of g) if (r.length !== 24) throw new Error(`${name}: row "${r}" is ${r.length}`);
  if (g.length !== 24) throw new Error(`${name}: ${g.length} rows`);
  writeFileSync(`${out}/${name}.png`, png(g, 1));
  writeFileSync(`${out}/${name}@2x.png`, png(g, 2));
};

// the crown: three points with gems, a gem on the brow, a jewelled band
const crown = outline([
  '                        ',
  '                        ',
  '                        ',
  '                        ',
  '           rr           ',
  '   rr     rRRS     rr   ',
  '   RRS     SS     rRRS  ',
  '    SS     HG      SS   ',
  '    HG    HGGS     HS   ',
  '    HGS  HGGGGS   HGS   ',
  '    HGGS HGGGGS  HGGS   ',
  '    HGGGHGGGGGGSHGGGS   ',
  '    HGGGGGGrrGGGGGGGS   ',
  '    HGGGGGrRRSGGGGGGS   ',
  '    HGGGGGGSSGGGGGGSS   ',
  '    SSSSSSSSSSSSSSSSD   ',
  '   oooooooooooooooooooo ',
  '   HHHHHHHHHHHHHHHHHHGS ',
  '   GGrRGGGGGrRGGGGGrRSS ',
  '   GGSSGGGGGSSGGGGGSSSD ',
  '   SSSSSSSSSSSSSSSSSSDD ',
  '                        ',
  '                        ',
  '                        ',
]);
save('menu-crown', crown);

// replay: a ring arrow turning back (counterclockwise, head at the top right) round a red play mark
const g = Array.from({ length: 24 }, () => Array(24).fill(' '));
const cx = 11.5, cy = 12, L = [-0.7071, -0.7071];
for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
  const dx = x + 0.5 - cx - 0.5, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (r >= 6.3 && r <= 9.4 && !(a > -112 && a < -58)) {
    const lit = (dx / r) * L[0] + (dy / r) * L[1], inner = r < 7.4;
    g[y][x] = lit > 0.35 ? 'P' : lit > -0.45 ? (inner ? 'T' : 'Q') : 'T';
    if (lit > -0.45 && r > 8.6) g[y][x] = lit > 0.35 ? 'P' : 'Q';
  }
}
// the arrowhead at -58 deg, pointing along the counterclockwise way (up and to the left)
{
  const th = (-58 * Math.PI) / 180, rm = 7.85, px = cx + 0.5 + rm * Math.cos(th), py = cy + rm * Math.sin(th);
  const d = [Math.sin(th), -Math.cos(th)], n = [-d[1], d[0]];
  const tip = [px + 4.2 * d[0], py + 4.2 * d[1]], b1 = [px - 0.5 * d[0] + 4.4 * n[0], py - 0.5 * d[1] + 4.4 * n[1]], b2 = [px - 0.5 * d[0] - 4.4 * n[0], py - 0.5 * d[1] - 4.4 * n[1]];
  const side = (p, a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const p = [x + 0.5, y + 0.5], s1 = side(p, tip, b1), s2 = side(p, b1, b2), s3 = side(p, b2, tip);
    if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) g[y][x] = p[1] < py - 1 ? 'P' : 'Q';
  }
}
// the play mark
for (let y = 8; y <= 16; y++) {
  const half = 4 - Math.abs(y - 12);
  for (let x = 10; x <= 10 + half * 1.25 && x < 24; x++) g[y][x] = y < 12 ? 'r' : 'R';
}
save('menu-replay', outline(g.map((r) => r.join(''))));

// sound: a bronze speaker and two sound waves
{
  const s = Array.from({ length: 24 }, () => Array(24).fill(' '));
  const cy = 12;
  for (let y = 9; y <= 15; y++) for (let x = 3; x <= 6; x++) s[y][x] = y === 9 ? 'H' : y === 15 ? 'S' : x === 3 ? 'H' : 'G';
  for (let x = 7; x <= 12; x++) {
    const h = 3 + (x - 7);
    for (let y = cy - h; y <= cy + h; y++) s[y][x] = y === cy - h ? 'H' : y === cy + h ? 'D' : y > cy + 1 ? 'S' : 'G';
  }
  for (let y = 0; y < 24; y++) for (let x = 14; x < 24; x++) {
    const r = Math.hypot(x + 0.5 - 13, y + 0.5 - 12.5), a = Math.abs(Math.atan2(y + 0.5 - 12.5, x + 0.5 - 13));
    if (a > 0.85) continue;
    if ((r >= 3.2 && r <= 4.6) || (r >= 6.2 && r <= 7.6)) s[y][x] = y < 12 ? 'P' : 'Q';
  }
  save('menu-sound', outline(s.map((r) => r.join(''))));
}
console.log('ok');
