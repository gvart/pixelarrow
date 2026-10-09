/**
 * Shared text formatting for times and numbers (no Phaser). Unit-tested in
 * tests/format.test.ts.
 */
import { t } from '../i18n';

/** "1:05" from seconds (rounded, never negative). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "12m 30s", "2h 05m" from milliseconds (localized). */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('online.time.s', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 && m < 10 ? t('online.time.ms', { m, s: s % 60 }) : t('online.time.m', { m });
  const h = Math.floor(m / 60);
  if (h < 48) return t('online.time.hm', { h, m: m % 60 });
  return t('online.time.d', { d: Math.floor(h / 24), h: h % 24 });
}

/** Short time since `at`, for wallet history: "3d", "5h", "0m". */
export function fmtAgo(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** "3h ago" of a time `ms` milliseconds in the past (localized, at least one minute). */
export function fmtAgoText(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60_000));
  if (m < 60) return t('duels.ago.m', { n: m });
  if (m < 1440) return t('duels.ago.h', { n: Math.floor(m / 60) });
  return t('duels.ago.d', { n: Math.floor(m / 1440) });
}

/** 999, 1.2K, 12K. */
export function fmtNum(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return `${v}`;
  if (v < 10_000) return `${(Math.floor(v / 100) / 10).toString()}K`;
  return `${Math.floor(v / 1000)}K`;
}

/** A change with its sign, always: "+15", "-5", "0" (ASCII minus: the bundled faces have no U+2212). Rewards read as "Win +15 · Loss +5", never "a loss 5". */
export function fmtSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `-${-n}`;
  return '0';
}
