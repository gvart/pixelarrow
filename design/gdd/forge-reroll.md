# Quick Design Spec: Forge reroll (the town Smith)

**Type**: Addition (a small mechanic on top of the item system; no new state beyond the item's existing `aff` field)
**System**: Items, random stats (`src/data/affixes.ts`), campaign economy
**GDD Reference**: no GDD covered rerolling. Sources used: `docs/ITEMS.md` "Random stats" and Open question 1, `docs/v5/audit/MECHANICS.md` E2 and §2.6.2, `docs/v5/balance/BASELINE.md` "Economy", `docs/v5/balance/AR-03.md` "Economy", `docs/v5/vision/GDD_REVIEW.md` W6 and Deferred 1, `docs/v5/DECISIONS.md` V5-018, V5-031, V5-070, V5-071, `docs/v5/plan/ANSWERS.md` A-40, story EC-01 in `docs/v5/plan/STORIES.md`.
**Prior quick specs for this system**: none (`design/quick-specs/` does not exist).
**Date**: 2026-10-12
**Story**: EC-01 (W19)

## Change summary

Every town gets a **Smith** in its Services tab. For gold, he **reforges one
random stat** of an item the player picks: that line is drawn again, as at a
drop, and the item's other lines and its power stay. It is campaign only,
paid in campaign gold only, and has no cap: it is the endgame gold sink.

## Motivation

Gold has no use once the 20-man army is hired and kitted (MECHANICS E2,
BASELINE "Economy"). AR-03 made it worse on purpose: tier-3 loot resale pays
479 g a win against 213 g of battle pay, and the campaign has no end. V5-070
made this story required. A sink that nobody wants is not a sink, so the
spend has to buy something a late player wants: a better roll on the gear he
already loves. That is a long, optional chase, not a tax.

## Options considered (decided autonomously; the user was asleep)

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| A. **Reforge one chosen line** (the line is redrawn; others and the power stay) | Player choice (which line); a chase with a visible goal; the power ceiling is the natural ceiling; reuses `aff` (no save field) | Can be repeated until an item is perfect | **Chosen** |
| B. Reroll all random stats at once | Simplest | A pure slot machine: a good line is lost with a bad one; little agency | Rejected |
| C. Lock rule (only the first reforged line may be reforged again, as in Diablo III) | Slows the chase | Needs a new per-item field (save change) and a line to explain | Rejected: the cost does the slowing |
| D. Raise a line's steps above the natural 2 | A clear upgrade | Breaks the item power cap (V5-071) and the rarity targets | Rejected |
| E. Reforge the power too | More chase | Powers are worth about 10 points per kit; would break the cap | Rejected |
| F. Gold cost that climbs per reforge of an item | Classic escalation | Needs a per-item counter (save change) | Rejected: a flat price per tier and rarity |

## Rules

1. **Where.** The Smith is a row of the Services tab in every **town**
   (villages have no Smith). It stays open when the town's market is closed or
   sacked, like the other services (SET-01). Campaign only (A-40): there is no
   Smith on the war map, in duels or online.
2. **Which items.** Any item in the stash **or worn** by a man of the army
   that has at least one random stat (uncommon and finer; set pieces included).
   **Not** named legendaries: their stats are fixed by their name (`def.fixed`).
3. **The choice.** The player picks one random-stat line of the item. By
   default the sheet selects the weakest line (fewest steps; the last one on a
   tie).
4. **The draw.** The chosen line is replaced by a stat drawn from the item's
   normal pool (`affixPool`: the slot's stats, the base item's own stats count
   double, family limits apply) **minus the item's other lines**, so an item
   never carries a stat twice. The line's own stat stays in the pool: a
   reforge can return the same stat. Its steps are rolled from the rarity's
   normal range (`AFFIX_STEPS`, 1–2 today). The result is never above what a
   drop could roll.
5. **What stays.** The other lines (in their order), the power, rarity,
   condition, paint, uid and value. The item's first line names it ("Keen
   ..."), so reforging the first line can rename it. Sale value does not
   change, so a reforge can never make gold.
6. **The price** (gold, paid up front, no refund):
   `FORGE_COST = round5(FORGE_BASE[tier] × FORGE_RARITY[rarity])`, with
   `FORGE_BASE = { 1: 20, 2: 40, 3: 80 }` and
   `FORGE_RARITY = { uncommon: 1, rare: 1.5, epic: 2, legendary: 3 }`.
   The tier is the base item's tier (1–3).

   | Tier | Uncommon | Rare | Epic | Legendary |
   | --- | --- | --- | --- | --- |
   | 1 | 20 | 30 | 40 | 60 |
   | 2 | 40 | 60 | 80 | 120 |
   | 3 | 80 | 120 | 160 | 240 |

7. **Determinism.** The draw uses the **world RNG** (`World.rng`, saved in
   `WorldSave.rng`), never `Math.random`. The game saves right after a
   reforge, so killing the app cannot undo it or roll it again, and the same
   save and the same choices always give the same result.
8. **No preview, no undo.** The new line is shown after paying. The old line
   is shown beside it ("was: ...") once, on the sheet.
9. **Refusals** (each one is shown as a reason, not a silent grey button):
   - no item qualifies: "No item with a random stat. Uncommon and finer gear has them.";
   - not enough gold: "Need {n} gold. You have {gold}.";
   - a named legendary: it is not listed (rule 2).
10. **No real money.** The Smith takes campaign gold only. Campaign gold is
    never sold for Stars or Drachmae, so the forge is no pay-for-power hook
    (V5-017 anti-pillar, PROPOSALS).

## Formulas and worked values

- **Chance a reforge hits a wanted line** (stat `s` at the top step):
  `p = w_s / W × 1 / |steps|`, where `w_s` is the stat's weight and `W` the
  pool's weight after the other lines are taken out. For a tier-3 legendary
  falcata (a melee pool of 6 stats; the falcata's own damage and shield pierce
  count double, weight 8 in all) wanting Keen (damage) at 2 steps, with its
  3 other lines (Swift, True, Hooking: weight 4) out of the pool:
  `p = 2/4 × 1/2 = 0.25`, so **4 reforges, 960 g** on average for that one line.
- **Late-game gold** (AR-03, BASELINE): 213 g battle pay plus 120–479 g loot
  resale a tier-3 win. One legendary reforge (240 g) is 0.35–0.7 of a win;
  perfecting one line of one legendary item is about 1.4–4.5 wins, and a
  narrow pool's rarer stat costs several times that.
- **Sink capacity:** 20 men × 5 slots × up to 4 lines. Perfecting one
  legendary kit for one man (5 items, 20 lines at about 1 000 g or more each)
  costs about 20 000 gold or more; the army's whole
  kit is out of reach of any campaign. The sink does not run out (the economy
  designer's "sinks that run out" check), and every reforge is optional.

## Tuning knobs

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| `FORGE.base` (gold by tier 1/2/3) | 20 / 40 / 80 | 10–200 a tier | curve | A tier-3 legendary reforge is about half a late win's gold |
| `FORGE.rarity` (uncommon/rare/epic/legendary) | 1 / 1.5 / 2 / 3 | 1–5 | curve | Finer gear has more lines worth chasing and more value to protect |
| Steps of a reforged line | `AFFIX_STEPS` of the rarity (1–2) | fixed | gate | Above 2 breaks the item cap (V5-071) |
| Lines a reforge touches | 1 | fixed | gate | Option A |

The values live in `src/game/economy.ts` (`FORGE`).

## Balance

- **Power ceiling** (scratch run of the rarity mirror, 100 seeds, L5 / L10):
  a full legendary kit with every line at 2 steps beats the natural legendary
  kit 62 / 60%; with the best stats of each pool at 2 steps, 69 / 66%. That is
  about **+3.5 points an item**, inside the 10-point item cap (V5-071). The same
  kits beat an all-common army 94 / 89% and 97 / 93% against the 85% target for
  an average legendary kit: the ceiling is a perfect drop, which the rarity
  target does not describe. Campaign gear never enters duels or the war map.
- **Sink row** (`tests/forge.test.ts`, recorded in `docs/v5/balance/EC-01.md`):
  the expected gold to perfect one line of a tier-3 legendary is more than four
  wins' battle pay, and the price of one reforge stays under one tier-3 win's
  gold (213 g battle pay plus at least 120 g resale).
- `npm run balance` anchors are unchanged: the forge touches no battle code.

## Acceptance criteria

- [x] A reforge changes exactly the chosen line; the other lines, the power,
      rarity, condition and value stay (test).
- [x] The new line is never a stat the item already has elsewhere, and its
      steps are within the rarity's range (test, many seeds).
- [x] The same world RNG state gives the same reforge; the RNG state advances
      and is saved (test).
- [x] The price follows the table; too little gold refuses with the reason,
      and nothing changes (test).
- [x] Named legendaries and common items are not offered (test).
- [x] The Services tab of a town shows the Smith; the forge sheet shows the
      item before and after a reforge and a disabled state with its reason, in
      English and Russian at 390 and 320 wide; layout-check shows no new
      violations.
- [x] No regression: `npm run balance` anchors unchanged; old items without
      a stored `aff` keep their rolled stats until reforged.

## Affected systems

| System | Impact | Action |
| --- | --- | --- |
| Items (`affixes.ts`) | A reforged item stores its lines in `aff` (already supported) | none |
| Gear logic (`src/game/gear.ts`) | `forgeLines`, `forgeReroll`, `forgeable` | new code |
| Economy (`src/game/economy.ts`) | `FORGE` prices, `forgeCost`, `fmtGold` | new code |
| Settlement Services | The Smith row | `SettlementScene.buildServices` |
| Forge sheet | Pick an item, pick a line, reforge | `src/ui/sheets/forge.ts` |
| Save | No new field (`aff` exists) | none |
| `docs/ITEMS.md` | Open question 1 answered | updated |

## GDD update required?

No GDD covered rerolling. `docs/ITEMS.md` gets the rules ("Reforging at the
Smith") and Open question 1 is closed.

## Review — 2026-10-12 — Verdict: APPROVED

`/design-review` lean, self-run (no specialist agents; the user was asleep).

- **Completeness**: summary, motivation, options, rules, formulas with worked
  values, knobs, balance, ACs and affected systems are all present for a quick spec.
- **Boundaries**: the tier is clamped to 1–3; a common item costs 0 and is
  never offered; when the pool minus the other lines is empty, the line keeps
  its stat and only the steps are redrawn; a refusal draws nothing from the RNG.
- **Consistency**: steps stay in `AFFIX_STEPS` (the V5-071 cap holds); no save
  field (`aff` exists); the world RNG, as the story AC asks; campaign only (A-40).
- **ACs**: each one is a test or a screenshot; none is a "feels" criterion.
- **Scope**: S (one system, one formula, no ADR).
