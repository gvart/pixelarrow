/**
 * How the game writes a count. The one number formatter: chips, sheets, cards
 * and the hubs all write numbers through it (F-07 merged DUE-01's `fmtCount`
 * and EC-01's `groupDigits`).
 */
import { lang, type Lang } from './index';

/** The no-break space between digit groups in Russian: a number never wraps over two lines. */
const NBSP = ' ';

/**
 * A whole number with its thousands grouped: "1,500" and "12,400" in English;
 * "1500" and "12 400" in Russian, where the separator is a no-break space
 * (never a comma) and four-digit numbers stay whole (Russian typesetting).
 */
export function fmtCount(n: number, l: Lang = lang()): string {
  const v = Math.round(n);
  const digits = String(Math.abs(v));
  const grouped = l === 'ru' && digits.length <= 4 ? digits : digits.replace(/\B(?=(\d{3})+(?!\d))/g, l === 'ru' ? NBSP : ',');
  return v < 0 ? `-${grouped}` : grouped;
}
