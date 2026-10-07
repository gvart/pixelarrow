/**
 * Bot notification texts, English and Russian (by the player's Telegram
 * language_code), and how several events of one type are folded into one
 * message ("3 attacks on your land in the last hour").
 */
import { startParamOf, type StartRoute } from '../../../src/online/deeplink';

/** Opt-out groups (Settings → Notifications, bot /settings). */
export const NOTIFY_TYPES = ['attack', 'march', 'income', 'duel', 'clan', 'boss', 'season', 'market'] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export type Lang = 'en' | 'ru';
export const langOf = (code: string | null | undefined): Lang => (code && /^(ru|uk|be|kk)\b/i.test(code) ? 'ru' : 'en');

/** Template parameters of each event. */
export interface EventData {
  attack_start: { q: number; r: number; by: string; ticket: string };
  attack_captured: { q: number; r: number; by: string; ticket: string };
  attack_held: { q: number; r: number; by: string; ticket: string };
  march_arrived: { q: number; r: number };
  income_full: Record<string, never>;
  duel_challenge: { by: string };
  /** An async attack on the player's defence team was fought (held: the defence won). */
  duel_defence: { by: string; held: boolean };
  clan_joined: { name: string; clan: string };
  clan_role: { clan: string; role: 'leader' | 'officer' | 'member' };
  clan_kicked: { clan: string };
  boss_slain: { boss: string; q: number; r: number; share: number; items: number };
  season_ending: { days: number };
  market_sold: { what: string; price: number; currency: 'gold' | 'drachmae'; gets: number };
}
export type EventId = keyof EventData;

export const EVENT_TYPE: Record<EventId, NotifyType> = {
  attack_start: 'attack',
  attack_captured: 'attack',
  attack_held: 'attack',
  march_arrived: 'march',
  income_full: 'income',
  duel_challenge: 'duel',
  duel_defence: 'duel',
  clan_joined: 'clan',
  clan_role: 'clan',
  clan_kicked: 'clan',
  boss_slain: 'boss',
  season_ending: 'season',
  market_sold: 'market',
};

export interface PendingEvent {
  event: EventId;
  data: Record<string, unknown>;
}

export interface Rendered {
  text: string;
  button: string;
  route: StartRoute;
}

const hex = (d: { q: number; r: number }) => `(${d.q}, ${d.r})`;
const cur = (lang: Lang, c: string) => (c === 'drachmae' ? (lang === 'ru' ? 'драхм' : 'Drachmae') : lang === 'ru' ? 'золота' : 'gold');
const ROLE: Record<Lang, Record<string, string>> = {
  en: { leader: 'Leader', officer: 'Officer', member: 'Member' },
  ru: { leader: 'лидер', officer: 'офицер', member: 'рядовой' },
};
const BOSS: Record<Lang, Record<string, string>> = {
  en: { kraken: 'Kraken', titan: 'Titan' },
  ru: { kraken: 'Кракен', titan: 'Титан' },
};

const BUTTON: Record<Lang, Record<NotifyType, string>> = {
  en: { attack: '🛡 To the war table', march: '🗺 Open the map', income: '💰 Collect', duel: '⚔ To the duels', clan: '🏛 Open the clan', boss: '🎁 See the loot', season: '🏆 Hold the line', market: '🪙 Marketplace' },
  ru: { attack: '🛡 К военному столу', march: '🗺 Открыть карту', income: '💰 Собрать', duel: '⚔ К дуэлям', clan: '🏛 Открыть клан', boss: '🎁 К добыче', season: '🏆 В бой', market: '🪙 Рынок' },
};

export const FOOTER: Record<Lang, string> = {
  en: 'Turn these off: /settings',
  ru: 'Отключить уведомления: /settings',
};

/** One line per event (used alone, or listed when several are folded together). */
function line(lang: Lang, e: PendingEvent): string {
  const ru = lang === 'ru';
  switch (e.event) {
    case 'attack_start': {
      const x = e.data as unknown as EventData['attack_start'];
      return ru ? `⚔ ${x.by} атакует ваш гекс ${hex(x)}!` : `⚔ ${x.by} is attacking your hex ${hex(x)}!`;
    }
    case 'attack_captured': {
      const x = e.data as unknown as EventData['attack_captured'];
      return ru ? `🔥 ${x.by} захватил ваш гекс ${hex(x)}.` : `🔥 ${x.by} captured your hex ${hex(x)}.`;
    }
    case 'attack_held': {
      const x = e.data as unknown as EventData['attack_held'];
      return ru ? `🛡 Ваш гарнизон на ${hex(x)} отбил атаку: ${x.by} отступил!` : `🛡 Your garrison at ${hex(x)} held against ${x.by}!`;
    }
    case 'march_arrived': {
      const x = e.data as unknown as EventData['march_arrived'];
      return ru ? `🏁 Ваше войско прибыло на ${hex(x)}.` : `🏁 Your army has arrived at ${hex(x)}.`;
    }
    case 'income_full':
      return ru
        ? '💰 Казна полна: ваши земли собрали доход за 24 часа. Соберите его, иначе новый доход не копится.'
        : '💰 Your treasury is full: your lands have gathered 24 hours of income. Collect it, or new income goes to waste.';
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
    case 'boss_slain': {
      const x = e.data as unknown as EventData['boss_slain'];
      const name = BOSS[lang][x.boss] ?? x.boss;
      const pct = Math.max(1, Math.round(x.share * 100));
      return ru
        ? `🐙 ${name} повержен! Ваша доля добычи: ${pct}%, предметов: ${x.items}. Они уже на вашем складе.`
        : `🐙 The ${name} has been slain! Your share of the hoard: ${pct}%, ${x.items} ${x.items === 1 ? 'item' : 'items'}. ${x.items === 1 ? 'It is' : 'They are'} in your stash.`;
    }
    case 'season_ending': {
      const x = e.data as unknown as EventData['season_ending'];
      if (ru) return x.days <= 1 ? '⏳ Сезон закончится через сутки! Удержите крепости: итоговые места и титулы считаются в конце.' : `⏳ Сезон закончится через ${x.days} дня. Удержите крепости: итоговые места и титулы считаются в конце.`;
      return x.days <= 1 ? '⏳ The season ends in 1 day! Hold your forts: final ranks and titles are counted at the end.' : `⏳ The season ends in ${x.days} days. Hold your forts: final ranks and titles are counted at the end.`;
    }
    case 'market_sold': {
      const x = e.data as unknown as EventData['market_sold'];
      return ru
        ? `🪙 Продан ваш лот «${x.what}» за ${x.price} ${cur(lang, x.currency)}. Вы получили ${x.gets} ${cur(lang, x.currency)}.`
        : `🪙 Your listing "${x.what}" sold for ${x.price} ${cur(lang, x.currency)}. You received ${x.gets} ${cur(lang, x.currency)}.`;
    }
  }
}

/** Where the button of a message goes: the newest event decides. */
function routeOf(type: NotifyType, last: PendingEvent): StartRoute {
  const d = last.data as { q?: number; r?: number };
  switch (type) {
    case 'attack':
    case 'march':
      return typeof d.q === 'number' && typeof d.r === 'number' ? { kind: 'hex', q: d.q, r: d.r } : { kind: 'income' };
    case 'boss':
      return typeof d.q === 'number' && typeof d.r === 'number' ? { kind: 'boss', q: d.q, r: d.r } : { kind: 'income' };
    case 'income':
      return { kind: 'income' };
    case 'duel':
      return { kind: 'duel' };
    case 'clan':
      return last.event === 'clan_kicked' ? { kind: 'income' } : { kind: 'clan' };
    case 'season':
      return { kind: 'season' };
    case 'market':
      return { kind: 'market' };
  }
}

/** Folds the pending events of one type (oldest first) into one message. */
export function render(lang: Lang, type: NotifyType, events: readonly PendingEvent[]): Rendered {
  const ru = lang === 'ru';
  const last = events[events.length - 1];
  let text: string;
  if (events.length === 1) text = line(lang, last);
  else if (type === 'attack') {
    const attacks = new Map<string, string[]>();
    for (const e of events) {
      const k = String(e.data.ticket ?? Math.random());
      attacks.set(k, [...(attacks.get(k) ?? []), e.event]);
    }
    const n = attacks.size;
    if (n === 1) text = line(lang, last);
    else {
      let lost = 0;
      let held = 0;
      for (const evs of attacks.values()) {
        if (evs.includes('attack_captured')) lost++;
        else if (evs.includes('attack_held')) held++;
      }
      text = ru
        ? `⚔ Атак на ваши земли за последний час: ${n}. Потеряно гексов: ${lost}, отбито атак: ${held}.`
        : `⚔ ${n} attacks on your land in the last hour. Hexes lost: ${lost}, attacks held: ${held}.`;
    }
  } else if (type === 'duel' && events.every((e) => e.event === 'duel_defence')) {
    const held = events.filter((e) => e.data.held).length;
    text = ru
      ? `🛡 Набегов на вашу оборону: ${events.length}. Отбито: ${held}, проиграно: ${events.length - held}.`
      : `🛡 ${events.length} raids on your defence team. Held: ${held}, lost: ${events.length - held}.`;
  } else if (type === 'duel' && events.every((e) => e.event === 'duel_challenge')) {
    const by = [...new Set(events.map((e) => String(e.data.by)))];
    text = by.length === 1 ? line(lang, last) : ru ? `⚔ Пока вас не было, вас вызывали на дуэль: ${by.slice(0, 3).join(', ')}${by.length > 3 ? ` и ещё ${by.length - 3}` : ''}.` : `⚔ While you were away, ${by.length} commanders challenged you to duels: ${by.slice(0, 3).join(', ')}${by.length > 3 ? ` and ${by.length - 3} more` : ''}.`;
  } else if (type === 'market') {
    const sum = { gold: 0, drachmae: 0 };
    for (const e of events) sum[(e.data.currency === 'drachmae' ? 'drachmae' : 'gold') as 'gold' | 'drachmae'] += Number(e.data.gets) || 0;
    const parts = [sum.gold ? `+${sum.gold} ${cur(lang, 'gold')}` : '', sum.drachmae ? `+${sum.drachmae} ${cur(lang, 'drachmae')}` : ''].filter(Boolean).join(', ');
    text = ru ? `🪙 Продано ваших лотов: ${events.length}. Выручка: ${parts}.` : `🪙 ${events.length} of your listings sold: ${parts}.`;
  } else if (type === 'season' || type === 'income' || type === 'march') {
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
