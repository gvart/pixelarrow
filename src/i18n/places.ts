/**
 * Place names as the language writes them (LOC-01). The campaign map
 * (src/world/map.ts), the online maps (src/online/maps/*.json) and the battle
 * sites (src/world/battlefield.ts) name places in Latin letters, and saves and
 * the server keep those names; the screens show them through `placeName`,
 * which gives the conventional Russian form ("Rhegion" -> "Регий",
 * "Mare Tyrrhenum" -> "Тирренское море", "Gaetulian Meadows II" ->
 * "Гетульские луга II"). A name it does not know is shown as it is.
 */
import { lang, type Lang } from './index';

/** Towns, villages, the online maps' named places and seas. */
const PLACES_RU: Readonly<Record<string, string>> = {
  // the campaign map's towns and villages (src/world/map.ts)
  Neapolis: 'Неаполь', Taras: 'Тарент', Kroton: 'Кротон', Syrakousai: 'Сиракузы', Akragas: 'Акрагант', Massalia: 'Массалия',
  Rhegion: 'Регий', Kyme: 'Кумы', Elea: 'Элея', Selinous: 'Селинунт', Himera: 'Гимера', Gela: 'Гела', Lokroi: 'Локры', Sybaris: 'Сибарис',
  Pylos: 'Пилос', Assos: 'Асс', Aigai: 'Эги', Elatea: 'Элатея', Kirrha: 'Кирра', Oinoe: 'Ойноя', Halai: 'Галы', Phyle: 'Фила',
  Anthele: 'Анфела', Dion: 'Дион', Skolos: 'Скол', Tanagra: 'Танагра', Abai: 'Абы', Kalydon: 'Калидон', Pheia: 'Фея', Krisa: 'Криса',
  Opous: 'Опунт', Thisbe: 'Фисба',
  // the western Mediterranean (src/online/maps/westmed.json): towns and landmarks
  Gades: 'Гадес', 'Carthago Nova': 'Новый Карфаген', Roma: 'Рим', Syracusae: 'Сиракузы', Carthago: 'Карфаген', Caralis: 'Каралис',
  Emporion: 'Эмпорион', Barcino: 'Барцинон', Tarraco: 'Тарракон', Saguntum: 'Сагунт', Valentia: 'Валентия', 'Akra Leuke': 'Акра-Левке',
  Baria: 'Бария', Sexi: 'Секси', Malaca: 'Малака', Carteia: 'Картея', Hispalis: 'Гиспалис', Corduba: 'Кордуба', Castulo: 'Кастулон',
  Ilerda: 'Илерда', Osca: 'Оска', Salduie: 'Сальдуба', Toletum: 'Толетум', Emerita: 'Эмерита', Segobriga: 'Сегобрига',
  Complutum: 'Комплутум', Clunia: 'Клуния', Sisapo: 'Сисапон', Caurium: 'Кавриум', Asturica: 'Астурика', Pompaelo: 'Помпелон',
  Numantia: 'Нуманция', Hemeroskopeion: 'Гемероскопейон', Rhode: 'Роды', Iacca: 'Якка', "Pyrene's Peak": 'Пик Пирены',
  'Solorius Heights': 'Солорийские высоты', Narbo: 'Нарбон', Nemausus: 'Немауз', Arelate: 'Арелат', Avenio: 'Авенион', Tolosa: 'Толоза',
  Antipolis: 'Антиполис', Nikaia: 'Никея', Divona: 'Дивона', Elusa: 'Элуза', Carcaso: 'Каркасон', Entremont: 'Антремон', Agathe: 'Агата',
  Athenopolis: 'Афинополь', Genua: 'Генуя', Pisae: 'Пизы', Faesulae: 'Фезулы', Bononia: 'Бонония', Ariminum: 'Аримин', Ancona: 'Анкона',
  Arretium: 'Арретий', Volaterrae: 'Волатерры', Perusia: 'Перузия', Populonia: 'Популония', Tarquinii: 'Тарквинии', Caere: 'Цере',
  Ostia: 'Остия', Tarracina: 'Таррацина', Corfinium: 'Корфиний', Capua: 'Капуя', Cumae: 'Кумы', Beneventum: 'Беневент',
  Poseidonia: 'Посейдония', Luceria: 'Луцерия', Consentia: 'Консенция', 'Alba Fucens': 'Альба-Фуценс', Bovianum: 'Бовиан', Laos: 'Лаос',
  Ilva: 'Ильва', Messana: 'Мессана', Tauromenion: 'Тавромений', Katane: 'Катана', Lilybaeum: 'Лилибей', Segesta: 'Сегеста',
  Panormus: 'Панорм', Eryx: 'Эрикс', Henna: 'Энна', 'Etna, Forge of the Cyclops': 'Этна, кузня циклопов', Nora: 'Нора', Sulci: 'Сульки',
  Tharros: 'Таррос', 'Turris Libisonis': 'Туррис-Либисонис', Olbia: 'Ольвия', Gennargentu: 'Дженнардженту', Alalia: 'Алалия',
  Mariana: 'Мариана', Urcinium: 'Урциний', 'Kyrnos Maquis': 'Заросли Кирноса', Palma: 'Пальма', Pollentia: 'Полленция', Mago: 'Магон',
  Ebusus: 'Эбес', Melite: 'Мелита', Tingis: 'Тингис', Volubilis: 'Волюбилис', Rusaddir: 'Русаддир', Siga: 'Сига', Iol: 'Иол',
  Icosium: 'Икозиум', Saldae: 'Сальды', Rusicade: 'Русикада', Cirta: 'Цирта', 'Hippo Regius': 'Гиппон-Регий', Thabraca: 'Табрака',
  'Hippo Diarrhytus': 'Гиппон-Диаррит', Utica: 'Утика', Hadrumetum: 'Гадрумет', Thapsus: 'Тапс', 'Sicca Veneria': 'Сикка-Венерия',
  Thugga: 'Тугга', Sufetula: 'Суфетула', Sitifis: 'Ситифис', Theveste: 'Тевеста', Thysdrus: 'Тисдр', Capsa: 'Капса', Pomaria: 'Помария',
  Tingartia: 'Тингартия', Zama: 'Зама', Lambaesis: 'Ламбезис', Auzia: 'Авзия', Taza: 'Таза', Kerkouane: 'Керкуан',
  'Pillars of Hercules': 'Геркулесовы столпы', 'Garden of the Hesperides': 'Сад Гесперид', 'Aures Crags': 'Утёсы Авреса',
  // its seas
  'Oceanus Cantabricus': 'Кантабрийский океан', 'Sinus Aquitanicus': 'Аквитанский залив', 'Sinus Gaditanus': 'Гадесский залив',
  'Fretum Herculeum': 'Геркулесов пролив', 'Mare Alboranum': 'Альборанское море', 'Sinus Rusaddirensis': 'Русаддирский залив',
  'Sinus Urcitanus': 'Урцитанский залив', 'Sinus Oranensis': 'Оранский залив', 'Mare Ibericum': 'Иберийское море',
  'Sinus Sucronensis': 'Сукронский залив', 'Freta Pityusae': 'Питиусский пролив', 'Mare Balearicum': 'Балеарское море',
  'Mare Balearicum Australe': 'Южное Балеарское море', 'Mare Mauretanicum': 'Мавретанское море', 'Sinus Gallicus': 'Галльский залив',
  'Mare Ligusticum Occidentale': 'Западное Лигурийское море', 'Mare Ligusticum': 'Лигурийское море',
  'Mare Sardoum Boreale': 'Северное Сардинское море', 'Mare Sardoum': 'Сардинское море', 'Mare Sardoum Australe': 'Южное Сардинское море',
  'Mare Africum': 'Африканское море', 'Sinus Numidicus': 'Нумидийский залив', 'Mare Etruscum': 'Этрусское море',
  'Mare Tyrrhenum Boreale': 'Северное Тирренское море', 'Mare Tyrrhenum': 'Тирренское море', 'Mare Campanum': 'Кампанское море',
  'Mare Tyrrhenum Australe': 'Южное Тирренское море', 'Mare Aeolium': 'Эолийское море', 'Fretum Siculum': 'Сицилийский пролив',
  'Sinus Carthaginiensis': 'Карфагенский залив', 'Sinus Hadrumetinus': 'Гадруметский залив', 'Mare Melitense': 'Мелитское море',
  'Mare Ionium': 'Ионическое море', 'Mare Hadriaticum Boreale': 'Северное Адриатическое море', 'Mare Hadriaticum': 'Адриатическое море',
  'Mare Hadriaticum Australe': 'Южное Адриатическое море',
  // the test map (src/online/maps/test30.json)
  'Ager Primus': 'Первое поле', 'Silva Nigra': 'Чёрный лес', 'Collis Ventosus': 'Ветреный холм', 'Arx Borea': 'Северная крепость',
  'Campus Altus': 'Высокое поле', 'Vallis Umbra': 'Тенистая долина', 'Oppidum Vetus': 'Старый город', Pratum: 'Луг',
  'Urbs Media': 'Срединный город', 'Lacus Draconis': 'Драконье озеро', 'Mons Ferreus': 'Железная гора', 'Ager Extremus': 'Дальнее поле',
  'Litus Occidens': 'Западный берег', 'Portus Minor': 'Малая гавань', 'Palus Rubra': 'Красное болото', 'Castra Media': 'Срединный лагерь',
  Emporium: 'Торжище', 'Ripa Orientis': 'Восточный берег', 'Mare Internum': 'Внутреннее море', 'Sinus Medius': 'Срединный залив',
  'Mare Orientis': 'Восточное море', 'Insula Portus': 'Остров-гавань', 'Insula Collis': 'Остров-холм', 'Antrum Insulae': 'Островная пещера',
  'Insula Arx': 'Остров-крепость', 'Ora Insulae': 'Островной берег', 'Mare Australe': 'Южное море', Saltus: 'Ущелье',
  'Via Strata': 'Мощёная дорога', Specula: 'Дозорная вышка',
  // battle sites (src/world/battlefield.ts siteName)
  'Open plain': 'Открытая равнина', Scrubland: 'Кустарник', Woodland: 'Редколесье', Hills: 'Холмы', Beach: 'Пляж',
  'Wooded river ford': 'Лесной брод', 'River in the hills': 'Река в холмах', 'River ford': 'Брод', 'Coastal hills': 'Прибрежные холмы',
  Coast: 'Побережье', 'Wooded hills': 'Лесистые холмы', 'Rocky hills': 'Каменистые холмы',
};

/**
 * The peoples of the online maps' generated regions ("Gaetulian Meadows"):
 * the stem of the Russian adjective, without its ending.
 */
const PEOPLES_RU: Readonly<Record<string, string>> = {
  Apuanian: 'Апуанск', Aquitanian: 'Аквитанск', Arecomican: 'Арекомикск', Arevacan: 'Аревакск', Asturian: 'Астурийск',
  Ausetanian: 'Авсетанск', Autrigonian: 'Автригонск', Balarian: 'Баларск', Baquatian: 'Бакватск', Bastetanian: 'Бастетанск',
  Beronian: 'Беронск', Bruttian: 'Бруттийск', Byzacene: 'Бизаценск', Cantabrian: 'Кантабрийск', Carpetanian: 'Карпетанск',
  Cavarian: 'Каварск', Celtiberian: 'Кельтиберск', Celtic: 'Кельтск', Cerretanian: 'Керретанск', Ciminian: 'Циминийск',
  Commonian: 'Коммонск', Contestanian: 'Контестанск', Daunian: 'Даунийск', Edetanian: 'Эдетанск', Elusate: 'Элузатск',
  Etruscan: 'Этрусск', Frentanian: 'Френтанск', Friniatian: 'Фриниатск', Gaetulian: 'Гетульск', Gallurian: 'Галлурск',
  Helvian: 'Гельвийск', Hirpinian: 'Гирпинск', Iacetanian: 'Якетанск', Ilercavonian: 'Илеркавонск', Ilergetan: 'Илергетск',
  Iliensian: 'Илиенск', Laietanian: 'Лайетанск', Libyphoenician: 'Ливофиникийск', Ligurian: 'Лигурийск', Lingonian: 'Лингонск',
  Lucanian: 'Луканск', Lusitanian: 'Лузитанск', Lusonian: 'Лузонск', Marsian: 'Марсийск', Masaesylian: 'Масесилийск',
  Massylian: 'Массилийск', Mauretanian: 'Мавретанск', Mazician: 'Мазикск', Moorish: 'Маврусийск', Musulamian: 'Мусуламск',
  Nitiobrogan: 'Нитиобригск', Numidian: 'Нумидийск', Olcadian: 'Олкадск', Oretanian: 'Оретанск', Oxybian: 'Оксибийск',
  Picene: 'Пиценск', Praetutian: 'Претутийск', Quinquegentian: 'Квинквегентанск', Rasennan: 'Расеннск', Rutenian: 'Рутенск',
  Sabine: 'Сабинск', Sedetanian: 'Седетанск', Senonian: 'Сенонск', Sicel: 'Сикульск', Sordonian: 'Сордонск',
  Suessetanian: 'Суэссетанск', Tarbellian: 'Тарбелльск', Tolosate: 'Толосск', Turdetanian: 'Турдетанск', Turdulian: 'Турдульск',
  Turmogan: 'Турмогск', Vaccaean: 'Вакцейск', Vardulian: 'Вардульск', Vasconian: 'Васконск', Vediantian: 'Ведиантийск',
  Vettonian: 'Веттонск', Vocontian: 'Воконтийск',
};

/** The land words of the generated regions: the Russian noun and the adjective ending it takes. */
const LAND_RU: Readonly<Record<string, [string, 'ие' | 'ий' | 'ая']>> = {
  Crags: ['утёсы', 'ие'], Downs: ['увалы', 'ие'], Farmlands: ['пашни', 'ие'], Fields: ['поля', 'ие'], Foothills: ['предгорья', 'ие'],
  Grove: ['роща', 'ая'], Heights: ['высоты', 'ие'], Highlands: ['нагорья', 'ие'], Hills: ['холмы', 'ие'], Lowlands: ['низины', 'ие'],
  Meadows: ['луга', 'ие'], Passes: ['перевалы', 'ие'], Pastures: ['пастбища', 'ие'], Peaks: ['пики', 'ие'], Pinewood: ['сосняк', 'ий'],
  Plain: ['равнина', 'ая'], Plains: ['равнины', 'ие'], Ridges: ['кряжи', 'ие'], Scarps: ['обрывы', 'ие'], Thickets: ['заросли', 'ие'],
  Uplands: ['взгорья', 'ие'], Vale: ['дол', 'ий'], Valley: ['долина', 'ая'], Wildwood: ['дебри', 'ие'], Wood: ['лес', 'ий'],
};

/**
 * A place (town, village, region, sea or battle site) as the language writes
 * it. Keeps a numeral suffix ("Gaetulian Meadows II"). Unknown names are
 * returned unchanged.
 */
export function placeName(name: string, l: Lang = lang()): string {
  if (l === 'en' || !name) return name;
  const whole = PLACES_RU[name];
  if (whole) return whole;
  const m = /^(.+?)(?: ([IVX]+))?$/.exec(name);
  const base = m?.[1] ?? name;
  const suffix = m?.[2] ? ` ${m[2]}` : '';
  if (PLACES_RU[base]) return PLACES_RU[base] + suffix;
  const g = /^(\S+) (\S+)$/.exec(base);
  const stem = g && PEOPLES_RU[g[1]];
  const land = g && LAND_RU[g[2]];
  return stem && land ? `${stem}${land[1]} ${land[0]}${suffix}` : name;
}
