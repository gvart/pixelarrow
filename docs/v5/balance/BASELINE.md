# v5 balance baseline

Story S1-AUDIT-MECH. Captured on 2026-10-10 from branch `v5` @ ea5af21. The code is the same as `main` @ bd61069, because v5 has only added docs so far.

## Commands

```
npm run balance          # default: 200 matched seeds, 69 s wall time
npm run balance -- 400   # 400 seeds: the numbers below, 242 s wall time
```

- **Harness:** `scripts/dev/balance.mjs` loads `src/dev/balance.ts` through Vite's module runner. That file pulls in `classBalance.ts`, `beastBalance.ts` and `rarityBalance.ts`.
- **Raw output:** both runs are kept verbatim next to this file: `raw-200.txt` and `raw-400.txt`.
- **Which run is quoted:** the 400-seed run, because it halves the noise. The 200-seed run agrees within its error bars everywhere.

**Noise.** At n seeds, one standard error on a win rate near 50% is about `50/√n` points:

| Test | Seeds | 1 SE |
| --- | --- | --- |
| Matched battles | 400 | 2.5 pts |
| Perk mirrors | 320 | 2.8 pts |
| Terrain mirrors | 240 | 3.2 pts |
| Each class round-robin cell | 25 | 10 pts |

Treat any perk difference under about 6 points, and any single round-robin cell difference under about 20 points, as noise.

## /balance-check: inputs and how I answered its questions

The user is asleep, so I answered the skill's prompts myself:

| Skill step | Answer |
| --- | --- |
| Phase 1, domain | No argument was given, so I chose **all four**: combat, economy, progression and loot. |
| Phase 2, data | `assets/data/` and `design/balance/` are **ABSENT**. The data lives in code: `src/data/{classes,items,affixes,perks,sets,terrain,units}.ts`, `src/sim/battle.ts` (`RULES`, `MOUNTED_RULES`), `src/game/{loot,enemy,sources}.ts`, `src/world/world.ts`, and `src/game/campaign.ts`. |
| Phase 3, targets | `design/registry/entities.yaml` and `design/gdd/` are **ABSENT** in this worktree and in the framework root. The targets come instead from `docs/GAMEPLAY.md` ("Balance", class band 34–64%) and `docs/ITEMS.md` ("Balance targets"). |
| Phase 6, next step | Like [B], save the report, but to `docs/v5/balance/` (this file). That folder is the scope this story was given; `design/balance/` is not. No fixes, because this story is docs-only. |

## Health summary: **CRITICAL ISSUES**

The verdict follows the skill's rule: the worst finding wins.

- **Critical.** There is a degenerate economy and loot loop. The offline Beast Trial is free, repeatable, gives legendary loot and feeds pity (see Loot below).
- **Critical.** At equal cost, the elite line classes lose to cheap shock infantry. This is a dominant-choice problem in the round robin.
- **Not assessed.** The offline economy has no stated targets, so it is judged by flows only.

## Combat: key numbers (400-seed run)

### Core battles

| Metric | Value | Target (source) | Verdict |
| --- | --- | --- | --- |
| Reference army vs matched bot | win 55% / loss 45% / draw 0% | about 50% (GAMEPLAY) | OK |
| Battle length, mean / median | 92.7 s / 82.5 s; 81% within 60–150 s | median 55–150 s (tests/balance.test.ts) | OK |
| First contact | 10.9 s | — | — |
| First group rout after contact, median | player 58.9 s (in 52% of battles), bot 40.5 s (in 70%) | 34–38 s (doc) | **Drifted.** The bot breaks first and the player's line is stickier than the doc states. |
| Survivors who are not dead | player 6.6 / 10, bot 7.9 / 10 | — | Battles end by rout, not by killing (see Economy). |
| Passive player wins | 6% (time limit hit in 5%) | low | OK: orders matter. |
| 6 swordsmen charge 6 braced hoplites: attacker routs within 15 s | 0% | 0% | OK |
| Same charge: attacker eventually wins | 1% | — | Braced spears are close to absolute. |
| 3 extra men hit the rear vs join the front: enemy line routs at | 12.8 s vs 97.5 s | rear much faster | OK. Flanking is the most powerful lever in the game (×7.6 faster rout). |
| Ridge defender vs attacker | **74% / 26%** | "clear advantage", doc says 63% | **Outlier.** It has grown 11 points since the doc was written. |
| River with a ford | 46 / 54 | about 50 | OK |
| Generated plain, scrub, forest, hills, beach | 46–50% | about 50 | OK. Hills make battles about 45% longer (160 s). |

### Abilities and auras

These are mirror battles with 320 seeds per row.

| Perk | Win rate | Doc value | Comment |
| --- | --- | --- | --- |
| Baseline | 51% | 49% | — |
| Shield Bash, all line men | 54% | 59% | +3 pts, within noise |
| Berserk, all line men | 56% | 57% | +5 pts |
| Volley, one skirmisher | 53% | 54% | +2 pts |
| Rally Cry, one hero | 54% | 54% | +3 pts |
| Steady Presence aura | 55% | 59% | +4 pts |
| Eagle Eye aura | 50% | 52% | **0 pts: a dead perk in a mixed army** |
| Warlord aura | 54% | 56% | +3 pts |

Every ability is now worth 0–5 points. The tier-2 and tier-4 picks barely register, and Eagle Eye is dead. The doc's table, for example Bash at 59%, is stale.

### Classes

Equal-cost round robin, budgets 700 and 900, 25 seeds per pair. The band target is 34–64% (GAMEPLAY).

| Class | Mean | Class | Mean | Class | Mean |
| --- | --- | --- | --- | --- | --- |
| Levy | 60 | Archer | 36 | Fanatic | 48 |
| Hoplite | 54 | **Slinger** | **34** (edge) | Companion | 44 |
| Thureophoros | 47 | Javelineer | 55 | Thessalian | 56 |
| Celt | 59 | Horse archer | 61 | Chariot | 45 |
| Rhomphaia | 52 | Peltast | 61 | **Royal guard** | **42** |
| Falx | 40 | Gaul | 59 | Sacred Band | 48 |

- Every class is inside the band, but the matrix is **polar**: 104 of 306 cells (34%) are at 0–4% or 96–100%.
- **Elites are cost-inefficient.** Royal guard (130) and Sacred Band (125) lose 92–100% of the time to the Celt (80), Gaul (70), peltast (65), falx (75), fanatic (70) and rhomphaia (85). The most expensive line infantry is a trap buy at equal cost.
- **Fanatic** (enemy-only) beats all three mounted classes 100%, and beats both elites 92–100%. So a cultist band hard-counters a cavalry-heavy player.
- **Militia** (60 gold) has the highest mean among the foot (60%). It beats Companions, Thessalians and chariots 100% at equal cost. Massed cheap spears dominate mounted play.
- **Chariots vs militia**: 0% (target "breaks loose foot"). The chariot's fantasy fails against the cheapest unit.
- **Horse archers** beat the Celt, thureophoros and javelineer 100%, and nothing cheap counters them except the Companion (4%) and the Sacred Band (16%).

### Other combat numbers

| Test | Result |
| --- | --- |
| Cavalry on the flank (6 hoplites + 2 Companions vs equal-cost hoplites) | 54%. Flanking cavalry is only break-even. |
| Companions charging braced hoplites head on | hoplites win 100% |
| Beasts vs a sensible army (win rate of the army) | Hydra 40%, cyclops 58%, harpies 41%, lion 51%, **minotaur 29%, chimera 29%**. A naive army wins 0–5% in every case. Minotaur and chimera are near-walls. |
| Animals vs militia at equal cost | wolf 54%, boar 39%, bear 52%. The bear has a cliff: 2 bears vs 10 men is 4%, 4 vs 15 is 100%. |

### Rarity mirror

240 seeds; the column order is the level-5 hero, then the level-10 hero.

| Rarity | Target | Measured |
| --- | --- | --- |
| Uncommon | 58% | 59 / 59 |
| Rare | 66% | 68 / 65 |
| Epic | 76% | 76 / 73 |
| Legendary | 85% | **89** / 85 |

On target, apart from the legendary at level 5, which is +4 points (still within the doc's ±5 tolerance).

## Economy

There is no economy simulator, so this section is computed from the formulas.

**Faucets per battle.** Kill counts are taken from the matched run: about 2.1 enemy dead per 10.

| Faucet | Formula | Typical value |
| --- | --- | --- |
| Battle gold | `(20 + 12·kills + 60 win) × (1 + min(0.5, goldBonus))` (`src/game/loot.ts:132`) | win about **105 g**, loss about 45 g, draw about 65 g |
| Loot, picked | 3–5 picks of killed men's gear; median item value 60 × wear `0.5 + 0.5·cond` | about **120–200 g** a win when sold at 100% (`src/game/campaign.ts`). **Loot resale is the main gold faucet, larger than battle gold.** |
| Ransom | `6·size + 4·level`, offered against bands under 0.35× your power | risk-free gold |

**Sinks.**

- Each even battle costs about 3.4 dead men. With the 40% knock-out chance that is about **2.0 permanent deaths and 1.4 wounds**.
- Replacing the dead costs 40 gold for a village hire, or about 60–200 for a town hire. Healing the wounds costs about 50 gold (36 wound-hours each at 1 g/h).
- An even win therefore spends about 130–450 gold against about 225–305 gold earned.

**Curve.**

- Even fights hover around break-even and lose experience levels, since dead veterans are replaced by level-1 recruits.
- The profitable play is to **punch down**: hunt weaker bands, take ransoms and sell loot. Band AI flees at a power ratio below 0.8, which pushes against this; ransom pushes for it.
- No inflation cap exists. Gold has no late sink once the army cap of 20 is full and kitted, apart from forge temper (rare at most) and repairs. There is no endgame gold sink.

**Arbitrage.** Repair cost ignores rarity, while sale value includes it. So repairing an item before selling it is profitable, for example a legendary nets +0.3× its value per 100 condition. This is finite, not a loop.

**Online and real money (constrained).**

- Stars buy Drachmae only (100→100 … 1000→1300, `server/src/products.ts`).
- On the war-map marketplace, Drachmae can buy player-listed items up to legendary, with price bounds up to 10,000 Dr and a 10% fee burned. That is an indirect paid-power path. The rule "no gear or heroes for Drachmae" (DESIGN_V2) covers the shop, not the marketplace.
- The premium pass (500 Dr) returns far less than the 600 Dr decided on 2026-10-07 (ROADMAP Polish).

## Progression

**XP curve.**

- `xpToNext(L) = 40·L` (`src/data/units.ts:66`), level cap 10. That is 1,800 XP from level 1 to 10.
- Per survivor: `12 + 10·kills + 12 if won`. Kills per hero average about 0.2, so a typical battle gives about 26 XP.

| Milestone | Battles a hero needs |
| --- | --- |
| Level 2 | 1.5 |
| Level 4 | 9 |
| Level 6 | 23 |
| Level 10 | about 69 |

- The curve is quadratic in total XP, while XP per battle is flat. So levels 6–10 take about 46 battles, with no new content to gate.
- **Dead zone.** There is no unlock between perks, and a perk comes every two levels. Late perk tiers 4 and 5 are auras worth 0–4 points each (above).

**Drill-yard idle loop.** A palisaded drill camp gives 1.5 XP per hour to every fit hero below level 4, including reserves. That is a free, safe route to level 4. The only cost is that band levels creep up by about 0.05 per day.

**Gating.** Danger rises with distance from the start town and near lairs. Bands cap at size 18 and level 8, and **their gear tier never reaches 3** (`src/world/world.ts:660-673`). Late-game bands stop scaling.

## Loot

| Source | Rates | Expected acquisition |
| --- | --- | --- |
| Band gear, tier 1 (`rollRarity`) | common 85 / uncommon 14 / rare 1 | a rare about 1 per 100 items |
| Band gear, tier 2 | 55 / 35 / rare 9 / epic 1 | an epic about 1 per 100 items, about 1 per 25 wins at 4 picks |
| Band gear, tier 3 | 30 / 40 / 25 / 5 | **unreachable offline**: no band has tier 3 |
| Beast hoards (`rollBeastRarity`) | rare 50 / epic 35 / legendary 15 | a legendary every 6.7 chests; pity forces one at 8 |

**Degenerate: the Beast Trial farm.**

- `src/scenes/BeastTrialScene.ts:89-95` runs any beast, or the Kraken or Titan, at the army's average level +1 (bosses +3).
- It costs no time, has no cooldown and no fee, and it is repeatable. It uses the normal loot, gold and pity code (`BattleScene.ts:1329-1337`).
- A fresh `randomSeed()` per fight, plus the battle not being saved (an app kill cancels it), means that bad outcomes can be abandoned.
- ROADMAP already plans to turn it into a no-loot "Practice" mode.

**Unreachable items offline.**

- The rare sets (Agoge, Peltast, Cretan) need tier-3 bands.
- The legendary sets (Achilles, Alexander) and the ladder's named items only exist online.

**Pity.** The counter counts the loot pool, not the picks, so a legendary left on the table still resets it.

## Degenerate strategies found

1. **Beast Trial farming** (critical): free legendary loot with pity, repeatable, and rerollable by killing the app.
2. **App-kill escape** (critical for permadeath): `state.pending` is never saved, so killing the app mid-battle voids a lost fight.
3. **Equal-cost elite trap** (critical in the class matrix): shock infantry beats the elite line 92–100% of the time.
4. **Massed militia vs mounted** (concern): militia beats all cavalry 100% at equal cost, so cavalry buys are never right against spear-heavy bands.
5. **Ridge camping** (concern): the defender wins 74%. The bot holds hills for up to 50 s, but a player can hold forever offline.
6. **Drill-camp idling** (concern): free XP to level 4.

## Recommendations (for later stories; this story makes no code changes)

| Priority | Issue | Suggested fix | Impact |
| --- | --- | --- | --- |
| P0 | Beast Trial farm | Ship the planned Practice mode (no loot, gold or pity), or give it a cooldown and entry cost | Removes the dominant loot source |
| P0 | App-kill escape | Persist a "battle in progress" stub in the save. On resume, resolve it as a retreat. Needs a save v6 migration. | Restores permadeath stakes |
| P1 | Elite cost-inefficiency | Raise the elites' block and armour vs shock, or cut their cost to about 100–110. Re-run the round robin at 50+ seeds per pair. | Makes elite buys meaningful |
| P1 | Abilities worth 0–5 points | Raise the effect sizes (Eagle Eye ×1.15 → ×1.3 damage, Volley 2 → 3 shots), or make them group-wide | Hero choices start to matter |
| P1 | Unreachable sets offline | Allow tier 3 for raiders and mercs past day N or at danger > 0.85. Add a campaign end boss carrying a legendary set. | Item design pays off offline |
| P2 | Ridge at 74% | Height melee bonus +0.25 → +0.18 per level, or bot attackers flank the hill | Back to about 65% |
| P2 | Late XP dead zone | Make levels 6–10 cheaper (`30·L`), or add level-gated unlocks | Smoother pacing |
| P2 | Harness noise | 25 seeds per round-robin pair is too few. Use ≥ 60 for decisions. | Trustworthy class tuning |

## Values that need attention (no stated target, so not judged)

- **No target in any doc:** the offline gold per battle, recruit prices, healing cost, ransom formula and drill XP.
- **Beast difficulty:** win rates of 29–58% have no stated target.
- **Animal cost cliffs:** no stated target either.
