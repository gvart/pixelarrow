/**
 * Display-name and clan-name rules (ADR-0009 §6, M-DN-3, M-DN-5). Pure and
 * dependency-free so the client can import it for instant feedback; the
 * server is authoritative and runs it on every write.
 */
import { BLOCKLIST } from './blocklist';
import { RESERVED } from './reserved';

export type NameReason = 'length' | 'chars' | 'mixed_script' | 'reserved' | 'blocked';
export type NameCheck = { ok: true; name: string; key: string } | { ok: false; reason: NameReason };

/**
 * Look-alike digits, `i` (with `1` and `l`), and Cyrillic letters that look
 * like Latin ones in either case.
 */
const FOLD: Record<string, string> = {
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', i: 'l',
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'l', ј: 'j', ѕ: 's',
};

/**
 * The uniqueness key (`players.display_name_key`): lower-cased, without spaces,
 * `_` and `-`, look-alikes folded, so `Adm1n`, `AdmIn` and `admin` collide, and so do
 * a Cyrillic `Сосо` and a Latin `Coco`.
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[013457iавеёкмнорстухіјѕ]/g, (ch) => FOLD[ch]);
}

const LETTER = 'A-Za-z\\u0400-\\u04FF';
/** Letters and digits in runs joined by one space, `_` or `-`. */
const SHAPE = new RegExp(`^[${LETTER}0-9]+(?:[ _-][${LETTER}0-9]+)*$`);
const HAS_LETTER = new RegExp(`[${LETTER}]`);
const LATIN = /[A-Za-z]/;
const CYRILLIC = /[\u0400-\u04FF]/;

const RESERVED_KEYS = RESERVED.map((w) => ({ key: nameKey(w), anywhere: [...w].length >= 5 }));
const BLOCKED_KEYS = BLOCKLIST.map(nameKey);

function check(raw: string, min: number, max: number): NameCheck {
  const name = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const length = [...name].length;
  if (length < min || length > max) return { ok: false, reason: 'length' };
  if (!SHAPE.test(name) || !HAS_LETTER.test(name)) return { ok: false, reason: 'chars' };
  if (LATIN.test(name) && CYRILLIC.test(name)) return { ok: false, reason: 'mixed_script' };
  const key = nameKey(name);
  if (RESERVED_KEYS.some((r) => (r.anywhere ? key.includes(r.key) : key === r.key))) return { ok: false, reason: 'reserved' };
  if (BLOCKED_KEYS.some((b) => key.includes(b))) return { ok: false, reason: 'blocked' };
  return { ok: true, name, key };
}

/** A player's public name: 3–16 characters. */
export function validateDisplayName(raw: string): NameCheck {
  return check(raw, 3, 16);
}

/** A clan name (public on the war board): the same rules with 3–20 characters. */
export function validateClanName(raw: string): NameCheck {
  return check(raw, 3, 20);
}
