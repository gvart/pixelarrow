/**
 * Bot notification texts, English and Russian (by the player's Telegram
 * language_code), and how several events of one type are folded into one
 * message ("3 raids on your defence team").
 */
import { startParamOf, type StartRoute } from '../../../src/online/deeplink';

/** Opt-out groups (Settings → Notifications, bot /settings). */
export const NOTIFY_TYPES = ['duel', 'clan', 'season'] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export type Lang = 'en' | 'ru';
export const langOf = (code: string | null | undefined): Lang => (code && /^(ru|uk|be|kk)\b/i.test(code) ? 'ru' : 'en');

/** Template parameters of each event. */
export interface EventData {
  duel_challenge: { by: string };
  /** An async attack on the player's defence team was fought (held: the defence won). */
  duel_defence: { by: string; held: boolean };
  clan_joined: { name: string; clan: string };
  clan_role: { clan: string; role: 'leader' | 'officer' | 'member' };
  clan_kicked: { clan: string };
  season_ending: { days: number };
}
export type EventId = keyof EventData;

export const EVENT_TYPE: Record<EventId, NotifyType> = {
  duel_challenge: 'duel',
  duel_defence: 'duel',
  clan_joined: 'clan',
  clan_role: 'clan',
  clan_kicked: 'clan',
  season_ending: 'season',
};

export interface PendingEvent {
  event: EventId;
  data: Record<string, unknown>;
}

interface Rendered {
  text: string;
  button: string;
  route: StartRoute;
}

const ROLE: Record<Lang, Record<string, string>> = {
  en: { leader: 'Leader', officer: 'Officer', member: 'Member' },
  ru: { leader: 'лидер', officer: 'офицер', member: 'рядовой' },
};

const BUTTON: Record<Lang, Record<NotifyType, string>> = {
  en: { duel: '⚔ To the duels', clan: '🏛 Open the clan', season: '🏆 Hold the line' },
  ru: { duel: '⚔ К дуэлям', clan: '🏛 Открыть клан', season: '🏆 В бой' },
};

const FOOTER: Record<Lang, string> = {
  en: 'Turn these off: /settings',
  ru: 'Отключить уведомления: /settings',
};

/** One line per event (used alone, or listed when several are folded together). */
function line(lang: Lang, e: PendingEvent): string {
  const ru = lang === 'ru';
  switch (e.event) {
    case 'duel_challenge': {
      const x = e.data as unknown as EventData['duel_challenge'];
      return ru ? `⚔ ${x.by} вызывает вас на дуэль! Зайдите в игру, чтобы принять вызов.` : `⚔ ${x.by} challenges you to a duel! Come online to accept.`;
    }
    case 'duel_defence': {
      const x = e.data as unknown as EventData['duel_defence'];
      if (ru) return x.held ? `🛡 Ваша оборона отбила набег: ${x.by} отступил!` : `⚔ ${x.by} прорвал вашу оборону в дуэлях.`;
      return x.held ? `🛡 Your defence team held against ${x.by}'s raid!` : `⚔ ${x.by} broke through your duel defence.`;
    }
    case 'clan_joined': {
      const x = e.data as unknown as EventData['clan_joined'];
      return ru ? `🤝 ${x.name} вступил в клан ${x.clan} по вашему приглашению.` : `🤝 ${x.name} joined ${x.clan} through your invite.`;
    }
    case 'clan_role': {
      const x = e.data as unknown as EventData['clan_role'];
      const role = ROLE[lang][x.role] ?? x.role;
      return ru ? `🏛 Ваш ранг в клане ${x.clan}: ${role}.` : `🏛 Your rank in ${x.clan} is now: ${role}.`;
    }
    case 'clan_kicked': {
      const x = e.data as unknown as EventData['clan_kicked'];
      return ru ? `🚪 Вас исключили из клана ${x.clan}.` : `🚪 You were removed from the clan ${x.clan}.`;
    }
    case 'season_ending': {
      const x = e.data as unknown as EventData['season_ending'];
      if (ru) return x.days <= 1 ? '⏳ Сезон закончится через сутки! Удержите крепости: итоговые места и титулы считаются в конце.' : `⏳ Сезон закончится через ${x.days} дня. Удержите крепости: итоговые места и титулы считаются в конце.`;
      return x.days <= 1 ? '⏳ The season ends in 1 day! Hold your forts: final ranks and titles are counted at the end.' : `⏳ The season ends in ${x.days} days. Hold your forts: final ranks and titles are counted at the end.`;
    }
  }
}

/** Where the button of a message goes: the newest event decides. */
function routeOf(type: NotifyType, last: PendingEvent): StartRoute {
  switch (type) {
    case 'duel':
      return { kind: 'duel' };
    case 'clan':
      return last.event === 'clan_kicked' ? { kind: 'income' } : { kind: 'clan' };
    case 'season':
      return { kind: 'season' };
  }
}

/** Folds the pending events of one type (oldest first) into one message. */
export function render(lang: Lang, type: NotifyType, events: readonly PendingEvent[]): Rendered {
  const ru = lang === 'ru';
  const last = events[events.length - 1];
  let text: string;
  if (events.length === 1) text = line(lang, last);
  else if (type === 'duel' && events.every((e) => e.event === 'duel_defence')) {
    const held = events.filter((e) => e.data.held).length;
    text = ru
      ? `🛡 Набегов на вашу оборону: ${events.length}. Отбито: ${held}, проиграно: ${events.length - held}.`
      : `🛡 ${events.length} raids on your defence team. Held: ${held}, lost: ${events.length - held}.`;
  } else if (type === 'duel' && events.every((e) => e.event === 'duel_challenge')) {
    const by = [...new Set(events.map((e) => String(e.data.by)))];
    text = by.length === 1 ? line(lang, last) : ru ? `⚔ Пока вас не было, вас вызывали на дуэль: ${by.slice(0, 3).join(', ')}${by.length > 3 ? ` и ещё ${by.length - 3}` : ''}.` : `⚔ While you were away, ${by.length} commanders challenged you to duels: ${by.slice(0, 3).join(', ')}${by.length > 3 ? ` and ${by.length - 3} more` : ''}.`;
  } else if (type === 'season') {
    // only the newest one matters
    text = line(lang, last);
  } else {
    const lines = events.slice(-5).map((e) => line(lang, e));
    if (events.length > 5) lines.unshift(ru ? `…и ещё ${events.length - 5}` : `…and ${events.length - 5} more`);
    text = lines.join('\n');
  }
  return { text: `${text}\n\n${FOOTER[lang]}`, button: BUTTON[lang][type], route: routeOf(type, last) };
}

/** The web_app URL of a notification button (the client routes `startapp` on launch). */
export function buttonUrl(gameUrl: string, route: StartRoute): string {
  const base = gameUrl.replace(/\/+$/, '');
  return `${base}/?startapp=${startParamOf(route)}`;
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
