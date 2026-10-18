// I5b: print a sheet manifest's colour groups, metal groups and tiers. Usage: node scripts/art/pixellab/i5b/mgroups.mjs <manifest.json>
import { readFileSync } from 'node:fs';

const m = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const [k, v] of Object.entries(m.colorGroups ?? {})) console.log(`group ${k}: ${v.join(' ')}`);
for (const g of m.metal ?? []) console.log(`metal ${g.kind} [${g.slots}]: ${g.colors.join(' ')}`);
for (const [t, gs] of Object.entries(m.tiers ?? {})) console.log(`tier ${t}: ${Object.keys(gs).join(', ') || '-'}`);
console.log(`frame ${m.frame.w}x${m.frame.h}, anims ${Object.entries(m.anims).map(([a, x]) => `${a} ${x.frames}@${x.fps}${x.strike !== undefined ? ` s${x.strike}` : ''}${x.hold !== undefined ? ` h${x.hold}` : ''}`).join(', ')}`);
