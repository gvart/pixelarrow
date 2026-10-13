// Regenerate the tables of docs/v5/art/ASSET_LIST.md (between <!-- list:start --> and
// <!-- list:end -->) from docs/v5/art/asset-manifest.json, so the two never drift.
// Usage: node scripts/art/list.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, ROOT } from './lib/manifest.mjs';

const path = join(ROOT, 'docs/v5/art/ASSET_LIST.md');
const md = readFileSync(path, 'utf8');
const { assets } = loadManifest();
const TITLES = { fresco: 'Frescoes (mode banners)', vignette: 'Settlement vignettes', bust: 'Class busts', portrait: 'Narrator portrait', plate: 'Beast plates', icon: 'Icons (atlas icons_ui)', chest: 'Reward art: chests', laurel: 'Reward art: laurels', splash: 'Splash key art', tile: 'World pixel art: field works', crest: 'World pixel art: battle markers' };
const out = [];
const counts = [];
for (const cat of Object.keys(TITLES)) {
  const list = assets.filter((a) => a.cat === cat);
  if (!list.length) continue;
  counts.push(`| ${TITLES[cat]} | ${list.length} |`);
  out.push(`### ${TITLES[cat]} (${list.length})`, '', '| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of list)
    out.push(`| ${a.id} | \`${a.file}\`${a.atlas ? ` (frame \`${a.frame}\`)` : ''} | ${a.size.join('x')} | ${a.kind} | ${a.template} | ${a.subject} | ${a.slot} | ${a.preview ? a.preview.screens.join(', ') : 'not wired'} |`);
  out.push('');
}
const block = ['| Category | Assets |', '| --- | --- |', ...counts, `| **Total** | **${assets.length}** |`, '', ...out].join('\n');
const next = md.replace(/<!-- list:start -->[\s\S]*<!-- list:end -->/, `<!-- list:start -->\n${block}\n<!-- list:end -->`);
if (next === md && !md.includes('<!-- list:start -->')) throw new Error('ASSET_LIST.md has no <!-- list:start --> / <!-- list:end --> markers');
writeFileSync(path, next);
console.log(`ASSET_LIST.md: ${assets.length} assets`);
