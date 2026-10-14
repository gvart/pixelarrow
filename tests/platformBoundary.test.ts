/**
 * The platform rule (ADR-0006, V5-076) as a test: game code talks to the
 * platform only through src/platform (the facade), src/platform/core and the
 * neutral services, and never checks which platform it runs on.
 *
 * ALLOWLIST holds the files not migrated yet, with the rules each still breaks.
 * It may only shrink: the test fails when a listed file stops breaking a listed
 * rule, so the entry must be removed in the same change. M10 empties and deletes it.
 */
import { describe, expect, it } from 'vitest';

// The client tsconfig has no Node types: reach node:fs untyped (as tests/trainReplay.test.ts does).
const fs = (await import('node:fs' as string)) as {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: 'utf8'): string;
  statSync(p: string): { isDirectory(): boolean };
};

type Rule = 1 | 2 | 3 | 4 | 5;

/** vitest runs from the repo root. */
const ROOT = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
const ADAPTERS = /^src\/platform\/(telegram|web|steam|mobile)\//;

/** Files not yet moved off the old seams (today's importers of the telegram.ts shim and online.available). */
const ALLOWLIST: Record<string, Rule[]> = {
  // rule 4: the retired names (the shim itself, until M10)
  'src/platform/telegram.ts': [4],
};

/** Repo-relative paths of the .ts files under dir. */
function walk(dir: string): string[] {
  return fs.readdirSync(`${ROOT}/${dir}`).flatMap((n) => {
    const p = `${dir}/${n}`;
    return fs.statSync(`${ROOT}/${p}`).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** The code without comments, line by line (a comment may name a retired API). */
function codeLines(src: string): string[] {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'));
}

const IMPORT_ADAPTER = /(from\s+|import\s*\()\s*['"][^'"]*platform\/(?:(?:telegram|web|steam|mobile)(?:\/[^'"]*)?|detect)['"]/;
const TELEGRAM_GLOBALS = /window\.Telegram\b|Telegram\.WebApp\b|TelegramWebviewProxy|telegram-web-app\.js/;
const PLATFORM_CHECK = /\bplatform\.id\b|===?\s*'(?:telegram|web)'|'(?:telegram|web)'\s*===?/;
const RETIRED = /\b(?:inTelegram|initTelegram|telegramInitData)\b|\bonline\.available\b/;
const ADAPTER_REACHES_GAME = /^\s*import\s+(?!type\b)[^;]*from\s+['"][^'"]*\/(?:scenes|ui|online|duel|game)\//;

/** Every (file, rule, line) that breaks the platform rule. */
function violations(): { file: string; rule: Rule; line: number; text: string }[] {
  const out: { file: string; rule: Rule; line: number; text: string }[] = [];
  for (const file of walk('src')) {
    const inPlatform = file.startsWith('src/platform/');
    const inTelegramAdapter = file.startsWith('src/platform/telegram/');
    const isAdapter = ADAPTERS.test(file);
    codeLines(fs.readFileSync(`${ROOT}/${file}`, 'utf8')).forEach((text, i) => {
      const hit = (rule: Rule) => out.push({ file, rule, line: i + 1, text: text.trim() });
      if (!inPlatform && IMPORT_ADAPTER.test(text)) hit(1);
      if (!inTelegramAdapter && TELEGRAM_GLOBALS.test(text)) hit(2);
      if (!inPlatform && PLATFORM_CHECK.test(text)) hit(3);
      if (!inTelegramAdapter && RETIRED.test(text)) hit(4);
      if (isAdapter && ADAPTER_REACHES_GAME.test(text)) hit(5);
    });
  }
  return out;
}

describe('platform boundary (ADR-0006)', () => {
  const found = violations();

  it('no file outside the allowlist breaks the platform rule', () => {
    const fresh = found.filter((v) => !ALLOWLIST[v.file]?.includes(v.rule));
    expect(fresh.map((v) => `rule ${v.rule}: ${v.file}:${v.line}  ${v.text}`)).toEqual([]);
  });

  it('the allowlist only shrinks: every listed file still breaks every listed rule', () => {
    const stale = Object.entries(ALLOWLIST).flatMap(([file, rules]) => rules.filter((r) => !found.some((v) => v.file === file && v.rule === r)).map((r) => `${file} no longer breaks rule ${r}: remove it from ALLOWLIST`));
    expect(stale).toEqual([]);
  });

  it('catches each kind of violation', () => {
    expect(IMPORT_ADAPTER.test(`import { createWebPlatform } from '../platform/web/index';`)).toBe(true);
    expect(IMPORT_ADAPTER.test(`import { haptic } from '../platform/telegram';`)).toBe(true);
    expect(IMPORT_ADAPTER.test(`import { detectPlatformId } from '../platform/detect';`)).toBe(true);
    expect(IMPORT_ADAPTER.test(`const m = await import('../../platform/telegram');`)).toBe(true);
    expect(IMPORT_ADAPTER.test(`import { platform } from '../platform';`)).toBe(false);
    expect(IMPORT_ADAPTER.test(`import { haptic } from '../platform/haptics';`)).toBe(false);
    expect(IMPORT_ADAPTER.test(`import type { Insets } from '../platform/core/safeArea';`)).toBe(false);
    expect(TELEGRAM_GLOBALS.test(`const wa = window.Telegram?.WebApp;`)).toBe(true);
    expect(PLATFORM_CHECK.test(`if (platform.id === 'web') return;`)).toBe(true);
    expect(PLATFORM_CHECK.test(`if (kind === 'telegram') x();`)).toBe(true);
    expect(RETIRED.test(`if (!online.available) return;`)).toBe(true);
    expect(RETIRED.test(`if (inTelegram()) share();`)).toBe(true);
    expect(ADAPTER_REACHES_GAME.test(`import { t } from '../../ui/lang';`)).toBe(true);
    expect(ADAPTER_REACHES_GAME.test(`import type { KV } from '../../game/save';`)).toBe(false);
  });
});
