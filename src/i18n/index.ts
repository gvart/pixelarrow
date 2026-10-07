/**
 * Translations (docs/DESIGN_V2.md "Localization"): English and Russian.
 *
 *   t('menu.continue')                    -> "Continue" / "Продолжить"
 *   t('common.day', { n: 3 })             -> "Day 3"
 *   t('common.heroes', { n: 5 })          -> "5 heroes" / "5 героев" (plural by `n`)
 *
 * The language comes from (first match): a `?lang=en|ru` URL parameter (tests,
 * screenshots), the player's setting (`settings.lang`, 'auto' = detect), the
 * Telegram user's `language_code`, the browser language. Scenes are rebuilt
 * after `setLang` (see `applyLangChange` in src/ui/settings.ts).
 *
 * Strings live in en.ts (the source, typed) and ru.ts (must have every key:
 * tests/i18n.test.ts). Data names (items, classes, perks) are translated with
 * `tOr('item.<id>.name', def.name)`: an English fallback until a key exists.
 */
import { EN } from './en';
import { RU } from './ru';
import { DATA_RU } from './data.ru';

export type Lang = 'en' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'ru'];
/** Player setting: a language or 'auto' (Telegram / browser language). */
export type LangSetting = Lang | 'auto';

export interface PluralForms {
  one?: string;
  few?: string;
  many?: string;
  other: string;
}
export type Entry = string | PluralForms;
export type TKey = keyof typeof EN;
export type Table = Record<TKey, Entry>;
export type Params = Record<string, string | number>;

const TABLES: Record<Lang, Table> = { en: EN as unknown as Table, ru: RU };

let current: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

/** CLDR plural category for `n` in `lang` (integers; fractions use `other`). */
export function pluralForm(lang: Lang, n: number): keyof PluralForms {
  if (!Number.isInteger(n)) return 'other';
  const a = Math.abs(n);
  if (lang === 'ru') {
    const d = a % 10;
    const h = a % 100;
    if (d === 1 && h !== 11) return 'one';
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'few';
    return 'many';
  }
  return a === 1 ? 'one' : 'other';
}

function format(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

function resolve(lang: Lang, key: string, params?: Params): string | undefined {
  const e = (TABLES[lang] as Record<string, Entry>)[key];
  if (e === undefined) return undefined;
  if (typeof e === 'string') return format(e, params);
  const n = Number(params?.n ?? params?.count ?? 0);
  const form = pluralForm(lang, n);
  return format(e[form] ?? e.other, params);
}

/** Translate `key` into the current language (falls back to English, then the key itself). */
export function t(key: TKey, params?: Params): string {
  return resolve(current, key, params) ?? resolve('en', key, params) ?? key;
}

/**
 * Names and descriptions of game data per language (data.ru.ts); English
 * uses the data itself (the `fallback` of tOr).
 */
const DATA: Partial<Record<Lang, Record<string, string>>> = { ru: DATA_RU };

/** Translate a dynamic key (e.g. built from a data id), with an explicit fallback. */
export function tOr(key: string, fallback: string, params?: Params): string {
  const d = DATA[current]?.[key];
  return resolve(current, key, params) ?? (d !== undefined ? format(d, params) : undefined) ?? resolve('en', key, params) ?? format(fallback, params);
}

/** The data translation table of a language (tests). */
export function dataTable(l: Lang): Record<string, string> {
  return DATA[l] ?? {};
}

/** Does a dynamic key exist (in English, the source table)? */
export function hasKey(key: string): key is TKey {
  return key in EN;
}

export function lang(): Lang {
  return current;
}

/** Switch language; listeners (e.g. scene rebuilds) run when it changes. */
export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  for (const cb of listeners) cb(l);
}

export function onLangChange(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Map an IETF tag ("ru", "ru-RU", "be", "en-GB") to a supported language. */
export function langFromTag(tag: string | null | undefined): Lang | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  if (base === 'ru' || base === 'be' || base === 'kk' || base === 'ky') return 'ru';
  if (base === 'en') return 'en';
  return null;
}

/** Pick the language: URL override > setting > Telegram > browser > English. */
export function detectLang(opts: { url?: string | null; setting?: LangSetting | null; telegram?: string | null; browser?: readonly string[] | null }): Lang {
  const fromUrl = opts.url ? langFromTag(opts.url) : null;
  if (fromUrl) return fromUrl;
  if (opts.setting && opts.setting !== 'auto' && LANGS.includes(opts.setting)) return opts.setting;
  const tg = langFromTag(opts.telegram);
  if (tg) return tg;
  for (const b of opts.browser ?? []) {
    const l = langFromTag(b);
    if (l) return l;
  }
  return 'en';
}

/** Every string of a table, flattened (plural forms included), for tests and font checks. */
export function allStrings(l: Lang): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const [key, e] of Object.entries(TABLES[l])) {
    if (typeof e === 'string') out.push({ key, text: e });
    else for (const v of Object.values(e)) if (v) out.push({ key, text: v });
  }
  return out;
}

export function table(l: Lang): Table {
  return TABLES[l];
}

/**
 * Reverse lookup for the layout check: which key produced this (upper-cased)
 * on-screen text, in any language. Lets the allowlist name elements by key
 * instead of by language-specific text.
 */
let reverse: Map<string, string> | null = null;
export function keyOfText(text: string): string | undefined {
  if (!reverse) {
    reverse = new Map();
    for (const l of LANGS)
      for (const { key, text: s } of allStrings(l)) if (!/\{\w+\}/.test(s)) reverse.set(s.toUpperCase(), key);
  }
  return reverse.get(text.toUpperCase());
}
