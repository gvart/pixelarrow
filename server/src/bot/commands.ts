/**
 * The bot's command menu (setMyCommands), English and Russian. Registered by
 * the cron job once per COMMANDS_VERSION (server/src/notify/jobs.ts) and by
 * the one-off script server/scripts/bot-setup.mjs, which carries the same
 * list (tests/botCommands.test.ts keeps them equal).
 */
export const COMMANDS_VERSION = 1;

export interface BotCommand {
  command: string;
  description: string;
}

export const BOT_COMMANDS: { en: BotCommand[]; ru: BotCommand[] } = {
  en: [
    { command: 'start', description: 'Play Pixelarrow' },
    { command: 'settings', description: 'Notification settings' },
    { command: 'paysupport', description: 'Help with a purchase' },
    { command: 'terms', description: 'Terms, privacy and refunds' },
    { command: 'delete_my_data', description: 'Request deletion of your data' },
  ],
  ru: [
    { command: 'start', description: 'Играть в Pixelarrow' },
    { command: 'settings', description: 'Настройки уведомлений' },
    { command: 'paysupport', description: 'Помощь с покупкой' },
    { command: 'terms', description: 'Условия, конфиденциальность, возвраты' },
    { command: 'delete_my_data', description: 'Запросить удаление данных' },
  ],
};

/** Updates the bot's webhook must receive (the README's setWebhook call uses the same list). */
export const ALLOWED_UPDATES = ['message', 'pre_checkout_query', 'callback_query'];
