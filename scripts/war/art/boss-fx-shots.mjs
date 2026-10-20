// Guardian FX captures (ART-L, PROMPTS_ART.md 40d): each landmark guardian in its region with a raid on it, its signature
// move, its phase change and its death, as GIFs (frames 100 ms apart, ffmpeg palette) and a still per clip.
//   <boss>-signature.gif   the move it is known by (Drakon's breath from the roof, Brontes' rock, Scylla's snatch...)
//   <boss>-phase.gif       the phase change (hurt down past its next phase share)
//   <boss>-death.gif       the death sequence (collapse, loot pile, light beam)
// Usage: node scripts/war/art/boss-fx-shots.mjs [baseUrl] [outDir] [boss,boss...]
//   (default outDir: shots/war/boss-fx). Requires a running dev server (npm run dev); ffmpeg on PATH for the GIFs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launch, captureErrors, shotsDir, prepContext } from '../../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/boss-fx', process.argv[3]);
const only = process.argv[4]?.split(',');

/**
 * Per guardian: its region, where the raid stands (tile offsets from the boss home), the camera zoom, the hp shares the
 * phase clip hurts it down to (before, at the change) and how long each clip runs (frames).
 */
const BOSSES = [
  { id: 'drakon', region: 'krios', raid: [[0, 8], [-4, 9], [4, 9], [0, 12]], cls: ['hoplite', 'hoplite', 'archer', 'archer'], zoom: 0.42, sig: 0.58, phase: [0.57, 0.555], death: 0.25, cam: [-4, -9] },
  { id: 'brontes', region: 'saddle', raid: [[0, 10], [-4, 12], [4, 12]], cls: ['hoplite', 'archer', 'hoplite'], zoom: 0.5, sig: 1, phase: [0.88, 0.83], cam: [-1, -1] },
  { id: 'gyges', region: 'gorge', raid: [[0, 4], [-3, 5], [3, 5]], cls: ['hoplite', 'celt_sword', 'archer'], zoom: 0.7, sig: 1, phase: [0.52, 0.48], cam: [0, 2] },
  { id: 'scylla', region: 'siren', raid: [[8, 0], [9, 4], [9, -4]], cls: ['hoplite', 'hoplite', 'archer'], zoom: 0.6, sig: 1, cam: [5, 0], parts: true },
  { id: 'chimera', region: 'canyons', raid: [[0, 4], [-3, 5], [3, 5]], cls: ['hoplite', 'celt_sword', 'archer'], zoom: 0.8, sig: 1, cam: [0, 2] },
  { id: 'bandit_king', region: 'ammon', raid: [[0, 6], [-3, 7], [3, 7]], cls: ['hoplite', 'celt_sword', 'hoplite'], zoom: 0.8, sig: 1, phase: [0.62, 0.58], cam: [0, 2] },
  { id: 'grove_queen', region: 'erymanthos', raid: [[0, 5], [-3, 6], [3, 6]], cls: ['hoplite', 'celt_sword', 'archer'], zoom: 0.8, sig: 1, phase: [0.42, 0.38], cam: [0, 2] },
];

const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await prepContext(context); // no HMR: a source edit cannot reload the page mid-capture
const page = await context.newPage();
captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);

/** n frames ~100 ms apart into a GIF (and the middle frame as a still). */
async function gif(name, n, step = 100) {
  const dir = join(out, `.${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    await page.screenshot({ path: join(dir, `f${String(i).padStart(3, '0')}.png`), clip: { x: 160, y: 60, width: 960, height: 680 } });
    const dt = Date.now() - t0;
    if (dt < step) await wait(step - dt);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', join(dir, 'f%03d.png'), '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', join(out, `${name}.gif`)]);
  // a contact sheet of every 4th frame to look at
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'f%03d.png'), '-vf', `select=not(mod(n\\,4)),scale=480:-1,tile=4x${Math.ceil(n / 16)}`, '-frames:v', '1', join(out, `${name}-sheet.png`)]);
  console.log('saved', join(out, `${name}.gif`));
}

for (const b of BOSSES) {
  if (only && !only.includes(b.id)) continue;
  await page.goto(`${base}sandbox.html?region=${b.region}&sim=real`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'), null, { timeout: 90000 });
  await page.evaluate(() => {
    const s = window.__sandbox;
    s.setFog(false);
    s.sim.spawnMobs();
    window.__cues = [];
    s.guardians.fx.onCue = (name, x, y, boss) => window.__cues.push(`${boss}:${name}`);
  });
  await page.waitForFunction((id) => window.__sandbox.sim.cur?.bosses?.some((g) => g.id === id), b.id, { timeout: 30000 });
  const home = await page.evaluate((id) => {
    const g = window.__sandbox.sim.cur.bosses.find((q) => q.id === id);
    return { x: g.x, y: g.y };
  }, b.id);
  await page.evaluate(({ b, home }) => {
    const s = window.__sandbox;
    b.raid.forEach(([dx, dy], i) => s.sim.spawn('you', 0, b.cls[i], 12, home.x + dx, home.y + dy));
    s.focus(home.x + b.cam[0], home.y + b.cam[1], b.zoom);
    // the boss camera follows him (his whole silhouette framed, as a click on him does)
    s.guardians.focus = s.sim.cur.bosses.find((q) => q.id === b.id).unit;
  }, { b, home });
  await wait(1200);
  // the raid on him
  await page.evaluate((home) => {
    const s = window.__sandbox;
    for (const q of s.sim.cur.squads ?? []) if (q.team === 0) s.sim.order({ kind: 'attackMove', squad: q.id, x: home.x, y: home.y });
  }, home);
  if (b.sig < 1) await page.evaluate(({ id, to }) => window.__sandbox.sim.hurtBossTo(id, to), { id: b.id, to: b.sig });
  await wait(2500);
  await gif(`${b.id}-signature`, 40);
  if (b.phase) {
    await page.evaluate(({ id, to }) => window.__sandbox.sim.hurtBossTo(id, to), { id: b.id, to: b.phase[0] });
    await wait(800);
    await page.evaluate(({ id, to }) => window.__sandbox.sim.hurtBossTo(id, to), { id: b.id, to: b.phase[1] });
    await gif(`${b.id}-phase`, 40);
  }
  if (b.death) {
    await page.evaluate(({ id, to }) => window.__sandbox.sim.hurtBossTo(id, to), { id: b.id, to: b.death });
    await wait(3000);
  }
  // down: every part (Scylla's heads, the Chimera's heads), then (once the sim has opened the body: Scylla's cave stays
  // shut, immune, until a tick after her heads fall) the body
  await page.evaluate((id) => {
    const s = window.__sandbox;
    for (let i = 0; i < 6; i++) s.sim.hurtBossTo(id, 0, i);
  }, b.id);
  if (b.parts) await wait(600);
  await page.evaluate((id) => {
    const s = window.__sandbox;
    for (let i = 0; i < 6; i++) s.sim.hurtBossTo(id, 0);
  }, b.id);
  await gif(`${b.id}-death`, 45);
  console.log(b.id, 'cues:', [...new Set(await page.evaluate(() => window.__cues))].join(' '));
}
await browser.close();
