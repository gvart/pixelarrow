import type { D1Migration } from 'cloudflare:test';
import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
      /** Empty at start: test/migrations.test.ts migrates it over seeded rows. */
      MIGRATE_DB: D1Database;
      /** Mixed into every test's random stream (test/setup.ts); empty by default. */
      TEST_SEED: string;
    }
  }
}
