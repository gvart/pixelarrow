/**
 * Client crash reports (docs/OPS.md "Monitoring"): window errors, unhandled
 * promise rejections and exceptions inside Phaser's scene loop, each with
 * the last breadcrumbs (scene transitions, button presses), sent to
 * POST /api/telemetry/errors.
 *
 * - Deduplicated: the same error (kind + message + top frame) is counted, not
 *   repeated; a fingerprint is sent at most MAX_SENDS_PER_FP times a session.
 * - Rate limited: at most MAX_PER_MINUTE new reports a minute, MAX_QUEUE queued.
 * - Batched: flushed FLUSH_MS after the first report, and with
 *   navigator.sendBeacon when the app is hidden or closed.
 * - Private: messages and stacks are scrubbed of tokens, query strings and
 *   e-mails; the only identity sent is the opaque session (player id).
 *
 * Nothing here may throw into the game.
 */
import { scrubText } from './analyticsSchema';

declare const __APP_VERSION__: string;

/** Git sha of this build (vite.config.ts `define`), 'dev' when unknown. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';

export interface Crumb {
  /** ms since page load. */
  t: number;
  /** 'scene' | 'ui' | 'nav' | 'net' | 'app' */
  c: string;
  m: string;
}

export class Breadcrumbs {
  private items: Crumb[] = [];
  constructor(
    readonly max = 20,
    private readonly clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  ) {}

  add(category: string, message: string): void {
    this.items.push({ t: Math.round(this.clock()), c: category.slice(0, 16), m: scrubText(message, 120) });
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }

  list(): Crumb[] {
    return this.items.slice();
  }
}

export type ErrorKind = 'error' | 'rejection' | 'scene' | 'console';

export interface ErrorItem {
  kind: ErrorKind;
  message: string;
  stack?: string;
  scene?: string;
  count: number;
  at: number;
  breadcrumbs: Crumb[];
}

export interface ErrorContext {
  app: { version: string; platform?: string; tg?: string; lang?: string };
  device: { w?: number; h?: number; dpr?: number; ua?: string; mem?: number };
  /** Session token (sendBeacon cannot set an Authorization header). */
  token?: string | null;
  /** The scene(s) running when the error happened. */
  scene?: string;
}

export interface ErrorsPayload {
  token?: string;
  app: ErrorContext['app'];
  device: ErrorContext['device'];
  errors: ErrorItem[];
}

export interface ReporterOptions {
  /** Delivers a batch; `beacon` asks for navigator.sendBeacon (page hiding). */
  send: (payload: ErrorsPayload, beacon: boolean) => void | Promise<unknown>;
  context: () => ErrorContext;
  crumbs?: Breadcrumbs;
  now?: () => number;
  /** Schedules the delayed flush (tests pass a fake). */
  schedule?: (fn: () => void, ms: number) => unknown;
  maxPerMinute?: number;
  maxQueue?: number;
  maxSendsPerFp?: number;
  flushMs?: number;
}

export const MAX_PER_MINUTE = 10;
export const MAX_QUEUE = 10;
export const MAX_SENDS_PER_FP = 3;
export const FLUSH_MS = 4000;

/** Normalized message + top stack frame: what makes two errors "the same". */
export function fingerprint(kind: ErrorKind, message: string, stack?: string): string {
  const frame = (stack ?? '').split('\n').map((l) => l.trim()).find((l) => /:\d+:\d+/.test(l)) ?? '';
  return `${kind}|${message.replace(/\d+/g, 'N').slice(0, 200)}|${frame.replace(/:\d+:\d+\)?$/, '')}`;
}

/** Message and stack of anything thrown. */
export function describeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack };
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err)?.slice(0, 300) ?? String(err) };
  } catch {
    return { message: String(err) };
  }
}

export class ErrorReporter {
  readonly crumbs: Breadcrumbs;
  private queue = new Map<string, ErrorItem>();
  private sends = new Map<string, number>();
  private window = { start: 0, n: 0 };
  private timer: unknown = null;
  /** Errors already reported (a Phaser error is caught in the scene loop and again by window.onerror). */
  private seen = new WeakSet<object>();
  private readonly o: Required<Omit<ReporterOptions, 'crumbs'>>;

  constructor(opts: ReporterOptions) {
    this.crumbs = opts.crumbs ?? new Breadcrumbs();
    this.o = {
      now: () => Date.now(),
      schedule: (fn, ms) => setTimeout(fn, ms),
      maxPerMinute: MAX_PER_MINUTE,
      maxQueue: MAX_QUEUE,
      maxSendsPerFp: MAX_SENDS_PER_FP,
      flushMs: FLUSH_MS,
      ...opts,
    };
  }

  /** Records an error. Returns false when it was dropped (duplicate object, rate limit, per-session cap). */
  capture(err: unknown, kind: ErrorKind = 'error', scene?: string): boolean {
    try {
      if (err && typeof err === 'object') {
        if (this.seen.has(err)) return false;
        this.seen.add(err);
      }
      const { message, stack } = describeError(err);
      const fp = fingerprint(kind, message, stack);
      const now = this.o.now();
      const queued = this.queue.get(fp);
      if (queued) {
        queued.count++;
        return true;
      }
      if ((this.sends.get(fp) ?? 0) >= this.o.maxSendsPerFp) return false;
      if (now - this.window.start >= 60_000) this.window = { start: now, n: 0 };
      if (this.window.n >= this.o.maxPerMinute || this.queue.size >= this.o.maxQueue) return false;
      this.window.n++;
      this.queue.set(fp, {
        kind,
        message: scrubText(message, 1000),
        stack: stack ? scrubText(stack, 4000) : undefined,
        scene: scene ?? this.o.context().scene,
        count: 1,
        at: now,
        breadcrumbs: this.crumbs.list(),
      });
      if (this.timer === null) this.timer = this.o.schedule(() => this.flush(false), this.o.flushMs);
      return true;
    } catch {
      return false;
    }
  }

  get pending(): number {
    return this.queue.size;
  }

  /** Sends what is queued (beacon: the page is going away). */
  flush(beacon = false): void {
    this.timer = null;
    if (!this.queue.size) return;
    const items = [...this.queue.entries()];
    this.queue.clear();
    for (const [fp] of items) this.sends.set(fp, (this.sends.get(fp) ?? 0) + 1);
    try {
      const ctx = this.o.context();
      const payload: ErrorsPayload = {
        app: ctx.app,
        device: ctx.device,
        errors: items.map(([, e]) => ({ kind: e.kind, message: e.message, stack: e.stack, scene: e.scene, count: e.count, at: e.at, breadcrumbs: e.breadcrumbs })),
      };
      if (ctx.token) payload.token = ctx.token;
      const r = this.o.send(payload, beacon);
      if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => undefined);
    } catch {
      /* reporting must never break the game */
    }
  }
}

// ------------------------------------------------------------------ browser wiring

export interface InstallDeps {
  endpoint?: string;
  token: () => string | null;
  platform: () => { platform?: string; tg?: string; lang?: string };
}

let reporter: ErrorReporter | null = null;
/** The scenes currently running, for error context (set by watchGame). */
let activeScenes: () => string = () => '';

/** Breadcrumb from anywhere (no-op before installErrorCapture). */
export function breadcrumb(category: string, message: string): void {
  reporter?.crumbs.add(category, message);
}

/** Reports an error caught by the game itself (no-op before installErrorCapture). */
export function reportError(err: unknown, kind: ErrorKind = 'error'): void {
  reporter?.capture(err, kind);
}

function uaFamily(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Windows/.test(ua) ? 'windows' : /Mac OS/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'other';
  const engine = /Firefox\//.test(ua) ? 'gecko' : /Chrome\//.test(ua) ? 'chromium' : /Safari\//.test(ua) ? 'webkit' : 'other';
  return `${os}-${engine}`;
}

export function sendJson(url: string, body: unknown, beacon: boolean): Promise<unknown> | void {
  const json = JSON.stringify(body);
  if (beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(url, new Blob([json], { type: 'application/json' }))) return;
    } catch {
      /* fall back to fetch */
    }
  }
  if (typeof fetch !== 'function') return;
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, keepalive: true }).catch(() => undefined);
}

/** Installs the global handlers once. Returns the reporter. */
export function installErrorCapture(deps: InstallDeps): ErrorReporter {
  if (reporter) return reporter;
  const url = deps.endpoint ?? '/api/telemetry/errors';
  reporter = new ErrorReporter({
    send: (payload, beacon) => sendJson(url, payload, beacon),
    context: () => {
      const p = deps.platform();
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      return {
        app: { version: APP_VERSION, platform: p.platform, tg: p.tg, lang: p.lang },
        device: { w: window.innerWidth, h: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100, ua: uaFamily(), mem },
        token: deps.token(),
        scene: activeScenes() || undefined,
      };
    },
  });
  const r = reporter;
  window.addEventListener('error', (ev: ErrorEvent) => {
    // Resource load errors (img/script) have no `error` and target an element.
    if (!ev.error && !ev.message) return;
    r.capture(ev.error ?? new Error(String(ev.message)), 'error');
  });
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => r.capture(ev.reason ?? 'unhandled rejection', 'rejection'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') r.flush(true);
  });
  window.addEventListener('pagehide', () => r.flush(true));
  r.crumbs.add('app', `boot ${APP_VERSION}`);
  return r;
}

/** The parts of a Phaser.Game this module touches (no Phaser import here, for the unit tests). */
export interface GameLike {
  scene: {
    scenes: { sys: { settings: { key: string }; events: { on(ev: string, fn: () => void): unknown } } }[];
    getScenes(active: boolean): { sys: { settings: { key: string } } }[];
    update?: (time: number, delta: number) => void;
    render?: (renderer: unknown) => void;
  };
  events: { once(ev: string, fn: () => void): unknown };
}

/**
 * Scene breadcrumbs (start / shutdown of every scene) and errors thrown in
 * the scene loop, reported with the running scenes. The error is re-thrown,
 * so the game behaves exactly as before.
 */
export function watchGame(game: GameLike): void {
  activeScenes = () => {
    try {
      return game.scene
        .getScenes(true)
        .map((s) => s.sys.settings.key)
        .join('+')
        .slice(0, 40);
    } catch {
      return '';
    }
  };
  const hook = () => {
    for (const s of game.scene.scenes) {
      const key = s.sys.settings.key;
      s.sys.events.on('start', () => breadcrumb('scene', `start ${key}`));
      s.sys.events.on('shutdown', () => breadcrumb('scene', `stop ${key}`));
    }
  };
  game.events.once('ready', hook);
  const sm = game.scene;
  for (const name of ['update', 'render'] as const) {
    const orig = sm[name] as ((...a: unknown[]) => void) | undefined;
    if (typeof orig !== 'function') continue;
    (sm as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      try {
        return orig.apply(this, args);
      } catch (e) {
        reporter?.capture(e, 'scene', activeScenes() || undefined);
        throw e;
      }
    };
  }
}
