/**
 * The browser globals an adapter may touch. Each adapter factory takes them
 * injected, so its tests run in vitest's Node environment with fakes. Every
 * member is optional: a missing global means "not available here".
 */
type Listener = (e: Event) => void;

export interface EnvEvents {
  addEventListener(type: string, cb: Listener, opts?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, cb: Listener, opts?: boolean | EventListenerOptions): void;
}

export interface EnvMediaQuery {
  readonly matches: boolean;
  addEventListener?(type: 'change', cb: () => void): void;
}

export interface EnvWindow extends EnvEvents {
  readonly location: { readonly hash: string; readonly search: string };
  readonly innerWidth: number;
  readonly innerHeight: number;
  open?(url: string, target?: string, features?: string): unknown;
  matchMedia?(query: string): EnvMediaQuery;
  readonly history?: { pushState(data: unknown, unused: string): void; back(): void };
}

export interface EnvDocument extends EnvEvents {
  readonly visibilityState?: string;
  readonly head?: { appendChild(el: unknown): unknown };
  createElement?(tag: 'script'): { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null };
}

export interface EnvNavigator {
  share?(data: { url?: string; text?: string }): Promise<void>;
  readonly clipboard?: { writeText(s: string): Promise<void> };
  readonly keyboard?: { getLayoutMap(): Promise<{ forEach(cb: (label: string, code: string) => void): void }> };
}

/** The subset of the DOM Storage the adapters use. */
export interface EnvKVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface PlatformEnv {
  readonly window?: EnvWindow;
  readonly document?: EnvDocument;
  readonly navigator?: EnvNavigator;
  /** null where localStorage is missing or blocked (private mode, sandboxed frames). */
  readonly localStorage?: EnvKVStore | null;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}
