#!/usr/bin/env node
/**
 * Generate the war's sound bank with ElevenLabs sound effects (docs/playbook/SOUND.md, the rows are the source):
 * fetch each variant once (raw mp3 kept outside the repo, so a rerun costs nothing), then trim, fade, normalise to the
 * row's LUFS and encode Opus (.ogg) and AAC (.m4a) into public/war/sfx/<id>-<k>.<ext>.
 *
 *   node scripts/war/gen-sounds.mjs                     every row variant without a raw file yet, then encode all
 *   node scripts/war/gen-sounds.mjs --only a,b --force  regenerate these ids (rerolls)
 *   node scripts/war/gen-sounds.mjs --encode            encode only (no API calls)
 *   node scripts/war/gen-sounds.mjs --dry               list what would be generated
 *
 * The key comes from ~/.config/pixelarrow/elevenlabs.env (ELEVENLABS_API_KEY=...) at run time and is never printed.
 * Prints the credits used (the subscription's character count before and after).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(homedir(), '.cache', 'pixelarrow', 'sfx-raw');
const OUT = join(ROOT, 'public', 'war', 'sfx');
const STYLE = 'dark epic ancient Greek bronze age, gritty, close and dry, realistic foley, no music, no voice, no speech';
const LOOP_STYLE = 'seamless ambience loop, no music, no voice';
const API = 'https://api.elevenlabs.io';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const only = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? new Set(args[i + 1].split(',')) : null;
})();

function rows() {
  const md = readFileSync(join(ROOT, 'docs', 'playbook', 'SOUND.md'), 'utf8');
  const out = [];
  for (const m of md.matchAll(/^\| ([a-z]+\.[a-zA-Z.]+) \| (\d+) \| ([\d.]+) \| (-\d+) \| (.+) \|$/gm)) {
    out.push({ id: m[1], n: Number(m[2]), dur: Number(m[3]), lufs: Number(m[4]), prompt: m[5].trim(), loop: m[1].startsWith('amb.') });
  }
  return out;
}

function key() {
  const f = join(homedir(), '.config', 'pixelarrow', 'elevenlabs.env');
  const m = /^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\s]+)"?/m.exec(readFileSync(f, 'utf8'));
  if (!m) throw new Error(`no ELEVENLABS_API_KEY in ${f}`);
  return m[1];
}

async function used(k) {
  const r = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': k } });
  if (!r.ok) return null;
  const j = await r.json();
  return { used: j.character_count, limit: j.character_limit };
}

async function generate(k, row, out) {
  const body = {
    text: `${row.prompt}. ${row.loop ? LOOP_STYLE : STYLE}`,
    duration_seconds: Math.max(0.5, Math.min(30, row.dur)),
    prompt_influence: 0.5,
    loop: row.loop,
    model_id: 'eleven_text_to_sound_v2',
  };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}/v1/sound-generation?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': k, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      return;
    }
    const t = (await r.text()).slice(0, 300);
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      await new Promise((ok) => setTimeout(ok, 4000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${row.id}: HTTP ${r.status} ${t}`);
  }
}

function encode(row, raw, k) {
  const base = join(OUT, `${row.id}-${k}`);
  const one = !row.loop;
  // one-shots: trim leading/trailing silence, mono, short fades; loops: stereo, untouched ends (they are seamless)
  const pre = one
    ? `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,afade=t=in:d=0.005,areverse,afade=t=in:d=0.03,areverse,`
    : '';
  const af = `${pre}loudnorm=I=${row.lufs}:TP=-1:LRA=11`;
  const ch = one ? ['-ac', '1'] : ['-ac', '2'];
  const run = (extra, file) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', af, '-ar', '48000', ...ch, ...extra, file]);
  run(['-c:a', 'libopus', '-b:a', one ? '48k' : '64k', '-vbr', 'on'], `${base}.ogg`);
  run(['-c:a', 'aac', '-b:a', one ? '64k' : '80k', '-movflags', '+faststart'], `${base}.m4a`);
}

async function main() {
  const all = rows().filter((r) => !only || only.has(r.id));
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const todo = [];
  for (const r of all) for (let k = 1; k <= r.n; k++) {
    const raw = join(RAW, `${r.id}-${k}.mp3`);
    if (flag('--force') || !existsSync(raw)) todo.push({ r, k, raw });
  }
  console.log(`${all.length} ids, ${todo.length} clips to generate`);
  if (flag('--dry')) return;
  if (!flag('--encode') && todo.length) {
    const k = key();
    const before = await used(k);
    let i = 0;
    // a few at a time: the API's concurrency limit is small on the lower tiers
    const queue = [...todo];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        await generate(k, t.r, t.raw);
        console.log(`  ${++i}/${todo.length} ${t.r.id}-${t.k}`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const after = await used(k);
    if (before && after) console.log(`credits used: ${after.used - before.used} (now ${after.used} of ${after.limit})`);
  }
  let bytes = { ogg: 0, m4a: 0 };
  for (const r of all) for (let k = 1; k <= r.n; k++) {
    const raw = join(RAW, `${r.id}-${k}.mp3`);
    if (!existsSync(raw)) continue;
    encode(r, raw, k);
    for (const ext of ['ogg', 'm4a']) bytes[ext] += statSync(join(OUT, `${r.id}-${k}.${ext}`)).size;
  }
  console.log(`encoded: ogg ${(bytes.ogg / 1e6).toFixed(2)} MB, m4a ${(bytes.m4a / 1e6).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
