// I5c: the asset-log tables of a class from its jobs file: every attempt (clip, facing, attempt, prompt id, gens,
// verdict) as markdown, and the prompts it used, word for word, from prompts.json.
// Usage: node scripts/art/pixellab/i5c/log.mjs <class> [--prompts]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadJobs } from './lib.mjs';

const cls = process.argv[2];
const jobs = loadJobs(cls);
const P = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/I5c/prompts.json'), 'utf8'));
const short = { 'south-east': 'SE', 'north-east': 'NE', 'south-west': 'SW', 'north-west': 'NW' };
console.log('| clip | facing | attempt | job | prompt | gens | outcome |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const j of jobs) console.log(`| ${j.anim} | ${short[j.dir]} | ${j.attempt} | \`${j.job.slice(0, 8)}\` | ${j.prompt} | ${j.gens} | ${j.verdict ?? ''} |`);
console.log(`\n${jobs.length} jobs, ${jobs.reduce((s, j) => s + j.gens, 0)} gens.`);
if (process.argv.includes('--prompts')) {
  const used = [...new Set(jobs.map((j) => j.prompt))];
  for (const id of used) console.log(`\n- **${id}**\n  \`\`\`\n  ${P.prompts[id]}\n  \`\`\``);
  const subs = [...new Set(jobs.map((j) => j.subject ?? cls))], poses = [...new Set(jobs.map((j) => j.pose ?? 'stand'))];
  console.log('\nSubjects (`subject_description`): ' + subs.map((s) => `${s}: "${P.subjects[s]}"`).join('; '));
  console.log('Poses (`initial_pose`): ' + poses.map((s) => `${s}: "${P.poses[s]}"`).join('; '));
}
