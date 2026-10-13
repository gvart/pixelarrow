/**
 * The platform rule (ADR-0006, V5-076) as a test: game code talks to the
 * platform only through src/platform (the facade), src/platform/core and the
 * neutral services, and never checks which platform it runs on.
 *
 * ALLOWLIST holds the files not migrated yet, with the rules each still breaks.
 * It may only shrink: the test fails when a listed file stops breaking a listed
 * rule, so the entry must be removed in the same change. M10 empties and deletes it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rule = 1 | 2 | 3 | 4 | 5;

const ROOT = join(__dirname, '..');
const ADAPTERS = /^src\/platform\/(telegram|web|steam|mobile)\//;

/** Files not yet moved off the old seams (today's importers of the telegram.ts shim and online.available). */
const ALLOWLIST: Record<string, Rule[]> = {
  // rule 1: imports src/platform/telegram (the M1 shim); M2 (haptics), M3, M5, M7, M8 move them
  'src/audio/hooks.ts': [1],
  'src/audio/index.ts': [1],
  'src/scenes/ArmyScene.ts': [1],
  'src/scenes/BattleScene.ts': [1],
  'src/scenes/BootScene.ts': [1, 4],
  'src/scenes/CampScene.ts': [1],
  'src/scenes/FirstRunScene.ts': [1],
  'src/scenes/HeroScene.ts': [1],
  'src/scenes/MarketScene.ts': [1],
  'src/scenes/ResultsScene.ts': [1],
  'src/scenes/SettlementScene.ts': [1],
  'src/scenes/ShopScene.ts': [1],
  'src/scenes/WorldScene.ts': [1],
  'src/scenes/duel/DuelScene.ts': [1],
  'src/scenes/online/ClanScene.ts': [1, 4],
  'src/scenes/online/MerchantScene.ts': [1],
  'src/scenes/online/OnlineArmyScene.ts': [1],
  'src/scenes/online/OnlineScene.ts': [1],
  'src/state.ts': [1],
  'src/ui/battlePanel.ts': [1],
  'src/ui/duelInvites.ts': [1],
  'src/ui/econ/consumablePicker.ts': [1],
  'src/ui/econ/source.ts': [1, 4],
  'src/ui/kit.ts': [1],
  'src/ui/lang.ts': [1],
  'src/ui/mosaic/Pager.ts': [1],
  'src/ui/mosaic/StatTile.ts': [1],
  'src/ui/notifySettings.ts': [1],
  'src/ui/results/arcVictory.ts': [1],
  'src/ui/results/tile.ts': [1],
  'src/ui/settings.ts': [1],
  'src/ui/sheets/encounter.ts': [1],
  'src/ui/sheets/eventCard.ts': [1],
  'src/ui/tutorial/battleTutorial.ts': [1],
  'src/ui/tutorial/onlineCoach.ts': [1],
  'src/ui/widgets.ts': [1],
  // rule 4: online.available (M6) and the retired names (the shim itself, until M10)
  'src/online/client.ts': [4],
  'src/duel/client.ts': [4],
  'src/platform/cloud.ts': [4],
  'src/platform/telegram.ts': [4],
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
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
  for (const abs of walk(join(ROOT, 'src'))) {
    const file = relative(ROOT, abs).split('\\').join('/');
    const inPlatform = file.startsWith('src/platform/');
    const inTelegramAdapter = file.startsWith('src/platform/telegram/');
    const isAdapter = ADAPTERS.test(file);
    codeLines(readFileSync(abs, 'utf8')).forEach((text, i) => {
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
