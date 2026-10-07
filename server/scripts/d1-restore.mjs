#!/usr/bin/env node
/**
 * Point-in-time restore of the production D1 database with D1 Time Travel
 * (docs/OPS.md "Restore runbook"). Dry run by default.
 *
 *   node server/scripts/d1-restore.mjs --timestamp 2026-10-07T09:30:00Z          # dry run
 *   node server/scripts/d1-restore.mjs --bookmark <bookmark>                      # dry run
 *   node server/scripts/d1-restore.mjs --timestamp 2026-10-07T09:30:00Z --apply   # restore (asks to type the database name)
 *
 * Options:
 *   --database <name>   default "pixelarrow"
 *   --config <path>     wrangler config with the real database id (default: wrangler.deploy.json
 *                       next to wrangler.jsonc; generate it with
 *                       D1_DATABASE_ID=<id> node server/scripts/deploy-config.mjs)
 *   --apply             actually restore (otherwise only shows what would happen)
 *   --yes               skip the typed confirmation (CI / scripted use)
 *
 * Before restoring it records the CURRENT bookmark in d1-undo-<time>.json, so
 * the restore itself can be undone with --bookmark <that bookmark>.
 * Needs CLOUDFLARE_API_TOKEN (D1 edit) and CLOUDFLARE_ACCOUNT_ID, or `wrangler login`.
 * WRANGLER overrides the wrangler command (default: npx wrangler, run in server/).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '..');

export function parseArgs(argv) {
  const o = { database: 'pixelarrow', config: resolve(serverDir, '..', 'wrangler.deploy.json'), apply: false, yes: false, timestamp: null, bookmark: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--timestamp') o.timestamp = val();
    else if (a === '--bookmark') o.bookmark = val();
    else if (a === '--database') o.database = val();
    else if (a === '--config') o.config = resolve(val());
    else if (a === '--apply') o.apply = true;
    else if (a === '--yes') o.yes = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  if (!o.help && !!o.timestamp === !!o.bookmark) throw new Error('Give exactly one of --timestamp or --bookmark');
  if (o.timestamp && !/^\d{9,11}$/.test(o.timestamp) && Number.isNaN(Date.parse(o.timestamp))) throw new Error(`Not a timestamp: ${o.timestamp}`);
  if (o.timestamp && !/^\d+$/.test(o.timestamp)) {
    const age = Date.now() - Date.parse(o.timestamp);
    if (age < 0) throw new Error('The timestamp is in the future');
    if (age > 30 * 86_400_000) throw new Error('Time Travel only reaches 30 days back; restore an exported backup instead (docs/OPS.md)');
  }
  return o;
}

function wrangler(args) {
  const cmd = process.env.WRANGLER ? process.env.WRANGLER.split(' ') : ['npx', 'wrangler'];
  return execFileSync(cmd[0], [...cmd.slice(1), ...args], { cwd: serverDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function json(text) {
  const start = text.indexOf('{');
  return JSON.parse(start >= 0 ? text.slice(start) : text);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log('See the header of server/scripts/d1-restore.mjs and docs/OPS.md "Restore runbook".');
    return;
  }
  if (!existsSync(o.config)) throw new Error(`${o.config} not found: run D1_DATABASE_ID=<id> node server/scripts/deploy-config.mjs first`);
  const cfg = ['--config', o.config];

  const now = json(wrangler(['d1', 'time-travel', 'info', o.database, '--json', ...cfg]));
  console.log(`current bookmark:  ${now.bookmark}  (keep it: restoring to it undoes this restore)`);
  let target = o.bookmark;
  if (o.timestamp) {
    const at = json(wrangler(['d1', 'time-travel', 'info', o.database, '--timestamp', o.timestamp, '--json', ...cfg]));
    target = at.bookmark;
    console.log(`bookmark at ${o.timestamp}:  ${target}`);
  }
  const restoreArgs = ['d1', 'time-travel', 'restore', o.database, '--bookmark', target, '--json', ...cfg];
  if (!o.apply) {
    console.log('\nDRY RUN: nothing changed. To restore, run again with --apply, which runs:');
    console.log(`  wrangler ${restoreArgs.join(' ')}`);
    return;
  }
  if (!o.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nThis REPLACES the live "${o.database}" database with its state at ${o.timestamp ?? target}.\nType the database name to continue: `);
    rl.close();
    if (answer.trim() !== o.database) throw new Error('Not confirmed; nothing changed');
  }
  const undo = join(process.cwd(), `d1-undo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(undo, JSON.stringify({ database: o.database, undoBookmark: now.bookmark, restoredTo: target, at: new Date().toISOString() }, null, 2) + '\n');
  console.log(`undo bookmark saved to ${undo}`);
  const out = wrangler(restoreArgs);
  console.log(out.trim());
  console.log(`\nRestored. To undo: node server/scripts/d1-restore.mjs --bookmark ${now.bookmark} --apply`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`d1-restore: ${e.message}`);
    process.exit(1);
  });
}
