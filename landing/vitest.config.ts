import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// The landing Worker's tests run inside workerd (real Cache API). No wrangler config is loaded: the
// GAME service, the rate limiter and ASSETS are stubs passed to the handler by each test.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './worker/index.ts',
      // The pool's bundled workerd can lag behind wrangler.jsonc's compatibility_date.
      miniflare: { compatibilityDate: '2026-08-15' },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
