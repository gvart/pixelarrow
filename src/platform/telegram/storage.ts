/** The save in Telegram CloudStorage (6.9+), mirrored to localStorage as a fast local fallback. */
import type { PlatformEnv } from '../core/env';
import type { KV } from '../core/storage';
import type { TgWebApp } from './sdk';

const TIMEOUT_MS = 5000;

/** Whether CloudStorage answered its last call in time (shared by every KV made for one session). */
export interface CloudHealth {
  down: boolean;
}

/** CloudStorage as a KV; each call gives up after 5 s (reads then return null) and marks the cloud down until a call answers. */
export function cloudKV(env: PlatformEnv, cs: NonNullable<TgWebApp['CloudStorage']>, health: CloudHealth = { down: false }): KV {
  const withTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    new Promise<T>((resolve) => {
      let done = false;
      const timer = env.setTimeout(() => {
        if (done) return;
        done = true;
        health.down = true;
        resolve(fallback);
      }, TIMEOUT_MS);
      void p.then((v) => {
        health.down = false;
        if (done) return;
        done = true;
        env.clearTimeout(timer);
        resolve(v);
      });
    });
  return {
    get: (k) => withTimeout(new Promise<string | null>((resolve) => cs.getItem(k, (err, v) => resolve(err ? null : v ? v : null))), null),
    set: (k, v) => withTimeout(new Promise<void>((resolve) => cs.setItem(k, v, () => resolve())), undefined),
    remove: (k) => withTimeout(new Promise<void>((resolve) => cs.removeItem(k, () => resolve())), undefined),
  };
}

/**
 * Writes go to both; a read the cloud cannot answer (timeout, error, missing)
 * comes from the mirror. While the cloud is down (its last call timed out),
 * reads go straight to the mirror, so a hung CloudStorage costs one timeout,
 * not one per key (before M4 the save fell back to the mirror after one).
 */
export function mirroredKV(cloud: KV, mirror: KV, health: CloudHealth = { down: false }): KV {
  return {
    async get(k) {
      if (health.down) return mirror.get(k);
      return (await cloud.get(k)) ?? mirror.get(k);
    },
    async set(k, v) {
      await mirror.set(k, v);
      await cloud.set(k, v);
    },
    async remove(k) {
      await mirror.remove(k);
      await cloud.remove(k);
    },
  };
}
