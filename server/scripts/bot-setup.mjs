#!/usr/bin/env node
/**
 * One-off bot setup (the Worker's cron does the command menu by itself after a
 * deploy, server/src/notify/jobs.ts; run this to do it by hand or to change
 * the webhook):
 *   - setMyCommands in English (default) and Russian
 *   - with TELEGRAM_WEBHOOK_SECRET also set: setWebhook to
 *     https://pixelarrow.app/api/telegram/webhook (or WEBHOOK_URL) with the
 *     allowed updates the bot needs (message, pre_checkout_query, callback_query)
 *
 * Usage: TELEGRAM_BOT_TOKEN=... [TELEGRAM_WEBHOOK_SECRET=...] node server/scripts/bot-setup.mjs
 * Keep the lists equal to server/src/bot/commands.ts (tests/botCommands.test.ts checks).
 */
export const BOT_COMMANDS = {
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
export const ALLOWED_UPDATES = ['message', 'pre_checkout_query', 'callback_query'];

async function call(token, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(`${method}: ${body.description ?? res.status}`);
  return body.result;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Set TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }
  await call(token, 'setMyCommands', { commands: BOT_COMMANDS.en });
  await call(token, 'setMyCommands', { commands: BOT_COMMANDS.ru, language_code: 'ru' });
  console.log('commands set (en, ru)');
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const url = process.env.WEBHOOK_URL || 'https://pixelarrow.app/api/telegram/webhook';
    await call(token, 'setWebhook', { url, secret_token: secret, allowed_updates: ALLOWED_UPDATES });
    console.log('webhook set:', url, ALLOWED_UPDATES.join(', '));
  }
  console.log(await call(token, 'getWebhookInfo', {}));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
