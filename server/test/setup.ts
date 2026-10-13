import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';
import { hashString } from '../../src/sim/rng';
import { setRandomSource } from '../src/online/store';
import { withFakeSiteverify } from './siteverify';

await applyD1Migrations(env.DB!, env.TEST_MIGRATIONS);

// Turnstile siteverify answers from a local fake (test/siteverify.ts). A test's
// vi.spyOn(globalThis, 'fetch') wraps it, and restoring the spy returns here.
globalThis.fetch = withFakeSiteverify(globalThis.fetch.bind(globalThis));

// Server randomness (shard seeds, home plots, battle/duel seeds, recruits) is
// drawn from a stream seeded by the test's file and name, so every run of a
// test sees the same homes, maps and battles: outcomes never hinge on chance.
// (The Worker, its Durable Objects and the tests share one isolate, hence one
// store module.) TEST_SEED=<salt> npx vitest run replays it with other draws.
beforeEach((ctx) => {
  // (fullName is relative: "test/x.test.ts > describe > it", the same on every machine)
  let state = hashString(`${env.TEST_SEED ?? ''}|${ctx.task.fullName}`) || 0x9e3779b9;
  setRandomSource(() => {
    // mulberry32
    let t = (state = (state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  });
});
