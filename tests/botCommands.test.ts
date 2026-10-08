import { describe, expect, it } from 'vitest';
import { ALLOWED_UPDATES, BOT_COMMANDS } from '../server/src/bot/commands';
// @ts-expect-error plain .mjs script without types
import * as script from '../server/scripts/bot-setup.mjs';

describe('bot command menu', () => {
  it('the one-off setup script registers the same commands as the Worker', () => {
    expect(script.BOT_COMMANDS).toEqual(BOT_COMMANDS);
    expect(script.ALLOWED_UPDATES).toEqual(ALLOWED_UPDATES);
  });

  it('English and Russian list the same commands with Telegram-valid names and descriptions', () => {
    expect(BOT_COMMANDS.ru.map((c) => c.command)).toEqual(BOT_COMMANDS.en.map((c) => c.command));
    for (const c of [...BOT_COMMANDS.en, ...BOT_COMMANDS.ru]) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeGreaterThanOrEqual(1);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
    expect(BOT_COMMANDS.en.map((c) => c.command)).toEqual(expect.arrayContaining(['paysupport', 'terms', 'settings']));
  });
});
