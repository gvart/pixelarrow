/**
 * How the game writes a count. The one number formatter: chips, sheets, cards
 * and the hubs all write numbers through it (F-07 merged DUE-01's `fmtCount`
 * and EC-01's `groupDigits`).
 */
import { lang, type Lang } from './index';

/**
 * A whole number with its thousands grouped: "1,500" and "12,400" in English;
 * "1500" and "12 400" in Russian, where the separator is a space (never a
 * comma) and four-digit numbers stay whole (Russian typesetting). A plain
 * space, not U+00A0: the UI fonts have no glyph for the no-break space, which
 * drew as nothing ("12450").
 */
export function fmtCount(n: number, l: Lang = lang()): string {
  const v = Math.round(n);
  const digits = String(Math.abs(v));
  const grouped = l === 'ru' && digits.length <= 4 ? digits : digits.replace(/\B(?=(\d{3})+(?!\d))/g, l === 'ru' ? ' ' : ',');
  return v < 0 ? `-${grouped}` : grouped;
}
