import { defineConfig } from 'vitest/config';

// Time budgets (npm run perf:war): one file at a time so samples don't compete for cores.
// Not part of `npm test` (vite.config.ts includes only tests/**/*.test.ts).
export default defineConfig({
  test: {
    include: ['tests/perf/**/*.perf.ts'],
    environment: 'node',
    fileParallelism: false,
    reporters: ['verbose'], // shows each budget's logged samples
    testTimeout: 300_000,
  },
});
