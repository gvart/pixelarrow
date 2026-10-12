/**
 * How the game writes a number. The one number formatter: chips, sheets, cards
 * and the hubs all write numbers through it (F-07 merged DUE-01's `fmtCount`
 * and EC-01's `groupDigits`; LOC-01 added the decimals).
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

/**
 * A number with at most `dp` decimals and no trailing zeros: "10.5", "0.05",
 * "8" in English; "10,5", "0,05", "8" in Russian (a decimal comma). Display
 * only: sim and save values never pass through it.
 */
export function fmtDecimal(n: number, dp: number, l: Lang = lang()): string {
  const f = 10 ** dp;
  const r = Math.round(n * f) / f;
  const s = dp > 0 ? r.toFixed(dp).replace(/\.?0+$/, '') : String(r);
  const out = s === '-0' ? '0' : s;
  return l === 'ru' ? out.replace('.', ',') : out;
}

/**
 * The decimal points of a text already written ("+0.05 s", "8.5"), as the
 * language writes them: commas in Russian. For the texts the pure game
 * modules format (item mod lines, forge and shop stat lines), which run on
 * the server too and so do not know the language. Only a point between two
 * digits changes.
 */
export function localDecimals(text: string, l: Lang = lang()): string {
  return l === 'ru' ? text.replace(/(\d)\.(\d)/g, '$1,$2') : text;
}
