// Asset audit (asset-audit skill, art bible section 8): checks staged and shipped art against
// docs/v5/art/asset-manifest.json. Every asset gets PASS, FAIL or NOT ASSESSED (no file to measure).
// Usage: node scripts/art/check.mjs [asset id ...] [--shipped]   (no ids = every asset)
// Exit code 1 on any FAIL. NOT ASSESSED is not a pass: the summary counts it separately.
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage } from './lib/png.mjs';
import { alphaStats, countColors, keyResidue } from './lib/ops.mjs';
import { loadManifest, stagedPath, shippedPath, NAME_RE, ROOT } from './lib/manifest.mjs';

const args = process.argv.slice(2);
const shipped = args.includes('--shipped');
const ids = args.filter((a) => !a.startsWith('--'));
const m = loadManifest();
const pal = JSON.parse(readFileSync(join(ROOT, 'docs/v5/art/palette.json'), 'utf8')).world;
const WORLD = new Set(Object.entries(pal).filter(([k]) => !k.startsWith('$')).flatMap(([, v]) => v).map((h) => parseInt(h.slice(1), 16)));

function checkAsset(a) {
  const problems = [];
  if (!NAME_RE.test(a.file)) problems.push(`name "${a.file}" breaks the naming rule`);
  const path = shipped ? shippedPath(a) : stagedPath(a);
  if (!path || !existsSync(path)) return { verdict: problems.length ? 'FAIL' : 'NOT ASSESSED', problems: [...problems, `no ${shipped ? 'shipped' : 'staged'} file`] };
  const img = readImage(path);
  const [W, H] = a.size;
  if (img.w !== W || img.h !== H) problems.push(`size ${img.w}x${img.h}, expected ${W}x${H}`);
  const st = alphaStats(img);
  const residue = keyResidue(img);
  if (a.kind === 'painted' && st.clear + st.partial > 0) problems.push(`painted art must be opaque (${st.clear + st.partial} transparent px)`);
  if (a.kind !== 'painted') {
    if (st.clear === 0) problems.push('no transparency: the #FF00FF key-out did not run');
    if (residue > 0) problems.push(`${residue} visible px still near #FF00FF (magenta fringe)`);
  }
  if (a.kind === 'icon') {
    // the icon must not touch the cell edge (room for the drop shadow)
    for (let x = 0; x < img.w; x++) if (img.data[x * 4 + 3] > 24 || img.data[((img.h - 1) * img.w + x) * 4 + 3] > 24) {
      problems.push('icon touches the top or bottom edge');
      break;
    }
  }
  if (a.kind === 'pixel') {
    if (st.partial) problems.push(`${st.partial} semi-transparent px (pixel art needs binary alpha)`);
    let off = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] && !WORLD.has((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2])) off++;
    if (off) problems.push(`${off} px outside the PA-WORLD palette`);
  }
  if (shipped && a.budgetKB) {
    const kb = statSync(path).size / 1024;
    if (kb > a.budgetKB) problems.push(`${kb.toFixed(0)} KB, budget ${a.budgetKB} KB`);
  }
  return { verdict: problems.length ? 'FAIL' : 'PASS', problems, info: `${img.w}x${img.h}, ${countColors(img)} colours` };
}

const list = ids.length ? m.assets.filter((a) => ids.includes(a.id) || ids.includes(a.file)) : m.assets;
const count = { PASS: 0, FAIL: 0, 'NOT ASSESSED': 0 };
for (const a of list) {
  const r = checkAsset(a);
  count[r.verdict]++;
  console.log(`${r.verdict.padEnd(12)} ${a.id} ${a.file}${r.info ? ' (' + r.info + ')' : ''}${r.problems.length ? '\n    - ' + r.problems.join('\n    - ') : ''}`);
}

// manifest <-> ASSET_LIST.md: every id listed in both
const listMd = readFileSync(join(ROOT, 'docs/v5/art/ASSET_LIST.md'), 'utf8');
const mdIds = new Set(listMd.match(/ART-\d{3}/g) ?? []);
const drift = m.assets.filter((a) => !mdIds.has(a.id)).map((a) => a.id);
if (drift.length) {
  console.log(`FAIL         ASSET_LIST.md is missing ${drift.join(', ')} (regenerate it: node scripts/art/list.mjs)`);
  count.FAIL++;
}
// orphans: files in public/ui that no manifest entry ships (only when auditing everything)
if (!ids.length) {
  const shippedFiles = new Set(m.assets.filter((a) => !a.atlas).map((a) => a.dest.replace(/\/$/, '') + '/' + a.file));
  const legacy = new Set(m.legacy ?? []);
  // files in subfolders too (public/ui/busts, public/ui/beasts): a folder is not an asset
  const files = existsSync(join(ROOT, 'public/ui')) ? readdirSync(join(ROOT, 'public/ui'), { recursive: true, withFileTypes: true }).filter((d) => d.isFile()) : [];
  for (const d of files) {
    const p = join(d.parentPath ?? d.path, d.name).slice(ROOT.length + 1);
    if (!shippedFiles.has(p) && !legacy.has(p)) console.log(`WARN         orphan ${p}: no manifest entry ships it`);
  }
}
console.log(`\n${list.length} assets: ${count.PASS} PASS, ${count.FAIL} FAIL, ${count['NOT ASSESSED']} NOT ASSESSED (${shipped ? 'shipped' : 'staged'} files)`);
process.exit(count.FAIL ? 1 : 0);
