// Ship a staged asset into the game (ASSET_PIPELINE.md step 7). Refuses unless the staged file
// passes scripts/art/check.mjs and the caller confirms with --looked that they looked at it in the game.
// .jpg destinations are encoded with macOS sips at the asset's quality (default 82).
// Atlas frames are not promoted one by one: promote the rebuilt atlas with --atlas <name>.
// Usage: node scripts/art/promote.mjs <asset id> --looked
//        node scripts/art/promote.mjs --atlas icons_ui --looked
import { copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { findAsset, stagedPath, shippedPath, loadManifest, STAGING, ROOT } from './lib/manifest.mjs';

const args = process.argv.slice(2);
const fail = (msg) => {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
};
if (!args.includes('--looked')) fail('pass --looked after looking at it in the game (art nobody looked at is not checked)');

const atlasIdx = args.indexOf('--atlas');
if (atlasIdx >= 0) {
  const name = args[atlasIdx + 1];
  const members = loadManifest().assets.filter((a) => a.atlas === name);
  for (const ext of ['png', 'json']) copyFileSync(join(STAGING, 'atlas', `${name}.${ext}`), join(ROOT, 'public/icons', `${name.replace(/^icons_/, '')}.${ext}`));
  console.log(`shipped atlas ${name} (${members.length} manifest frames) to public/icons/`);
  process.exit(0);
}

const a = findAsset(args.find((x) => !x.startsWith('--')));
if (a.atlas) fail(`${a.id} is an atlas frame: run scripts/art/atlas.mjs ${a.atlas}, look at its frames, then promote --atlas ${a.atlas}`);
const staged = stagedPath(a);
const chk = spawnSync(process.execPath, [join(ROOT, 'scripts/art/check.mjs'), a.id], { encoding: 'utf8' });
if (!/^PASS/m.test(chk.stdout)) fail(`check did not pass:\n${chk.stdout}`);

const dest = shippedPath(a);
mkdirSync(dirname(dest), { recursive: true });
if (/\.jpe?g$/i.test(dest)) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(a.quality ?? 82), staged, '--out', dest], { stdio: 'ignore' });
else copyFileSync(staged, dest);
console.log(`shipped ${a.id} -> ${dest.replace(ROOT + '/', '')}`);
console.log('next: node scripts/art/check.mjs --shipped ' + a.id + '  (size budget), then log it under Done in docs/v5/ASSET_LOG.md');
