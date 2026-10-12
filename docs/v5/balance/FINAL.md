# v5 final balance pass (FL-04)

Story FL-04 is the last balance check of v5. It re-runs `npm run balance -- 400` after the feel and presentation stories (FL-01 juice, FL-02 transitions, FL-03 audio, F-07 retire v3), records every balance axis with fresh numbers, and judges each one against its target. The user was asleep, so I made the calls myself. They are listed under Decisions, ready for the Director to copy to DECISIONS.md.

**Verdict: CONCERNS, with no drift and no degenerate strategy.** Every row matches the train-2 close (TRAIN2.md, ST-04) to the seed. Presentation moved nothing. The misses are the residuals already accepted in V5-071 and V5-073, plus the small edges TRAIN2 listed. No data change was needed, so none was made.

## How it was measured

| Item | Value |
| --- | --- |
| Commit | `v5` @ 9c1c473 (LOC-01 merged), plus FL-04's harness commit (event rows) |
| Command | `npm run balance -- 400`, which took 2,060 s at a load average of 16–29 |
| Event deck | `eventRows` now print in `npm run balance` (the known follow-up from PROGRESS item 30) |
| Determinism | `src/sim` and `src/data` (everything the sim reads), `src/duel/ladder.ts` floors, `src/game/heroes.ts`, `enemy.ts`, `armySpec.ts`, `sources.ts` and `loot.ts` are byte-identical to the EC-05 merge (9570d6f), apart from comments, the ladder ticket clock, the arc's host constants (AR-04) and the event-deck flags (EV-03). `git diff 9570d6f HEAD -- src/sim` touches only the comment in `version.ts`. Seeded battles are deterministic, so every battle row is the same battle as at ST-04. |
| Replays | `node scripts/replay-hash.mjs`: Chromium 13/13. WebKit was NOT RUN, because webkit-2215 is not installed. TRAIN2 ran it with the 2242 override. |
| Gates | `npx tsc --noEmit` clean; `npx vitest run` 1,483/1,483 |

Because of that determinism, a fresh run is a replay of the ST-04 battles. Where a row's number differs from TRAIN2.md, the reason is the seed count: TRAIN2 quotes some rows from EC-05's 200-seed run.

## 1. Matched fights and the battle itself

| Row | Now (400 seeds) | TRAIN2 | Target | Status |
| --- | --- | --- | --- | --- |
| Matched: player win | **54%** (loss 46%, draw 0%) | 54% | 45–55% (anchor: about 53% at 200 seeds) | met |
| Length median / mean | 72.0 / 78.6 s, 71% in 60–150 s | 72.0 / 78.6 | median 55–150 s | met |
| First contact | 10.9 s | — | ≤ 15 s (5v5: 11.9 s) | met |
| Passive player | wins 9%, time limit 2% | 9% / 2% | low | met |
| Frontal: swords into braced hoplites | attacker wins 3%, routs 41% | — | the shield wall holds | met |
| Flank: 3 men to the rear vs to the front | rear routs the line in 12.8 s, front in 97.5 s | — | the rear is decisive | met |
| Dead fights (cohesion on) | 0% | 0% | ≤ 2% | met |
| Mean length, cohesion on vs off | −15% (78.6 vs 92.9 s) | −15% | within 10% | **miss**, accepted (TRAIN2 list) |
| Rout gap shrinks / cascade median | 32% / 1 | 32% / 1 | 20–40% / ≤ 2 | met |

## 2. Campaign curve

| Row | Now | Target | Status |
| --- | --- | --- | --- |
| 8-man opening vs starter-zone bandits (248 fights, plate ×0.84) | **72%** | 55–70% (R1, V5-054) | **miss by 2**, accepted (D3) |
| 8-man opening vs lair bandits at the start (×1.31) | 18% | none (the Strong plate warns) | info |
| 5 volunteers after a destroyed army (×2.96) | 0% | none | info, so the player should avoid fights; see risks |
| Tier-3 share of new bands, day 49 / day 50 | 0% / 61% | 0% before day 50 (R3) | met |
| Tier-3 share after 2 lairs fall (day 10) | 92% | by danger (R3) | met |
| Tier-3 band power over the same band at tier 2 | ×1.18 (an even army 21% vs 32%) | none (the plate shows it) | info |
| Levels 6–10 | 37 battles at 26 XP (was 46) | < 46 (R7) | met |
| Rare set pieces per tier-3 band | 0.08 | > 0 | met |

## 3. Class and tier mirrors

**Equal-cost round robin** (18 classes, budgets 700 and 900, 25 seeds per pair):

| Row | Now | Target | Status |
| --- | --- | --- | --- |
| Archer / slinger mean | 47 / 48% | ≥ 40% (V5-037) | met |
| Royal Guard / Sacred Band mean | 47 / 50% | ≥ 46% | met |
| Militia vs Companion / Thessalian / chariot | 84 / 68 / 64% | not 100% | met |
| Class means, lowest to highest | falx 40, thureophoros 42, levy 43, javelin 43 … chariot 58, Gaul 59 | none stated | 19-point spread |
| Lopsided cells (0–4% or 96–100%) | 99 of 306 | none stated | structural (V5-069) |
| Shock infantry cells over 85% | 23 | none | **miss**, accepted (V5-073) |
| Level-4 means: archer, slinger, Guard, Sacred Band | 64 / 57 / 52 / 57% | ≥ 40 / ≥ 46 | met |

**Rarity mirror** (a full kit at a rarity vs the same army all common, 240 seeds):

| Rarity | L5 | L10 | Target | Status |
| --- | --- | --- | --- | --- |
| uncommon | 59% | 61% | 58% | met |
| rare | 65% | 66% | 66% | met |
| epic | 78% | 75% | 76% | met |
| legendary | 90% | 85% | 85% | met (L5 +5, about 1 SE at 240 seeds) |

**Tiers:** the tier-3 band vs tier 2 rows are in section 2. Terrain mirrors: plain 49%, river 46%, generated 47–52%, all about 50% (met). The steady-vs-steady ridge mirror is 72%. The targeted row is ridge vs rush, at 65% against 62–68% (met).

## 4. Lairs, assaults and the host

| Row | Now | Anchor | Target | Status |
| --- | --- | --- | --- | --- |
| Hydra / cyclops / Nemean lion, sensible army (80 seeds) | 40 / 58 / 56% | 43 / 58 / 53% (200 seeds) | about 45–60% | within 1 SE of the anchor (SE about 5.5 at 80 seeds) |
| Naive army, same lairs | 0 / 0 / 0% | — | much lower | met |
| Lair assault at 1.0× (800 fights) | **43%** | 45% (EC-05) | 38–48% (R2) | met |
| Lair assault at 1.3× | 94% | 94% | ≥ 60% | met |
| Walls' worth to the garrison (1.0× open ground) | 40%, so walls +3 pts | — | +5..+12 (info) | info |
| Lair hoard: epic set piece (4,000 chests) | 24% | 24% | 25% (R6) | met |
| **Host** (R 16) vs the prepared army (400 fights, ×0.98) | **50%** | 49% (200) | 40–55% (R5) | met |
| Host (R 20) vs 20 prepared men | 38% | 36% | none | info |
| Host size for R = 8 / 16 / 20 | 8 / 16 / 20 | — | min(32, ceil(1.0·R)) | met |

## 5. Ladder floors

**Not re-run as a parity scan. The numbers are exact by determinism.** V5-052 asks for a re-measure after any sim or AI change. There has been none since the EC-05 merge, where the scan was taken: `src/sim`, the ladder floors, `FLOOR_DOCTRINE` and `FLOOR_LEVEL_ROOM`, and the data the sim reads are byte-identical (see "How it was measured"). The parity harness, a frozen pre-EC-05 `ai.ts`, was never committed. A fresh run would replay the same seeds to the same results.

| Row | Value (EC-05, 300 seeds per arm, vs the pre-change copy) | Target | Status |
| --- | --- | --- | --- |
| Floors within ±5 | **47 of 50** | all 50 within ±5 (V5-052) | accepted exceptions |
| Floor 29 (steady) | +8 | ±5 | accepted within ±8 (V5-073) |
| Floor 31 (swarm, room 3) | −6 | ±5 | accepted within ±8 (V5-073) |
| Floor 36 (fury) | −6 | ±5 | accepted within ±8 (V5-073) |
| Doctrine table | pinned by `tests/ladderDoctrine.test.ts` (passes) | unchanged | met |
| Ladder replay fixtures | 5 of 13 (floors 5 / 13 / 23 / 33 / 43, plus the lost Standard) | hash parity | 13/13 |

Since EC-05 the ladder has gained only the ticket clock: 30-minute tickets with a countdown in the last 5 minutes (CT-06, DUE-01). That clock doesn't change a floor's army or its reward.

## 6. Duels: ranked, unranked and raids

Duel fairness comes from the point budget (150 for ranked and unranked). A class's points are a tenth of its cost, so the **equal-cost round robin in section 3 is the duel class matrix**. Its means range from 40% to 59%, and no class mean falls outside 40–60%. Single-class cells are lopsided by structure (V5-069), and a mixed 150-point team dilutes that. The rarity and item rows bound the gear side, since a rarer item also costs more points.

**Glory flow per UTC day** (from `RANKED`, `DUEL_RULES`, `LADDER` and docs/DUELS.md; the win rate is assumed at 50%, a matched Glicko player):

| Source / sink | Amount | Note |
| --- | --- | --- |
| Ranked live, 10 matches | about 200 | win 30, draw 20, loss 10 |
| Unranked, 10 matches | about 100 | half of ranked |
| Raids (10 rated a day) | about 130 | win 20, draw 12, loss 6 |
| Defence held | ≤ 50 | 5 a hold, capped |
| Ladder replays | ≤ 300 (capped) | first clears pay 40 + 8·floor, uncapped and one time |
| **An active day** | **about 650–700** | ranked, raids, defence and the farm cap |
| Recruit | 45–255 (hoplite 100, Companion 155, chariot 255) | the class cost |
| Shop gear (135 bases), median | common 25, uncommon 50, rare 100 (max 320) | half value × rarity factor |
| Respec | 20 per level (L5: 100) | — |
| Stash resale | a quarter of the shop price | so buying and selling is no loop |
| Duel spoils | ranked 12%, unranked 8%, raids 6%; common, uncommon or rare | gear above rare comes only from the ladder, chests and daily offers |

**Judgement:** there is no Glory target in any GDD, so the flow is **not judged**. That's an open risk, not a pass. One active day buys about a 150-point team's worth of recruits and common gear, with no loop (resale is 25%), and the 300 farm cap bounds the PvE faucet. Ranked rewards don't depend on Glory spending (the budget is fixed), so Glory can't buy rank.

## 7. War beasts (the season map's lairs)

The war map's lairs use the same six beasts as `beastReport` (tier-3 lair, army at the beast's level − 1, 80 seeds):

| Beast | Sensible | Naive | Median length | Harness target (beastBalance.ts) | Status |
| --- | --- | --- | --- | --- | --- |
| hydra | 40% | 0% | 60 s | about 45–60% | 1 SE under |
| cyclops | 58% | 0% | 69 s | 45–60% | met |
| harpies | 41% | 9% | 35 s | 45–60% | 1 SE under |
| Nemean lion | 56% | 0% | 55 s | 45–60% | met |
| minotaur | 33% | 4% | 47 s | 45–60% | **miss**, accepted (D4) |
| chimera | 29% | 0% | 66 s | 45–60% | **miss**, accepted (D4) |

The minotaur and the chimera have been at 29–33% since the v5 baseline (BASELINE.md: 29 / 29%). They haven't drifted. They appear only on the war map, never in the campaign arc. World bosses (Kraken, Titan) are shared-HP raids, not win-rate fights, so they have no row.

## 8. Economy

### Campaign gold: income vs sinks, per tier-3 win

| Flow | Value | Source |
| --- | --- | --- |
| Battle pay of a win | **217 g** (tier 2 the same) | `(20 + 12·kills + 60) × (1 + gold bonus ≤ 0.5)`, arcRows |
| Loot resale, 4 picks | **488 g** at tier 3 (320 g at tier 2) | arcRows |
| Lair hoard resale | 295 g a chest, 6 one-time chests | arcRows |
| Captain bounty when paid | 24% of that win's gold (79 of 727 wins) | doctrineRows; target 30–60% (**miss**, accepted) |
| Event gold per battle | −0.8 g (random), −2.9 g (greedy) | eventRows; target −10..+25 g (met) |
| Events per battle | 0.37 / 0.39 | target 0.30–0.50 (met) |
| Ransom | `6·size + 4·level` | bands under 0.35× your power |
| Sink: replacing a dead man | 40 g village, about 60–200 g town | `RECRUIT_COST`, BASELINE |
| Sink: healing | 1 g a wound-hour (about 50 g after an even battle) | `WORLD_RULES.healGoldPerHour` |
| Sink: repair | half value × wear | `Campaign.repairCost` |
| **Sink: the forge reroll** | **20–240 g a reforge**; 960 g expected to put one line on a tier-3 legendary weapon at 2 steps; about 20,000 g for a full legendary kit for one man | `FORGE` in `gear.ts`, EC-01.md |

**Judgement:** a tier-3 win nets about 700 g with resale. Even battles cost about 130–450 g in men and healing. The forge has no ceiling within any campaign (EC-01), so late gold has a use and no loop (a reforge doesn't raise sale value). The events are gold-neutral, as the GDD intends. Met where a target exists. The offline gold curve itself has no stated target (BASELINE), so it is not judged.

### Items and rarity

| Row | Now | Target | Status |
| --- | --- | --- | --- |
| Rarity mirror | section 3 | 58 / 66 / 76 / 85% | met |
| Item power cap (240 seeds, L5 / L10) | every named legendary and set bonus within 1 SE of +10 (for example Aegis −5 / +13, Trident +12 / +11, Sacred Band set +5 / +12) | ≤ +10 (V5-071) | met within noise |
| Legendary weapon (generic) | +11 / +13 | ≤ +10 | **OVER**, accepted (V5-071, EC-02 decision 3) |
| Forge: a perfected item over a natural one | about +3.5 pts (EC-01) | inside the cap | met |
| Beast hoard pity | a legendary every 6.7 chests, forced at 8 | — | unchanged |

### Perks and actives

| Row (mirror, level 4) | Now | Target | Status |
| --- | --- | --- | --- |
| Shield Bash / Berserk (all line men) | +5 / +6 pts (vs baseline 51%) | none stated | info |
| Volley / Eagle Eye (one skirmisher) | +3 / +2 | none stated | info |
| Rally Cry / Steady Presence / Warlord (one hero) | +5 / +6 / +7 | none stated | info |
| Push of Pike / War-cry / Sunder | +5 / +6 / +7 | +5..+10 | met |
| Sacred Bond / Aimed Volley / Wheel and Re-charge / Scythe Run | 0 / 0 / −1 / +3 | +5..+10 | **4 of 7 miss**, accepted (V5-073 and TRAIN2) |
| Companions with recharge on the flank (50 seeds) | 54% | ≥ 58% | **miss**, accepted (noise: 58% at 200 seeds) |
| Chariots vs militia (scythe, 50 seeds) | 26% | ≥ 30% | **miss**, accepted |
| The Standard vs none | +4 pts | +5..+8 | **miss**, accepted (V5-061, V5-073) |
| Bearer killed: first rout sooner | 36% sooner | ≥ 15% | met |
| Captain present vs absent | +8 | +5..+10 | met |
| Kill-captain vs ignore | −10 | ≥ +6 | **miss**, accepted (V5-073: needs single-man targeting) |

### Doctrines, orders and works (the rest of train 2)

| Row | Now | Target | Status |
| --- | --- | --- | --- |
| Reference vs steady / rush / hammer / swarm / fury | 52 / 47 / 44 / **39** / 50% | 40–60% | swarm 1 under, accepted |
| Lengths: hammer / swarm | 65 / 59 s | 80–150 s | **miss**, accepted (TRAIN2) |
| Ridge defender vs rush | 65% | 62–68% | met |
| Flanker vs face | 38% | ≥ 52% | **miss**, accepted (V5-073) |
| Orb vs riders / vs flank-and-rear | 81 / 65% | ≥ 55 / 55–70% | met |
| Orb vs equal line, frontal | 0% | 20–35% | **miss**, accepted (V5-041) |
| Feint gain / focus fire sooner | +22 pts / 30% | ≥ 8 / ≥ 30% | met |
| Stakes on the threatened flank | +8 | +10..+15 | **miss**, accepted (TRAIN2) |
| Riders into stakes: charge damage / hoplites win | −76% / 100% | ≤ −80% / 100% | 1 miss, accepted |
| Ditch vs 7 swordsmen | +9 | +6..+12 | met |
| Works: reference player / ridge + works / turtle | 9 and 53% / 68% / 0–8% | ≤ 62 / ≤ 70 / ≤ 70 | met |
| Event deck: dominated choices / chains / free choice | 0 / 8 of 24 / 24 of 24 | 0 / ≥ 1/3 / all | met |

## Within target, outside, and the call on each

**Within target:** matched win and length, contact, cohesion win/rout gap/cascade, dead fights, terrain mirrors, ridge vs rush, archer/slinger and elite means, militia vs riders, rarity mirror, item cap (named items and sets), tier-3 pacing, level pacing, lair hoard, the three campaign lairs, assault 1.0× and 1.3×, the host, captain present, bearer killed, orb vs riders and vs flank-and-rear, feint, focus, ditch, works caps, the event deck (EV table, events per battle, event gold).

**Outside target: every one accepted, none fixed.**

| Row | Gap | Call | Why |
| --- | --- | --- | --- |
| 8-man opening 72% | +2 over 70% | accept (D3) | About 0.7 SE at 248 fights, the same number since EC-05. The fix would be a starter-band knob (`STARTER_BANDS`), which moves the first fights of every campaign for 2 points of noise. |
| Minotaur / chimera 33 / 29% | 12–16 under the harness's 45% | accept (D4) | War map only, unchanged since baseline, and no GDD target (BASELINE "not judged"). A fix needs beast-kit tuning plus a fresh comp study, which isn't a smallest change. |
| Hydra / harpies 40 / 41% | 4–5 under | accept | Within 1 SE at 80 seeds; the hydra's 200-seed anchor is 43%. |
| Shock cells over 85% (23), flanker vs face, kill-captain, the A/B mirror, the Standard +4, orb vs frontal line | — | already accepted | V5-073, V5-041, V5-061 |
| Legendary weapon +11 / +13 | 1–3 over the cap | already accepted | V5-071, EC-02 decision 3 |
| Four actives under +5, Companion recharge 54%, chariot scythe 26%, swarm 39%, hammer/swarm lengths, cohesion length −15%, bounty 24% / +3%, stakes +8, riders into stakes −76% | 1–10 pts | accept (D2) | TRAIN2's proposed entry, never copied to DECISIONS. None of them is degenerate. Each fix would re-open the ladder parity (V5-052) and the 13 replay fixtures. |
| Ladder floors 29 / 31 / 36 | +8 / −6 / −6 | already accepted | V5-073 |

**Drift since the last tune: none.** No row changed, so the "fix in data" branch didn't apply. `src/data` is untouched, and the replay fixtures are untouched (13/13).

## Open risks

1. **No Glory or offline-gold target.** The duel Glory flow and the campaign gold curve are computed, not judged. A post-v5 economy GDD should set targets (owner: economy-designer).
2. **Ladder parity has no committed harness.** A future sim change can't re-run V5-052's parity scan. Owner: the first post-v5 sim story commits a frozen-copy harness under `src/dev/`.
3. **Mono-class matrix (99 lopsided cells)** matters only if a duel meta converges on single-class teams. Watch ranked telemetry after release (owner: systems-designer).
4. **War-map minotaur and chimera** are hard for an army at level − 1. Clans can bring more men, but a solo player may find them walls. Owner: the post-v5 balance pass.
5. **Destroyed-army restart:** 5 volunteers win 0% against the start's lair bandits (×2.96). The start bands near the town are the intended road back; check this in QA-03's playthrough.
6. **WebKit replay leg not run locally** (webkit-2215 missing); TRAIN2's 2242 run is the last WebKit evidence.
7. **Heavy runs under load:** the 400-seed run takes 34 minutes at a load average of about 25. Gates should keep using 200 seeds.

## Decisions (made while the user was asleep; for the Director to copy to DECISIONS.md)

| ID | Decision | Alternatives | Why |
| --- | --- | --- | --- |
| D1 | FL-04 closes v5 balance with **no data change**. Every row is identical to the ST-04 close: the battle code is byte-identical to EC-05, and seeded battles are deterministic. | Re-tune the residuals now | Nothing drifted. The story's rule is "fix only what drifted, smallest change". |
| D2 | TRAIN2's proposed residual list is **accepted** and routed to the post-v5 balance pass: doctrine lengths (hammer 65, swarm 59 s), swarm 39%, bounty 24% / +3%, cohesion length −15%, stakes +8, riders into stakes −76%, the 8-man opening 72%, four actives under +5, Companion recharge 54%, chariot scythe 26%. | Hold v5 for a tuning pass | ST-04 proposed it, but no integrator wrote it to DECISIONS. Each is within a few points, and none is degenerate. |
| D3 | The 8-man opening at 72% (target 55–70%) is accepted. | Lower `STARTER_BANDS` | 0.7 SE over, unchanged since EC-05; it touches every campaign's first fights. |
| D4 | War-map minotaur 33% and chimera 29% (harness target about 45–60%) are accepted for v5, owned by the post-v5 balance pass. | Re-kit both beasts now | No GDD target, unchanged since baseline, war map only. |
| D5 | Ladder parity is reported as **exact by determinism** rather than re-scanned: no input changed since the EC-05 scan, and the harness isn't in the repo. | Rebuild the frozen-copy harness | A rebuild would reproduce the same seeds. Committing a harness belongs with the next sim change (risk 2). |
| D6 | `npm run balance` now prints the event-deck rows (`eventRows` from `src/dev/eventBalance.ts`). The full EV table stays behind the one-line command in that module's header. | A separate script | It closes the PROGRESS item 30 follow-up. It adds about 20 s, and every row is in band. |

## `npm run balance -- 400`: summary

```
Matched 54% (loss 46%), median 72.0 s, contact 10.9 s; passive 9%
Ridge vs rush 65%; terrain mirrors 46-52%
Classes: archer 47 / slinger 48 / Guard 47 / Sacred Band 50; shock >85% cells 23; lopsided 99/306
Rarity 59-61 / 65-66 / 75-78 / 85-90; item cap: legendary weapon +11/+13 OVER (accepted)
Beasts (80 s.): hydra 40, cyclops 58, harpies 41, lion 56, minotaur 33, chimera 29
Doctrines 52/47/44/39/50; captain +8; kill-captain -10; bounty 24% / +3%
Orders: face 38, orb-riders 81, orb-rear 65, orb-frontal 0, feint +22, focus 30%
Works: stakes +8, ditch(7) +9, caps met
Arc: opening 72%, assault 1.0x 43% / 1.3x 94%, host 50%, hoard epic 24%, L6-10 37 battles
Events: 0 dominated, 0.37-0.39 per battle, -0.8 / -2.9 g per battle
(2059.8 s)
```

Skills applied: balance-check (inputs FOUND, every row judged against its target, and NOT ASSESSED or "not judged" where no target exists, such as Glory and the offline gold curve; the prompts were self-answered in autonomous mode) and playtest-report (experiential checks are routed to QA-03, risk 5). The agent lenses were systems-designer (the targets and the accept-or-fix calls) and economy-designer (faucets and sinks, the forge, Glory).
