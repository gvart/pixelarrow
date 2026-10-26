// Cuts the war trailer (docs/playbook/trailer.md) from the recorded takes, the rendered music and the title cards:
//   shots/trailer/raw/1920x1080/<shot>/f0000.png... + audio.wav  (./record-war-clips.mjs --shots ./trailer-shots.mjs)
//   shots/trailer/music/<cue>.wav, shots/trailer/cards/<card>.png (./trailer-music.mjs)
// -> shots/trailer/pixelarrow-trailer.mp4: H.264 High yuv420p 1920x1080 30 fps, AAC 320k 48 kHz, -14 LUFS / -1 dBTP.
//
//   node scripts/landing/trailer.mjs [--dir shots/trailer] [--out <file.mp4>]
//
// The cut is the script's 22 shots (the edit decision list EDL below: shot, slot length, where in the take, the way in);
// the flashes are fades from or to white, the dissolves fades through black; the game's own effects and ambience come
// with each take (the recorder renders them with the frames), the music is laid on the cue sheet (CUES) in hard cuts on
// the bar lines. Needs ffmpeg (no drawtext needed: the cards are PNGs).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = resolve(opt('--dir', join(ROOT, 'shots', 'trailer')));
const RAW = join(DIR, 'raw', '1920x1080');
const OUT = resolve(opt('--out', join(DIR, 'pixelarrow-trailer.mp4')));
const FPS = 30, F = 1 / FPS;

/**
 * The cut: take id, slot seconds, `from` seconds into the take, `in`: 'black' (fade from black, s), 'white' (a flash,
 * frames), 'dip' (through black, frames, the previous shot fading out too). `grade`: a filter for the shot alone. `sfx`:
 * the take's sound in dB (default 0). A 60 fps take (14-gate) plays at 30: half speed.
 */
const EDL = [
  // I · Peace
  { id: '01-bay', dur: 4.0, in: ['black', 1.0], grade: 'colorbalance=rs=.06:gs=.02:bs=-.06:rm=.03:bm=-.03' },
  { id: '02-agora', dur: 3.0 },
  { id: '03-chop', dur: 2.0, from: 0.2 },
  { id: '04-marble', dur: 2.0, from: 0.2 },
  { id: '05-hunt', dur: 3.0, from: 0.2 },
  { id: '06-wagon', dur: 2.0, from: 0.2 },
  { id: '07-build', dur: 3.0, from: 0.2 },
  { id: '08-ridge', dur: 1.0, from: 0.2 },
  // II · Ambush
  { id: '09-column', dur: 3.0, from: 0.2 },
  { id: '10-flee', dur: 2.0, from: 0.2 },
  { id: '11-fire', dur: 2.0, from: 0.3, in: ['white', 2] },
  { id: '12-ram', dur: 2.0, from: 0, in: ['white', 1] },
  { id: '12-ram', dur: 1.0, from: 2.0, in: ['white', 1] }, // the push in to zoom 2: the third blow
  { id: '13-ladders', dur: 2.0, from: 0.2 },
  { id: '14-gate', dur: 3.0, from: 0.2, sfx: -12, slow: true },
  // III · Escalation
  { id: '15-pass', dur: 2.0, from: 0.2, in: ['white', 2] },
  { id: '16-ford', dur: 2.0, from: 0.2 },
  { id: '17-drakon', dur: 2.3, from: 0.2, in: ['white', 2] },
  { id: '18-gyges', dur: 2.3, from: 0.2 },
  { id: '19-chimera', dur: 2.3, from: 0.2 },
  { id: '20-scylla', dur: 2.3, from: 0.2 },
  { id: '21a-deadcity', dur: 1.8, from: 0.2, in: ['dip', 6] },
  { id: '21b-deadcity', dur: 2.0, from: 0.2 },
  { id: '22a-temple', dur: 1.5, from: 0.2 },
  { id: '22b-temple', dur: 1.5, from: 0.4, out: ['white', 4] },
];
/** The end card: the Temple City held, darkened, the title fading in; then to black. */
const END = { id: 'ec-temple', dur: 5.0, cardAt: 0.3, cardFade: 0.5, outAt: 4.3 };
/** Title cards over the cut: [card, from, to] in trailer seconds, 0.3 s fades. */
const CARDS = [['card1', 1.0, 3.5], ['card2', 16.5, 19.0], ['card3', 32.5, 35.0]];
/** The cue sheet: [cue, at, length, dB, extra filter]. Hard cuts on bar lines; the turn at 19 s is one frame-drum dum. */
const CUES = [
  ['explore', 0, 19.0, 0],
  ['dum', 19.0, 1.0, 2],
  ['deploy', 20.0, 5.0, 0],
  ['battle', 25.0, 14.0, -1],
  ['boss', 39.0, 9.2, 0],
  ['drone', 48.2, 1.8, 2, 'lowpass=f=260'],
  ['battle2', 50.0, 5.0, -1],
  ['victory', 55.0, 5.0, 1],
  ['tail', 56.6, 3.4, -6, 'afade=t=in:d=0.6'],
];

const ff = (a, what) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg (${what}) failed:\n${r.stderr}`);
  return r.stderr;
};
for (const s of [...EDL, END]) if (!existsSync(join(RAW, s.id, 'f0000.png'))) throw new Error(`missing take ${s.id}: record it first (./trailer-shots.mjs)`);
const fpsOf = (id) => Number(/FPS=(\d+)/.exec(spawnSync('cat', [join(RAW, id, 'clip.env')], { encoding: 'utf8' }).stdout)?.[1] ?? FPS);
const TMP = join(DIR, 'tmp');
mkdirSync(TMP, { recursive: true });

// --- picture -----------------------------------------------------------------------------------------------------------
const inputs = [], chains = [], labels = [];
let t = 0;
const starts = [];
EDL.forEach((s, i) => {
  // a 60 fps take read at 30 is the slow-mo; its `from` is in played seconds
  inputs.push('-framerate', String(FPS), '-i', join(RAW, s.id, 'f%04d.png'));
  const from = s.from ?? 0, f = [`trim=start=${from}:duration=${s.dur}`, 'setpts=PTS-STARTPTS', 'format=yuv420p'];
  if (s.grade) f.push(s.grade);
  const [kind, n] = s.in ?? [];
  if (kind === 'black') f.push(`fade=t=in:st=0:d=${n}`);
  if (kind === 'white') f.push(`fade=t=in:st=0:d=${(n * F).toFixed(4)}:color=white`);
  if (kind === 'dip') f.push(`fade=t=in:st=0:d=${((n / 2) * F).toFixed(4)}`);
  if (EDL[i + 1]?.in?.[0] === 'dip') f.push(`fade=t=out:st=${(s.dur - (EDL[i + 1].in[1] / 2) * F).toFixed(4)}:d=${((EDL[i + 1].in[1] / 2) * F).toFixed(4)}`);
  if (s.out?.[0] === 'white') f.push(`fade=t=out:st=${(s.dur - s.out[1] * F).toFixed(4)}:d=${(s.out[1] * F).toFixed(4)}:color=white`);
  chains.push(`[${i}:v]${f.join(',')}[v${i}]`);
  labels.push(`[v${i}]`);
  starts.push(t);
  t += s.dur;
});
const CUT = t; // the cut's length before the end card
// the end card: the last frame of its take held, at 40% light, out of the white flash, the title fading in, then black
const nEnd = readdirSync(join(RAW, END.id)).filter((f) => f.endsWith('.png') && f.startsWith('f')).length;
const iEnd = EDL.length;
inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(END.dur), '-i', join(RAW, END.id, `f${String(nEnd - 1).padStart(4, '0')}.png`));
const iCard = iEnd + 1;
inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(END.dur), '-i', join(DIR, 'cards', 'end.png'));
chains.push(`[${iEnd}:v]format=yuv420p,colorchannelmixer=rr=.4:gg=.4:bb=.4,fade=t=in:st=0:d=${(8 * F).toFixed(4)}:color=white[ebg]`);
chains.push(`[${iCard}:v]format=rgba,fade=t=in:st=${END.cardAt}:d=${END.cardFade}:alpha=1[ecard]`);
chains.push(`[ebg][ecard]overlay=format=auto,fade=t=out:st=${END.outAt}:d=${(END.dur - END.outAt).toFixed(2)},format=yuv420p[vend]`);
chains.push(`${labels.join('')}[vend]concat=n=${EDL.length + 1}:v=1:a=0[cut]`);
// the title cards
let last = 'cut';
CARDS.forEach(([card, a, b], k) => {
  const ii = iCard + 1 + k;
  inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(b - a), '-i', join(DIR, 'cards', `${card}.png`));
  chains.push(`[${ii}:v]format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${(b - a - 0.3).toFixed(2)}:d=0.3:alpha=1,setpts=PTS-STARTPTS+${a}/TB[c${k}]`);
  chains.push(`[${last}][c${k}]overlay=eof_action=pass:format=auto[o${k}]`);
  last = `o${k}`;
});
chains.push(`[${last}]format=yuv420p[vout]`);
const TOTAL = CUT + END.dur;
console.log(`cut ${CUT.toFixed(2)} s + end card ${END.dur} s = ${TOTAL.toFixed(2)} s`);

// --- sound -------------------------------------------------------------------------------------------------------------
// the takes' sound in their slots (the slow-mo's an octave down, half speed, as the picture), the music on the cue sheet
const ain = [], ach = [], sfxL = [], musL = [];
EDL.forEach((s, i) => {
  const wav = join(RAW, s.id, 'audio.wav');
  if (!existsSync(wav)) return;
  const k = ain.length / 2;
  ain.push('-i', wav);
  const slow = fpsOf(s.id) !== FPS;
  const from = (s.from ?? 0) * (slow ? FPS / fpsOf(s.id) : 1);
  const f = [`atrim=start=${from}:duration=${slow ? s.dur * FPS / fpsOf(s.id) : s.dur}`, 'asetpts=PTS-STARTPTS'];
  if (slow) f.push(`asetrate=${48000 * FPS / fpsOf(s.id)}`, 'aresample=48000');
  f.push(`volume=${s.sfx ?? 0}dB`, 'afade=t=in:d=0.02', `afade=t=out:st=${(s.dur - 0.03).toFixed(3)}:d=0.03`, `adelay=${Math.round(starts[i] * 1000)}:all=1`);
  ach.push(`[A${k}]${f.join(',')}[s${i}]`);
  sfxL.push(`[s${i}]`);
});
const nShotAudio = ain.length / 2;
CUES.forEach(([cue, at, len, db, extra], j) => {
  const k = ain.length / 2;
  ain.push('-i', join(DIR, 'music', `${cue}.wav`));
  const f = [`atrim=duration=${len}`, 'asetpts=PTS-STARTPTS', 'aformat=sample_rates=48000:channel_layouts=stereo', `volume=${db}dB`];
  if (extra) f.push(extra);
  f.push(`afade=t=out:st=${(len - 0.025).toFixed(3)}:d=0.025`, `adelay=${Math.round(at * 1000)}:all=1`);
  ach.push(`[A${k}]${f.join(',')}[m${j}]`);
  musL.push(`[m${j}]`);
});
// remap the audio input labels to their file indices (after the picture's inputs, in a separate run)
const remap = (s) => s.replace(/\[A(\d+)\]/g, (_, n) => `[${n}:a]`);
const mixGraph = [
  ...ach.map(remap),
  `${sfxL.join('')}amix=inputs=${sfxL.length}:normalize=0,aformat=sample_rates=48000:channel_layouts=stereo,volume=-2dB,asplit[sfx][key]`,
  `${musL.join('')}amix=inputs=${musL.length}:normalize=0,volume=1dB[mus0]`,
  // the music ducks a little under the field's loud moments
  '[mus0][key]sidechaincompress=threshold=0.12:ratio=2.5:attack=20:release=300[mus]',
  `[sfx][mus]amix=inputs=2:normalize=0,apad=whole_dur=${TOTAL},atrim=duration=${TOTAL},afade=t=in:d=0.4,afade=t=out:st=${(TOTAL - 0.7).toFixed(2)}:d=0.7[mix]`,
].join(';');
const MIX = join(TMP, 'mix.wav');
ff([...ain, '-filter_complex', mixGraph, '-map', '[mix]', '-c:a', 'pcm_f32le', '-ar', '48000', MIX], 'mix');
console.log(`sound: ${nShotAudio} takes, ${CUES.length} music cues`);
// loudness: two-pass loudnorm to -14 LUFS integrated, -1 dBTP (YouTube's reference)
const meas = ff(['-v', 'info', '-i', MIX, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], 'loudness scan');
const m = JSON.parse(meas.slice(meas.lastIndexOf('{'), meas.lastIndexOf('}') + 1));
const NORM = join(TMP, 'mix-14.wav');
ff(['-i', MIX, '-af', `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_f32le', NORM], 'loudness');
console.log(`loudness: ${m.input_i} LUFS in -> -14 (linear: ${m.normalization_type})`);

// --- master ------------------------------------------------------------------------------------------------------------
const nIn = inputs.filter((a) => a === '-i').length;
ff([...inputs, '-i', NORM, '-filter_complex', chains.join(';'), '-map', '[vout]', '-map', `${nIn}:a`,
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', String(TOTAL), '-movflags', '+faststart', OUT], 'master');
console.log(`-> ${OUT}`);
