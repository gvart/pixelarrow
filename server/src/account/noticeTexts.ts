/**
 * Account notice texts by bot, English and Russian (by the player's Telegram
 * language_code): what is left of the bot's notification texts.
 */

export type Lang = 'en' | 'ru';
export const langOf = (code: string | null | undefined): Lang => (code && /^(ru|uk|be|kk)\b/i.test(code) ? 'ru' : 'en');

/** The web_app URL of an account notice's button: the game's Settings → Account (`startapp=account`). */
export function accountButtonUrl(gameUrl: string): string {
  return `${gameUrl.replace(/\/+$/, '')}/?startapp=account`;
}

/**
 * Account notices by bot (V6-LINK-02; ADR-0009 §2.4, §4, M-LK-4): one message
 * per identity change. They are security notices, so they skip the outbox's
 * opt-outs, quiet hours and coalescing (account/notices.ts sends them at once).
 */
export type AccountNotice = 'email_added' | 'email_changed' | 'email_removed' | 'telegram_removed' | 'account_deleted' | 'telegram_linked' | 'link_conflict' | 'link_cancelled';

const ACCOUNT_NOTICE: Record<Lang, Record<AccountNotice, string>> = {
  en: {
    email_added: '🔐 An email and password were added to your Pixelarrow account, so it can also be played in a browser. Not you? Open Settings → Account.',
    email_changed: '🔐 The email of your Pixelarrow account was changed. Not you? Open Settings → Account.',
    email_removed: '🔐 The email was removed from your Pixelarrow account, and browser sessions were signed out. Not you? Open Settings → Account.',
    telegram_removed: '🔐 This Telegram account was unlinked from your Pixelarrow account. The bot will stop messaging you. Opening the game here again starts a new, empty account.',
    account_deleted: '🗑 Your Pixelarrow account was deleted. Opening the game again starts a new, empty account.',
    telegram_linked: '🔐 This Telegram account was linked to your Pixelarrow account: the game here now plays it. Not you? Open Settings → Account.',
    link_conflict: '🔐 A web Pixelarrow account asks to link this Telegram account, and both have progress. Open the game to choose which account to keep, or tap "Not me". Nothing changes until you choose.',
    link_cancelled: '🔐 The Telegram link you started was cancelled in Telegram ("Not me"). Nothing was linked.',
  },
  ru: {
    email_added: '🔐 К вашему аккаунту Pixelarrow добавлены почта и пароль: теперь в него можно играть и в браузере. Это были не вы? Откройте Настройки → Аккаунт.',
    email_changed: '🔐 Почта вашего аккаунта Pixelarrow изменена. Это были не вы? Откройте Настройки → Аккаунт.',
    email_removed: '🔐 Почта удалена из вашего аккаунта Pixelarrow, в браузерах выполнен выход. Это были не вы? Откройте Настройки → Аккаунт.',
    telegram_removed: '🔐 Этот Telegram отвязан от вашего аккаунта Pixelarrow. Бот больше не будет вам писать. Если открыть игру здесь снова, начнётся новый, пустой аккаунт.',
    account_deleted: '🗑 Ваш аккаунт Pixelarrow удалён. Если открыть игру снова, начнётся новый, пустой аккаунт.',
    telegram_linked: '🔐 Этот Telegram привязан к вашему аккаунту Pixelarrow: игра здесь теперь открывает его. Это были не вы? Откройте Настройки → Аккаунт.',
    link_conflict: '🔐 Веб-аккаунт Pixelarrow просит привязать этот Telegram, и в обоих аккаунтах есть прогресс. Откройте игру и выберите, какой аккаунт оставить, или нажмите «Это не я». Без вашего выбора ничего не изменится.',
    link_cancelled: '🔐 Начатая вами привязка Telegram отменена в Telegram («Это не я»). Ничего не привязано.',
  },
};

const ACCOUNT_BUTTON: Record<Lang, string> = { en: '⚙ Settings', ru: '⚙ Настройки' };

/** The bot text of an account notice; a Settings button only while the chat still belongs to the account. */
export function renderAccountNotice(lang: Lang, kind: AccountNotice): { text: string; button: string | null } {
  const linked = kind === 'email_added' || kind === 'email_changed' || kind === 'email_removed' || kind === 'telegram_linked' || kind === 'link_conflict';
  return { text: ACCOUNT_NOTICE[lang][kind], button: linked ? ACCOUNT_BUTTON[lang] : null };
}
