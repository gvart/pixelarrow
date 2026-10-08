import type { D1Migration } from 'cloudflare:test';
import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
      /** Mixed into every test's random stream (test/setup.ts); empty by default. */
      TEST_SEED: string;
    }
  }
}
