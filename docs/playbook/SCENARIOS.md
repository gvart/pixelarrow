# Authoring game content

How the content is made: overland event cards, the campaign arc (lairs, assaults, the host), ladder floors, bot
doctrines, names. Content is data in `src/data/**` with text in `src/i18n/**`, built from a closed vocabulary a GDD
defines, and checked by a dev script and tests before it ships.

**No generation prompt was used for content.** The event deck was written by the EV-02 implementation agent
(agents `writer`, `economy-designer`, `game-designer`; skills `dialogue-systems`, `team-narrative`,
`balance-check`, `localize`, `tdd`) from the template in [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md) and the GDD rules
below. Lairs, the host, the ladder and doctrines are tuned data, set by balance runs.

## The general recipe

1. **The GDD defines the vocabulary** (data shape, a closed list of effects); a new effect needs a GDD update first.
2. **The GDD sets measurable quality rules** (events: no dominated choice, a third of cards chain, 0.3–0.5 per
   battle, net gold −10..+25 per battle).
3. **A dev script measures them** over seeded runs; **tests** pin the structural rules.
4. **Text is separate from data**: keys per item in en and ru; text never repeats numbers the UI shows from data.
5. **Never sell what the game can't deliver**: a card whose effect has no screen yet ships at weight 0 behind a flag
   (the oracle sat behind `RETRAIN_SPENDABLE = false` until the Drillmaster existed).
6. **Ship dark when the UI isn't there**: the deck shipped behind `EVENT_DECK_ENABLED = false` until the card that
   closes an event existed (V5-064, V5-070).

---

## 1. Overland event cards

Engine `src/data/events.ts` (EV-01); deck `src/data/eventDeck.ts` (EV-02, 24 events); text
`src/i18n/events.en.ts` / `.ru.ts`; card `src/ui/sheets/eventCard.ts` (EV-03); check `src/dev/eventBalance.ts`;
tests `tests/events.test.ts`, `tests/eventDeck.test.ts`.

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

**Effects (`fx.*`):** `gold(n)`, `food(n)`, `supplies(n)`, `recruit(cls | 'raw', level, n)`, `xp(target, n)`,
`wound(target, hours)`, `heal()`, `item(rarity, slot?)`, `spawnBand('bandits' | 'raiders' | 'mercs', { size,
level, captain, hunts, doctrine, bountyMult })`, `weakenGarrison(lair | 'nearest', n)`, `reveal(lair | 'nearest' |
{ radius })`, `retrain()`, `priceMod(place | 'here', pct, days)`, `closeSettlement(place, days)`,
`nextBattle('pick' | 'xp' | 'gold')`, `setFlag(name, value?)`, `clearFlag(name)`. Targets: `all`, `one_random`,
`lowest`. `nextBattle` bonuses are post-battle rewards, never sim inputs.

**Pacing (`EVENT_RULES`):** march check every 12 game hours at 0.1; settlement arrival 0.25 (3-day cooldown per
settlement); camp night 0.2; after a won battle 0.25; flag events when due. At most 1 event per game day and 24
hours between events (flag events ignore the gap). Draws are seeded per check (world seed + trigger + slot), and the
drawn event is saved as `pendingEvent` **before** it is shown, so killing the app can't reroll it.

**Content rules (GDD R5):**

- 2–3 choices; **at least one costs nothing** (an ambush's decline is "flee").
- Each choice trades at least two of gold, men, wounds, time, risk, flags; **no choice is ≥ another in every
  dimension**.
- At least a third set a flag a later event or the arc reads; every follow-up clears its flag.
- Body ≤ 280 characters, choice labels ≤ 24, en and ru, no numbers in text.
- A result line per choice (`r.<key>`), a failure line per chance choice (`f.<key>`).
- Only reference features that exist; if the vocabulary can't express the idea, change the card, not the promise
  ("Hand them over" became "Pay his price" because no effect removes men).

**The EV check (GDD F2):** `EV_c` = Σ effect value: 1 gold = 1, 1 food = 2, 1 man = 60, 1 wound-hour = −1, a flag =
0 (its follow-up listed as `chain`). A spawned band at power ratio r: p_win = 0.5 − 1.25(r − 1), 2r deaths; a captain
adds 0.15 to r. Other values (`EV_ASSUME`): 1 XP = 0.5 g, `all` = 8 men, `heal` = 50 wound-hours, an uncommon item
48.7 g, `nextBattle` xp 60 / gold 52.5 / pick 43.5, a lair reveal 15, a radius 10, a garrison man 10, a retrain 40,
one price % = 1 g. A choice is **dominated** if another of the same event is ≥ in every component (gold, food, men,
wounds, xp, gear, intel, price, chain, risk) and > in one.

`npm run balance` prints the event rows; the full table alone:

```bash
node -e "import('vite').then(async v => { const { module: m } = await v.runnerImport('/src/dev/eventBalance.ts', { root: process.cwd(), configFile: false, logLevel: 'error', server: { hmr: false } }); console.log(m.eventBalanceReport(200)); })"
```

It plays 200 worlds × 40 battles for a random and a greedy player. v5: 0 of 53 choices dominated; 8 of 24 events
chain; 0.36 / 0.39 events per battle; −0.6 / −2.8 g net per battle.

### Template: a new event card

1. **Design** it against the rules: trigger, condition, 2–3 choices, the two dimensions each trades, flags.
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
// real chain follow-up:
{ id: 'deserters_hunt', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'deserters_joined', days: [4, 8] },
  choices: [
    { key: 'fight', effects: [fx.spawnBand('mercs', CAPTAIN_HUNT), fx.clearFlag('deserters_joined')] },
    { key: 'pay', cost: [fx.gold(-60)], effects: [fx.clearFlag('deserters_joined')] },
  ] },
```

3. **Text** in `events.en.ts` / `events.ru.ts`: `event.{id}.title`, `.body` (≤ 280, no numbers), `.c.{key}` (≤ 24),
   `.r.{key}`, `.f.{key}` (chance only). Example: `'event.deserters_hunt.title': 'The Captain Comes'`, body "Riders at
   dawn. The mercenary captain your deserters fled is on your trail with his men. He wants his spears back, or their
   price in silver.", `c.fight` "Stand and fight", `c.pay` "Pay his price".
4. **Check:** `npx vitest run tests/eventDeck.test.ts tests/events.test.ts`, then the EV command (0 dominated, pacing
   and gold in band). Look at the card at 320x640 and 320x568 in ru (fixtures `world-event`, `world-event-costs`).
5. **Log** any deviation from the GDD in the story's balance file.

## 2. Campaign arc: the opening, lairs, assaults, the host

Knobs `src/data/arc.ts`; check `src/dev/arcBalance.ts` (rows in `npm run balance`).

| Content | Knob | Rule |
| --- | --- | --- |
| Lair garrison | `GARRISON = { base: 10, danger: 6, level: 2, levelDanger: 3, levelDays: 0.04, regrowH: 24, plate: 1.15 }` | `base + round(danger²)` men at `level + round(danger × levelDanger + days × levelDays)`; one man regrows every `regrowH` h; `plate` scales the shown power so an army at 1.0× wins 38–48% (EC-05) |
| Lairs to clear | `ARC_LAIRS = 6` | The host musters when the last falls |
| Assault field | `ASSAULT = { gates: 2, gateW: 3, rampartRows: 1 }` | Palisade with gates, a rampart behind, the garrison's stakes in front |
| The Tyrant's host | `HOST = { mult: 1.0, cap: 32, level: [7, 9], tier: 3, leanShare: 2/3, tyrantLevel: 10, speed: 1.2, minDist: 30 }` | `min(cap, ceil(mult × R))` men, fights `hammer`, never retreats; tuned to 40–55% for a prepared army (the GDD's 1.25 measured 3%) |
| Sacked town, post-game | `SACK_DAYS = 5`, `POST_GAME = { danger: 0.2, reborn: 2, rebornDays: 10 }` | |

**To change one:** edit the knob, `npm run balance -- 400`, read the arc rows (lairs 43 / 58 / 53%, assault ≈ 45%,
host ≈ 49%), record before and after. The arc is offline only.

## 3. Ladder floors

`src/duel/ladder.ts` (client and server). A floor's army is a **pure function of the floor number**; only the battle
seed comes from the server ticket.

| Content | Where | Rule |
| --- | --- | --- |
| Floors, chapters, bosses, stars, chests | `LADDER` | 50 floors, chapters of 10, a boss every 10th (double Glory, an epic-or-better first clear) |
| Chapter doctrine | `CHAPTER_DOCTRINE = ['steady', 'swarm', 'rush', 'hammer', 'fury']` | Harder to read as you climb |
| Per-floor exceptions | `FLOOR_DOCTRINE` | A floor its chapter doctrine moved more than ±5 pts gets the closest doctrine inside, or steady (V5-052) |
| Level room | `FLOOR_LEVEL_ROOM` | Floors allowed more levels to reach their target |

After any change to the sim, a doctrine or a floor: `npm run balance:ladder` (one floor at 1,000 seeds:
`npm run balance:ladder -- 1000 21-21`). Target: every floor within ±5 of the frozen anchor (49 of 50 at the end of v5).

## 4. Bot doctrines

Data `src/data/doctrines.ts`; check `src/dev/doctrineBalance.ts`. Doctrines are sim data: **any change is a rules
change** (ADR-0001). A doctrine is timers and thresholds: `lineWaitS`, `flankAtS`, `pressAfterS`, `pressIdleS`,
`reserveAtS`, `reserveWaver`, `holdHillS`, `fordWaitS`, `hillFlank`, `skirmishRetire`, `shieldwallWhenShot`,
`preferShape`, `feint`, `focusMissiles`, `retreatAt`, `jitter`; small armies press sooner
(`min(D.pressAfterS, 4 + 1.5 × men)`). The five: steady, rush, hammer, swarm, fury.

**To add one:** a GDD row (behaviour, the "tell" a player can learn, counters), the record, its icon
(`ui:doctrine_<id>`, [PROMPTS_ART.md](PROMPTS_ART.md) §4), Codex text (en, ru), who gets it, then the doctrine scan
and the ladder parity run. The tell must match what the bot does.

## 5. Names and places

| Content | Where | Rule |
| --- | --- | --- |
| Hero and captain names | `src/data/names.ts` `NAMES` per culture (`greek`, `phoenician`, `celtic`) | Latin in saves and on the server; `freeName`, `dedupeNames` keep them unique |
| Russian forms | `src/i18n/names.ts` `NAMES_RU` | Conventional Russian form (Brasidas → Брасид); all distinct; `tests/heroNames.test.ts` |
| Places | `src/world/map.ts`, `src/online/maps/*.json`, `src/world/battlefield.ts`; Russian in `src/i18n/places.ts` `PLACES_RU` | Shown through `placeName` |
| Culture labels | `CULTURE_LABEL` | Hellenes, Carthaginians, Galatae |

**To add a name:** append to its culture, add the Russian form, run `npx vitest run tests/heroNames.test.ts`. Use
historically attested names.

## 6. Beasts

`src/data/beasts.ts`, hints in `src/i18n/beasts.en.ts`, battle figures in `src/art/beastArt.ts`. A plate or text
takes its part counts and props from the figure and the hint (five heads, six arms, two boulders) so Codex, plate and
battle agree. Balance: `src/dev/beastBalance.ts`.

## Checklist

- [ ] Only the GDD's vocabulary; a new effect or field went through the GDD first
- [ ] Nothing promises a missing feature (weight 0 or a flag until it exists)
- [ ] Data in `src/data/**`, text in `<ns>.en.ts` / `.ru.ts`, no numbers in text
- [ ] Dev script: no dominated choice / in band / ladder parity ±5
- [ ] Tests pass; sim data changed → replay fixtures checked
- [ ] Seen at 320 in ru; before/after numbers and deviations in `docs/<ver>/balance/<story>.md`
