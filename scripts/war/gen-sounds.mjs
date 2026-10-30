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
 *   node scripts/war/gen-sounds.mjs --report            per file: seconds, raw and final loudness (for rerolls)
 *
 * The key comes from ~/.config/pixelarrow/elevenlabs.env (ELEVENLABS_API_KEY=...) at run time and is never printed.
 * Prints the credits used (the subscription's character count before and after).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  const tmp = join(RAW, `_${row.id}-${k}.wav`);
  // 1. one-shots: trim leading/trailing silence, mono, short fades; loops: stereo, untouched ends (they are seamless)
  const trim = one
    ? 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.005,areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,afade=t=in:d=0.03,areverse,afade=t=in:d=0.005'
    : 'anull';
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', trim, '-ar', '48000', '-ac', one ? '1' : '2', tmp]);
  // 2. one linear gain to the row's loudness (loudnorm's dynamic mode wrecks short clips), a limiter at -1 dB
  const m = measure(tmp);
  const gain = Math.max(-30, Math.min(30, row.lufs - m.level));
  const af = `volume=${gain.toFixed(2)}dB,alimiter=limit=0.8:attack=1:release=40:level=disabled`;
  const run = (extra, file) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', af, ...extra, file]);
  run(['-c:a', 'libopus', '-b:a', one ? '48k' : '64k', '-vbr', 'on'], `${base}.ogg`);
  run(['-c:a', 'aac', '-b:a', one ? '64k' : '80k', '-movflags', '+faststart'], `${base}.m4a`);
  rmSync(tmp);
}

/** Seconds and integrated loudness of a file. */
function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const e = r.stderr;
  const i = [...e.matchAll(/^\s+I:\s+(-?[\d.]+|-inf) LUFS/gm)].pop()?.[1];
  const pk = [...e.matchAll(/^\s+Peak:\s+(-?[\d.]+|-inf) dBFS/gm)].pop()?.[1];
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(e);
  const lufs = i === undefined || i === '-inf' ? -Infinity : Number(i);
  // under one 400 ms block (or gated to nothing) the integrated value is meaningless: the RMS level stands in
  let level = lufs;
  if (!(lufs > -60)) {
    const a = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'astats=measure_overall=RMS_level:measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
    const rms = /RMS level dB:\s+(-?[\d.]+)/.exec(a.stderr)?.[1];
    level = rms ? Number(rms) : -60;
  }
  return { s: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0, lufs: i, peak: pk, level };
}

function report(all) {
  for (const r of all) for (let k = 1; k <= r.n; k++) {
    const raw = join(RAW, `${r.id}-${k}.mp3`), ogg = join(OUT, `${r.id}-${k}.ogg`);
    if (!existsSync(raw) || !existsSync(ogg)) continue;
    const a = measure(raw), b = measure(ogg);
    console.log(`${`${r.id}-${k}`.padEnd(26)} raw ${a.s.toFixed(2)}s ${a.lufs} LUFS  out ${b.s.toFixed(2)}s ${b.lufs} LUFS (level ${b.level.toFixed(1)}) peak ${b.peak}  (want ${r.dur}s ${r.lufs})`);
  }
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
  if (flag('--report')) return report(all);
  if (!flag('--encode') && todo.length) {
    const k = key();
    const before = await used(k);
    let i = 0;
    // a few at a time: the API's concurrency limit is small on the lower tiers
    const queue = [...todo];
    const failed = [];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          await generate(k, t.r, t.raw);
          console.log(`  ${++i}/${todo.length} ${t.r.id}-${t.k}`);
        } catch (e) {
          failed.push(`${t.r.id}-${t.k}`);
          console.error(`  failed ${t.r.id}-${t.k}: ${String(e.message ?? e)}`);
          // out of credits or a bad key: stop, the rest stay to do (a rerun picks them up)
          if (/HTTP (401|402|403)|quota|credits/i.test(String(e.message))) failed.push(...queue.splice(0).map((q) => `${q.r.id}-${q.k}`));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (failed.length) console.log(`not generated (${failed.length}): ${failed.join(' ')}`);
    const after = await used(k);
    if (before && after) console.log(`credits used: ${after.used - before.used} so far (the count lags a minute; now ${after.used} of ${after.limit})`);
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
