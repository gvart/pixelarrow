// The war trailer's music and title cards, rendered offline in the browser from the game's own sources (with
// `npm run dev` running): every music cue is a src/audio/music.ts track (or the victory stinger) rendered in an
// OfflineAudioContext at 48 kHz, seeded, so a re-render gives the same samples; the cards are PNGs (transparent) set in
// Cinzel 700, the game's heading serif (@fontsource/cinzel).
//
//   node scripts/landing/trailer-music.mjs [--base http://localhost:5173/] [--out shots/trailer]
//     -> <out>/music/<cue>.wav, <out>/cards/<card>.png
// ./trailer.mjs lays them on the cut (the cue sheet there).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const base = opt('--base', 'http://localhost:5173/').replace(/\/?$/, '/');
const OUT = resolve(opt('--out', join(ROOT, 'shots', 'trailer')));

/** Music cues: a track for `seconds` (heat for battle and boss), or the victory stinger with a lyre tail. */
export const CUES = {
  explore: { track: 'explore', seconds: 20 },
  deploy: { track: 'deploy', seconds: 6 },
  battle: { track: 'battle', seconds: 15, heat: 1 },
  boss: { track: 'boss', seconds: 10, heat: 1 },
  drone: { track: 'boss', seconds: 3, heat: 0 },
  battle2: { track: 'battle', seconds: 6, heat: 1 },
  dum: { drum: 0.9, seconds: 2.5 },
  victory: { stinger: 'victory', seconds: 6 },
  tail: { track: 'explore', seconds: 6 },
};

/** Title cards: lines of [text, px] centred, `y` the first baseline's share of the height. */
export const CARDS = {
  card1: { lines: [['The fallen wake again.', 64]], y: 0.8 },
  card2: { lines: [['Build. Trade. Conquer.', 64]], y: 0.8 },
  card3: { lines: [['Every soldier has a name.', 64]], y: 0.8 },
  end: { lines: [['PIXELARROW', 120], ['Coming soon · pixelarrow.app', 44]], y: 0.5 },
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.route('**/api/**', (r) => r.fulfill({ status: 503, body: '{}' }));
await page.goto(`${base}sandbox.html?region=fake`);

mkdirSync(join(OUT, 'music'), { recursive: true });
for (const [id, cue] of Object.entries(CUES)) {
  const b64 = await page.evaluate(async (cue) => {
    const [{ MusicPlayer }, { frameDrum }, { AudioRng }] = await Promise.all([import('/src/audio/music.ts'), import('/src/audio/sfx.ts'), import('/src/audio/rng.ts')]);
    const RATE = 48000, ctx = new OfflineAudioContext(2, Math.ceil(cue.seconds * RATE), RATE);
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    if (cue.drum) frameDrum(ctx, bus, 0.02, new AudioRng(7), cue.drum);
    else {
      const m = new MusicPlayer(ctx, bus);
      if (cue.stinger) m.stinger(cue.stinger);
      else {
        m.set(cue.track, 0.05);
        if (cue.heat !== undefined) m.setHeat(cue.heat, true);
        m.pump(cue.seconds);
      }
    }
    const buf = await ctx.startRendering(), len = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = new DataView(new ArrayBuffer(44 + len * 8));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    // 32-bit float WAV: the mix keeps its headroom
    str(0, 'RIFF'); out.setUint32(4, 36 + len * 8, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true);
    out.setUint16(20, 3, true); out.setUint16(22, 2, true); out.setUint32(24, RATE, true); out.setUint32(28, RATE * 8, true);
    out.setUint16(32, 8, true); out.setUint16(34, 32, true); str(36, 'data'); out.setUint32(40, len * 8, true);
    for (let i = 0; i < len; i++) for (let c = 0; c < 2; c++) out.setFloat32(44 + (i * 2 + c) * 4, ch[c][i], true);
    let s = '';
    const b = new Uint8Array(out.buffer);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  }, cue);
  writeFileSync(join(OUT, 'music', `${id}.wav`), Buffer.from(b64, 'base64'));
  console.log(`music ${id}: ${cue.seconds} s`);
}

mkdirSync(join(OUT, 'cards'), { recursive: true });
const font = readFileSync(join(ROOT, 'node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2')).toString('base64');
for (const [id, card] of Object.entries(CARDS)) {
  const total = card.lines.reduce((a, [, px]) => a + px * 1.3, 0);
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: Cinzel; font-weight: 700; src: url(data:font/woff2;base64,${font}) format('woff2'); }
    html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; }
    .c { position: absolute; left: 0; right: 0; top: ${Math.round(1080 * card.y - total / 2)}px; text-align: center; font: 700 64px Cinzel, serif;
      color: #F2E6CC; letter-spacing: 0.04em; -webkit-text-stroke: 0; text-shadow: 0 0 2px #1a1208, 0 0 2px #1a1208, 2px 2px 0 #1a1208, -2px -2px 0 #1a1208, 2px -2px 0 #1a1208, -2px 2px 0 #1a1208, 0 4px 18px rgba(0,0,0,.65); }
    .c div { line-height: 1.3; }
  </style><div class="c">${card.lines.map(([t, px]) => `<div style="font-size:${px}px">${t}</div>`).join('')}</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, 'cards', `${id}.png`), omitBackground: true });
  console.log(`card ${id}`);
}
await browser.close();
