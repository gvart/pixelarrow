import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Tests run inside workerd (Miniflare) with the real wrangler.jsonc bindings:
// a local D1 database and the RegionDO Durable Object. The root dist/ must
// exist (npm run build at the repo root) because the config declares assets.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: './src/index.ts',
      wrangler: { configPath: '../wrangler.jsonc' },
      miniflare: {
        // The pool's bundled workerd can lag behind wrangler.jsonc's compatibility_date.
        compatibilityDate: '2026-08-15',
        bindings: {
          TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN',
          TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
          SESSION_SECRET: 'test-session-secret-0123456789abcdef',
          DEV_AUTH: '1',
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
        },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/globalSetup.ts'],
  },
});
