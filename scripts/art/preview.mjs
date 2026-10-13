// Check a staged asset in the REAL game before it is saved (ASSET_PIPELINE.md step 6).
// Runs scripts/layout-check.mjs (its real fixtures and layout rules) on the asset's screens at
// 390x844, 360x780 and 320x640, DPR 3, with the game's request for the asset's file answered by
// the staged file (lib/override-hook.mjs): nothing under public/ changes. Then it writes a contact
// sheet of the three sizes and a record that scripts/art/promote.mjs requires.
// Usage: node scripts/art/preview.mjs <asset id> [baseUrl=http://localhost:5173/]   (needs `npm run dev` running)
// Exit: 0 shots taken and no new layout violation; 1 layout violations or errors; 3 NOT ASSESSED
// (the asset has no slot wired in the game yet, or no staged file).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readImage, writeImage } from './lib/png.mjs';
import { blank, paste, resizeArea } from './lib/ops.mjs';
import { findAsset, stagedPath, STAGING, ROOT } from './lib/manifest.mjs';

const [id, base = 'http://localhost:5173/'] = process.argv.slice(2);
if (!id) {
  console.error('usage: node scripts/art/preview.mjs <asset id> [baseUrl]');
  process.exit(2);
}
const a = findAsset(id);
const staged = stagedPath(a);
if (!existsSync(staged)) {
  console.log(`NOT ASSESSED ${a.id}: no staged file (run scripts/art/process.mjs first)`);
  process.exit(3);
}
if (!a.preview?.url || !a.preview?.screens?.length) {
  console.log(`NOT ASSESSED ${a.id}: no game slot loads this file yet (manifest "preview" is empty). Wire the slot in code, then preview. The asset may not be promoted until then.`);
  process.exit(3);
}

const SIZES = ['390x844', '360x780', '320x640'];
const out = join(STAGING, 'preview', a.id);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// atlas frames are previewed through their rebuilt atlas (scripts/art/atlas.mjs)
const overrides = a.atlas
  ? // the game loads icons/ui.{webp,json} for the icons_ui atlas, icons/ui.png when the WebP fails
    // (iconBitmaps ICON_ATLASES): the staged PNG answers both image URLs
    {
      [`icons/${a.atlas.replace(/^icons_/, '')}.webp`]: join(STAGING, 'atlas', `${a.atlas}.png`),
      [`icons/${a.atlas.replace(/^icons_/, '')}.png`]: join(STAGING, 'atlas', `${a.atlas}.png`),
      [`icons/${a.atlas.replace(/^icons_/, '')}.json`]: join(STAGING, 'atlas', `${a.atlas}.json`),
    }
  : { [a.preview.url]: staged };
for (const f of Object.values(overrides)) if (!existsSync(f)) {
  console.log(`NOT ASSESSED ${a.id}: ${f.replace(ROOT + '/', '')} is missing (run scripts/art/atlas.mjs ${a.atlas})`);
  process.exit(3);
}

// Two runs: the layout verdict at DPR 1 (the layout check's rules are calibrated there: at DPR 3
// it reports tab bar and caption violations that are not real), then the shots at DPR 3, the
// density at which painted art is drawn on a 3x phone (blur and fringes only show there).
const layoutCheck = (extra) =>
  spawnSync(
    process.execPath,
    ['--import', join(ROOT, 'scripts/art/lib/override-hook.mjs'), join(ROOT, 'scripts/layout-check.mjs'), base, '--screens', a.preview.screens.join(','), '--sizes', SIZES.join(','), '--langs', 'en', '--insets', 'plain', '--jobs', '1', ...extra],
    { cwd: ROOT, env: { ...process.env, ART_OVERRIDES: JSON.stringify(overrides), SHOTS: out }, encoding: 'utf8', timeout: 600000 },
  );
const run = layoutCheck(['--no-shots']);
process.stdout.write(run.stdout.split('\n').slice(-6).join('\n') + '\n');
if (run.stderr) process.stderr.write(run.stderr.split('\n').slice(-6).join('\n') + '\n');
const shotsRun = layoutCheck(['--dpr', '3']);
if (shotsRun.error) console.log(`shots run failed: ${shotsRun.error.message}`);

// contact sheet: each screen, the three sizes side by side at half scale over the page colour
const shotRoot = join(out, 'layout', 'en-plain');
const sheets = [];
for (const screen of a.preview.screens) {
  const shots = SIZES.map((s) => join(shotRoot, s, `${screen}.png`)).filter(existsSync).map((p) => readImage(p));
  if (!shots.length) continue;
  const half = shots.map((im) => resizeArea(im, Math.round(im.w / 2), Math.round(im.h / 2)));
  const sheet = blank(half.reduce((s, im) => s + im.w + 16, 16), Math.max(...half.map((im) => im.h)) + 32);
  for (let i = 3; i < sheet.data.length; i += 4) (sheet.data[i - 3] = 0x16), (sheet.data[i - 2] = 0x12), (sheet.data[i - 1] = 0x0f), (sheet.data[i] = 255);
  let x = 16;
  for (const im of half) (paste(sheet, im, x, 16), (x += im.w + 16));
  const p = join(out, `${screen}-sheet.png`);
  writeImage(p, sheet);
  sheets.push(p.replace(ROOT + '/', ''));
}
const record = {
  id: a.id,
  file: a.file,
  sha256: createHash('sha256').update(readFileSync(staged)).digest('hex'),
  layoutCheckExit: run.status,
  screens: a.preview.screens,
  sizes: SIZES,
  sheets,
  at: new Date().toISOString(),
};
writeFileSync(join(out, 'preview.json'), JSON.stringify(record, null, 2));
const ok = run.status === 0 && sheets.length === a.preview.screens.length;
console.log(`${ok ? 'PREVIEWED' : 'FAIL'} ${a.id}: ${sheets.length}/${a.preview.screens.length} sheets, layout check exit ${run.status}`);
console.log(sheets.map((s) => '  ' + s).join('\n'));
console.log(ok ? `Look at every sheet (slot filled, no blur, no crop of heads, no clash with chrome), then: node scripts/art/promote.mjs ${a.id} --looked` : 'Fix and re-run.');
process.exit(ok ? 0 : 1);
