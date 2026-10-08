/**
 * Product analytics, client side (docs/OPS.md "Analytics").
 *
 *   track('tutorial_step', { id: 'deploy', step: 2 });
 *
 * Only events in the shared allowlist (src/platform/analyticsSchema.ts) that
 * the client may send are accepted; props are validated there too. Events
 * are batched (FLUSH_MS after the first, or MAX_BATCH at once) and sent to
 * POST /api/telemetry/events once signed in; with navigator.sendBeacon when
 * the app is hidden. The Settings "Analytics" toggle turns everything off:
 * the queue is dropped, nothing is sent, and every API request carries
 * `x-pa-analytics: 0` so the server skips its own events for this player.
 */
import { normalizeEvent, type ClientEvent, type EventProps } from './analyticsSchema';

export const MAX_BATCH = 20;
export const MAX_QUEUED = 100;
export const FLUSH_MS = 10_000;

export interface QueuedEvent {
  e: string;
  p: Record<string, unknown>;
}

export interface EventsPayload {
  token?: string;
  app: { version: string; platform?: string };
  events: QueuedEvent[];
}

export interface AnalyticsOptions {
  /** Delivers a batch; resolves true when the server took it. */
  send: (payload: EventsPayload, beacon: boolean) => Promise<boolean> | boolean;
  enabled: () => boolean;
  /** The session token; nothing is sent while null (events wait, up to MAX_QUEUED). */
  token: () => string | null;
  app: () => EventsPayload['app'];
  schedule?: (fn: () => void, ms: number) => unknown;
  flushMs?: number;
  maxBatch?: number;
}

export class Analytics {
  private queue: QueuedEvent[] = [];
  private timer: unknown = null;
  private sending = false;
  private readonly schedule: (fn: () => void, ms: number) => unknown;

  constructor(private readonly o: AnalyticsOptions) {
    this.schedule = o.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Queues an allowlisted event. False when it was rejected or analytics is off. */
  track<E extends ClientEvent>(event: E, props: EventProps<E> = {} as EventProps<E>): boolean {
    try {
      if (!this.o.enabled()) {
        this.queue = [];
        return false;
      }
      if (!normalizeEvent(event, props, 'client')) return false;
      if (this.queue.length >= MAX_QUEUED) this.queue.shift();
      this.queue.push({ e: event, p: { ...(props as Record<string, unknown>) } });
      if (this.queue.length >= (this.o.maxBatch ?? MAX_BATCH)) void this.flush(false);
      else if (this.timer === null) this.timer = this.schedule(() => void this.flush(false), this.o.flushMs ?? FLUSH_MS);
      return true;
    } catch {
      return false;
    }
  }

  /** Sends queued events (one batch per call). Kept for later when not signed in or the send fails. */
  async flush(beacon = false): Promise<void> {
    this.timer = null;
    if (!this.o.enabled()) {
      this.queue = [];
      return;
    }
    const token = this.o.token();
    if (!token || !this.queue.length || (this.sending && !beacon)) {
      if (this.queue.length && this.timer === null && !beacon) this.timer = this.schedule(() => void this.flush(false), this.o.flushMs ?? FLUSH_MS);
      return;
    }
    const batch = this.queue.splice(0, this.o.maxBatch ?? MAX_BATCH);
    this.sending = true;
    let ok = false;
    try {
      ok = await this.o.send({ token, app: this.o.app(), events: batch }, beacon);
    } catch {
      ok = false;
    } finally {
      this.sending = false;
    }
    if (!ok && !beacon) this.queue.unshift(...batch.slice(0, MAX_QUEUED - this.queue.length));
    if (this.queue.length && this.timer === null && !beacon) this.timer = this.schedule(() => void this.flush(false), this.o.flushMs ?? FLUSH_MS);
  }

  /** Analytics switched off: forget everything queued. */
  clear(): void {
    this.queue = [];
  }
}

// ------------------------------------------------------------------ the game's instance

let instance: Analytics | null = null;

export function setAnalytics(a: Analytics | null): void {
  instance = a;
}

/** Tracks a product event (no-op until the game wires the instance, or when opted out). */
export function track<E extends ClientEvent>(event: E, props?: EventProps<E>): void {
  instance?.track(event, props);
}

export function flushAnalytics(beacon = false): void {
  void instance?.flush(beacon);
}
