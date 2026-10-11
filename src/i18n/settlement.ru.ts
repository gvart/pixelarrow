import type { SETTLEMENT_EN } from './settlement.en';
import type { Entry } from './index';

/** Поселение v5 (SET-01): вкладка «Услуги» с наставником, отмена найма, карточка добровольца, разграбленный город. */
export const SETTLEMENT_RU: Record<keyof typeof SETTLEMENT_EN, Entry> = {
  'set.tab.services': 'Услуги',
  'set.undo': 'Отменить',
  'set.undone': '{name} отпущен домой: {n} золота возвращено',
  'set.volunteer': 'Доброволец',
  'set.sacked': 'Разграблен войском',
  'set.closed': 'Ворота закрыты',
  'set.reopens': {
    one: 'Откроется через {n} день',
    few: 'Откроется через {n} дня',
    many: 'Откроется через {n} дней',
    other: 'Откроется через {n} дня',
  },
  'set.servicesStay': 'Услуги по-прежнему открыты.',
  'set.provisions': 'Припасы',
  'set.foodHave': 'Пайков: {n}',
  'set.supHave': 'Снаряжения: {n}',
  'set.physician': 'Лекарь',
  'set.physicianSub': {
    one: 'Вылечить {n} раненого сейчас',
    few: 'Вылечить всех {n} раненых сейчас',
    many: 'Вылечить всех {n} раненых сейчас',
    other: 'Вылечить всех {n} раненых сейчас',
  },
  'set.noPatients': 'Раненых нет',
  'set.drill': 'Наставник',
  'set.drillSub': 'Переучить перк · {n} з × ступень',
  'set.drillFree': {
    one: '{n} бесплатное переучивание',
    few: '{n} бесплатных переучивания',
    many: '{n} бесплатных переучиваний',
    other: '{n} бесплатного переучивания',
  },
  'set.drillGo': 'Выбрать',
  'set.drillTip': 'Выберите воина, затем ступень перка',
  'set.drillNone': 'Ни у кого ещё нет перка для переучивания',
  'set.buyBody': '{name} за {n} золота. У вас {gold}.',
  'set.strong': 'Силён против',
  'set.weak': 'Слаб против',
};
