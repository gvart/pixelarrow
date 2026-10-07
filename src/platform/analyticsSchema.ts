/**
 * Product analytics event allowlist, shared by the client (src/platform/
 * analytics.ts) and the Worker (server/src/telemetry/analytics.ts).
 *
 * Every event is one Workers Analytics Engine data point in the
 * `pixelarrow_events` dataset (docs/OPS.md "Analytics"):
 *
 *   index1  = player id (string; "0" when unknown)  — the sampling key
 *   blob1   = event name        blob2 = source ('client' | 'server')
 *   blob3   = platform          blob4 = app version (git sha)
 *   blob5.. = the event's string props, in the order declared below
 *   double1 = player id         double2 = days since install (-1 unknown)
 *   double3.. = the event's number props, in the order declared below
 *
 * Nothing here may carry personal data: no names, usernames, Telegram ids,
 * free text. Strings are enums or short [a-z0-9_] ids; numbers are bounded.
 */

export type PropSpec =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'id' }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'bool' };

export interface EventSpec {
  /** Who may emit it: the client through POST /api/telemetry/events, or only the server. */
  source: 'client' | 'server' | 'both';
  /** String props (blob5, blob6, ...), in order. bool props are stored as '1' / '0'. */
  strings?: Record<string, PropSpec>;
  /** Number props (double3, double4, ...), in order. */
  numbers?: Record<string, PropSpec>;
}

const int = (min: number, max: number): PropSpec => ({ kind: 'int', min, max });
const en = (...values: string[]): PropSpec => ({ kind: 'enum', values });

export const BATTLE_MODES = ['offline', 'trial', 'online', 'beast', 'boss', 'duel', 'ladder'] as const;
export const BATTLE_RESULTS = ['win', 'loss', 'draw'] as const;

export const ANALYTICS_EVENTS = {
  /** Client boot (once per app launch). */
  session_start: { source: 'client', strings: { tg: { kind: 'id' }, lang: en('en', 'ru', 'other') }, numbers: {} },
  /** Server: first sign-in of a new player. */
  install: { source: 'server' },
  /** Server: first sign-in on calendar day 1 / 7 after install (UTC), from players.created_at and last_seen_at. */
  return_d1: { source: 'server' },
  return_d7: { source: 'server' },
  tutorial_step: { source: 'client', strings: { id: { kind: 'id' } }, numbers: { step: int(0, 99) } },
  tutorial_complete: { source: 'client', numbers: { ms: int(0, 86_400_000) } },
  tutorial_skip: { source: 'client', strings: { id: { kind: 'id' } }, numbers: { step: int(0, 99) } },
  /** Server-derived once per player (analytics_milestones) from the first battle_result. */
  first_battle: { source: 'server', strings: { mode: en(...BATTLE_MODES) } },
  /** Offline battles are reported by the client; online, beast, boss and duel results by the server. */
  battle_result: { source: 'both', strings: { mode: en(...BATTLE_MODES), result: en(...BATTLE_RESULTS) }, numbers: { ticks: int(0, 1_000_000) } },
  online_join: { source: 'server', numbers: { shard: int(0, 1_000_000), season: int(0, 1_000_000) } },
  /** Server: the player opened the duel mode for the first time (docs/DUELS.md). */
  duel_join: { source: 'server' },
  /** Server-derived once per player: their first hex captured from a neutral or a player. */
  first_capture: { source: 'server' },
  clan_join: { source: 'server', strings: { how: en('create', 'invite') } },
  /** A Drachmae pack (or legacy entitlement) paid with Telegram Stars. */
  purchase: { source: 'server', strings: { pack: { kind: 'id' } }, numbers: { drachmae: int(0, 10_000_000), stars: int(0, 1_000_000) } },
  first_purchase: { source: 'server', strings: { pack: { kind: 'id' } } },
  pass_claim: { source: 'server', strings: { track: en('free', 'premium') }, numbers: { tier: int(0, 1000) } },
  market_list: { source: 'server', strings: { kind: en('item', 'resource', 'consumable'), currency: en('gold', 'drachmae') }, numbers: { price: int(0, 1_000_000_000) } },
  market_buy: { source: 'server', strings: { kind: en('item', 'resource', 'consumable'), currency: en('gold', 'drachmae') }, numbers: { price: int(0, 1_000_000_000) } },
} as const satisfies Record<string, EventSpec>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;
export type ClientEvent = { [K in AnalyticsEvent]: (typeof ANALYTICS_EVENTS)[K]['source'] extends 'server' ? never : K }[AnalyticsEvent];

type SpecValue<S> = S extends { kind: 'int' } ? number : S extends { kind: 'bool' } ? boolean : S extends { kind: 'enum'; values: readonly (infer V)[] } ? V : string;
type PropsOfSpec<T> = { [K in keyof T]?: SpecValue<T[K]> };
type Strs<E extends AnalyticsEvent> = (typeof ANALYTICS_EVENTS)[E] extends { strings: infer S } ? PropsOfSpec<S> : unknown;
type Nums<E extends AnalyticsEvent> = (typeof ANALYTICS_EVENTS)[E] extends { numbers: infer N } ? PropsOfSpec<N> : unknown;
/** The props an event accepts (all optional; unknown keys are dropped). */
export type EventProps<E extends AnalyticsEvent> = Strs<E> & Nums<E>;

export const ID_RE = /^[a-z0-9_.-]{1,40}$/;
/** Max string / number props per event (Analytics Engine allows 20 blobs and 20 doubles). */
export const MAX_PROPS = 6;

export interface NormalizedEvent {
  event: AnalyticsEvent;
  strings: string[];
  numbers: number[];
}

function checkValue(spec: PropSpec, v: unknown): string | number | null {
  switch (spec.kind) {
    case 'enum':
      return typeof v === 'string' && spec.values.includes(v) ? v : null;
    case 'id':
      return typeof v === 'string' && ID_RE.test(v) ? v : null;
    case 'int':
      return typeof v === 'number' && Number.isFinite(v) ? Math.max(spec.min, Math.min(spec.max, Math.round(v))) : null;
    case 'bool':
      return typeof v === 'boolean' ? (v ? '1' : '0') : null;
  }
}

/**
 * Validates an event against the allowlist. Returns null for an unknown event
 * (or one this source may not send); bad or unknown props are dropped (an
 * empty string / -1 takes their slot, so columns never shift).
 */
export function normalizeEvent(event: string, props: unknown, from: 'client' | 'server'): NormalizedEvent | null {
  if (!Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, event)) return null;
  const spec = ANALYTICS_EVENTS[event as AnalyticsEvent] as EventSpec;
  if (from === 'client' && spec.source === 'server') return null;
  const p = props && typeof props === 'object' && !Array.isArray(props) ? (props as Record<string, unknown>) : {};
  const strings = Object.entries(spec.strings ?? {}).map(([k, s]) => {
    const v = checkValue(s, p[k]);
    return v === null ? '' : String(v);
  });
  const numbers = Object.entries(spec.numbers ?? {}).map(([k, s]) => {
    const v = checkValue(s, p[k]);
    return typeof v === 'number' ? v : -1;
  });
  return { event: event as AnalyticsEvent, strings, numbers };
}

/** Removes things that look like secrets or personal data from free text (error messages, stacks). */
export function scrubText(s: string, max = 1000): string {
  return s
    .replace(/((?:token|initdata|init_data|hash|auth\w*|signature|password|secret|bearer)[=:\s"]+)[^\s&"',;)]+/gi, '$1<redacted>')
    .replace(/\b(?:pa1\.)?[A-Za-z0-9_-]{32,}(?:\.[A-Za-z0-9_-]{16,})*\b/g, '<redacted>')
    .replace(/(https?:\/\/[^\s?#)'"]*)[?#][^\s)'"]*/g, '$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .slice(0, max);
}
