/**
 * The kit's rules as pure functions (no Phaser, unit-tested in tests/mosaic.test.ts; ADR-0005):
 * badges count only actionable things (G11), must-show facts wrap and numbers are never cut (G14),
 * a clipped list shows a scroll cue (G9), no meaningful text under TEXT_MIN (A11Y-09), and a row of
 * labels shares one face and case (art bible 7.2).
 */
import { fmtNum } from '../../util/format';
import { TEXT_MIN } from '../tokens';

/**
 * What a count badge shows (art bible 7.3, audit G11): a number of things to act on, capped at "99+";
 * nothing (null) for 0, a negative or an empty value, since a badge never says there is nothing to do;
 * a non-number (the old "!") becomes a plain dot (''), a quieter "look here" than a glyph.
 */
export function badgeText(n: number | string | undefined | null): string | null {
  if (n === undefined || n === null || n === '') return null;
  if (typeof n === 'number') return n > 0 ? (n > 99 ? '99+' : `${Math.floor(n)}`) : null;
  if (/^\d+$/.test(n)) return badgeText(Number(n));
  return '';
}

/**
 * Greedy word wrap: lines of at most `maxW` by `width`; a word is never broken or cut (one wider than
 * `maxW` gets a line of its own), so a must-show fact always shows whole (G14).
 */
export function wrapWords(str: string, maxW: number, width: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of str.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (!line || width(cand) <= maxW) line = cand;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * What a chip of `room` UI px shows for `val`: the largest size from `big` down to TEXT_MIN at which it
 * fits; a whole number that does not fit at TEXT_MIN is written short (fmtNum: 1.2K, 12K), or whole when
 * under 1000, and never cut (G14, WAR-1). Only a word that does not fit even then is shortened with "…".
 */
export function chipText(val: string, room: number, big: number, width: (s: string, size: number) => number): { text: string; size: number } {
  const sizes = [big, 7, TEXT_MIN].filter((z, i, a) => z <= big && a.indexOf(z) === i);
  const fitAt = (str: string) => sizes.find((z) => width(str, z) <= room);
  const z = fitAt(val);
  if (z !== undefined) return { text: val, size: z };
  const digits = val.replace(/[,\s]/g, '');
  if (/^\d+$/.test(digits)) {
    // a number (grouped or not) is never cut: written short from 1000 up, else whole at the smallest size
    const short = Number(digits) >= 1000 ? fmtNum(Number(digits)) : val;
    return { text: short, size: fitAt(short) ?? TEXT_MIN };
  }
  let s = val;
  while (s.length > 1 && width(`${s}…`, TEXT_MIN) > room) s = s.slice(0, -1).trimEnd();
  return { text: s === val ? val : `${s}…`, size: TEXT_MIN };
}

/** Label sizes of an MButton `h` UI px tall, largest first: never under TEXT_MIN (6.5, A11Y-09; it went to 5.5). */
export function buttonLabelSizes(h: number): number[] {
  const start = h >= 30 ? 9 : h >= 26 ? 8 : 7;
  return [start, start - 0.5, start - 1, start - 1.5, start - 2, TEXT_MIN].filter((s, i, a) => s >= TEXT_MIN && a.indexOf(s) === i);
}

/**
 * The one label style of a row of segments: Cinzel capitals at 7, then 6.5, when every label fits its
 * room; then the same without the segments' icons (a label matters more than its icon); else Inter in
 * sentence case, with icons, then without; a label that still does not fit is cut by the caller. Never
 * capitals beside sentence case in one row (art bible 7.2). `room`: with its icon; `bare`: without.
 */
export function switchLabelStyle(
  items: readonly { label: string; room: number; bare?: number }[],
  measure: (text: string, face: 'roman' | 'body', size: number) => number,
): { face: 'roman' | 'body'; size: number; icons: boolean } {
  const tries: { face: 'roman' | 'body'; size: number; icons: boolean }[] = [];
  for (const face of ['roman', 'body'] as const) for (const icons of [true, false]) for (const size of [7, TEXT_MIN]) tries.push({ face, size, icons });
  for (const st of tries)
    if (items.every((it) => measure(st.face === 'roman' ? it.label.toUpperCase() : it.label, st.face, st.size) <= (st.icons ? it.room : it.bare ?? it.room))) return st;
  return { face: 'body', size: TEXT_MIN, icons: false };
}

/** A segment of a switch as `switchLayout` sizes it: its label, whether it has an icon, whether that icon is a lock (always kept). */
export interface SwitchItem {
  label: string;
  icon: boolean;
  lock?: boolean;
}

/**
 * The segments' widths and their one label style across `total` UI px (V5-063: a tab keeps its whole name
 * at every width). The styles of `switchLabelStyle` in its order (Cinzel 7, 6.5, without icons, then
 * Inter): for each, equal segments when every label fits one, else segments as wide as their labels
 * (and icons) with the leftover space shared equally; the next style only when neither fits. Only when
 * no style fits even label-sized is a label cut (the widths then follow the labels' share of the room). `iconW`: an icon and
 * its gap; `pad`: the segment's inner margin, both sides together; `min`: the narrowest a segment may be
 * (its touch target).
 */
export function switchLayout(
  items: readonly SwitchItem[],
  total: number,
  measure: (text: string, face: 'roman' | 'body', size: number) => number,
  iconW: number,
  pad = 6,
  min = 0,
): { face: 'roman' | 'body'; size: number; icons: boolean; widths: number[] } {
  const n = items.length;
  const seg = Math.floor(total / n);
  const text = (it: SwitchItem, face: 'roman' | 'body') => (face === 'roman' ? it.label.toUpperCase() : it.label);
  const need = (st: { face: 'roman' | 'body'; size: number; icons: boolean }) =>
    items.map((it) => Math.max(min, Math.ceil(measure(text(it, st.face), st.face, st.size)) + ((st.icons && it.icon) || it.lock ? iconW : 0) + pad));
  const share = (ws: number[]): number[] => {
    const sum = ws.reduce((a, b) => a + b, 0);
    // too little room even so: every segment keeps its minimum, the rest goes by how much more each label needs
    const out = sum <= total ? ws.map((w) => Math.floor(w + (total - sum) / n)) : ws.map((w) => Math.floor(min + ((w - min) * (total - n * min)) / Math.max(1, sum - n * min)));
    out[n - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  };
  for (const face of ['roman', 'body'] as const)
    for (const icons of [true, false])
      for (const size of [7, TEXT_MIN]) {
        const ws = need({ face, size, icons });
        if (ws.every((w) => w <= seg)) return { face, size, icons, widths: items.map(() => seg) };
        if (ws.reduce((a, b) => a + b, 0) <= total) return { face, size, icons, widths: share(ws) };
      }
  const last = { face: 'body' as const, size: TEXT_MIN, icons: false };
  return { ...last, widths: share(need(last)) };
}

/**
 * The scroll cue of a clipped list (G9): which edges hide content. `below` while the list is not at its
 * end, `above` once it has scrolled; 1 UI px of slack so a rounding remainder shows no cue.
 */
export function scrollCue(scroll: number, max: number): { above: boolean; below: boolean } {
  return { above: max > 1 && scroll > 1, below: max > 1 && scroll < max - 1 };
}
