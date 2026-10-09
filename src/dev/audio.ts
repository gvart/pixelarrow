/**
 * Sound preview (audio.html): play every effect and track live, and
 * `window.renderSample(kind, id, seconds, rate)` for offline renders
 * (scripts/dev/audio-samples.mjs writes shots/audio/*.wav with it).
 */
import { AudioEngine } from '../audio/engine';
import { MusicPlayer, TRACKS, type StingerId, type TrackId } from '../audio/music';
import { RECIPES, type SfxId } from '../audio/sfx';
import { AudioRng } from '../audio/rng';

const engine = new AudioEngine();
engine.configure(() => ({ sound: true, musicVol: 7, sfxVol: 8 }));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  parent.appendChild(e);
  return e;
}

const root = document.body;
el('h1', 'Pixelarrow sounds', root);
el('p', 'Everything is synthesised with Web Audio at run time (src/audio). Tap a button.', root);
el('h2', 'Effects', root);
const fx = el('div', '', root);
for (const id of Object.keys(RECIPES) as SfxId[]) {
  const b = el('button', id, fx);
  b.onclick = () => {
    engine.unlock();
    engine.play(id, { vol: 1 });
  };
}
el('h2', 'Music', root);
const mu = el('div', '', root);
for (const id of [...(Object.keys(TRACKS) as TrackId[]), null]) {
  const b = el('button', id ?? 'stop', mu);
  b.onclick = () => {
    engine.unlock();
    engine.music(id);
  };
}
for (const id of ['victory', 'defeat'] as StingerId[]) {
  const b = el('button', id, mu);
  b.onclick = () => {
    engine.unlock();
    engine.stinger(id);
  };
}
const heat = el('label', ' battle intensity ', mu);
const range = document.createElement('input');
range.type = 'range';
range.min = '0';
range.max = '100';
range.value = '0';
range.oninput = () => engine.heat(Number(range.value) / 100);
heat.appendChild(range);

/** Offline render -> 16-bit PCM mono, base64. */
async function renderSample(kind: 'sfx' | 'music', id: string, seconds: number, rate = 16000): Promise<string> {
  const c = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  comp.connect(c.destination);
  const bus = c.createGain();
  bus.connect(comp);
  if (kind === 'sfx') {
    bus.gain.value = 0.9;
    RECIPES[id as SfxId](c, bus, 0.02, new AudioRng(7));
  } else {
    bus.gain.value = 1;
    const p = new MusicPlayer(c, bus);
    p.set(id as TrackId, 0.5);
    // intensity rises over the excerpt, as when the lines meet
    for (let t = 0.25; t <= seconds; t += 0.25) {
      p.setHeat(Math.min(1, t / (seconds * 0.8)), true);
      p.pump(t);
    }
  }
  const buf = await c.startRendering();
  const d = buf.getChannelData(0);
  const n = d.length;
  // fade the last 50 ms (music excerpt cut)
  for (let i = Math.max(0, n - rate / 20); i < n; i++) d[i] *= (n - i) / (rate / 20);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767)));
  const bytes = new Uint8Array(pcm.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Object.assign(window, { renderSample, __audio: engine });
document.body.dataset.ready = '1';
