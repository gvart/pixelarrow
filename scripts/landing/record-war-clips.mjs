// Records seeded, scripted shots of the war game (sandbox.html scenarios, world.html) frame by frame,
// for the landing page's clips and anything longer (a trailer). The shots themselves live in a shot
// list (default ./war-shots.mjs); this file knows nothing about any one clip.
//
//   npm run clips:war                       (records ./war-shots.mjs at 1280x720 and 1920x1080, then encodes)
//   node scripts/landing/record-war-clips.mjs [--base http://localhost:5173/] [--shots <file.mjs>]
//        [--only caravan,battle] [--sizes 1280x720,1920x1080] [--out <dir>] [--still] [--lead <s>]
//   bash scripts/landing/encode-war-clips.sh [rawDir] [outDir]
//
// How: Playwright's fake clock (page.clock) drives the page's requestAnimationFrame, Date and
// performance.now, so the game advances exactly 1/fps s between two screenshots however slow the machine
// is. The sim runs in a worker the fake clock does not reach, so its own 10 Hz timer is cut off (the
// page's `speed` messages are dropped) and the recorder steps it instead: `timeScale` sim ticks per
// 100 ms of shot time, each waited for. Math.random is seeded; the sim has its own seed. Same shot list,
// same frames: re-record after any art change.
//
// A shot (see ./war-shots.mjs for real ones):
//   id          folder and file stem
//   page        'sandbox' (default) or 'world'
//   query       URL query, e.g. { scenario: 'clip-battle' }
//   seconds     length (any)
//   lead        sim seconds stepped at once before the shot (squads take post, the fight starts)
//   timeScale   sim ticks per 100 ms of shot time (default 1: real speed)
//   hud         'none' (default: the canvas only) or 'prod' (the player HUD, no dev panel or dev buttons)
//   audio       false (default: silent) or true: the game's sound, rendered in step with the frames
//               (an OfflineAudioContext stands in for the page's AudioContext), saved as audio.wav
//   fog         keep the fog of war (default off: the whole scene is lit)
//   setup       page-side JS (a function source run with the scene / world state) after the scenario, before the lead
//   camera      keyframes [{ t, x, y, zoom, ease }] in tiles (sandbox) or map px (world: zoom = map scale k),
//               eased between (ease: 'linear' | 'inOut', default inOut). Instead of x, y a key may `track`:
//               page-side JS returning {x, y} (e.g. the wagon), plus dx, dy; the camera eases onto it.
//               Zoom is for a 720 px tall frame; other sizes scale it, so the framing stays the same.
//   fps         frames a second for this shot (default: the list's FPS); e.g. 60 played back at 30 is a 0.5 slow-mo
//   poster      seconds into the shot of the poster frame
//   loop        seconds of the end cross-faded into the start by the encoder (0: no loop)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { ROOT } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const base = opt('--base', 'http://localhost:5173/').replace(/\/?$/, '/');
const only = opt('--only')?.split(',');
const sizes = opt('--sizes', '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
const still = args.includes('--still'); // only the poster frame of each shot (to look at a scene quickly)
const OUT = resolve(opt('--out', join(ROOT, 'shots', 'war-clips')));
const { SHOTS, FPS: LIST_FPS = 30 } = await import(pathToFileURL(resolve(opt('--shots', join(ROOT, 'scripts/landing/war-shots.mjs')))).href);

// System Chrome with its GPU: SwiftShader is far too slow for big battles and blends differently.
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });

/** Runs in the page before its own scripts: seeded Math.random, the sim worker held, the HUD hidden, the audio stand-in. */
function initPage({ hud, audio, seconds, seed }) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(url, o) {
      super(url, o);
      if (!String(url).includes('bake')) window.__simWorker = this;
    }
    postMessage(m, ...r) {
      if (this === window.__simWorker && m?.t === 'speed') return; // the recorder steps the sim
      return super.postMessage(m, ...r);
    }
  };
  const css = hud === 'prod'
    ? '#dev,.rf-dev-only{display:none!important}'
    : 'body>:not(#game):not(canvas#map){display:none!important}';
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = css + 'canvas{cursor:none!important}';
    document.head.appendChild(s);
    // prod HUD: the dev corner buttons (DEV, Auto, Sound panel toggles) go
    if (hud === 'prod') new MutationObserver(() => {
      for (const b of document.querySelectorAll('button,div')) if (/^(DEV|Auto)$/.test(b.textContent?.trim() ?? '') && b.children.length === 0) b.style.display = 'none';
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  if (audio) {
    // The game's AudioContext becomes an OfflineAudioContext the recorder renders in step with the frames.
    const RATE = 48000, O = window.OfflineAudioContext;
    const ctx = new O(2, Math.ceil((seconds + 2) * RATE), RATE);
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    const native = { resume: O.prototype.resume.bind(ctx), suspend: O.prototype.suspend.bind(ctx) };
    ctx.resume = () => Promise.resolve();
    ctx.suspend = () => Promise.resolve();
    ctx.close = () => Promise.resolve();
    window.__rec = { ctx, native, RATE, done: null };
    window.AudioContext = window.webkitAudioContext = function () { return ctx; };
  }
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);

/**
 * Steps the sim `n` ticks (n >= 1) and waits for its snapshot: a placement check sent after the step comes back
 * after it (the worker answers in order), so no earlier snapshot still on its way is taken for it.
 */
const step = (page, n) => ev(page, (n) => new Promise((ok) => {
  const w = window.__simWorker, id = -1 - (window.__recStep = (window.__recStep ?? 0) + 1);
  const h = (e) => { if (e.data?.reply === id) { w.removeEventListener('message', h); ok(); } };
  w.addEventListener('message', h);
  window.__sandbox.sim.skip(n - 1);
  w.postMessage({ t: 'check', id, team: 0, type: 'camp', x: 0, y: 0 });
}), n);

/** Places the camera for shot time t (page side; keys already scaled to the frame). */
function placeCamera({ keys, t, page: kind, first }) {
  const ease = (k, u) => (k.ease === 'linear' ? u : u * u * (3 - 2 * u));
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0, e = ease(b, u);
  const at = (k) => {
    if (!k.track) return [k.x, k.y];
    const p = new Function('s', `return (${k.track})(s)`)(window.__sandbox ?? window.__world);
    return [p.x + (k.dx ?? 0), p.y + (k.dy ?? 0)];
  };
  const [ax, ay] = at(a), [bx, by] = at(b);
  let x = ax + (bx - ax) * e, y = ay + (by - ay) * e;
  const zoom = a.zoom * Math.pow(b.zoom / a.zoom, e); // even in scale, not in steps
  // a tracked target is followed smoothly (no jitter from the sim's 10 Hz steps)
  if (a.track || b.track) {
    const c = window.__recCam;
    if (c && !first) { x = c.x + (x - c.x) * 0.12; y = c.y + (y - c.y) * 0.12; }
    window.__recCam = { x, y };
  }
  if (kind === 'world') {
    const m = window.__world.map, w = m.canvas.clientWidth, h = m.canvas.clientHeight;
    m.k = zoom;
    m.x = x - w / 2 / zoom;
    m.y = y - h / 2 / zoom;
  } else {
    const s = window.__sandbox, cam = s.cameras.main;
    cam.setZoom(zoom);
    cam.centerOn(s.iso.sx(x, y), s.iso.sy(x, y, s.iso.zAt(x, y)));
  }
}

/** Waits (real time, the page clock running) until the terrain under the camera is baked. */
async function settleView(page) {
  await page.waitForFunction(() => !window.__sandbox || window.__sandbox.viewPending === 0, null, { timeout: 60000, polling: 50 });
}

async function record(shot, [w, h]) {
  const kind = shot.page ?? 'sandbox', seconds = shot.seconds, k = h / 720, FPS = shot.fps ?? LIST_FPS;
  const keys = shot.camera.map((c) => ({ ...c, zoom: c.zoom * k }));
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(initPage, { hud: shot.hud ?? 'none', audio: !!shot.audio, seconds, seed: shot.seed ?? 20261026 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured"}}' }));
  await page.clock.install();
  const q = new URLSearchParams(shot.query ?? {}).toString();
  await page.goto(`${base}${kind === 'world' ? 'world' : 'sandbox'}.html${q ? `?${q}` : ''}`);
  if (kind === 'world') {
    await page.waitForFunction(() => window.__world?.st && window.__world.map, null, { timeout: 60000 });
    await page.waitForTimeout(1500); // the map's art
  } else {
    await page.waitForFunction(() => window.__sandbox?.sim?.cur && window.__simWorker && window.__warAudio, null, { timeout: 120000 });
    await ev(page, (fog) => { const s = window.__sandbox; s.setFog(fog); s.sel?.set([]); }, !!shot.fog);
    // setup before the lead: orders it gives play out over the lead
    if (shot.setup) await ev(page, `(${shot.setup})(window.__sandbox)`);
    const lead = Number(opt('--lead', shot.lead ?? 0)); // --lead: try a scene at another moment
    if (lead) await step(page, Math.round(lead * 10));
  }
  if (shot.setup && kind === 'world') await ev(page, `(${shot.setup})(window.__world)`);
  // bake the terrain along the camera path first (the clock flowing), so no frame shows a chunk missing
  if (kind !== 'world') {
    for (let t = 0; t <= seconds; t += 0.5) {
      await ev(page, placeCamera, { keys, t, page: kind, first: true });
      await page.waitForTimeout(60);
      await settleView(page);
    }
  }
  await ev(page, () => { window.__recCam = null; });
  await page.clock.pauseAt((await ev(page, () => Date.now())) + 1000);
  if (shot.audio) await ev(page, () => window.__warAudio?.engine.unlock());

  const dir = join(OUT, `${w}x${h}`, shot.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = Math.round(seconds * FPS), dt = (i) => Math.round(((i + 1) * 1000) / FPS) - Math.round((i * 1000) / FPS);
  let simAt = 0, gaps = 0;
  // two unsaved frames: the first camera placement settles
  const posterAt = Math.min(n - 1, Math.round((shot.poster ?? seconds / 2) * FPS));
  for (let i = -2; i < (still ? posterAt + 1 : n); i++) {
    const t = Math.max(0, i) / FPS;
    await ev(page, placeCamera, { keys, t, page: kind, first: i === -2 });
    if (kind !== 'world' && i >= 0) {
      // the sim: timeScale ticks per 100 ms of shot time
      while (simAt <= t + 1e-9) { await step(page, shot.timeScale ?? 1); simAt += 0.1; }
    }
    await page.clock.runFor(i < 0 ? Math.round(1000 / FPS) : dt(i));
    // the sound renders up to the frame's end (suspend's promise settles when rendering gets there)
    if (shot.audio && i >= 0) await ev(page, async (t) => {
      const r = window.__rec, at = r.native.suspend((Math.ceil((t * r.RATE) / 128) * 128) / r.RATE);
      if (!r.done) r.done = r.ctx.startRendering();
      else r.native.resume();
      await at;
    }, (i + 1) / FPS);
    if (kind !== 'world' && i >= 0 && (await ev(page, () => window.__sandbox.viewPending)) > 0) gaps++;
    if (i >= 0 && (!still || i === posterAt)) await page.screenshot({ path: join(dir, still ? 'poster.png' : `f${String(i).padStart(4, '0')}.png`) });
  }
  if (shot.audio) {
    const wav = await ev(page, async () => {
      const r = window.__rec;
      await r.native.resume().catch(() => {});
      const buf = await r.done, ch = [buf.getChannelData(0), buf.getChannelData(1)], len = buf.length;
      const out = new DataView(new ArrayBuffer(44 + len * 4));
      const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); out.setUint32(4, 36 + len * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true);
      out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, r.RATE, true); out.setUint32(28, r.RATE * 4, true);
      out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, len * 4, true);
      for (let i = 0; i < len; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + (i * 2 + c) * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
      let s = '';
      const b = new Uint8Array(out.buffer);
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    });
    writeFileSync(join(dir, 'audio.wav'), Buffer.from(wav, 'base64'));
  }
  writeFileSync(join(dir, 'clip.env'), `W=${w}\nH=${h}\nFPS=${FPS}\nXF=${shot.loop ?? 0}\nPOSTER=${shot.poster ?? seconds / 2}\nAUDIO=${shot.audio ? 1 : 0}\n`);
  console.log(`${shot.id} ${w}x${h}: ${n} frames${gaps ? `, ${gaps} with terrain still baking` : ''}${errors.length ? `; page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await ctx.close();
}

for (const shot of SHOTS) {
  if (only && !only.includes(shot.id)) continue;
  for (const size of shot.sizes ?? sizes) await record(shot, size);
}
await browser.close();
