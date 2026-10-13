/** The save in Telegram CloudStorage (6.9+), mirrored to localStorage as a fast local fallback. */
import type { PlatformEnv } from '../core/env';
import type { KV } from '../core/storage';
import type { TgWebApp } from './sdk';

const TIMEOUT_MS = 5000;

/** CloudStorage as a KV; each call gives up after 5 s (reads then return null). */
export function cloudKV(env: PlatformEnv, cs: NonNullable<TgWebApp['CloudStorage']>): KV {
  const withTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> => Promise.race([p, new Promise<T>((r) => env.setTimeout(() => r(fallback), TIMEOUT_MS))]);
  return {
    get: (k) => withTimeout(new Promise<string | null>((resolve) => cs.getItem(k, (err, v) => resolve(err ? null : v ? v : null))), null),
    set: (k, v) => withTimeout(new Promise<void>((resolve) => cs.setItem(k, v, () => resolve())), undefined),
    remove: (k) => withTimeout(new Promise<void>((resolve) => cs.removeItem(k, () => resolve())), undefined),
  };
}

/** Writes go to both; a read the cloud cannot answer (timeout, error, missing) comes from the mirror. */
export function mirroredKV(cloud: KV, mirror: KV): KV {
  return {
    async get(k) {
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
