/** Russian strings. Same keys and parameters as en.ts; plurals use one / few / many / other. */
import { TUTORIAL_RU } from './tutorial.ru';
import type { Table } from './index';
import { BATTLE_RU } from './battle.ru';
import { RU_ARMY } from './ru.army';
import { BEASTS_RU } from './beasts.ru';
import { DUELS_RU } from './duels.ru';
import { MERCHANT_RU } from './merchant.ru';
import { CLAN_RU } from './clan.ru';
import { FIELDCAMP_RU } from './fieldcamp.ru';
import { OCAMP_RU } from './camp.ru';
import { STRAT_RU } from './strat.ru';
import { CAMPSCENE_RU } from './campscene.ru';
import { V3_RU } from './v3.ru';
import { V4_RU } from './v4.ru';
import { MOSAIC_RU } from './mosaic.ru';
import { MOSAIC_CMAP_RU } from './mosaic.campaignmap.ru';
import { MOSAIC_WAR_RU } from './mosaic.war.ru';
import { TARGETING_RU } from './targeting.ru';
import { UNDO_RU } from './undo.ru';
import { WORKS_RU } from './works.ru';
import { READOUT_RU } from './readout.ru';
import { QUEUE_RU } from './queue.ru';
import { ATTENTION_RU } from './attention.ru';
import { HUB_RU } from './hub.ru';
import { FIRSTRUN_RU } from './firstrun.ru';
import { ARMY_V5_RU } from './army.v5.ru';
import { HERO_RU } from './hero.ru';
import { SETTINGS_RU } from './settings.ru';
import { CODEX_RU } from './codex.ru';
import { WHY_RU } from './why.ru';
import { PACE_RU } from './pace.ru';
import { EVENTS_RU } from './events.ru';
import { EVENTCARD_RU } from './eventcard.ru';
import { SHOP_V5_RU } from './shop.v5.ru';
import { RESULTS_RU } from './results.ru';
import { WORLD_V5_RU } from './world.v5.ru';
import { CAMP_V5_RU } from './camp.v5.ru';
import { SETTLEMENT_RU } from './settlement.ru';
import { FORGE_RU } from './forge.ru';
import { ARC_RU } from './arc.ru';
import { DUELS_V5_RU } from './duels.v5.ru';
import { GAPS_RU } from './gaps.ru';
import { INPUT_RU } from './input.ru';
import { CONTROLS_RU } from './controls.ru';
import { ACCOUNT_RU } from './account.ru';

export const RU: Table = {
  'common.ok': 'ОК',
  'common.cancel': 'Отмена',
  'common.close': 'Закрыть',
  'common.back': 'Назад',
  'common.stay': 'Остаться',
  'common.confirm': 'Подтвердить',
  'common.on': 'Вкл',
  'common.off': 'Выкл',
  'common.yes': 'Да',
  'common.no': 'Нет',
  'common.loading': 'Загрузка...',
  'common.retry': 'Повторить',
  'common.gold': 'Золото',
  'common.day': 'День {n}',
  'common.level': 'Уровень {n}',
  'common.heroes': { one: '{n} герой', few: '{n} героя', many: '{n} героев', other: '{n} героя' },
  'common.items': { one: '{n} предмет', few: '{n} предмета', many: '{n} предметов', other: '{n} предмета' },
  'common.seconds': { one: '{n} секунда', few: '{n} секунды', many: '{n} секунд', other: '{n} секунды' },
  'common.minutes': { one: '{n} минута', few: '{n} минуты', many: '{n} минут', other: '{n} минуты' },

  'kit.tapForMore': 'Нажмите, чтобы читать',
  'kit.more': 'Ещё',
  'kit.less': 'Свернуть',
  'kit.disabled': 'Сейчас недоступно',
  'kit.empty.title': 'Здесь пока пусто',
  'kit.scrollHint': 'Листайте дальше',
  'kit.confirm.title': 'Вы уверены?',

  'rarity.common': 'Обычный',
  'rarity.uncommon': 'Необычный',
  'rarity.rare': 'Редкий',
  'rarity.epic': 'Эпический',
  'rarity.legendary': 'Легендарный',

  'slot.weapon': 'Оружие',
  'slot.shield': 'Щит',
  'slot.helmet': 'Шлем',
  'slot.armor': 'Доспех',
  'slot.trinket': 'Амулет',
  'res.gold': 'Золото',
  'res.food': 'Еда',
  'res.wood': 'Дерево',
  'res.bronze': 'Бронза',
  'res.recruits': 'Рекруты',
  'res.drachmae': 'Драхмы',

  'battle.cat.movement': 'Движение',
  'battle.cat.attack': 'Атака',
  'battle.cat.formation': 'Строй',
  'battle.cat.abilities': 'Умения',

  'menu.subtitle': 'Щиты Срединного моря',
  'menu.continue': 'Продолжить',
  'menu.newCampaign': 'Новый поход',
  'menu.online': 'Онлайн',
  'menu.shop': 'Лавка',
  'menu.settings': 'Настройки',
  'menu.cloudSave': 'Облачное сохранение',
  'menu.cloudSaveOf': 'Облако - {name}',
  'menu.localSave': 'Локальное сохранение',
  'menu.resetTitle': 'Новый поход?',
  'menu.resetBody': 'Ваше войско, склад и карта будут потеряны навсегда.',
  'menu.resetOk': 'Начать',
  'menu.noSave': 'Сохранённого похода нет: начните новый.',
  'save.corrupt': 'Сохранение не удалось прочитать. Его копия сохранена, начат новый поход.',
  'save.newer': 'Сохранение сделано более новой версией игры. Закройте и откройте игру, чтобы обновить её. До тех пор ничего не сохраняется.',
  'battle.abandoned': 'Игра закрылась во время битвы, и битва доиграна с приказами, отданными до её начала.',
  'menu.tip.gold': 'Золото похода в казне',
  'menu.tip.army': 'Герои в войске',
  'menu.warband': 'Войско',
  'menu.tip.warband': { one: 'Войско похода: {n} человек. У дуэлей свои герои (Дуэли → Отряд).', few: 'Войско похода: {n} человека. У дуэлей свои герои (Дуэли → Отряд).', many: 'Войско похода: {n} человек. У дуэлей свои герои (Дуэли → Отряд).', other: 'Войско похода: {n} человека. У дуэлей свои герои (Дуэли → Отряд).' },
  'menu.tip.day': 'Дней в походе',
  'menu.tip.record': 'Победы / битвы похода',

  'online.reloadForUpdate': 'Вышла новая версия игры. Перезапустите игру, чтобы играть по сети.',
  'online.bar.clan': 'Клан',
  'online.bar.collect': 'Собрать',
  'result.notCounted': 'Бой не засчитан',
  'result.taken': 'Гекс взят!',
  'result.victory': 'Победа',
  'result.defeat': 'Поражение',
  'result.wave': 'Осада {wins}/{needed}: идёт новая волна',
  'result.slain': 'Врагов убито: {dead}/{total}',
  'result.gold': 'Золото +{n}',
  'result.goldPlunder': 'Золото +{n} (добыча {p})',
  'result.loot': 'Трофеи: {n} в обоз',
  'result.fallen': 'Пали: {names}',
  'result.wounded': 'Ранены: {n} (отдых 2 ч)',
  'result.levelUp': 'Новый уровень: {names}',
  'result.verified': 'Проверено сервером',
  'duel.over': 'Дуэль окончена',
  'duel.desync': 'Битвы разошлись. Дуэль не засчитана.',
  'duel.left': '{name} покинул дуэль.',
  'duel.cancelled': 'Дуэль отменена.',
  'duel.won': 'Дуэль выиграна!',
  'duel.drawn': 'Ничья',
  'duel.lost': 'Дуэль проиграна',
  'duel.vs': 'против: {name}',
  'duel.differs': 'Повтор на сервере не совпал!',
  'duel.friendly': 'Дружеская дуэль: без потерь.',
  'duel.noAnswer': 'Сервер не ответил.',
  'duel.lobby': 'Игроки в сети',
  'duel.connecting': 'Подключение...',
  'duel.nobody': 'Сейчас здесь никого. Позовите клан!',
  'duel.busy': 'Занят',
  'duel.challenge': 'Вызвать',
  'duel.cancel': 'Отменить',
  'duel.lobbyNote': 'Дружеские дуэли: ничего не теряется.',
  'duel.challenged': 'Вызов!',
  'duel.challengesYou': '{name} вызывает вас на дружескую дуэль.',
  'duel.decline': 'Отказать',
  'duel.fight': 'В бой',
  'duel.preparing': 'Готовим поле боя...',
  'duel.closed.declined': 'Вызов отклонён',
  'duel.closed.expired': 'Вызов истёк',
  'duel.closed.unavailable': 'Вызов недоступен',
  'duel.closed.cancelled': 'Вызов отменён',
  'def.militia': 'Ополчение и разбойники',
  'def.beasts': 'Волки и кабаны',
  'def.outlaws': 'Лучники-изгои',
  'def.tribes': 'Горные племена',
  'def.pirates': 'Пираты',
  'def.deserters': 'Наёмники-дезертиры',
  'def.city': 'Городской гарнизон',
  'def.cultists': 'Культисты и фанатики',
  'def.beast': 'Мифический зверь',
  'online.time.s': '{s} с',
  'online.time.m': '{m} мин',
  'online.time.ms': '{m} мин {s} с',
  'online.time.hm': '{h} ч {m} мин',
  'online.time.d': '{d} дн. {h} ч',
  'online.time.h': '{h} ч',
  'num.k': '{n}К',
  'online.time.dd': '{d} дн.',
  'settings.title': 'Настройки',
  'settings.pauseContact': 'Пауза при первом контакте',
  'settings.pauseFlank': 'Пауза при обходе с фланга',
  'settings.pauseRout': 'Пауза при бегстве отряда',
  'settings.pauseDeath': 'Пауза при гибели героя',
  'settings.haptics': 'Вибрация',
  'settings.dmgNumbers': 'Числа урона',
  'settings.analytics': 'Статистика игры',
  'settings.sound': 'Звук',
  'settings.music': 'Музыка',
  'settings.effects': 'Эффекты',
  'settings.language': 'Язык',
  'settings.lang.auto': 'Авто',
  'settings.lang.en': 'English',
  'settings.lang.ru': 'Русский',
  'settings.tab.game': 'Игра',
  'settings.tab.audio': 'Звук',
  'settings.tab.language': 'Язык',
  'settings.volumeDown': 'Тише',
  'settings.volumeUp': 'Громче',
  'settings.notifications': 'Уведомления',
  'settings.about': 'Об игре',
  'settings.open': 'Открыть',
  'notify.title': 'Уведомления',
  'notify.note': 'Сообщения от бота Pixelarrow в Telegram.',
  'notify.blocked': 'Бот не может вам написать. Откройте его в Telegram и отправьте /start.',
  'notify.offline': 'Уведомления настраиваются, когда вы вошли в аккаунт и есть связь.',
  'notify.failed': 'Не удалось сохранить. Попробуйте ещё раз.',
  'notify.quiet': 'Тихо ночью',
  'notify.type.duel': 'Дуэли',
  'notify.type.clan': 'Клан',
  'notify.type.season': 'Конец сезона',
  'about.title': 'Об игре',
  'about.note': 'Покупки являются цифровыми товарами. Помощь с покупкой: /paysupport в боте.',
  'about.terms': 'Условия игры',
  'about.privacy': 'Конфиденциальность',
  'about.refunds': 'Возвраты',

  ...BATTLE_RU,
  ...TUTORIAL_RU,
  ...RU_ARMY,
  // ---- mythical beasts, the Beast trial, world bosses (beasts.ru.ts)
  ...BEASTS_RU,
  ...DUELS_RU,
  ...MERCHANT_RU,
  ...CLAN_RU,
  ...FIELDCAMP_RU,
  ...OCAMP_RU,
  ...CAMPSCENE_RU,
  ...STRAT_RU,
  ...V3_RU,
  ...V4_RU,
  // ---- the v4 Mosaic & Parchment chrome (mosaic.ru.ts)
  ...MOSAIC_RU,
  ...MOSAIC_CMAP_RU,
  ...MOSAIC_WAR_RU,
  ...TARGETING_RU,
  ...UNDO_RU,
  ...WORKS_RU,
  // ---- the battle readout: morale glyph, bar labels, Flanked! (readout.ru.ts)
  ...READOUT_RU,
  ...QUEUE_RU,
  ...ATTENTION_RU,
  ...HUB_RU,
  ...FIRSTRUN_RU,
  ...ARMY_V5_RU,
  ...HERO_RU,
  ...SETTINGS_RU,
  ...CODEX_RU,
  ...WHY_RU,
  ...PACE_RU,
  // ---- overland events: the deck's text (events.ru.ts) and the event card and journal (eventcard.ru.ts)
  ...EVENTS_RU,
  ...EVENTCARD_RU,
  ...SHOP_V5_RU,
  ...WORLD_V5_RU,
  ...CAMP_V5_RU,
  ...RESULTS_RU,
  ...SETTLEMENT_RU,
  ...FORGE_RU,
  ...ARC_RU,
  ...DUELS_V5_RU,
  ...GAPS_RU,
  ...INPUT_RU,
  ...CONTROLS_RU,
  ...ACCOUNT_RU,
};
