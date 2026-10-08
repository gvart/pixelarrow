#!/usr/bin/env node
/**
 * Generates wrangler.deploy.json (next to wrangler.jsonc, so relative paths
 * keep working) for CI deploys:
 *   - D1_DATABASE_ID set   -> the D1 binding gets that id
 *   - D1_DATABASE_ID empty -> the D1 binding is dropped; the API answers 503
 *                             "database not configured" on DB routes
 *   - ANALYTICS_ENGINE=off -> the Analytics Engine datasets are dropped
 *                             (product analytics and error counts are then
 *                             skipped; crash reports still go to D1)
 * Also writes wrangler.deploy.noae.json, the same config without Analytics
 * Engine: the deploy step falls back to it if the account cannot create the
 * datasets yet (docs/OPS.md "Analytics").
 * Prints "d1=true|false" (also to $GITHUB_OUTPUT when present).
 *
 * Usage: node server/scripts/deploy-config.mjs [path/to/wrangler.jsonc]
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Removes // and /* *\/ comments and trailing commas, leaving string contents alone. */
export function stripJsonc(src) {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      i++;
    } else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const configPath = resolve(process.argv[2] ?? 'wrangler.jsonc');
const config = JSON.parse(stripJsonc(readFileSync(configPath, 'utf8')));
const id = (process.env.D1_DATABASE_ID ?? '').trim();

let d1 = false;
if (id) {
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    console.error(`D1_DATABASE_ID does not look like a D1 database id: "${id}"`);
    process.exit(1);
  }
  for (const db of config.d1_databases ?? []) if (db.binding === 'DB') db.database_id = id;
  d1 = true;
} else {
  config.d1_databases = (config.d1_databases ?? []).filter((db) => db.binding !== 'DB');
  if (config.d1_databases.length === 0) delete config.d1_databases;
  console.warn('D1_DATABASE_ID is not set: deploying without D1 (DB routes answer 503).');
}

const noAe = { ...config };
delete noAe.analytics_engine_datasets;
if ((process.env.ANALYTICS_ENGINE ?? '').trim().toLowerCase() === 'off') {
  delete config.analytics_engine_datasets;
  console.warn('ANALYTICS_ENGINE=off: deploying without Analytics Engine datasets.');
}

const outPath = join(dirname(configPath), 'wrangler.deploy.json');
writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
console.log(`wrote ${outPath}`);
const noAePath = join(dirname(configPath), 'wrangler.deploy.noae.json');
writeFileSync(noAePath, JSON.stringify(noAe, null, 2) + '\n');
console.log(`wrote ${noAePath}`);
console.log(`d1=${d1}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `d1=${d1}\n`);
