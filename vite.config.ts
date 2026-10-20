import { defineConfig } from 'vite';
// @ts-ignore -- node built-in; the browser tsconfig has no @types/node
import { execSync } from 'node:child_process';
import { sheetPackPlugin } from './scripts/art/pack/vite-plugin.mjs';

// `process` without pulling in @types/node for the browser tsconfig.
const penv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const apiProxy = penv.API_PROXY ?? 'http://localhost:8787';

/** Commit of the build, sent with crash reports and analytics (src/platform/telemetry.ts APP_VERSION). */
function appVersion(): string {
  const sha = penv.GITHUB_SHA ?? penv.APP_VERSION;
  if (sha) return sha.slice(0, 12);
  try {
    const run = execSync as (cmd: string, o: object) => unknown;
    return String(run(['git', 'rev-parse', '--short=12', 'HEAD'].join(' '), { stdio: ['ignore', 'pipe', 'ignore'] })).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// Relative base: the build works at a domain root, under a sub-path such as
// https://gvart.github.io/pixelarrow/ and inside Telegram's webview alike.
// All art is generated in code, so there are no runtime asset URLs to fix up.
export default defineConfig({
  base: './',
  // class sprite sheets ship packed (scripts/art/pack/, docs/v5/art/SHEET_FORMAT.md)
  plugins: [sheetPackPlugin()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // preview.html (procedural sprite sheets) and store.html (Telegram store
      // art, see scripts/dev/store-images.mjs) are shipped too, for art review;
      // audio.html plays every procedural sound and track (src/dev/audio.ts).
      // auth/*.html are the standalone email-link pages (V6-ACCT-06, accounts-v6.md UXA-06): a few KB,
      // no Phaser; Workers static assets serve /auth/signup from auth/signup.html.
      input: {
        main: 'index.html',
        preview: 'preview.html',
        store: 'store.html',
        audio: 'audio.html',
        sandbox: 'sandbox.html', // war region sandbox (src/war/view/main.ts)
        world: 'world.html', // war world map (src/war/world-view/main.ts)
        'auth-signup': 'auth/signup.html',
        'auth-add_email': 'auth/add_email.html',
        'auth-change_email': 'auth/change_email.html',
        'auth-reset': 'auth/reset.html',
      },
    },
  },
  // /api and /ws go to a local `wrangler dev` (see README, "Online features");
  // override the target with API_PROXY=http://host:port.
  server: {
    host: true,
    proxy: {
      '/api': { target: apiProxy, changeOrigin: true },
      '/ws': { target: apiProxy, changeOrigin: true, ws: true },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The suite is seeded simulation: results never depend on time, but whole battles take
    // seconds on a loaded CPU (parallel workers, CI), so the default 5 s timeout is too tight.
    testTimeout: 30_000,
  },
} as any);
