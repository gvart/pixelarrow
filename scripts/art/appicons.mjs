// App icon set from one painted mark (AS-08, template T-MARK in docs/playbook/PROMPTS_ART.md).
// The raw is a round red-figure disc on #FF00FF: it is keyed, trimmed and given a clean round alpha,
// then laid out at every size the web app and the Telegram bot need. Small sizes (≤ 48 px) use the
// inner disc only (the helmet, without the Greek-key ring), so the helmet stays a readable shape.
// Usage: node scripts/art/appicons.mjs <raw mark> [cover art for the 640x360 Telegram image]
// Output: public/ (favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png,
// icon-maskable-512.png) and docs/telegram/ (bot_userpic_640.png, miniapp_cover_640x360.jpg).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readImage, writeImage, encodePng } from './lib/png.mjs';
import { keyOut, trim, fit, blank, paste, flatten, crop } from './lib/ops.mjs';
import { ROOT } from './lib/manifest.mjs';

const [rawPath, coverPath = join(ROOT, 'public/ui/fresco_campaign.jpg')] = process.argv.slice(2);
if (!rawPath) {
  console.error('usage: node scripts/art/appicons.mjs <raw mark> [cover art]');
  process.exit(2);
}
/** The game's backdrop (src/ui/tokens.ts bg, index.html theme-color). */
const BG = '#14100c';
/** The inner disc (inside the meander ring) as a share of the whole disc's diameter. */
const INNER = Number(process.env.INNER ?? 0.75);

/** Square crop of `img` centred, `share` of its size, with a round anti-aliased alpha. */
function roundDisc(img, share = 1) {
  const s = Math.floor(Math.min(img.w, img.h) * share);
  const c = crop(img, { x: Math.round((img.w - s) / 2), y: Math.round((img.h - s) / 2), w: s, h: s });
  const r = s / 2;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      const cover = Math.max(0, Math.min(1, r - d + 0.5));
      const i = (y * s + x) * 4 + 3;
      c.data[i] = Math.round(c.data[i] * cover);
    }
  return c;
}

/** `disc` at `share` of a size x size canvas, on `bg` (or transparent). */
function place(disc, size, share, bg) {
  const d = Math.round(size * share);
  const inner = fit(disc, d, d, { mode: 'contain' });
  if (!bg) {
    const out = blank(size, size);
    const o = Math.round((size - d) / 2);
    for (let y = 0; y < d; y++) out.data.set(inner.data.subarray(y * d * 4, (y + 1) * d * 4), ((y + o) * size + o) * 4);
    return out;
  }
  return paste(flatten(blank(size, size), bg), inner, Math.round((size - d) / 2), Math.round((size - d) / 2));
}

/** A .ico holding PNG images (Vista+ format; every current browser reads it). */
function ico(images) {
  const pngs = images.map(encodePng);
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    head[e] = images[i].w % 256;
    head[e + 1] = images[i].h % 256;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.length, e + 8);
    head.writeUInt32LE(off, e + 12);
    off += p.length;
  });
  return Buffer.concat([head, ...pngs]);
}

const disc = roundDisc(trim(keyOut(readImage(rawPath), { tol: 60, fringe: 3 })));
const small = roundDisc(disc, INNER);
const pub = join(ROOT, 'public');
const tg = join(ROOT, 'docs/telegram');
mkdirSync(tg, { recursive: true });
const out = (dir, name, img) => (writeImage(join(dir, name), img), console.log(`${name} ${img.w}x${img.h}`));

// web: the whole disc from 180 up; the inner disc (helmet only) for the browser tab
writeFileSync(join(pub, 'favicon.ico'), ico([16, 32, 48].map((s) => place(small, s, 1))));
console.log('favicon.ico 16+32+48');
out(pub, 'favicon-32.png', place(small, 32, 1));
out(pub, 'apple-touch-icon.png', place(disc, 180, 0.9, BG));
out(pub, 'icon-192.png', place(disc, 192, 1));
out(pub, 'icon-512.png', place(disc, 512, 1));
// maskable: the safe zone is the centred circle of 80% of the size (W3C manifest spec)
out(pub, 'icon-maskable-512.png', place(disc, 512, 0.8, BG));

// Telegram: the bot's profile picture is shown as a circle; the disc sits inside it with a margin
out(tg, 'bot_userpic_640.png', place(disc, 640, 0.86, BG));
// Mini App / description image 640x360: the campaign fresco, the mark in its sky at the upper left
const cover = fit(readImage(coverPath), 640, 360, { mode: 'cover', ax: 0.5, ay: 0.5 });
for (let i = 3; i < cover.data.length; i += 4) cover.data[i] = 255;
const mark = fit(disc, 150, 150, { mode: 'contain' });
paste(cover, mark, 28, 24);
const tmp = join(tg, '.cover.png');
writeImage(tmp, cover);
execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '88', tmp, '--out', join(tg, 'miniapp_cover_640x360.jpg')], { stdio: 'ignore' });
rmSync(tmp);
console.log('miniapp_cover_640x360.jpg 640x360');
