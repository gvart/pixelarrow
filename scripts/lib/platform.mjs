// The platform mode of the browser checks (V6-GATE-02): every smoke and the
// regression scripts run as a Telegram Mini App (the fake Telegram.WebApp of
// fakeTelegram.mjs) or as a plain web page, and CI runs both.
//
//   node scripts/<smoke>.mjs <baseUrl> [--platform telegram|web|both] [script args]
//
// The base URL is required: a positional http(s) URL, `--base <url>` or $BASE_URL.
// There is no default port (each agent and CI job serves the game on its own).
// The mode: `--platform`, else $SMOKE_PLATFORM (CI) or $PLATFORM, else `both`. With `both` the script runs
// itself once per mode, as a child process, and exits with the worse result, so a
// failure in one mode is never hidden by the other (and there are no retries).
//
// How the game picks its platform (src/platform/detect.ts): a production build
// (what `vite preview` serves) ignores `?platform=`, so the mode is set the way a
// real launch sets it. Telegram: the fake WebApp with signed-looking initData (and
// telegram.org requests aborted, the SDK is already "loaded"). Web: nothing at all;
// every request to telegram.org is recorded, and the run fails if there is one.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fakeTelegram } from './fakeTelegram.mjs';
import { check } from './harness.mjs';

export const MODES = ['telegram', 'web'];

/**
 * Parses argv: { base (with a trailing slash), platform, args } where `args` is
 * argv without the base URL and the --platform / --base flags (the script's own
 * positional arguments and flags, in order). Exits 2 (could not run) on a
 * missing base URL or an unknown mode.
 */
export function cliArgs(argv = process.argv.slice(2), usage = '') {
  const args = [];
  let base = process.env.BASE_URL || null;
  let platform = process.env.SMOKE_PLATFORM || process.env.PLATFORM || 'both';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--platform') platform = argv[++i];
    else if (a.startsWith('--platform=')) platform = a.slice(11);
    else if (a === '--base') base = argv[++i];
    else if (a.startsWith('--base=')) base = a.slice(7);
    else if (/^https?:\/\//.test(a) && !args.some((x) => /^https?:\/\//.test(x))) base = a;
    else args.push(a);
  }
  if (!base) {
    console.log(`NOT RUN: no base URL. Usage: node ${usage || 'scripts/<script>.mjs'} <baseUrl> [--platform telegram|web|both]`);
    process.exit(2);
  }
  if (![...MODES, 'both'].includes(platform)) {
    console.log(`NOT RUN: --platform must be telegram, web or both (got ${platform})`);
    process.exit(2);
  }
  return { base: base.replace(/\/?$/, '/'), platform, args };
}

/**
 * The mode this process runs in. For `both`, runs the calling script once per
 * mode (a child process each, output prefixed with the mode), prints one verdict
 * line per mode and exits: 1 if a mode failed, else 2 if a mode could not run,
 * else 0. `scriptUrl` is the caller's import.meta.url.
 */
export async function platformMode(scriptUrl, { base, platform, args }) {
  if (platform !== 'both') {
    console.log(`platform: ${platform} (${base})`);
    return platform;
  }
  const script = fileURLToPath(scriptUrl);
  const codes = {};
  for (const mode of MODES) {
    codes[mode] = await new Promise((resolve) => {
      const child = spawn(process.execPath, [script, base, '--platform', mode, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      const feed = (d) => {
        buf += d;
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) console.log(`[${mode}] ${l}`);
      };
      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.on('close', (code, signal) => {
        if (buf) console.log(`[${mode}] ${buf}`);
        resolve(signal ? 1 : code);
      });
    });
  }
  const word = (c) => (c === 0 ? 'PASS' : c === 2 ? 'NOT ASSESSED' : 'FAIL');
  for (const mode of MODES) console.log(`PLATFORM ${mode}: ${word(codes[mode])}`);
  const all = Object.values(codes);
  process.exit(all.some((c) => c !== 0 && c !== 2) ? 1 : all.includes(2) ? 2 : 0);
}

/**
 * Puts a browser context in `mode` before its first page loads. Telegram: the
 * fake WebApp (`fake` = fakeTelegram's options) and telegram.org aborted. Web:
 * telegram.org requests recorded (and aborted, no network leaves the run).
 * Returns { mode, telegramRequests }; finish a web run with noTelegramRequests().
 */
export async function applyPlatform(ctx, mode, fake = {}) {
  const telegramRequests = [];
  if (mode === 'telegram') await ctx.addInitScript(fakeTelegram, fake);
  else ctx.on('request', (r) => /(^|\.)telegram\.org$/.test(new URL(r.url()).hostname) && telegramRequests.push(r.url()));
  await ctx.route('**/telegram.org/**', (r) => r.abort());
  return { mode, telegramRequests };
}

/** The URL a launch opens: Telegram adds its launch hash (tgWebAppVersion...), the web the bare URL. */
export const launchUrl = (base, mode, path = '') => `${base}${path}${mode === 'telegram' ? '#tgWebAppVersion=8.0&tgWebAppPlatform=ios' : ''}`;

/**
 * Checks the game took the mode: Telegram, the adapter launched (it called
 * WebApp.ready()); web, no Telegram object at all. Polls up to `ms`.
 */
export async function checkPlatform(page, mode, tag = '', ms = 30000) {
  const want = mode === 'telegram' ? () => !!window.__tg && window.__tg.log.includes('ready') : () => !window.Telegram && !window.__tg;
  let ok = false;
  for (let t = 0; t < ms && !ok; t += 250) {
    ok = await page.evaluate(want).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 250));
  }
  check(`${tag}[${mode}] the game runs as ${mode === 'telegram' ? 'a Telegram Mini App (WebApp.ready called)' : 'a plain web page (no Telegram object)'}`, ok);
  return ok;
}

/** Web mode: the run made no request to telegram.org (a no-op check in Telegram mode). */
export function noTelegramRequests(p, tag = '') {
  if (p.mode !== 'web') return;
  check(`${tag}[web] no request to telegram.org`, p.telegramRequests.length === 0, p.telegramRequests.slice(0, 3).join(' '));
}
