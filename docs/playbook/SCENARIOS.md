# Authoring game content

How v5's content was made: the overland event cards, the campaign arc (lairs, assaults, the host), ladder
floors, bot doctrines and names. Content is data in `src/data/**` with text in `src/i18n/**`, built from a
closed vocabulary that a GDD defines, and checked by a dev script and tests before it ships.

**About prompts.** No dedicated generation prompt was used for content. The event deck was written by the EV-02
implementation agent (agents `writer`, `economy-designer`, `game-designer`; skills `dialogue-systems`,
`team-narrative`, `balance-check`, `localize`, `tdd`), using the implementation template in
[PROMPTS_AGENTS.md](PROMPTS_AGENTS.md) and the rules in the GDD. The recipe below is that GDD plus the decisions
the agent recorded in [docs/v5/balance/EV-02.md](../v5/balance/EV-02.md). The other content (lairs, host,
ladder, doctrines) is tuned data, set by balance runs rather than written.

## The general recipe

1. **The GDD defines the vocabulary** (the data shape and a closed list of effects). Content may only use it;
   a new effect needs a GDD update first.
2. **The GDD sets measurable quality rules** (for events: no dominated choice, a third of cards chain, 0.3–0.5
   per battle, net gold −10..+25 per battle).
3. **A dev script measures them** over many seeded runs, and **tests** pin the structural rules.
4. **Text is separate from data.** Keys per item in en and ru; the text never repeats numbers the UI shows from
   data.
5. **Never sell what the game can't deliver.** A card whose effect has no screen yet ships with weight 0 behind
   a flag (the oracle sat behind `RETRAIN_SPENDABLE = false` until the Drillmaster existed).
6. **Ship dark when the UI isn't there.** The deck shipped behind `EVENT_DECK_ENABLED = false` because an open
   event pauses the map and the card that closes it came later (V5-064, V5-070).

---

## 1. Overland event cards

GDD: [design/gdd/campaign-events.md](../../design/gdd/campaign-events.md). Engine: `src/data/events.ts` (EV-01).
Deck: `src/data/eventDeck.ts` (EV-02, 24 events). Text: `src/i18n/events.en.ts`, `events.ru.ts`. Card UI:
`src/ui/sheets/eventCard.ts` (EV-03). Check: `src/dev/eventBalance.ts`. Tests: `tests/events.test.ts`,
`tests/eventDeck.test.ts`.

### Data shape (`src/data/events.ts`)

```ts
interface EventDef {
  id: string;
  trigger: 'march' | 'arrive_village' | 'arrive_town' | 'camp' | 'after_battle' | 'flag';
  weight: number;                 // draw weight among eligible events
  cond: { minDay?; maxDay?; danger?: [number, number]; flags?: string[]; notFlags?: string[];
          minMen?; minGold?; arcStage?: ('lairs'|'host'|'won'|'post')[]; escaped?: number };
  unique?: boolean;               // at most once per campaign
  cooldownDays: number;
  after?: { flag: string; days: [number, number] };   // 'flag' events: due N days after the flag was set
  choices: { key: string; cost?: Effect[]; effects: Effect[]; chance?: { p: number; fail: Effect[] } }[]; // 2-3
}
```

### The closed effect vocabulary (`fx.*`)

`gold(n)`, `food(n)`, `supplies(n)`, `recruit(cls | 'raw', level, n)`, `xp(target, n)`, `wound(target, hours)`,
`heal()`, `item(rarity, slot?)`, `spawnBand('bandits' | 'raiders' | 'mercs', { size, level, captain, hunts,
doctrine, bountyMult })`, `weakenGarrison(lair | 'nearest', n)`, `reveal(lair | 'nearest' | { radius })`,
`retrain()`, `priceMod(place | 'here', pct, days)`, `closeSettlement(place, days)`,
`nextBattle('pick' | 'xp' | 'gold')`, `setFlag(name, value?)`, `clearFlag(name)`.
Targets: `all`, `one_random`, `lowest`. `nextBattle` bonuses are post-battle rewards only, never sim inputs.

### Triggers and pacing (`EVENT_RULES`)

March check every 12 game hours at 0.1; settlement arrival 0.25 (3-day cooldown per settlement); camp night
0.2; after a won battle 0.25; flag events when due. At most 1 event per game day and 24 game hours between
events (flag events ignore the gap). Draws are seeded per check (world seed + trigger + slot), not the shared
RNG (V5-064), and the drawn event is saved as `pendingEvent` **before** it is shown, so killing the app can't
reroll it.

### Content rules (the decision-quality bar, GDD R5)

- 2–3 choices; **at least one costs nothing** (decline is always possible; an ambush's decline is "flee").
- Each choice trades between at least two of: gold, men, wounds, time, risk, flags. **No choice is better or
  equal in every dimension** (the EV table checks it).
- At least a third of the events set a flag a **later** event or the arc reads. Every follow-up clears its
  flag, so a chain fires once.
- Body ≤ 280 characters; choice labels ≤ 24 characters; en and ru.
- The text carries no numbers: the card's cost chips come from the data.
- Each choice has a result line (`r.<key>`), and each chance choice a failure line (`f.<key>`), for the card
  and the journal.
- Only reference features that exist. If the vocabulary can't express the GDD's idea, change the card, not the
  promise (EV-02: "Hand them over" became "Pay his price" because no effect removes men; the caravan pays up
  front and a chained raid follows, because no effect can depend on winning a fight).

### The EV check (GDD F2)

`EV_c` = Σ effect value, with fixed weights: 1 gold = 1, 1 food = 2, 1 man = 60, 1 wound-hour = −1, a flag = 0
(its follow-up is listed separately as `chain`). A spawned band at power ratio r: p_win = 0.5 − 1.25(r − 1),
2r deaths; a captain adds 0.15 to r. Other assumed values (EV-02 `EV_ASSUME`): 1 XP = 0.5 g, `all` = 8 men,
`heal` = 50 wound-hours, an uncommon item 48.7 g, `nextBattle` xp 60 / gold 52.5 / pick 43.5, a lair reveal 15,
a radius 10, a garrison man 10, a retrain 40, one price % = 1 g. A choice is **dominated** if another choice of
the same event is ≥ in every component (gold, food, men, wounds, xp, gear, intel, price, chain, risk) and > in
one.

`npm run balance` prints the event rows (`eventRows`). For the full EV table on its own:

```bash
node -e "import('vite').then(async v => { const { module: m } = await v.runnerImport('/src/dev/eventBalance.ts', { root: process.cwd(), configFile: false, logLevel: 'error', server: { hmr: false } }); console.log(m.eventBalanceReport(200)); })"
```

It plays F1's typical day through the real engine (200 worlds × 40 battles) for a random and a greedy player and
prints the EV table plus these targets. v5 result: 0 of 53 choices dominated; 8 of 24 events chain; 0.36 / 0.39
events per battle; −0.6 / −2.8 g net per battle.

### Template: a new event card

1. **Design it** on paper against the rules above: trigger, condition, 2–3 choices, which two dimensions each
   trades, and whether it sets or reads a flag.
2. **Data** in `src/data/eventDeck.ts`:

```ts
{
  id: '{event_id}', trigger: '{march|arrive_village|arrive_town|camp|after_battle|flag}', weight: {1-3},
  cond: { {minDay: n, notFlags: ['...'], ...} }, cooldownDays: {n},
  // flag events only: after: { flag: '{flag_set_earlier}', days: [{min}, {max}] },
  choices: [
    { key: '{a}', effects: [{fx...}, fx.setFlag('{chain_flag}')] },
    { key: '{b}', effects: [] },                                           // the free choice
    { key: '{c}', cost: [fx.gold(-{n})], effects: [{fx...}], chance: { p: {0.5}, fail: [{fx...}] } },
  ],
},
```

   Real example (a chain follow-up):

```ts
{
  id: 'deserters_hunt', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'deserters_joined', days: [4, 8] },
  choices: [
    { key: 'fight', effects: [fx.spawnBand('mercs', CAPTAIN_HUNT), fx.clearFlag('deserters_joined')] },
    { key: 'pay', cost: [fx.gold(-60)], effects: [fx.clearFlag('deserters_joined')] },
  ],
},
```

3. **Text** in `src/i18n/events.en.ts` and `events.ru.ts`:

```ts
'event.{id}.title': '...',
'event.{id}.body': '...',            // ≤ 280 chars, no numbers
'event.{id}.c.{key}': '...',         // ≤ 24 chars
'event.{id}.r.{key}': '...',         // the result line
'event.{id}.f.{key}': '...',         // only for a chance choice: the failure line
```

   Real example (en): `'event.deserters_hunt.title': 'The Captain Comes'`, `'…body': 'Riders at dawn. The
   mercenary captain your deserters fled is on your trail with his men. He wants his spears back, or their price
   in silver.'`, `'…c.fight': 'Stand and fight'`, `'…c.pay': 'Pay his price'`.
4. **Check**: `npx vitest run tests/eventDeck.test.ts tests/events.test.ts`, then the EV command above (0
   dominated, pacing and gold in band). Look at the card at 320x640 and 320x568 in ru (layout-check fixtures
   `world-event` and `world-event-costs`).
5. **Log** any card you changed from the GDD, and why, in the story's balance file.

---

## 2. Campaign arc: the opening, lairs, assaults, the host

GDD: [design/gdd/campaign-arc.md](../../design/gdd/campaign-arc.md). Knobs: `src/data/arc.ts`. Check:
`src/dev/arcBalance.ts` (rows in `npm run balance`). Balance files: AR-01..AR-04 in
[docs/v5/balance/](../v5/balance/).

| Content | Knob (`src/data/arc.ts`) | Rule |
| --- | --- | --- |
| Lair garrison | `GARRISON = { base: 10, danger: 6, level: 2, levelDanger: 3, levelDays: 0.04, regrowH: 24, plate: 1.15 }` | `base + round(danger²)` men at `level + round(danger × levelDanger + days × levelDays)`; one man regrows every `regrowH` hours; `plate` scales the power shown so an army at 1.0× of it wins 38–48% (EC-05) |
| Lairs to clear | `ARC_LAIRS = 6` | The host musters when the last falls |
| Assault field | `ASSAULT = { gates: 2, gateW: 3, rampartRows: 1 }` | A palisade with gates and a rampart behind; the garrison's stakes go in front |
| The Tyrant's host | `HOST = { mult: 1.0, cap: 32, level: [7, 9], tier: 3, leanShare: 2/3, tyrantLevel: 10, speed: 1.2, minDist: 30 }` | `min(cap, ceil(mult × R))` men (R = the fit roster), fights `hammer`, never retreats; tuned to 40–55% for a prepared army (AR-04: the GDD's 1.25 measured 3%) |
| Sacked town, post-game | `SACK_DAYS = 5`, `POST_GAME = { danger: 0.2, reborn: 2, rebornDays: 10 }` | |

**To add or change one:** change the knob, run `npm run balance -- 400`, read the arc rows (lairs 43 / 58 / 53%,
assault about 45%, host about 49%), and record before and after. The arc is offline only: duels, the ladder
and war never read `arc.ts`.

## 3. Ladder floors

Code: `src/duel/ladder.ts` (shared by client and server). A floor's army is a **pure function of the floor
number** (players can learn and counter it); only the battle seed comes from the server ticket.

| Content | Where | Rule |
| --- | --- | --- |
| Floors, chapters, bosses, stars, chests | `LADDER` | 50 floors, chapters of 10, a boss every 10th floor (double Glory, an epic-or-better first clear) |
| Chapter doctrine | `CHAPTER_DOCTRINE = ['steady', 'swarm', 'rush', 'hammer', 'fury']` | The enemy gets harder to read as you climb (ai-doctrines R4) |
| Per-floor exceptions | `FLOOR_DOCTRINE` | A floor whose chapter doctrine moved its difficulty more than ±5 pts gets the closest doctrine that stays inside, or steady (V5-052) |
| Level room | `FLOOR_LEVEL_ROOM` | Floors allowed to rise more levels to reach their point target |

**Parity check after any change to the sim, a doctrine or a floor:**

```bash
npm run balance:ladder                 # all floors, default seeds
npm run balance:ladder -- 1000 21-21   # one floor, 1,000 seeds (SE about 2 pts)
```

Target: every floor within ±5 of the frozen anchor (49 of 50 at the end of v5; floor 28 +4 at 1,000 seeds).

## 4. Bot doctrines

GDD: [design/gdd/ai-doctrines.md](../../design/gdd/ai-doctrines.md). Data: `src/data/doctrines.ts`. Check:
`src/dev/doctrineBalance.ts`. Doctrines are sim data: **any change is a rules change** (ADR-0001; replay
fixtures).

A doctrine is a record of timers and thresholds: `lineWaitS`, `flankAtS`, `pressAfterS`, `pressIdleS`,
`reserveAtS`, `reserveWaver`, `holdHillS`, `fordWaitS`, `hillFlank`, `skirmishRetire`, `shieldwallWhenShot`,
`preferShape`, `feint`, `focusMissiles`, `retreatAt`, `jitter`. Small armies press sooner
(`pressAfter = min(D.pressAfterS, 4 + 1.5 × men)`). The five: steady, rush, hammer, swarm, fury.

**To add one:** a GDD row (behaviour, the "tell" a player can learn, counters), the record, its icon
(`ui:doctrine_<id>`, see [PROMPTS_ART.md](PROMPTS_ART.md) §4), its Codex text (en, ru), who gets it (culture,
ladder chapter, arc), then the doctrine scan and the ladder parity run. The tell text must match what the bot
does (a v5 follow-up: the swarm tell said it retreats while garrisons hold).

## 5. Names and places

| Content | Where | Rule |
| --- | --- | --- |
| Hero and captain names | `src/data/names.ts` `NAMES` per culture (`greek`, `phoenician`, `celtic`) | Latin letters in saves and on the server; `freeName` and `dedupeNames` keep them unique |
| Russian forms | `src/i18n/names.ts` `NAMES_RU` | The conventional Russian form (Brasidas → Брасид, Hasdrubal → Гасдрубал); every form distinct; `tests/heroNames.test.ts` holds both lists together and checks only characters the fonts carry |
| Places | `src/world/map.ts`, `src/online/maps/*.json`, `src/world/battlefield.ts`; Russian in `src/i18n/places.ts` `PLACES_RU` | Shown through `placeName` |
| Culture labels | `CULTURE_LABEL` | Hellenes, Carthaginians, Galatae |

**To add a name:** append it to its culture in `NAMES`, add its Russian form to `NAMES_RU`, run
`npx vitest run tests/heroNames.test.ts`. Use historically attested names of the culture; check no two shown
forms collide.

## 6. Beasts (Codex text and art agree)

Beasts are in `src/data/beasts.ts`, their hints in `src/i18n/beasts.en.ts` (`myth.*.hint1`), their battle
figures in `src/art/beastArt.ts`. When a beast's plate or text is written, take the part counts and props from
the figure and the hint (five heads, six arms, two boulders) so the Codex, the plate and the battle agree
(AS-05). Balance: `src/dev/beastBalance.ts`.

## Checklist for new content

- [ ] Uses only the GDD's vocabulary; a new effect or field went through the GDD first
- [ ] Nothing promises a feature the game can't deliver yet (weight 0 or a flag until it can)
- [ ] Data in `src/data/**`, text in `src/i18n/<ns>.en.ts` and `.ru.ts`, no numbers in text
- [ ] Dev script run: no dominated choice / in band / ladder parity ±5, as the GDD says
- [ ] Tests pass; sim data changed → replay fixtures checked (ADR-0001)
- [ ] Seen at 320 in ru
- [ ] Before and after numbers and any GDD deviation recorded in `docs/<ver>/balance/<story>.md`
