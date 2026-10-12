// Types for doors.mjs (read by tests/regression/doors.test.ts; the project's tsconfig has no allowJs).
export interface Door {
  name: string;
  hub: 'campaign' | 'duels' | 'war' | 'codex' | 'shop';
  from: [string, Record<string, unknown>];
  prep?: string;
  via: { tap: string } | { start: [string, Record<string, unknown>] } | { call: string };
  at: string;
  origin: string | null;
  back: string;
  state?: string;
}
export const ELSEWHERE: Readonly<Record<string, string>>;
export const DOORS: readonly Door[];
export const TABS: readonly [string, string][];
