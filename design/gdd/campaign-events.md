# Overland Event Deck

> **Type**: New Small System (quick-design), extending #19 Overland campaign world
> **Status**: Draft (S2-VISION, 2026-10-10)
> **Vision rank**: 5 of 6
> **Pillars**: P4 Every man has a name; supports P1 (it sends you into fights with stakes)
> **Fixes**: MECH C2 (texture), E2 (a gold sink), H4 (a respec source); folds in the deferred "town contracts" (2.5.3) as event chains
> **Legacy reference**: MECHANICS.md §2.5.1; rpg skill: "choices set flags that later content reads"

## Overview

A seeded deck of short overland events. They fire while you march, when you arrive at a settlement, when you make camp and after battles. Each event is a card with **2–3 choices**. Their consequences last: gold, men, wounds, items and spawned bands, plus **world flags** that later events and the campaign arc read.

Events never change battle rules. They are **offline only**, so they need no server work and no sim version.

## Player Fantasy

"Deserters on the road, asking to join. Four free spears. But their old captain will come looking for them..."

The aesthetics are Narrative and Fantasy, with Autonomy.

## Detailed Rules

### R1. The event definition

The data lives in the new `src/data/events.ts`:

```ts
interface EventDef {
  id: string;
  trigger: 'march' | 'arrive_village' | 'arrive_town' | 'camp' | 'after_battle' | 'flag';
  weight: number;                       // draw weight among eligible events
  cond: { minDay?: number; maxDay?: number; danger?: [number, number]; flags?: string[]; notFlags?: string[];
          minMen?: number; minGold?: number; arcStage?: ArcStage[] };
  unique?: boolean;                     // fires at most once per campaign
  cooldownDays: number;                 // per-event cooldown
  choices: { key: string; cost?: Effect[]; effects: Effect[]; chance?: { p: number; fail: Effect[] } }[]; // 2-3
}
```

### R2. The effect vocabulary

The list is closed. A new effect needs a GDD update.

| Effect | Meaning |
| --- | --- |
| `gold(n)`, `food(n)`, `supplies(n)` | add or remove. Clamped at 0 and at the caps. |
| `recruit(classId, level, n)` | join for free, up to the army cap. Overflow is refused, and the event shows the reason. |
| `xp(target, n)` | `target` is `all`, `one_random` or `lowest` |
| `wound(target, hours)` | the existing wound model |
| `heal(all)` | heal every wound |
| `item(rarity, kind?)` | `rollRarity` or a set piece by culture, into the stash |
| `spawnBand(kind, mods)` | `mods`: size×, level+, `captain: true`, `hunts: true` (chases the player whatever the power ratio), `doctrine?` |
| `weakenGarrison(lairId \| 'nearest', n)` | campaign-arc.md R2 |
| `reveal(lairId \| 'nearest' \| radius)` | lifts fog |
| `retrain(free)` | one free perk retrain (abilities.md R7) |
| `priceMod(settlementId, pct, days)` | a market or recruit price change |
| `closeSettlement(id, days)` | |
| `nextBattle(bonus)` | `bonus` is `+1 loot pick`, `+50% XP` or `+50% gold`. These are **post-battle rewards only**, never sim inputs. |
| `setFlag(name, value?)`, `clearFlag(name)` | |

### R3. Triggers and frequency

The rules are deterministic and use the world RNG (`WorldSave.rng`).

| Trigger | When it's checked | Chance | Limit |
| --- | --- | --- | --- |
| March | every 12 game hours of travel | `EVENT_RATE_MARCH` (0.1) | — |
| Settlement arrival | on entering | `EVENT_RATE_ARRIVE` (0.25) | a 3-day cooldown per settlement |
| Camp | each night spent in camp | `EVENT_RATE_CAMP` (0.2) | |
| After battle | after a won campaign battle | `EVENT_RATE_AFTER_BATTLE` (0.25) | |
| Flag | when a flag set by an earlier event comes due (`flag:<name>@day`) | 1 | |

- **Pacing cap**: at most `EVENTS_PER_DAY` = 1 per game day, and at least `EVENT_MIN_GAP_H` = 24 game hours between events. Flag-due events ignore the gap but still count toward the cap.
- **The real target is per battle, not per day.** Game time runs fast: 1.6 game hours per real second on the march. Events are paced against battles, at **0.3–0.5 events per battle fought**, which is one every 2–3 battles.
- **The draw**: a weighted pick among eligible events (`cond` met, not on cooldown, `unique` not used).

### R4. Showing and resolving an event

1. Once drawn, the event is written to `WorldSave.pendingEvent = { id, seed }` **and saved before it's shown**. Killing the app can't reroll it (P4; the same lesson as MECH C1).
2. The map pauses: no time passes while the card is open.
3. The player picks a choice:
   - `cost` is applied;
   - `chance` is rolled from `seed`;
   - `effects` (or `fail`) are applied;
   - flags are set;
   - `pendingEvent` is cleared;
   - the line goes into the journal.
4. A choice whose cost can't be paid (for example not enough gold) is disabled and shows the reason (UX principle).
5. **Every event has at least one choice with no cost.** Decline is always possible, except for ambush events whose decline is "flee", which uses the existing flee chance.

### R5. Design rules for content (the decision-quality bar)

- Each choice trades between at least two of: gold, men, wounds, time, risk, flags. **No choice is better or equal in every dimension** (checked by the event EV script, Balance).
- At least one third of the events set a flag that a **later** event or the arc reads. Chains are how contract-like stories get told.
- Text is at most 280 characters per card, plus choice labels of at most 24 characters each, in en and ru.

### R6. The starter deck

The deck has 24 events, of which 12 are specified here. The other 12 are written to the same rules in the content story.

| Id | Trigger | Choices (short) | Flags and chains |
| --- | --- | --- | --- |
| `deserters` | march | Take them (recruit 2 raw spears, free) / Turn them away / Rob them (+30 g, a wound risk) | Take → `deserters_joined`, which after 4–8 days unlocks `deserters_hunt` |
| `deserters_hunt` | flag | Stand and fight (a hunting band of mercs with a captain spawns) / Hand them over (lose the 2 deserters, +60 g) | |
| `shrine_ares` | march | Offer 30 g (next battle +50% XP) / Pass by / Loot the shrine (+40 g, sets `ares_angry`) | `ares_angry` → `ares_wrath` after 3+ days |
| `ares_wrath` | flag | Make amends (−60 g) / Bear it (2 random wounds, 24 h) | |
| `plague_town` | arrive_town | Leave at once / Stay and help (−20 food, +XP to all, a 30% wound risk) / Pay the physician (−50 g, the town gets 10% off for 5 days) | |
| `caravan` | arrive_town | Escort (a raider band spawns on your route in 1 day; win → +80 g and an uncommon item) / Decline | `caravan_escort` |
| `rival_challenge` | march, day ≥ 6 | Accept (a rival mercs band with a captain spawns and hunts; its bounty is doubled) / Refuse (−10% recruit prices are lost in this region for 5 days) | `rival_beaten` boosts later recruit offers |
| `rival_returns` | march | Fight / Evade (a flee roll) | `cond`: any `PartyState.escaped ≥ 1` (ai-doctrines.md R8); the escaped band and its captain come back as hunters |
| `oracle` | arrive_village, unique | Pay 40 g (one free retrain) / Ask about the lairs (reveal the nearest lair) / Leave | |
| `deserter_map` | camp | Buy the map (−25 g: reveal the nearest lair and `weakenGarrison(nearest, 3)`) / Refuse | read by the arc |
| `ford_toll` | march, near a river | Pay (−15 g) / Force the ford (a bandit band of 0.8× power attacks) | |
| `host_musters` | flag (arc) | Narrative card, one choice: "To arms" | campaign-arc.md R5 |

## Formulas

### F1. Expected events per battle

```
E_battle = min(1, E_raw) / B_day

E_raw    = (h_march / 12) × r_m + v × r_a + c × r_c + w × r_b
```

E_raw is the uncapped expected events per day. The `min(1, …)` is the daily cap, and the 24 h gap enforces the same limit.

| Symbol | Meaning | Typical |
| --- | --- | --- |
| `h_march` | march hours per game day | 10 |
| `r_m` | `EVENT_RATE_MARCH` | 0.1 |
| `v` | settlement arrivals per day (with `r_a` = 0.25) | 0.7 |
| `c` | camp nights (with `r_c` = 0.2) | 0.3 |
| `w` | wins per game day (with `r_b` = 0.25) | 1.0 |
| `B_day` | battles fought per game day | about 1.2 |

**Typical**: E_raw = 0.083 + 0.175 + 0.06 + 0.25 = **0.57 per day**, which is under the cap. 0.57 / 1.2 ≈ **0.47 events per battle**, inside the 0.3–0.5 target.

**Output range**: from 0 per battle (no marching, no wins) to 1/B_day per battle at the cap.

### F2. Event EV (the dev check)

For each choice, `EV_c` = Σ(effect value), with fixed weights: 1 gold = 1, 1 food = 2, 1 man = 60, 1 wound-hour = −1, a flag = 0 (and the expected follow-up is listed separately). A choice is **dominated** if another choice of the same event is ≥ in every component and > in at least one.

## Edge Cases

- **Army cap full on `recruit`**: the choice shows "No room (20/20)" and is disabled.
- **`spawnBand` with no passable tile near the player**: the band spawns at the nearest lair or town instead.
- **An event while inside a settlement**: only `arrive_*` triggers fire inside. March events wait.
- **A chained event whose band was already killed**: the flag is cleared, and the follow-up doesn't fire.
- **The app is killed with an event open**: `pendingEvent` reopens on load with the same seed and the same outcome.
- **The arc is won (post-game)**: events continue. The `host_musters` card is unique.
- **Old save without `flags` or `pendingEvent`**: the defaults are empty.

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| campaign-arc.md | uses / is used by | `weakenGarrison`, `reveal`, `host_musters`; reads `arc.stage` |
| ai-doctrines.md | uses | `spawnBand` with a captain and doctrine; reads `PartyState.escaped` |
| abilities.md | uses | the `retrain` effect (R7) |
| controls.md | uses | the event card is a BottomPanel sheet (one primary choice, at least 44 pt) |
| #19 World, #20 Settlements, #22 Save | modifies | the triggers in `world.advance`, prices, the save fields |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| campaign-arc.md | R2 garrison, R5 host | uses |
| ai-doctrines.md | R6 captains, R8 `escaped` | uses |
| abilities.md | R7 retrain | uses |

## Tuning Knobs

The knobs live in `src/data/events.ts`.

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| EVENT_RATE_MARCH | 0.1 | 0.05–0.2 | gate | the march share of the 0.3–0.5 per battle |
| EVENT_RATE_ARRIVE | 0.25 | 0.1–0.5 | gate | towns feel alive |
| EVENT_RATE_CAMP / AFTER_BATTLE | 0.2 / 0.25 | 0–0.4 | gate | |
| EVENTS_PER_DAY / EVENT_MIN_GAP_H | 1 / 24 | 1–2 / 12–48 | gate | no spam: game days pass in seconds |
| Per-event weight and cooldown | data | — | curve | content pacing |
| EV weights (dev check) | as F2 | — | — | the dominance test |

## Touch UI needs

- **The event card**: a Mosaic BottomPanel with a vignette niche (an icon now, painted art in the art pass; no upscaled pixel art, G8), a title, up to 280 characters of body, and 2–3 choice buttons.
  - One choice is primary (terracotta); the others are bronze.
  - Each has a cost chip with an icon and a number: never colour only, never truncated.
  - It must fit at 320x640.
- **Journal**: from the World top bar's arc chip, the last 20 event lines.
- **Map**: the time-paused state shows a dim scrim.
- **Strings**: every event text in en and ru (G12). The layout check gains an `event-card` fixture.

## Online and server impact

**None.** The overland campaign is offline. Effects never touch the sim (`nextBattle` bonuses apply only to post-battle rewards in `src/game/loot.ts` and `campaign.ts`). Events can't reach duels or war.

## Save impact

Part of the **v5 campaign save bump**:

- `WorldSave.flags: Record<string, number>`
- `WorldSave.eventCd: Record<string, number>` (the day it's next allowed)
- `WorldSave.eventsToday: [day, count]`
- `WorldSave.pendingEvent?: { id: string; seed: number }`
- `WorldSave.journal: string[]` (event ids and choice keys, capped at 20)

**Migration**: empty defaults.

**Size**: flags and the journal must stay small, because the save is chunked into 3,800-character CloudStorage parts. Cap the flags at 64 keys.

## Balance targets (`npm run balance` and the dev script)

- **The EV table** (new `src/dev/eventBalance.ts`, printed by `npm run balance`): **0 dominated choices** in the deck.
- **Net gold from events, averaged per battle**: −10 g to +25 g, which is at most 10% of an even win's income (BASELINE: about 225–305 g). Events shape the economy; they don't replace it.
- **Event frequency** in a scripted 40-battle campaign: **0.3–0.5 events per battle**.
- **Playtest**: no choice is picked more than 80% of the time across 5 testers (an experiential check).

## Acceptance Criteria

- [ ] Events are drawn deterministically from the world RNG. The same save and the same actions give the same events (test).
- [ ] `pendingEvent` is saved before display. Killing and reloading shows the same event and outcome.
- [ ] Every event has 2–3 choices, at least one free, and the EV check shows no dominated choice.
- [ ] Flags set by one event make later events and the arc eligible (chain test: deserters → deserters_hunt).
- [ ] The event card passes the layout check at 390, 360, 320x640 and 320x568 in en and ru.
- [ ] *Experiential*: playtesters remember at least one event and its consequence after a session.

## Files touched

- **Data**: new `src/data/events.ts`, new `src/dev/eventBalance.ts`.
- **World**: `src/world/world.ts` (`WorldEvent`, `advance` triggers), `src/game/campaign.ts` (effects), `src/game/save.ts`, `src/game/loot.ts` (`nextBattle` bonuses).
- **Scenes**: `src/scenes/WorldScene.ts` (event card, journal), `src/scenes/SettlementScene.ts` (arrival hook), `src/scenes/CampScene.ts` (camp hook), `src/i18n/*`.
- **Tests**: `scripts/layout-check.mjs` fixtures, `tests/events.test.ts`.
