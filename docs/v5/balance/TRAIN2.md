# Sim train 2: what changed, the balance snapshot, release notes (ST-04)

Story ST-04 closes sim train 2 (V5-019). Every rule change of v5 ships under `SIM_VERSION` 2, in one deploy, with both floors at 2 (V5-033, V5-043). This page records three things: what v2 changes against v1 (the v4 rules frozen in `server/src/sims/v1`), the balance at the close (`npm run balance -- 400` on `v5` at 5070ff7), and the release notes. The cutover runbook is in `docs/OPS.md` "Sim train releases".

The user was asleep, so I made the calls myself. They are listed under Decisions.

## What changed in v2

| Story | Rule (GDD) | Balance record |
| --- | --- | --- |
| FO-01 | **Face** turns a group and keeps its order. **Focus** makes missile men shoot one enemy group first. Forms keep their order (formations-orders.md R1, R4). FO-01 raised both floors to 2. | FO-01.md |
| FO-02 | **Orb** formation: no riders, a ring that braces all round. **Feint**: light men, missile men or riders run back, then turn and charge, and the group they draw is disordered (R2, R3). | FO-02.md |
| FO-03 | **Cohesion**: a group's rout shakes its own men and the men near it. **Army break**: past a loss threshold the whole army runs (R5, R6). | FO-03.md |
| AI-01 | Bot **doctrines** steady / rush / hammer / swarm / fury (ai-doctrines.md R1). A setup without one plays steady, which is the v1 AI. | AI-01.md |
| AI-02 | Band **captains** (a bot standard bearer) and the captain bounty (R6, R8). | AI-02.md |
| AI-03 | Ladder floors fight their chapter's doctrine, tuned per floor, and never retreat (`holdField`). War-map neutrals fight their kind's doctrine and may retreat (R4, V5-052). | AI-03.md |
| AB-01 | Perk paths A / B. | AB-01.md |
| AB-02 | Seven **signature actives**: Push of Pike, Sacred Bond, War-cry, Sunder, Aimed Volley, Wheel and Re-charge, Scythe Run (abilities.md R3). Bots use them too. | AB-02.md |
| AB-03 | **The Standard**: a bearer's aura, Raise once per battle, banner loss (R5, R6). | AB-03.md |
| FW-01, FW-02 | **Field works**: stakes, ditch and laager, placed in deployment. There is an allowance per army, bots place works, and there is a stand-off rule (field-works.md). Works are offline only; no online setup carries an allowance. | FW-01.md, FW-02.md |
| EC-02 | Item power cap: no item adds more than 10 points (V5-071). | EC-02.md |
| EC-04 | Class re-cost: archer, slinger, Royal Guard, Sacred Band, Companion and chariot. | EC-04.md |
| EC-05 | Militia kit, bots that focus fire and orb against riders, garrisons that hold their walls, the garrison plate, and the ladder re-tune (V5-073). | EC-05.md |

Wire and server: there are new order kinds `face`, `focus`, `work` and `unwork`. There is a new order `feint` and a new shape `orb`. The setup has new fields: `doctrine`, `holdField`, `works`, `captain` and `CombatStats.standard`. The zod schema in `server/src/battle.ts` declared all of them in ST-03. `REPLAYERS` has 1 (frozen) and 2 (today's sim). Since FO-01, `MIN_SIM_VERSION` and `SOCKET_MIN_SIM_VERSION` are 2.

## Replay fixtures (AC 1, AC 2)

`tests/fixtures/replay-v2.json` (12 online battles) and `replay-v2-offline.json` (1) hold 13 battles. They are recorded on purpose by `tests/trainReplay.test.ts` (`RECORD_REPLAY_V2=1`). Each holds the setup as the server builds it (`ladderSetup`, or `onlineBattleSetup` + `withDoctrine`), the human's log as the client submits it (`attackSubmission`), the result, `Battle.hash()`, and a hash every 100 ticks.

| Battle | Where | What it carries |
| --- | --- | --- |
| `ladder-all-hammer` | ladder floor 33 (hammer, holdField) | **The all-features online log:** orb and face in deployment, focus, face in battle, feints, all 7 actives, the Standard raised. Events: a feint that draws (disordered), cohesion, army break, banner loss. |
| `ladder-steady` / `-swarm` / `-rush` / `-fury` | floors 5 / 13 / 23 / 43 | Same script, one per chapter doctrine (holdField). |
| `war-steady` … `war-fury` | war attack on hills, one per doctrine | Same script against neutrals that may retreat. |
| `war-retreat` | war, swarm | The neutrals retreat (`retreated: 1`). |
| `ladder-standard-lost` | floor 43 | The human's bearer falls (`standardLost`). |
| `offline-all-works` | offline lair assault, fury garrison, holdField | **One log with everything:** the player's stakes, ditch and an unwork, the garrison's own stakes (with a `stakesBreak`), a band captain, orb, face, focus, feint, all 7 actives and the Standard. |

Together they cover face, focus, orb, feint, every active, the Standard (raised and lost), cohesion, army break, every doctrine on the ladder and on the war map, holdField, a war retreat, a captain and works. The tests check that coverage too, so a fixture can't silently lose a feature.

**Cross-engine result: identical everywhere.**

| Engine | How | Result |
| --- | --- | --- |
| Node 25 (V8) | `tests/trainReplay.test.ts`: replays every battle, and re-plays the client script to an identical record | 13 / 13, every checkpoint |
| workerd | `server/test/trainReplay.test.ts`: zod + `replayBattle(…, 2)`, checkpoints, and `POST /api/battle/verify` for both all-features logs | 13 / 13, every checkpoint, `match: true` |
| Chromium 141 | `node scripts/replay-hash.mjs chromium` (Vite bundle of `src/sim`, Playwright page) | 13 / 13 |
| WebKit 26.0 | `PW_WEBKIT_PATH=…/ms-playwright/webkit-2242/pw_run.sh node scripts/replay-hash.mjs webkit` | 13 / 13 |

WebKit note: Playwright 1.56 wants webkit-2215, which is not installed here. I used the installed build 2242 (WebKit 26.0) through `PW_WEBKIT_PATH` rather than download a browser. Without the override the script prints `webkit: NOT RUN`.

**Determinism audit:** no fix was needed. `src/sim` uses only `+ - * /`, `sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `round`, `imul` and the constant `Math.PI`. The only cos and sin are the Taylor series in `formation.ts turnCosSin` and `battle.ts smallTurn`. There is no `atan2` (`pseudoAngle`), and no `Math.random`, `Date` or `performance` in the sim. Mutation check: I changed one recorded checkpoint, and the Node test, the workerd test and the browser script all failed and named the battle and tick 400. Then I restored it. Re-recording gives a byte-identical file.

## Balance snapshot (AC 3)

`npm run balance -- 400` on 5070ff7 took 1,792 s. The raw output was kept in the session scratchpad. `src/sim`, `src/data`, `src/duel/ladder.ts`, `src/game`, `src/online` and `src/world` are byte-identical to the EC-05 merge (9570d6f), so differences from EC-05.md are seed count and noise.

### Headline

| Row | Value | Target | |
| --- | --- | --- | --- |
| Matched: player win | 54% | 45–55% | met |
| Battle length median / mean | 72.0 / 78.6 s (71% in 60–150 s) | median 55–150 s | met |
| Passive player wins | 9% (time limit 2%) | low | met |
| Ridge defender vs rush | 65% | 62–68% | met |
| Generated terrains | 47–52% | about 50% | met |

### Every GDD target

| Target (source) | Measured | Status | Logged |
| --- | --- | --- | --- |
| Archer / slinger mean ≥ 40% (V5-037) | 47 / 48% | met | — |
| Royal Guard / Sacred Band mean ≥ 46% | 47 / 50% | met | — |
| Militia vs Companion / Thessalian / chariot not 100% | 84 / 68 / 64% | met | — |
| Shock infantry cells over 85%: none (EC-04 AC 1) | 23 | **missed** | V5-073 |
| Signature actives +5..+10 pts each | Push +5, War-cry +6, Sunder +7; **Bond 0, Aimed 0, Recharge −1, Scythe +3** | **4 of 7 missed** | V5-073 (A/B mirror, perk pass) and new (below) |
| Companion flank with recharge ≥ 58% | 54% (50 seeds) | **missed** | new (EC-05 measured 58% at 200 seeds; noise at 50) |
| Chariots vs militia (scythe) ≥ 30% | 26% (50 seeds) | **missed** | new |
| Standard vs none +5..+8 | +4 | **missed** | V5-073 |
| Bearer killed: first rout ≥ 15% sooner | 36% sooner | met | — |
| Doctrine reference wins 40–60% | steady 52, rush 47, hammer 44, fury 50, **swarm 39** | **swarm missed by 1** | new (EC-05 had 40, the edge) |
| Doctrine lengths | steady 73 (60–150), rush 64 (60–90), fury 63 (60–150); **hammer 65, swarm 59 (80–150)** | **2 missed** | new |
| First contact (5v5) ≤ 15 s | 11.9 s | met | — |
| Captain present vs absent +5..+10 | +8 | met | — |
| Kill-captain vs ignore ≥ +6 | −10 | **missed** | V5-073 |
| Bounty share of a win's gold 30–60% (F3) | 24% | **missed** | new |
| Bounty over every captained win +10..+20% | +3% | **missed** | new |
| Flanker vs face ≥ 52% | 38% | **missed** | V5-073 |
| Orb vs riders ≥ 55% | 81% | met | — |
| Orb vs flank-and-rear 55–70% | 65% | met | — |
| Orb vs equal line, frontal 20–35% | 0% | **missed** | V5-041 (bots never orb against a frontal line), EC-04 |
| Feint gain over a plain withdraw ≥ 8 pts | +22 | met | — |
| Focus silences slingers ≥ 30% sooner | 30% | met | — |
| Dead fights ≤ 2% | 0% | met | — |
| Mean length with cohesion within 10% | −15% (78.6 vs 92.9 s) | **missed** | new (shorter battles, a GAMEPLAY median still met) |
| Player win with cohesion 45–55% | 54% | met | — |
| Rout gap shrinks 20–40% | 32% | met | — |
| Cascade median ≤ 2 groups | 1 | met | — |
| Stakes on the threatened flank +10..+15 pts | +8 | **missed** | new (EC-05 had +9) |
| Riders into stakes: charge damage ≤ −80% | −76% | **missed** | new |
| Riders into stakes: hoplites win 100% | 100% | met | — |
| Ditch vs 7 swordsmen +6..+12 | +9 | met | — |
| Works: reference player ≤ 62% (holding / bot-driven) | 9 / 53% | met | — |
| Ridge + 3 bot works vs rush ≤ 70% | 68% | met | — |
| Turtle vs swarm / hammer ≤ 70% | 0 / 8% | met | — |
| Rarity mirror 58 / 66 / 76 / 85% | 59–61 / 65–66 / 75–78 / 85–90% | met (within about 1 SE) | — |
| Item power cap +10 | legendary weapon +11 / +13 OVER; others within 1 SE | **missed (accepted)** | V5-071, EC-02.md decision 3 |
| 8-man opening vs starter bandits 55–70% (R1) | 72% | **missed by 2** | new (EC-05 had 71) |
| Lair assault at 1.0× 38–48% (R2) | 43% | met | — |
| Lair assault at 1.3× ≥ 60% | 94% | met | — |
| Tier-3 bands: 0% before day 50, then by danger (R3) | 0% / 61%; 92% after 2 lairs | met | — |
| Lair hoard epic set piece 25% (R6) | 24% (4,000 chests) | met | — |
| Levels 6–10 at 32·L XP (R7) | 37 battles at 26 XP (< 46) | met | — |

### Lairs

| Beast lair (80 seeds, sensible army) | Win | Naive |
| --- | --- | --- |
| hydra / cyclops / Nemean lion | 40 / 58 / 56% | 0 / 0 / 0% |
| harpies / minotaur / chimera | 41 / 33 / 29% | 9 / 4 / 0% |

The three campaign lairs (hydra, cyclops, lion) are within 2 pts of EC-05.md (43 / 58 / 53% at 200 seeds). Garrison lair assaults are in the table above.

### Ladder

**NOT RE-MEASURED in ST-04.** Ladder parity, floor by floor against the pre-change copy, needs EC-05's throwaway harness (a frozen pre-EC-05 `ai.ts`), and that harness was never committed. The sim, the data and `ladder.ts` are byte-identical to the EC-05 merge, where it was measured after the merge: **47 of 50 floors are within ±5 pts. Floor 29 is +8, floors 31 and 36 are −6, and all three are accepted within ±8 (V5-073).** `tests/ladderDoctrine.test.ts` pins the doctrine table that measurement used. The ladder replay fixtures cover one floor per chapter doctrine, all holdField.

### Health summary: CONCERNS

There is no degenerate strategy. No row moved from EC-05 beyond noise. The misses fall into two groups. Most are already accepted residuals (V5-071, V5-073, V5-041). The rest are small edges, marked "new" above.

**Proposed DECISIONS.md entry (for the integrator; DECISIONS.md is not an ST-04 file):**

> V5-0xx | ST-04 closes sim train 2 at the EC-05 balance. Train-2 misses not logged before are accepted for the release and routed to the post-v5 balance pass: doctrine lengths (hammer 65 s, swarm 59 s vs 80–150), swarm reference 39% (edge of 40–60), bounty share 24% / +3% (vs 30–60% / +10..+20%), cohesion length −15% (vs within 10%), stakes gain +8 (vs +10..+15), riders into stakes −76% (vs ≤ −80%), the 8-man opening 72% (vs 55–70%), and four actives below +5 (Bond 0, Aimed 0, Recharge −1, Scythe +3; Companion recharge 54% and chariot scythe 26% at 50 seeds). | Hold the train for a tuning pass | Every one is within a few points of its band, none is degenerate, and each change would re-open the ladder parity (V5-052) and the v2 fixtures.

## Release notes: v1 → v2 (player-facing draft)

**New orders**
- **Face:** turn a group where it stands. It keeps its order.
- **Focus:** archers, slingers and javelin men shoot the enemy group you pick first.
- **Orb:** foot soldiers close into a ring that braces on every side. Strong against riders, weak against a line that hits it head on.
- **Feint:** light troops, missile men and riders run back, then turn and charge. The enemy group that chased them is thrown into disorder.

**The battle line**
- A routing group shakes the men around it. An army that loses too much breaks and runs as a whole.
- **The Standard:** your bearer steadies the men around him. Raise it once per battle to rally men who are running. If he falls, his side loses heart.
- **Signature actives:** each family has one: Push of Pike, Sacred Bond, War-cry, Sunder, Aimed Volley, Wheel and Re-charge, Scythe Run.

**Enemies**
- Enemies fight in a style (steady, rush, hammer, swarm or fury).
- Bands may have a **captain**, and catching him pays a bounty.
- Ladder enemies fight to the last man. War-map neutrals may retreat.
- Garrisons man their walls, archers focus fire, and a lone line forms an orb against riders.

**Campaign only**
- **Field works:** set stakes, a ditch or a laager in deployment.

**Balance**
- Archers, slingers, the Royal Guard, the Sacred Band, Companions and chariots cost less. Militia carry clubs and javelins as well as spears. The strongest named items and set bonuses are trimmed to the item power cap.

**Online**
- Online battles need the new version. If the game says it is out of date, close and reopen it. A battle you started before the update can still be finished.

## Decisions (made while the user was asleep)

1. **AC 1's "one log" is the offline fixture.** Works are offline only, and no online setup carries an allowance, so no online log can hold works. `offline-all-works` holds everything at once, works and a captain included. The server replays it through `/api/battle/verify`. The online all-features log (`ladder-all-hammer`) holds everything an online battle can hold. "Each doctrine" needs one battle per doctrine, because a side has one doctrine, so it is covered across the set: every doctrine on both the ladder and the war map.
2. **Two files outside the story's list.** `tests/trainReplay.test.ts` is the Node half and the recorder, because the root vitest has no Node types and fixtures need a deterministic generator. `scripts/replay-hash.mjs` is the browser half. I kept it out of `scripts/regression/**`, which belongs to QA-02, and QA-02 can absorb it. No new dependencies: it uses Vite's `build` and the Playwright the repo already has.
3. **Fixture content:** human orders only, as `attackSubmission` sends them, with a hash every 100 ticks. A cross-engine drift then shows its first bad tick, not just a wrong final hash.
4. **WebKit via the installed 2242 build**, not a browser download (`PW_WEBKIT_PATH`).
5. **Ladder parity not re-run.** The code is identical to the measured EC-05 merge, and the harness isn't in the repo. It is marked NOT RE-MEASURED above, not as a pass.
6. **Misses not written to DECISIONS.md.** The file is outside ST-04's ownership, so the entry is proposed above for the integrator.
7. **`server/src/simVersion.ts`:** a comment only. Train 2 is closed, and after the release any change that alters a replay is version 3. The floors were already 2 (FO-01).

## Gates

- `npx tsc --noEmit`: clean. `npx vitest run`: 97 files, 1,219 tests. `npx vite build`: ok.
- Server `tsc --noEmit`: clean. Server `vitest run`: 37 files, 340 tests (`trainReplay.test.ts` 31).
- `node scripts/replay-hash.mjs`: Chromium 13/13, WebKit 26.0 13/13 (with the override).
- Preview on :4547: `online-smoke.mjs` ALL PASS (25), `duel-smoke.mjs` ALL PASS (53). `online-e2e.mjs` against `wrangler dev` on :8851 (local D1, migrations through 0016) with vite on :4549: ALL PASS. The attack and the live duel were both server-verified.
- Nothing deployed.

Skills applied: balance-check (inputs listed, every target judged, NOT RE-MEASURED where no data, prompts self-answered), regression-suite (the fixtures are a guarded regression set; I watched a mutation fail all three engines), smoke-check (the three smokes, NOT RUN reported for a missing engine), security-audit (network: the forged and tampered logs are refused, and no new endpoint or field was added), tdd, story-done (each AC checked above). Agents' lenses: network-programmer (deploy order, in-flight tickets), systems-designer (targets), qa-lead (cross-engine evidence).
