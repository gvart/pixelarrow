# v5 audit: mechanics, systems and balance

Story S1-AUDIT-MECH. Audited on 2026-10-10 on branch `v5` @ ea5af21 (the code is the same as `main` @ bd61069). Balance numbers come from [../balance/BASELINE.md](../balance/BASELINE.md) (400-seed run). Paths are relative to the repository root, and line numbers are ±2.

**Severity**

- **S1**: breaks the game's stakes or economy, or blocks v5 depth. Fix before expanding.
- **S2**: a real depth or balance problem, fixable by tuning or a small feature.
- **S3**: polish or debt.

**Depth** asks whether the player faces interesting decisions:

- **Deep**: real trade-offs that change by situation.
- **Medium**: a few meaningful choices.
- **Shallow**: one right answer, or no choice at all.

---

## 1. Systems

### 1.1 Battle sim (`src/sim/battle.ts`, 2,196 lines)

**What exists**

- **Engine.** A pure TypeScript real-time sim:
  - A 20 Hz fixed tick (`TICK_RATE`, L43).
  - A mulberry32 RNG (`src/sim/rng.ts`). Each bot gets its own RNG, seeded from `seed ^ (0x5bd1e995·(side+1))` (L281).
  - No trigonometry. Units update in id order.
  - `hash()` (L2141) fingerprints the whole state.
- **Step order** (L974–997): orders → bots → auras (every 10 ticks) and powers → slot reassignment (every 40 ticks) → groups and units → separation → myth → projectiles → end check.
- **Damage** (`applyDamage`, L1843):
  - `raw = dmg × U(0.8,1.2) × direction × charge × brace × height × buffs`
  - `final = max(0.5, raw × 0.34 × 12/(12+armour))`
  - Missiles carry armour pierce.
- **Hit chance.** Melee hit chance is a **flat 0.55** (L1701): +0.08 against a winded target, +0.15 for a mounted impact.
- **Block.** Frontal only: ×0.35 from the side, 0 from the rear, +0.15 in a shield wall, clamped to 0.85.
- **Formations** (`src/sim/formation.ts:6`): line, column, wedge, skirmish (loose), shield wall. Slot priority puts shielded spears in front and missile men at the back (`battle.ts:2187`).
- **Orders** (`src/sim/types.ts:180-194`):
  - `form` (move, face, frontage, shape), `preset`
  - `order`: hold, advance, charge, fallback
  - `shieldwall`, `loose` (fire at will)
  - `detach` / `rejoin`, `assign` (deploy only)
  - `ability`, `retreat`, `horn`

  Every order is logged with its tick. The sim does not throttle orders.
- **End.** A side with nobody standing loses. At 300 s, the side with more than 1.1× the HP wins; otherwise it is a draw.

**Decision depth: Medium-deep.**

- The real decisions are in where and when, not what:
  - Placement and facing.
  - When to commit the reserve.
  - Where the flank group goes.
  - When javelins loose.
- The order set is small: four group orders, five shapes, toggles.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| B1 | Melee hit chance ignores level, attributes and class (L1701). Skill shows only in damage, HP and block, so a veteran and a levy hit equally often. That flattens the growth fantasy of an RPG layer. | S2 |
| B2 | `form` always resets the group's order to `hold` (L527). Re-facing a charging group stops it. The bot hits this too: `ai.ts face()` → `form` causes stalls (ai.ts L431–442). | S2 |
| B3 | There is no group-level cohesion. The `routed` flag (≥50% gone plus some routing) is display and AI only: it does not shake the rest of the group. Morale is per man, with a 5-unit cascade. | S3 (and a v5 opportunity) |
| B4 | Two statements share one line at L1708. Cosmetic. | S3 |
| B5 | There is no version tag on the sim (see 1.11). Every change to the sim is a coordinated client and server deploy. | S1 for v5 process |

### 1.2 Morale (`battle.ts:49-85`, `1553-1622`)

**What exists**

- Each hit costs morale: `dmg × 0.5 × {front 1, side 1.8, rear 2.8} × moraleLoss × (1 + shock + charge)`. Missiles ×0.8.
- Within 5 units:
  - An ally's death: −6.
  - An ally's rout: −5.
  - An enemy's death: +3.
- Outnumbered in melee: −0.5 × the excess. Exhausted in melee: −1/s. Horse dread: −0.5 per horse every 0.5 s, ×3 for missile men; spear walls are immune.
- **Rout** below 25% of max morale (per-class `routAt`, e.g. fanatic 0.15). A routing man flees at 1.6× speed.
- **Rally** at 55% morale when no enemy is within 5; a routing man recovers 3.5/s. Animals never rally.
- **Rally tools:** Rally Cry, the war horn (3 per army, `HORN_RULES`), Berserk's no-rout window, and the Last Stand and Born to Rule powers.

**Depth: Deep.** This is the core of the game, and it works. The rear-vs-front flank test shows a ×7.6 faster rout: 12.8 s vs 97.5 s.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| M1 | The bot routs first (median 40 s after contact) while the player's line holds about 59 s. The doc claims 34–38 s for both, so this has drifted unnoticed. | S3 |
| M2 | Morale tools are tied to heroes with specific perks (Rally Cry at tier 4, or WIL 9). An army without them has the horn as its only rally. There is no commander-level morale lever, such as a standard, a general or a speech before battle. | S2 |

### 1.3 Flanking

**What exists**

- `hitDirection` (L1653) uses the dot product of the attacker's offset with the target's facing: >0.45 is front, < −0.35 is rear, anything else is side.

  | Hit from | Melee damage | Missile damage | Morale damage | Block |
  | --- | --- | --- | --- | --- |
  | Side | ×1.3 | ×1.15 | ×1.8 | ×0.35 |
  | Rear | ×1.6 | ×1.3 | ×2.8 | 0 |

- A mounted flank charge adds ×1.3 damage and +1.0 shock.
- A man fighting one enemy keeps facing it, so a second attacker gets the flank bonus.
- The `flanked` event fires at most once per 12 s per group, for display.

**Depth: Deep** in effect, and **Shallow** in counterplay:

- There is no "refuse the flank" or "wheel" order.
- No square, orb or hollow formation exists.
- The only counter is a reserve placed by hand.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| F1 | Flanking is strong, but defensive answers are thin: no orb, square or refused-flank shape, and no "face threat" order that keeps a charge going (see B2). | S2 |
| F2 | Cavalry flank play is barely break-even. 6 hoplites + 2 Companions vs equal-cost hoplites wins 54%. The main flanking arm under-delivers. | S2 |

### 1.4 Javelins and missiles

**What exists**

- Projectiles have travel time, lead and scatter: `(1−acc)×(0.35+0.09·d)`, ×1.3 on a galloping horse. A missile hits whoever stands within 0.5 of the landing point. Forest cover absorbs 38%. Minimum range 1.4.

  | Weapon | Damage | Range | Ammo | Armour pierce |
  | --- | --- | --- | --- | --- |
  | Javelins | 11 | 7 | 3 | 0.25 |
  | Saunion | 13 | 7.5 | 4 | 0.35 |
  | Soliferrum | 15 | 6.5 | 2 | 0.5 |
  | Sling | 6 | 11 | 20 | — |
  | Bow | 7 | 13 | 16 | — |
  | Cretan bow | 7.5 | 14 | 18 | — |
  | Scythian bow | 7 | 11 | 30 | — |

  Weapon stats are in `src/data/items.ts:145-280`.
- **Javelin groups hold their throws** until `loose` or `charge` (L268–274, L553). This is the javelin timing decision.
- Volley gives 2 free shots. Riders shoot on the move.

**Depth: Medium.**

- The javelin timing is a real decision.
- Bows and slings are fire-and-forget: fire at will is on by default, and there is no target priority order, no aimed or focused fire, and no fire arrows.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| J1 | Pure missile classes are the weakest in the round robin: archer 36%, slinger 34% (the band edge). Eagle Eye is worth 0 points and Volley +2. Missile investment does not pay. | S2 |
| J2 | There is no target order for missile groups. "Tap an enemy" sets an attack, but missile men keep shooting the nearest target. There is no "shoot their archers" or "shoot the flank" decision. | S2 |

### 1.5 Unit roster (`src/data/classes.ts:149-337`)

**What exists**

- 18 human classes: levy, 4 heavy, 4 ranged, 4 light, 3 cavalry, 2 elite.
- 3 animals (wolf, boar, bear) and 10 mythical beasts.
- Mounts are a class property: horse or chariot (`MOUNTS`, L78).
- Each class has its own five-tier perk tree. Costs were fitted to a 34–64% band.

**Depth: Medium.** There is a clear rock-paper-scissors, but the matrix is too polar: 104 of 306 cells are at 0–4% or 96–100%.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| R1 | **The elites are a trap at equal cost.** Royal guard (130, mean 42%) and Sacred Band (125, 48%) lose 92–100% to the Celt, Gaul, peltast, falx, fanatic and rhomphaia. | S1 (dominant choice) |
| R2 | Near-duplicates with thin identity: Royal guard vs Sacred Band (same `bronze_dory`, shared perks); archer vs slinger (same tree except tier 0); thureophoros vs Celtic swordsman; javelineer vs peltast. | S2 |
| R3 | Militia (60) beats all three cavalry classes 100%, and chariots lose 0% to militia. The chariot's "breaks loose foot" role fails against the cheapest foot. | S2 |
| R4 | The fanatic cannot be recruited (empty `cultures`) and beats every mounted and elite class 92–100%. Cultist bands hard-counter cavalry players. That may be fine, but it should be stated in the docs. | S3 |
| R5 | Round-robin cells use 25 seeds (1 SE about 10 points). The cost fit rests on noisy data. | S3 |

### 1.6 Heroes, perks and abilities (`src/data/perks.ts`, `src/sim/powers.ts`)

**What exists**

- One hero is one soldier: levels 1–10, STR/AGI/END/WIL (2 points per level), 1–2 traits, and five gear slots.
- A perk at levels 2, 4, 6, 8 and 10, down a **linear** class tree. There is no branching.
- **4 actives:**

  | Ability | Cooldown | Effect |
  | --- | --- | --- |
  | Bash | 12 s | stun, then daze |
  | Volley | 20 s | 2 free shots per shooter |
  | Berserk | 40 s | 8 s of fury |
  | Rally Cry | 45 s | restores morale, turns routers back |

- **3 auras:** Steady, Eagle Eye, Warlord.
- **16 item powers** and 5 set specials (`powers.ts`, `src/data/sets.ts:42`).
- There is no commander unit on the field.

**Depth: Shallow-to-medium.**

- Point allocation has a preview, but perk choice is **zero-choice**: the tree is linear, and a perk outside the class tree is blocked.
- Actives are 4 shared ids (`AbilityId`, `perks.ts:57`) across 18 classes.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| H1 | The perk trees are linear, so levelling gives no decision. The doc calls them "trees", but each is a chain of 5. | S1 for v5 depth |
| H2 | The abilities' impact is 0–5 points each (BASELINE: Bash +3, Berserk +5, Eagle Eye 0). Doc numbers like Bash 59% are stale. | S2 |
| H3 | Only 4 actives exist. Most classes (cavalry, falx, rhomphaia, chariot, archers) have no class-specific active. | S2 |
| H4 | No respec offline (`src/duel/heroSource.ts:25` online only). | S3 |

### 1.7 AI (`src/sim/ai.ts`, 923 lines)

**What exists**

- A **scripted role-based FSM**: a `stage` memo per group, thinking every 10 ticks, staggered by side. It issues the same `Order`s as the player.
- **Roles:** main line, skirmishers, flank, reserve, cavalry, horse archers, beasts, and myth hunts.
- **Terrain-aware deploy:** takes high ground, puts skirmishers in woods, crosses at fords.
- **Abilities:** it uses all four, with thresholds.
- **Anti-stall:** after 25 s with 8 s of nothing happening, it commits everything.
- **Variety** (`src/game/enemy.ts`): 3 cultures; mixes for bandits, raiders and mercs; neutral mixes (outlaws, hill tribes, pirates, deserters, cultists, beasts). Cavalry appears from tier 2.

**Depth for the player: Medium**, and predictable.

- The game-ai skill's test is: does the agent's decision model fit the behaviour count? An FSM is right for 2–5 states. Here there are 8 roles × several stages, all driven by **fixed timers**:
  - flank at 14 s
  - idle press at 25 s
  - beasts at 45 s
  - hill hold up to 50 s
  - ford wait up to 55 s
  - reserve at 70 s

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| A1 | **There are no AI personalities.** Every culture and band fights with the same doctrine and timers. Only the army make-up differs, which is the biggest "enemy variety" gap. | S1 for v5 depth |
| A2 | Exploitable fixed patterns: shooting a hill-holder after 22 s baits it down; skirmishers retreat at a 5-unit threat, so a feint silences them; the flank group always targets the largest group's side; cavalry's "braced" test reads group flags only. | S2 |
| A3 | The AI never uses `fallback` with infantry, never detaches, and never retreats. A bot army always fights to the end. | S2 |
| A4 | Reserve commit and target choice are hard thresholds. The game-ai skill recommends utility scoring for "how strongly do I want each option". That would smooth the predictability without becoming a behaviour tree. | S3 |
| A5 | **Any AI change is a sim change for online.** The server re-derives bot orders from the seed (`server/src/battle.ts:198-223`), so the AI is bound by determinism and the deploy lockstep too. | constraint |

### 1.8 Campaign and progression (`src/world/*`, `src/game/campaign.ts`)

**What exists**

- An open 112×112 overland map generated from a seed: 4 towns, 9 villages and 6 lairs.
- **Bands** chase you at a power ratio ≥1.1 and flee below 0.8. They respawn every 10 h, up to `min(16, 9+days/2)`.
- **Encounters:** attack, flee (15–90%), ransom (under 0.35× your power), or let go.
- **Settlements** have recruits and markets. Food and supplies feed the field camp (tents, fire, palisade, forge, drill yard).
- **Wounds and permadeath:** a 40% knock-out chance (+END), with a 36 h wound.
- **XP:** `40·L` per level, level cap 10 (`src/data/units.ts:66`).
- **Traits:** gained at levels 3, 5 and 8.

**Depth: Medium.** Picking fights by the power plate, flee or fight, and managing wounds are real decisions. There is no goal beyond growing.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| C1 | **Killing the app escapes permadeath.** `state.pending` and `state.last` are not saved, so killing the app mid-battle voids the fight. | S1 |
| C2 | **No campaign arc or end state.** Lairs are never destroyed, and the only world events are `encounter` and `arrive` (`world.ts:93-95`). There are no random, narrative or quest events. | S1 for v5 depth |
| C3 | Bands never reach tier 3, cap at level 8 and size 18 (`world.ts:660-673`), so the late game stops scaling. | S2 |
| C4 | `weakenParty` rerolls the band's seed (`world.ts:713`). A beast you lost to can come back as a plain band, or the reverse. | S2 (bug) |
| C5 | A palisaded drill camp gives free, safe XP to level 4. The fractional `drill` buffer is not saved. | S3 |
| C6 | Late XP dead zone: levels 6–10 take about 46 battles, with only aura perks (worth 0–4 points) to show for it. | S2 |
| C7 | `generateEnemyArmy` / `ENEMY_POWER` (the skirmish opponent) is effectively dead outside the balance harness (`BattleScene.ts:321-324`). `Campaign.recruit/canRecruit` have no callers. | S3 |

### 1.9 Economy and shop

**What exists**

- **Offline (gold).** Faucets and sinks:

  | Faucets | Sinks |
  | --- | --- |
  | Battle gold `(20 + 12·kills + 60 win)` (`src/game/loot.ts:132`) | Recruits: 40 in villages, `cost−40+35·(L−1)+gear/3` in towns (`world.ts:817-832`) |
  | Loot sold at 100% value | Wares at 1.5× value |
  | Ransoms | Repairs |
  | Scrap → supplies | Healing at 1 g/h |
  | | Food and supplies |
  | | Forge temper (`campaign.ts:170-187`) |

- **Online (constrained).**
  - Stars → Drachmae only (`server/src/products.ts`).
  - Drachmae buy cosmetics, the season pass (500) and consumables.
  - The player marketplace accepts gold or Drachmae, with a 10% fee burned (`src/game/marketRules.ts`).

**Depth: Shallow.** Gold buys men and gear, and the only interesting sink is choosing which recruit.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| E1 | Loot resale is the main faucet (about 120–200 gold per win against about 105 gold battle pay). An even fight is about break-even after about 2 permanent deaths, which rewards punching down and ransoms. There is no stated target for any offline flow. | S2 |
| E2 | No endgame gold sink once the 20-man cap is kitted. Forge temper stops at rare. | S2 |
| E3 | Repair cost ignores rarity while sale value includes it: repair-then-sell arbitrage (finite). | S3 |
| E4 | **Real money: an indirect power path.** Drachmae (Stars) can buy legendaries on the war-map marketplace (bounds up to 10,000 Dr). DESIGN_V2 says "no direct power purchases", which this technically keeps, but it should be an explicit decision. | S2, constrained |
| E5 | The premium pass returns much less than the 600 Dr decided on 2026-10-07 (ROADMAP). | S3, constrained |

### 1.10 Items (`src/data/items.ts`, `affixes.ts`, `sets.ts`, `gearRules.ts`, `src/game/sources.ts`)

**What exists**

- ITEMS.md steps 1–3 are all built:
  - 178 items (31 set pieces, 12 named, 22 bound).
  - 5 rarities with 0–4 random stats and powers on epic and legendary.
  - Attribute requirements with a soft penalty (10% per missing point, capped at 70%).
  - Hard class limits.
  - 8 sets.
  - Army-weighted loot, pity at 8, bound items.
- The rarity mirror is **on target**: 59 / 68 / 76 / 89% at level 5, against targets of 58 / 66 / 76 / 85%.

**Depth: Medium-deep** in data. In play it is limited by sources (below).

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| I1 | **The Beast Trial is a free legendary farm** (`src/scenes/BeastTrialScene.ts:89-95`): no cost, time or cooldown, normal loot, gold and pity, and a fresh seed each time. Combined with C1, outcomes can be rerolled. | S1 |
| I2 | **Unreachable offline:** the rare sets (they need tier-3 bands, and C3 means none exist), the legendary sets Achilles and Alexander, and the ladder's named items. | S2 |
| I3 | Pity counts the loot pool, not the pick, so a legendary you leave behind still resets it. | S3 |
| I4 | Near-dead items: 18 tier-1 trinkets at value 30 once tier 2 arrives, and the Corinthian helm's −0.05 accuracy. | S3 |
| I5 | Doc drift: ITEMS.md "Code changes" still lists `RARITY_MULT` 1…1.20 (the code has 1…1.08), and describes a load migration that is really a lazy derivation from the uid. | S3 |

### 1.11 Duels and war: the client/server split

**What exists**

- **The server replays every online battle with the client's own `src/sim`.** It is imported by relative path into the Worker. The single adapter is `server/src/battle.ts` (zod schemas L36–141; `replayBattle` L198–223).
- `server/src/duel/verify.ts:26-50` requires an exact match on winner, ticks and `Battle.hash()`.
- **Server-authoritative:**
  - Seeds and armies, loaded from D1.
  - Budgets (`teamProblem`, `src/duel/rules.ts`).
  - Rewards, Glicko-2, spoils, region capture (`src/online/battle.ts` `resolveAttack`, optimistic region `version`) and bosses.
- **Live duels are lockstep:** `TURN_TICKS=2`, `DELAY_TURNS=2`, and a hash compare every 10 turns (`src/online/protocol.ts:25-28`).
- **Offline campaign battles** are posted to `/api/battle/verify` fire-and-forget, for logging only.

**Depth:** not applicable; this is infrastructure. It is solid.

**Problems and constraints for v5**

| # | Problem | Severity |
| --- | --- | --- |
| O1 | **There is no `SIM_VERSION`, rules version or client-version gate.** Any change to the sim, AI, data or stats breaks: in-flight tickets (10 min), live duels between mixed builds (desync), and stored async raid replays (`server/src/duel/async.ts:413-430`). | S1 for v5 process |
| O2 | New order kinds or enum values need the server's zod schema (`server/src/battle.ts:132` takes `ability` as `z.string().max(32)`, so new ability ids pass, but new `kind`s do not). Limits: 64 units per side, 16 groups, 20,000 orders, 600 s. | constraint |
| O3 | Every new mechanic must be bit-deterministic: no `Math.random`, no trigonometry, iteration in id order. | constraint |

### 1.12 Save format and version (`src/game/save.ts`)

**What exists**

- `SAVE_VERSION = 5` (L14), with a v1→v5 migration chain (L98–142) and `validate`.
- Storage: JSON in 3,800-character chunks (`px_part_N` and `px_meta`). That is Telegram CloudStorage mirrored to localStorage (`src/platform/storage.ts:61-65`), plus a server copy (`/api/save`, `seq` / `revision`, `src/platform/saveSync.ts`).
- Saved fields: gold, heroes, stash, rng, world (seed, time, parties, places, fog, food, supplies, camp), pity, settings.

**Problems**

| # | Problem | Severity |
| --- | --- | --- |
| S1 | **A data-loss path.** `migrate` returns null for a newer version or an unknown item def (L148, L163). `state.load` then builds `Campaign.fresh` and **saves over** the old save (`src/state.ts:65-70`). An older client opening a v6 save, or a removed item, wipes the campaign. | S1 |
| S2 | The pending battle is not saved (C1). | S1 |
| S3 | No world flags or quest state exist yet. Any event or quest feature needs a v6 migration. | constraint |

---

## 2. Expansion opportunities (ranked by depth gained vs cost)

**Flags**

- **[SERVER]**: touches server rules or the replay contract. That needs a client and server deploy together and, after O1, a sim version bump.
- **[SAVE]**: needs a save migration.
- **[MONEY]**: touches real-money pricing or entitlements.

Almost everything in `src/sim` is **[SERVER]**, because online battles replay it.

**Cost scale:** S is about 1–3 days, M about 1–2 weeks, L more than 2 weeks.

**Prerequisites for every [SERVER] item** (they are not expansions, so they are not ranked):

1. Add `SIM_VERSION` to `BattleSetup` and tickets, and make the server refuse mismatched clients (O1).
2. Stop the save overwrite on a failed migration (S1).
3. Persist the pending battle (C1).

### 2.1 Unit and hero abilities

| Rank | Pick | Depth / cost | Flags |
| --- | --- | --- | --- |
| 1 | Branching perk trees | High / M | [SAVE] |
| 2 | Class signature actives | High / M | [SERVER] |
| 3 | Re-tune ability magnitudes | Medium / S | [SERVER] |

1. **Branching perk trees.** Turn each class's linear five-perk chain into two options per tier (A/B). For example, hoplite tier 2 is Shield Bash or a "Push of Pike" shove. This turns every level-up into a decision (H1).
   - Data: `src/data/perks.ts` (trees, `PERK_LEVELS`), `src/data/classes.ts`.
   - UI: `src/scenes/HeroScene.ts`. Bots: `autoDevelop` in `src/game/heroes.ts`.
   - Perk ids are already saved, so old saves keep their chosen chain as the A path. New perks that change stats also go through `src/sim/stats.ts`, which makes those parts [SERVER].
2. **Class signature actives.** Give each class family one active:
   - Cavalry: "Wheel and re-charge".
   - Falx and rhomphaia: "Shield-breaker", which drops a target's block for 6 s.
   - Archers: "Aimed volley" at a tapped group.
   - Chariot: "Scythe run".
   - Sacred Band: "Bond", which shares morale.

   That brings `AbilityId` from 4 to about 10 (`perks.ts:57`), with effects in `battle.ts` `useAbility`, bot use in `ai.ts`, and medallions in `src/ui/battleHud.ts`. The server's zod already accepts any ability string, but replay determinism makes it [SERVER].
3. **Re-tune ability magnitudes.** Make each ability worth 5–10 points (H2) and re-measure in `src/dev/balance.ts` `perkImpact`. This is pure data in `perks.ts` and `RULES`.

### 2.2 Formations and orders

| Rank | Pick | Depth / cost | Flags |
| --- | --- | --- | --- |
| 1 | Fix the order reset, add Wheel and Face-threat | High / S | [SERVER] |
| 2 | Orb / square formation and a feigned-retreat order | High / M | [SERVER] |
| 3 | Group cohesion | Medium-high / S | [SERVER] |
| 4 | Missile target orders | Medium / S | [SERVER] |

1. **Fix the order reset, add Wheel and Face-threat.** `form` keeps the current order (B2), and a new `{kind:'face', group, toward}` turns a group without stopping it. Cheapest flank counter-play (F1). Touches `battle.ts` (L494–530), `types.ts`, `ai.ts` `face()`, `src/ui/dragFormation.ts`, and `server/src/battle.ts` zod.
2. **Orb / square formation and a feigned-retreat order.**
   - **Orb** has no flanks, but is slow and has lower damage. It is the hard answer to cavalry and flanking.
   - **Feigned retreat** is fallback plus a rally at a set point, baiting pursuers out of formation. Light troops only.

   Both create real "read the enemy" decisions. Touches `formation.ts` (`FormationType`), `battle.ts` slot and facing logic, `ai.ts` (when bots use and answer them), and the formation buttons in `src/ui/battlePanel.ts`.
3. **Group cohesion.** When a group's `routed` flag sets, its remaining men take a morale check: −10, halved by Steady or a standard bearer. This makes "break one group to cascade the line" a planned tactic (B3). A few lines in `battle.ts` `updateGroups`.
4. **Missile target orders.** Tap an enemy group while a missile group is selected to focus it. Adds the "kill their archers first" decision (J2). Touches `battle.ts` target selection and `types.ts`.

### 2.3 Terrain

Terrain already exists, and it is good: `src/data/terrain.ts`, `src/sim/terrain.ts`, `src/world/battlefield.ts`. The ridge, however, is too strong at 74%.

| Rank | Pick | Depth / cost | Flags |
| --- | --- | --- | --- |
| 1 | Deployable field works | High / M | [SERVER] |
| 2 | Weather and light | Medium-high / M | [SERVER] |
| 3 | Tune height, and teach the bot to flank hills | Medium / S | [SERVER] |

1. **Deployable field works.** Stakes (anti-cavalry), a ditch, or a wagon laager are placed in deployment with a limited budget, or built from the camp's supplies. Terrain cells already travel in `BattleSetup.terrain`, so the server sees them without generation. This links the camp to battles, which nothing does today.
   - Touches `src/sim/terrain.ts`, `TERRAIN`, deployment UI, and `src/world/camp.ts`.
   - The schema must accept new cell kinds (`server/src/battle.ts`).
2. **Weather and light.** Rain (slings and bows −25% range, javelins fine, stamina drain), fog (missile range capped, flanking unseen), and dusk. Generated into `BattleSetup` from the overland time and season. Touches `generateBattlefield`, `RULES` modifiers, ground and fx art, and the server zod.
3. **Tune height, and teach the bot to flank hills.** Bring the ridge from 74% to about 65%, and have the bot send its flank group round a held hill instead of waiting for 50 s (A2). Data plus `ai.ts`.

### 2.4 Enemy variety and AI

| Rank | Pick | Depth / cost | Flags |
| --- | --- | --- | --- |
| 1 | AI doctrines | Highest / S–M | [SERVER] |
| 2 | Band captains | High / M | [SERVER], [SAVE] |
| 3 | Utility scoring for reserve, cavalry target and retreat | Medium / M | [SERVER] |

1. **AI doctrines.** Move the hard-coded timers and thresholds in `src/sim/ai.ts` into a `Doctrine` data record, chosen per culture or band kind and seeded into `BattleSetup`. For example:
   - Celts: an early all-in charge, high shock, flank at 6 s.
   - Punic: hold, skirmish, then a cavalry hammer.
   - Pirates: a skirmish swarm that retreats when it loses.
   - Mercs: the current doctrine.

   Highest depth per line of code: every band fights differently and the fixed-timer exploits disappear (A1, A2). Touches `ai.ts`, `src/game/enemy.ts`, `src/sim/types.ts` (`BattleSetup.doctrine`), and the server zod.
2. **Band captains.** Bands of tier 2 and above get a named captain hero with a doctrine-linked active (horn, war-cry, feigned retreat) and better gear. Kill or capture him for a bounty. This adds a target-priority decision on the field and a trophy loop.
   - Touches `buildArmy` in `enemy.ts`, `world.ts` `PartyState`, and the results screen.
   - [SAVE] for the band record.
3. **Utility scoring for reserve, cavalry target and retreat.** Replace hard thresholds with response curves, per the game-ai skill. This also lets bots retreat (A3), so losing bands survive and come back. That is a hook for nemesis-style rivals. Touches `ai.ts`.

### 2.5 Campaign events and progression

| Rank | Pick | Depth / cost | Flags |
| --- | --- | --- | --- |
| 1 | Overland event deck | High / M | [SAVE] |
| 2 | Campaign arc: lair sieges and an end boss | High / L | [SAVE] |
| 3 | Town contracts | Medium-high / M | [SAVE] |
| 4 | Fix the stakes | Medium / S | [SAVE] |

1. **Overland event deck.** Seeded events fire on world time, on arrival and while camping:
   - deserters ask to join;
   - a shrine offers a blessing for gold;
   - a plague in a town;
   - a merchant caravan to escort;
   - a rival mercenary challenge.

   Each has 2–3 choices with consequences that last (world flags). Per the rpg skill, choices must set flags that later content reads.
   - Touches `src/world/world.ts` (`WorldEvent`, `advance`), a new `src/data/events.ts`, a dialog UI, and `WorldSave`.
   - Offline only, so no server impact.
2. **Campaign arc: lair sieges and an end boss.** Lairs become destructible through an assault battle with a palisade terrain set. Destroying all 6 summons a final host: a tier-3 army, plus the Achilles or Alexander set as its loot.
   - Gives the campaign an end state (C2), real tier-3 content (C3) and an offline source for legendary sets (I2).
   - Touches `src/world/map.ts` and `world.ts` (lair state, spawns), `enemy.ts` (tier 3), `src/game/sources.ts`, and `generateBattlefield`.
3. **Town contracts.** A quest state machine (the rpg skill's available → active → complete → turned in): "clear the bandits near X in 3 days", "escort", "hunt the boar". Rewards include gold, reputation and town discounts. This gives travel and fight selection a purpose.
   - Touches `world.ts`, `src/scenes/SettlementScene.ts`, and `WorldSave`.
4. **Fix the stakes.**
   - Persist the pending battle (C1).
   - Turn the Beast Trial into Practice, as already planned (I1).
   - Save the drill buffer (C5).
   - Stop the identity reroll in `weakenParty` (C4).

   Small, but the campaign has no stakes without it. Touches `src/state.ts`, `save.ts` (v6), `BeastTrialScene.ts`, and `world.ts`.

### 2.6 Items (docs/ITEMS.md)

| Rank | Pick | Depth / cost | Flags |
| --- | --- | --- | --- |
| 1 | Offline sources for every set and named item | Medium-high / S | — |
| 2 | Forge reroll | Medium / S | [SERVER] for the duel and war variant |
| 3 | Consumables in the campaign | Medium / S | [SAVE] |
| 4 | Marketplace paid-power decision | Policy / S | [MONEY], [SERVER] |

1. **Offline sources for every set and named item.** Tier-3 bands appear past day N or at danger > 0.85. The campaign end boss (2.5.2) drops `BOSS_SET`. The Beast Trial gets loot only through its replacement. Touches `world.ts` band generation, `src/game/sources.ts`, and `beasts.ts`. Offline only.
2. **Forge reroll** (ITEMS.md open question 1). Reroll one random stat for gold in the campaign, or for Glory in duels. This is the missing endgame gold sink (E2).
   - Campaign side: `campaign.ts` forge.
   - Duel and war side: `server/src/duel/routes.ts` and `server/src/online/*`.
3. **Consumables in the campaign.** Horn, salves, wine and sharpening stones are already modelled online (`src/data/consumables.ts`, the `horn` order). Sell them in towns for gold as a per-battle tactical choice and a sink.
   - Touches `SettlementScene`, `BattleScene` consumable picker, and the save stash.
4. **Marketplace paid-power decision.** Decide whether legendaries may be priced in Drachmae (E4). A product decision. If restricted, the change is in `server/src/online/market.ts` and `src/game/marketRules.ts`.

### Top 5 overall picks

| # | Pick | Why |
| --- | --- | --- |
| 1 | AI doctrines (2.4.1) | Highest variety per line, kills the predictable timers |
| 2 | Branching perk trees (2.1.1) | Every level-up becomes a choice |
| 3 | Overland event deck (2.5.1) | Campaign texture and choices; offline only, so no server risk |
| 4 | Wheel / face-threat fix plus the orb and feigned-retreat formations (2.2.1–2.2.2) | Flank counter-play, deepens the core loop |
| 5 | Campaign arc with lair sieges and an end boss (2.5.2), with offline item sources (2.6.1) | An end state, real tier-3 content, and the set items reachable |

**Ship these first:** the prerequisites (sim version, the save overwrite, the pending battle) and the Beast Trial Practice change.

---

## 3. Phaser 4 technical note

**Evidence**

- The Phaser usage inventory was gathered by grep over `src/`.
- The Phaser 4 facts come from the official 4.0.0-rc.6 API docs, fetched through Context7 on 2026-10-10.
- Anything not covered there is marked **NOT SOURCEABLE**, and the P4 spike (V5-005) must verify it.

### What the game uses that is v3-specific or fragile

| Area | Usage | Files | v4 risk |
| --- | --- | --- | --- |
| Internal monkey-patch | `Phaser.Scale.ScaleManager.prototype.getParentBounds` patched to render at devicePixelRatio; touches `parentSize.setSize` and `canvasBounds` | `src/platform/renderScale.ts:36-55` | **High.** Private internals. NOT SOURCEABLE whether v4 keeps them. |
| Hand-built bitmap font | `scene.cache.bitmapFont.add(...)` with a hand-made `retroFont` data object (per-glyph `u0/v0/u1/v1`) | `src/ui/kit.ts:95-111` (`registerVectorFont`); BitmapText used in 25 files, 48 refs | **Medium-high.** Internal data format. NOT SOURCEABLE. All UI text depends on it (`add.text` is never used). |
| Geometry masks | `createGeometryMask` | `src/ui/kit.ts:710` (every scroll area), `src/scenes/CampScene.ts:148` | **Medium. Sourced:** in v4, `setMask` with a GeometryMask "only works in the Canvas Renderer. In WebGL, use a Mask filter instead" (`FilterList#addMask`). The scroll-area mask must be rewritten with `filters.internal.addMask`, or by clipping with a camera. |
| Canvas textures as live atlases | `textures.addCanvas` (111 calls in 32 files); `createCanvas` (5); manual frames `tex.add(...)`, `setTrim`; `getContext()` / `refresh()` repainting | `src/ui/sprites.ts:103-134, 301, 432-484, 608-612` and most of `src/ui/*`, `src/art/*` | **Medium.** The core asset path, since all art is procedural. NOT SOURCEABLE for exact v4 CanvasTexture semantics. |
| Graphics | 92 objects, about 873 draw calls | 42 files | Low-medium. A standard API, but v4 rewrote the renderer, so check visual parity for rounded rects and line joins. |
| Multi-camera with `ignore` | UI camera plus `cam.ignore(layer)` on Layers | `src/scenes/BattleScene.ts:344,426`, `WorldScene.ts:155,202`, `online/OnlineScene.ts:264,271` | Medium. The camera and Layer render paths changed in v4 (filters live on cameras). |
| Pixel-art config | `pixelArt: true`, `roundPixels: true`, `antialias: false`, `Scale.RESIZE` | `src/main.ts:43-58` | Medium. Crispness at dpr scale is the game's look. NOT SOURCEABLE for v4 defaults. |
| Tint | `setTint` (19) | various | Low. The v4 docs still list `setTint` and `setTintFill`. |
| Tweens, timers, input | `tweens.add` 43, `addCounter` 3, no timelines or chains; `time.*` 45; `setInteractive` 54, pointer events only, no keyboard, no `setDraggable`; custom pinch and drag (`src/ui/dragFormation.ts`) | — | Low. |
| Hit areas | `Geom.Rectangle.Contains` on containers centred at w/2, h/2 (a v3 container-origin quirk) | `src/ui/v3.ts:278,523,875` | Low-medium. Re-test every button. |
| Not used at all | custom pipelines, preFX / postFX, particles (so the removed `createEmitter` does not matter), RenderTexture / DynamicTexture, plugins, Shader / Mesh, DOM, Video, the renderer or GL directly, physics | — | none |
| Unaffected | `src/sim`, `src/game`, `src/data`, `src/world`, `src/duel`, `src/online`, and the whole server, which import no Phaser; `src/art/model3d.ts`, a pure software ray caster that outputs canvases | — | none |

### Migration risk: **MEDIUM-LOW**

**Why the risk is low**

- The sim and server, the riskiest part of the game, are untouched.
- No pipelines, FX, particles or render textures are used, which are the areas v4 changed most.

**Where the work is**

- Five fragile seams, in order of risk:
  1. The ScaleManager patch.
  2. The hand-built retroFont cache entry.
  3. The geometry-mask scroll areas (sourced breakage in WebGL).
  4. The CanvasTexture live-atlas path.
  5. The multi-camera `ignore` setup.

**Estimate:** about 1–2 weeks for one engineer:

- 2–3 days for the seams above.
- 3–5 days of visual parity across 20 scenes at 390 / 360 / 320 widths, using the existing layout check and shots scripts.
- A buffer for v4 bugs.

**Spike recommendation (V5-005)**

1. Branch, bump `phaser` to v4, run `tsc`, and fix the five seams in this order: font, scale patch, masks, canvas atlas, cameras.
2. Run `npm run shots` and the layout check.
3. If the font and scale patch take more than 3 days, defer v4 until after the v5 gameplay work. The game gains no features it needs from v4: it uses none of the new filter or render features.
