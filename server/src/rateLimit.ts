/**
 * Best-effort fixed-window rate limiter kept in isolate memory. Each Worker
 * isolate has its own map, so the effective limit is per isolate (a soft guard
 * against hammering /api/auth, not a hard quota). Swap for the Workers Rate
 * Limiting binding or a Durable Object when it matters.
 */
import { ApiError } from './errors';

const windows = new Map<string, { start: number; count: number }>();
const MAX_KEYS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  let w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (windows.size >= MAX_KEYS) windows.clear();
    w = { start: now, count: 0 };
    windows.set(key, w);
  }
  w.count++;
  return w.count <= limit;
}

/** Counts a hit on `key`; over `limit` in the window it throws 429 `rate_limited` with `message`. */
export function requireRate(key: string, limit: number, windowMs: number, message = 'Too many requests, slow down'): void {
  if (!rateLimit(key, limit, windowMs)) throw new ApiError(429, 'rate_limited', message);
}

/** True while `key` is over `limit` in its current window (does not count a hit). */
export function overLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  return !!w && now - w.start < windowMs && w.count >= limit;
}

export function resetRateLimits(): void {
  windows.clear();
}
