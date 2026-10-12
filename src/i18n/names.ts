/**
 * Hero and captain names as the language writes them (LOC-01). Saves and the
 * server keep a hero's generated name in Latin letters (src/data/names.ts);
 * the screens show it through `heroName`, which gives the conventional
 * Russian form ("Epameinon II" -> "Эпаминонд II"). A name the table does not
 * know (a player's own, a clan's) is shown as it is.
 */
import { CLASSES } from '../data/classes';
import { dataTable, lang, type Lang } from './index';

/**
 * Every name of src/data/names.ts NAMES (tests/heroNames.test.ts holds the
 * two lists together), in the Russian tradition for Greek, Punic and Gaulish
 * names (Brasidas -> Брасид, Hasdrubal -> Гасдрубал, Brennos -> Бренн).
 * Every form is distinct, so two heroes never share a shown name.
 */
export const NAMES_RU: Readonly<Record<string, string>> = {
  // Greek
  Lysandros: 'Лисандр', Nikias: 'Никий', Damon: 'Дамон', Kleon: 'Клеон', Brasidas: 'Брасид', Leonidas: 'Леонид',
  Phokion: 'Фокион', Iason: 'Ясон', Timon: 'Тимон', Dexios: 'Дексий', Kallias: 'Каллий', Aristos: 'Арист',
  Menon: 'Менон', Theron: 'Ферон', Philon: 'Филон', Agis: 'Агис', Lykos: 'Лик', Doros: 'Дор',
  Xanthos: 'Ксанф', Myron: 'Мирон', Pyrrhos: 'Пирр', Glaukos: 'Главк', Straton: 'Стратон', Eudoros: 'Евдор',
  Alkimos: 'Алким', Demaratos: 'Демарат', Euthymos: 'Евфим', Hippias: 'Гиппий', Kimon: 'Кимон', Laches: 'Лахет',
  Meleagros: 'Мелеагр', Nearchos: 'Неарх', Orestes: 'Орест', Pausanias: 'Павсаний', Sostratos: 'Сострат', Telamon: 'Теламон',
  Akakios: 'Акакий', Charmides: 'Хармид', Diokles: 'Диокл', Epameinon: 'Эпаминонд', Kratos: 'Кратос', Lampon: 'Лампон',
  Mnason: 'Мнасон', Polydoros: 'Полидор', Simonides: 'Симонид', Thrasyllos: 'Фрасилл', Xenias: 'Ксений', Zopyros: 'Зопир',
  // Phoenician (Punic)
  Hanno: 'Ганнон', Himilco: 'Гимилькон', Mago: 'Маго', Adherbal: 'Адгербал', Bomilcar: 'Бомилькар', Hasdrubal: 'Гасдрубал',
  Gisco: 'Гискон', Bodashtart: 'Бодаштарт', Abibaal: 'Абибаал', Eshmun: 'Эшмун', Milkyaton: 'Милькиатон', Azmelek: 'Азмелек',
  Baalyaton: 'Баалиатон', Germelqart: 'Гермелькарт', Hiram: 'Хирам', Itobaal: 'Итобаал', Abdmelqart: 'Абдмелькарт', Sakarbaal: 'Сакарбаал',
  Hamilcar: 'Гамилькар', Bodmelqart: 'Бодмелькарт', Carthalo: 'Карталон', Maharbal: 'Магарбал', Abdeshmun: 'Абдэшмун', Baalhanno: 'Баалганнон',
  Gerashtart: 'Гераштарт', Mattan: 'Маттан', Yehawmilk: 'Йехавмилк', Arish: 'Ариш', Bostar: 'Бостар', Hannibaal: 'Ганнибаал',
  Magon: 'Магон', Abdtanit: 'Абдтанит', Baalshillek: 'Баалшиллек', Eshmunazar: 'Эшмуназар', Muttumbaal: 'Муттумбаал', Zimrida: 'Зимрида',
  // Celtic (Gaulish, Galatian)
  Brennos: 'Бренн', Ambiorix: 'Амбиорикс', Dumnorix: 'Думнорикс', Cingeto: 'Цингето', Segovax: 'Сеговакс', Teutomatos: 'Тевтомат',
  Vercassos: 'Веркасс', Litavicos: 'Литавик', Comux: 'Комукс', Bituitos: 'Битуит', Orgetorix: 'Оргеторикс', Andecos: 'Андек',
  Caturix: 'Катурикс', Epatix: 'Эпатикс', Medrios: 'Медрий', Senognatos: 'Сеногнат', Tascovanos: 'Таскован', Vindos: 'Винд',
  Acichorios: 'Ахихорий', Bolgios: 'Болгий', Cavaros: 'Кавар', Deiotaros: 'Дейотар', Eposognatos: 'Эпосогнат', Gaesatos: 'Гесат',
  Kambaules: 'Камбавл', Luernios: 'Луерний', Moricos: 'Морик', Nertomaros: 'Нертомар', Ortiagon: 'Ортиагон', Rigantos: 'Ригант',
  Sinorix: 'Синорикс', Toutissos: 'Тутисс', Uxellos: 'Укселл', Velaunos: 'Велаун', Cassivellos: 'Кассивелл', Durnacos: 'Дурнак',
};

/**
 * The preset names of the demo and preview fixtures (duel opponents, the war
 * board's players): written in Russian when the fixture is built, as a
 * stand-in for real players' names.
 */
export const DEMO_NAMES_RU: Readonly<Record<string, string>> = {
  Ana: 'Ана', Lysander: 'Лисандр', Phormio: 'Формион', Phormion: 'Формион', Myronides: 'Миронид', Iphicrates: 'Ификрат',
  Demosthenes: 'Демосфен', Chabrias: 'Хабрий', Pelopidas: 'Пелопид', Xanthippos: 'Ксантипп', Agesilaos: 'Агесилай',
  Hektor: 'Гектор', Timoleon: 'Тимолеонт', Myrto: 'Мирто', Tanaquil: 'Танаквиль', Lysandra: 'Лисандра',
};

/** Names given in code rather than drawn from the lists. */
const FIXED: Readonly<Record<string, string>> = { 'The Tyrant': 'name.tyrant' };

/** An animal's name ("Wolf", "Wild boar", "Boar") as its class key (`class.<id>.name`). */
function animalKey(base: string): string | null {
  for (const c of Object.values(CLASSES)) if (c.kind === 'animal' && (c.name === base || c.short === base)) return `class.${c.id}.name`;
  return null;
}

/**
 * The name of a hero, captain or beast as the language writes it. Keeps a
 * suffix ("II", "3"): "Nearchos II" -> "Неарх II", "Wolf 2" -> "Волк 2".
 * Unknown names (players' own) are returned unchanged.
 */
export function heroName(name: string, l: Lang = lang()): string {
  if (l === 'en' || !name) return name;
  const data = dataTable(l);
  const fixed = FIXED[name];
  if (fixed) return data[fixed] ?? name;
  const m = /^(.+?)(?: ([IVX]+|\d+))?$/.exec(name);
  const base = m?.[1] ?? name;
  const suffix = m?.[2] ? ` ${m[2]}` : '';
  const ru = NAMES_RU[base];
  if (ru) return ru + suffix;
  const animal = animalKey(base);
  return animal && data[animal] ? data[animal] + suffix : name;
}

/** A fixture's preset name (demo opponents, preview boards) in the language. */
export function demoName(name: string, l: Lang = lang()): string {
  if (l === 'en') return name;
  const m = /^(.+?)(?: (\d+))?$/.exec(name);
  const ru = DEMO_NAMES_RU[m?.[1] ?? name];
  return ru ? ru + (m?.[2] ? ` ${m[2]}` : '') : heroName(name, l);
}

/**
 * The stored names inside a text already put together ("Brasidas fell"):
 * in Russian every run of Latin letters is a name (the words are Russian),
 * so each run goes through `heroName`. For the few battle lines (banners,
 * the hint pill, the group cards) that get a unit's name from the sim.
 */
export function namesIn(text: string, l: Lang = lang()): string {
  return l === 'en' ? text : text.replace(/[A-Za-z]+(?: [A-Za-z]+)*/g, (run) => heroName(run, l));
}
