/**
 * Measure-based text fitting for the UI typeface (src/art/vectorFont.ts).
 * Pure functions (no Phaser), so they run in unit tests: every language's
 * strings are measured the same way the bitmap text renders them.
 *
 * Widths are in UI pixels at the base size (7 px cap height); pass `size` for
 * scaled titles. Text renders in the case it is given (the font has lower case).
 */
import { advance, type Face } from '../art/vectorFont';

export const BASE_FONT_SIZE = 7;
export const ELLIPSIS = '…';

/** Rendered width of one line. `shadow`: fonts drawn with a 1 px drop shadow (light, gold, title). */
export function measureText(str: string, shadow = false, size = BASE_FONT_SIZE, face: Face = 'body'): number {
  let w = 0;
  let n = 0;
  for (const ch of str) {
    const g = advance(ch, face);
    if (g < 0) continue;
    w += g;
    n++;
  }
  if (n === 0) return 0;
  return Math.ceil(((w + (shadow ? 0.5 : 0)) * size) / BASE_FONT_SIZE);
}

/** Characters the pixel font cannot draw (they would silently vanish). */
export function missingGlyphs(str: string): string[] {
  const out = new Set<string>();
  for (const ch of str) if (ch !== '\n' && advance(ch) < 0) out.add(ch);
  return [...out];
}

/** Shorten one line to `maxW`, ending in "…". Returns the line unchanged when it fits. */
export function ellipsize(str: string, maxW: number, shadow = false, size = BASE_FONT_SIZE, face: Face = 'body'): string {
  if (measureText(str, shadow, size, face) <= maxW) return str;
  const chars = [...str];
  while (chars.length > 0) {
    chars.pop();
    const s = chars.join('').trimEnd() + ELLIPSIS;
    if (measureText(s, shadow, size, face) <= maxW) return s;
  }
  return measureText(ELLIPSIS, shadow, size, face) <= maxW ? ELLIPSIS : '';
}

export interface WrapResult {
  lines: string[];
  /** Some text was cut (the last line ends in "…"). */
  truncated: boolean;
}

/**
 * Word-wrap to `maxW`, at most `maxLines` lines (0 = unlimited). Words longer
 * than a line are broken. Explicit "\n" starts a new line.
 */
export function wrapText(str: string, maxW: number, maxLines = 0, shadow = false, size = BASE_FONT_SIZE): WrapResult {
  const lines: string[] = [];
  const fits = (s: string) => measureText(s, shadow, size) <= maxW;
  // Never break inside a word ("15 Drachm / ae"): a word wider than the line
  // gets a line of its own and ends in "…" (the caller should shrink or
  // abbreviate; `truncated` tells it, and Label / tips show the whole text).
  let cut = false;
  for (const para of str.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (fits(cand)) {
        line = cand;
        continue;
      }
      if (line) lines.push(line);
      if (fits(word)) {
        line = word;
        continue;
      }
      const short = ellipsize(word, maxW, shadow, size);
      cut = true;
      // (a width narrower than "…" keeps the first character, so the line is never empty)
      lines.push(short || [...word][0]);
      line = '';
    }
    if (line || !lines.length) lines.push(line);
  }
  if (maxLines > 0 && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const chars = [...kept[maxLines - 1]];
    while (chars.length > 0 && !fits(chars.join('').trimEnd() + ELLIPSIS)) chars.pop();
    kept[maxLines - 1] = chars.join('').trimEnd() + ELLIPSIS;
    return { lines: kept, truncated: true };
  }
  return { lines, truncated: cut };
}

/** True when `str` wraps into `maxW` without cutting any word (every word fits a line on its own). */
export function wrapsWhole(str: string, maxW: number, maxLines = 0, shadow = false, size = BASE_FONT_SIZE): boolean {
  return !wrapText(str, maxW, maxLines, shadow, size).truncated;
}

/** Line height of the pixel font in UI pixels (glyphs 7-8 px + spacing). */
export const LINE_H = 10;
