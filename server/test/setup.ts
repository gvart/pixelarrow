import { applyD1Migrations, env } from 'cloudflare:test';
import { withFakeSiteverify } from './siteverify';

await applyD1Migrations(env.DB!, env.TEST_MIGRATIONS);

// Turnstile siteverify answers from a local fake (test/siteverify.ts). A test's
// vi.spyOn(globalThis, 'fetch') wraps it, and restoring the spy returns here.
globalThis.fetch = withFakeSiteverify(globalThis.fetch.bind(globalThis));
