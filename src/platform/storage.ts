/** Key/value storage: Telegram CloudStorage inside Telegram, localStorage elsewhere. */
import type { KV } from '../game/save';
import { cloudStorage } from './telegram';

const PREFIX = 'pixelarrow:';

export function localKV(): KV {
  return {
    async get(k) {
      try {
        return localStorage.getItem(PREFIX + k);
      } catch {
        return null;
      }
    },
    async set(k, v) {
      try {
        localStorage.setItem(PREFIX + k, v);
      } catch {
        /* quota / private mode */
      }
    },
    async remove(k) {
      try {
        localStorage.removeItem(PREFIX + k);
      } catch {
        /* ignore */
      }
    },
  };
}

export function telegramKV(): KV | null {
  const cs = cloudStorage();
  if (!cs) return null;
  const withTimeout = <T>(p: Promise<T>, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), 5000))]);
  return {
    get: (k) =>
      withTimeout(
        new Promise<string | null>((resolve) => cs.getItem(k, (err, v) => resolve(err ? null : v ? v : null))),
        null,
      ),
    set: (k, v) => withTimeout(new Promise<void>((resolve) => cs.setItem(k, v, () => resolve())), undefined),
    remove: (k) => withTimeout(new Promise<void>((resolve) => cs.removeItem(k, () => resolve())), undefined),
  };
}

/**
 * Storage used by the game. Inside Telegram we write to CloudStorage and mirror
 * to localStorage (fast local fallback if the cloud is unreachable).
 */
export function gameKV(): { primary: KV; mirror: KV | null; cloud: boolean } {
  const tg = telegramKV();
  if (tg) return { primary: tg, mirror: localKV(), cloud: true };
  return { primary: localKV(), mirror: null, cloud: false };
}
