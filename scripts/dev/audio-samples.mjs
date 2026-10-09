// Renders sample WAVs of the procedural audio offline (OfflineAudioContext in
// headless Chromium, via audio.html / src/dev/audio.ts) into shots/audio/ (git-ignored).
// Usage: node scripts/dev/audio-samples.mjs [outDir]
// Starts its own Vite dev server; uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH).
import { writeFileSync } from 'node:fs';
import { withViteAndBrowser, shotsDir } from '../lib/harness.mjs';

const out = shotsDir('audio', process.argv[2]);
const RATE = 16000;
const samples = [
  ['sfx', 'clash', 0.6],
  ['sfx', 'block', 0.6],
  ['sfx', 'javelin', 0.9],
  ['sfx', 'horn', 1.9],
  ['sfx', 'levelUp', 1.5],
  ['music', 'battle', 20],
];

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const problems = [];
let total = 0;
await withViteAndBrowser(async ({ base, browser }) => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await page.goto(`${base}audio.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 30000 });
  for (const [kind, id, secs] of samples) {
    const b64 = await page.evaluate(([k, i, s, r]) => window.renderSample(k, i, s, r), [kind, id, secs, RATE]);
    const pcm = Buffer.from(b64, 'base64');
    // sanity: not silent, not clipped flat
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    if (peak < 1000) problems.push(`${id}: nearly silent (peak ${peak})`);
    const file = `${out}/${kind === 'music' ? `music-${id}` : id}.wav`;
    const data = wav(pcm, RATE);
    writeFileSync(file, data);
    total += data.length;
    console.log('saved', file, `${(data.length / 1024).toFixed(0)} KB`, `peak ${(peak / 327.67).toFixed(0)}%`);
  }
});
console.log(`total ${(total / 1024).toFixed(0)} KB`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
