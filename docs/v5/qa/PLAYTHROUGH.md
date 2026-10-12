# QA-03: full-game playthrough and playtest report (v5)

- **Date:** 2026-10-12
- **Build:** `v5` @ e8a440e (batch 37 merged), vite preview (offline) and vite dev + wrangler dev with DEV_AUTH (online)
- **Tester:** one agent acting as a proxy player, using the PLAY method (`production/qa/qa-plan-v5.md` §12–13)
- **Platform:** headless Chromium, phone context (touch, DPR 2) at 390x844, 360x780, 320x640, in en and ru
- **Duration:** about 3 h of play, including 1 full tutorial, 11 campaign battles (2 staged), 1 practice, 1 ladder floor, 1 raid, 1 war attack
- **Shots:** `docs/v5/qa/shots/` (59 JPEGs, each 150 KB or less). Names are `NN-<step>-<size>-<lang>.jpg`; the `m-*` files are the size and language matrix

## Summary verdict

**NOT APPROVED.** By the team-qa rule, any open S1 or S2 blocks approval. There is 1 S1 and 2 S2.

v5 plays like a different game from the audit. The tutorial, first-run art, encounter sheet, perk choice, event cards and why-lines all work, and they read well. The first campaign battle gave 9 real decisions.

Three defects block release:

1. **S1:** on the online **Shop** hub, every tab-bar tap falls through to hidden cosmetic cards. The Shop becomes a dead end that opens purchase sheets instead.
2. **S2:** after a defeat in a field camp, the winning band attacks the camp again the moment the map returns. This repeats until the army has 0 fit men. A new player who loses once in camp is spiralled out.
3. **S2:** the encounter sheet miscounts the army ("5 fit, 5 wounded" when 0 are fit) and calls the fight "an even match".

Fixing these three and the top S3s (the paused state with no message, cards for dead groups, deployment framing, and the lair-assault stalemate) would make the build releasable on this evidence.

**Smoke check (precondition): PASS.** I ran it against the preview build used for play: `scripts/smoke.mjs` ALL PASS (47 checks), and `scripts/tutorial-smoke.mjs` PASSED (136 checks). I did **not** re-run vitest, layout-check or online-e2e. Their last results are the batch 36–37 integrator gates in PROGRESS.md (vitest 1489, layout 0 new, online-e2e 34).

**Run shape (team-qa `team.size: individual`).** Active set: this agent as qa-tester. qa-lead and game-designer were consulted only through their agent definitions, and no subagent was spawned: QA-03 is a single-agent story and the brief forbids fan-out. Nothing was written to `production/qa/bugs/`. The Director dispatches fixers from the findings below.

**Staging used (named so no reader takes it for natural play):**

- The party was moved to a campable tile, because twice a tap on open ground entered Lokroi.
- A second campaign used level-6 heroes and 900 gold to reach a lair.
- Five lairs were razed through `razeLair` to reach the host.
- Duel XP was set to 5000 in local D1 to unlock ranked and raids.
- A second dev user set a raid defence.
- The ru and 320 matrix runs end their battles by stepping the sim, only to reach the Results screen.

Every sheet, button and order was otherwise tapped with real touch events.

## Experiential AC scorecard

Counts: **PASS 45 · PARTIAL 8 · FAIL 6 · NOT ASSESSED 6** (65 rows: 20 playtest ACs + 45 story ACs). The playtest ACs alone are 10 pass, 4 partial, 2 fail and 4 not assessed.

### A. Playtest ACs (qa-plan §12)

| # | AC (source) | Score | Evidence |
| --- | --- | --- | --- |
| A1 | ≥ 8 real decisions in the first campaign battle (VISION) | **PASS** | 9: deploy (1) Phalanx I forward, (2) IV to the right; battle (3) II Shoot, (4) II focus their skirmishers, (5) I Charge, (6) IV focus the rider, (7) IV tap-move to the enemy flank, (8) IV Then→Charge, (9) II refocus to their main body. Shots 19, 22, 23 |
| A2 | Time to first contact ≤ 15 s (VISION) | **PARTIAL** | 0:07 and 0:08 (matrix), about 0:12–0:15 (battle 1), 0:17 (host), 0:18 (camp attack). 2 of 5 over |
| A3 | Defeats with an explained cause: 100% (VISION, RD-03) | **PARTIAL** | 9 of 9 defeats had a why-line, but the lair-assault timeout read "Outnumbered 8 to 16 at the clash" when there was no clash (S3-4). Shots 48, 96, m-results-* |
| A4 | Wrong-group orders ≤ 0.2 per battle (controls) | **PASS** (proxy) | 0 wrong-group orders in about 9 battles. One self-inflicted misplacement (S3-8) |
| A5 | Mistaken knob grabs: 0 in 5 battles | **PASS** (proxy) | 0, but the knob was used rarely outside the tutorial |
| A6 | Missile group idle out of range > 10 s: 0 | **PARTIAL** | Battle 1: IV's focus target (the rider) died and IV stood "holding" for about 15 s, with no out-of-range or retarget cue |
| A7 | "It did something I didn't mean" ≤ 1 per person (5 people) | NOT ASSESSED | Needs humans |
| A8 | Who is winning at a random pause, ≥ 4 of 5 (readability) | **FAIL** (proxy 0/2) | At 0:30 and 0:33 I read "foe ahead" from the bars (70 v 83%). The swarm band withdrew at 0:44. The strength bars do not show doctrine or morale intent. Shot 22 |
| A9 | "Teal bar?" confusion: 0 | **PASS** | HP and MOR labels on every card, ru ЗДР and ДУХ |
| A10 | ≥ 10 decisions at 20+ men with no overload | **FAIL** (proxy) | 24-man lair assault: about 6 decisions. The garrison never left the palisade, so there was nothing to decide (S3-4) |
| A11 | Describes the turning point before reading the why-line | **PASS** | Battle 2 note: "skirmishers broke, the rout spread". The why-line: "Our army broke after 2 groups routed" |
| A12 | Names a band's doctrine after two fights | **PASS** (proxy, biased) | Swarm, fought 5 times. It is named on the sheet anyway |
| A13 | 5v5 contact ≤ 15 s (ai-doctrines) | **PARTIAL** | As A2 |
| A14 | Counters a flank with face or orb unprompted | NOT ASSESSED | The tester read the GDD (biased); Orb and Feint did not unlock before the save broke (S2-1) |
| A15 | Hesitates at a level-up and can explain the choice | **PASS** | Theron Lv 2: Shield Drill (+1 armour) or Drilled (+9 morale). Took Drilled: a front hoplite should hold when the line wavers. Shot 33 |
| A16 | Says the campaign goal after 10 minutes | **PASS** | "Burn the six lairs, then beat the Tyrant's host": coach mark 1/3 and the Lairs 0/6 chip. Shot 14 |
| A17 | Remembers an event and its consequence | **PASS** | "Fever in the town": stayed to help, it went badly, +15 XP to all, −20 food, a man fell ill. Shot 38 |
| A18 | No event choice > 80% across 5 testers | NOT ASSESSED | Needs humans |
| A19 | Uses stakes vs cavalry unprompted | NOT ASSESSED | Works were placed (shot 43), but no cavalry band was met while works were available |
| A20 | Practice: "no spoils", grants nothing | **PASS** | Nemean Lion Trial: gold 60→60, XP 0, stash 2→2, all men back. Shot 61 |

### B. Story ACs checked in play

| # | Story · AC | Score | Evidence |
| --- | --- | --- | --- |
| B1 | TUT-01: key art first, not blank parchment | **PASS** | Shot 01 |
| B2 | TUT-01: mode choice matches the three tabs | **PASS** | Shot 13 |
| B3 | TUT-02: teaches knob, focus, undo, Then, morale glyph, flank arcs | **PASS** | Shots 06, 10; tutorial-smoke 136/136 |
| B4 | TUT-02: about 3.5 min | **PASS** | 2:28 wall time (a fast player) |
| B5 | HUB-02: Army, Stash, Camp above the fold at 320x640; one primary CTA | **PASS** | m-hub-320-en, m-hub-320-ru |
| B6 | S03: "Lairs n/6" in the hub status line | **PARTIAL** | Hub status shows hurt men, not lairs; the chip is on the World only. Shot 37 |
| B7 | WLD-01: encounter sheet shows doctrine, tell and captain at 390 and 320, no truncation; has a close | **PASS** | Shots 16, m-encounter-390-ru, m-encounter-320-ru |
| B8 | WLD-02: arc chip states the goal; coach marks guide the first march | **PASS** | Shot 14 |
| B9 | WLD-02: Arc sheet with Lairs and Journal tabs | **PASS** | Shot 99 |
| B10 | EV-03: card pauses the map; 2–3 choices with outcomes in words | **PASS** | Shot 38 |
| B11 | AI-02: swarm retreats, comes back weakened with the same captain | **PASS** | Abdmelqart: 7 men, withdrew, back with 6. Shot 49 |
| B12 | SET-01: Services with the Drillmaster; hire Undo toast; Sell confirms | **PASS** | Shots 28, 29 |
| B13 | HERO-01: A/B per tier with the stat delta; second pick refused | **PASS** | Shot 33; the Learn confirm says the other perk closes |
| B14 | HERO-01: Perks tab fits at 320x640 | **FAIL** | The tier cards start below the fold. Shot m-hero-320-ru |
| B15 | HERO-01: retrain confirm states the cost | **PARTIAL** | The Drillmaster row says "40 g × tier"; the retrain flow itself was not run |
| B16 | ARM-01: Back targets match screen-flow (Hero→Army→World→Hub) | **PASS** | Telegram Back chain verified |
| B17 | FW-03: single-tap placement (tap a cell + Place); supplies spent | **PASS** | 12→6 supplies. Shot 43 |
| B18 | FW-03: Works after the first camp | **PASS** | Works tray in the camp-attack battle |
| B19 | CT-01: empty groups show no card | **FAIL** | Wiped groups keep cards ("0 men · holding"). Shot 102 (S3-2) |
| B20 | CT-03: Retreat and Leave confirm | **PASS** | "Leave the field? … Stay / Leave" |
| B21 | CT-04: Then… queues a charge | **PASS** | Battle 1, IV; tutorial step |
| B22 | CT-05: deployment opens with both armies in view | **FAIL** | Enemy off-screen in the campaign, camp, assault and ladder deployments. Shots 19, 94 (S3-3) |
| B23 | CT-06: ladder pauses; 2x and 0.5x cycle | **PASS** | Speed key 2× → 0.5× → 1×; Pause works |
| B24 | CT-06: realtimeLocked battles say so before the start | **PARTIAL** | War attack: "Real time: this battle cannot be paused or sped up". Raid: I saw no notice; the raid was already at 0:02 "Live" when first sampled. Shots 83, 77 |
| B25 | CT-07: left-hand mirrors the rail and the eye | **PASS** | Shot 66 |
| B26 | RD-01: bars carry a word | **PASS** | HP and MOR |
| B27 | RD-02: banners expire at 6 s | **PARTIAL** | They expire, but the auto-pause then stays with no message (S3-1). Shot 47 |
| B28 | RD-03: 100% of defeats carry a why-line; wraps in ru at 320 | **PASS** | m-results-320-ru wraps |
| B29 | BTL-01: menu in realtimeLocked offers Retreat and Sound only | **PASS** | Shot 77 |
| B30 | RES-01: Practice label; losses count dead, fled and KO | **PASS** | Shot 61; "Losses 6" with 1 dead, 5 KO |
| B31 | AR-02: assault field uses palisade + stakes | **PASS** | Shot 94 |
| B32 | AR-02: a victory marks the lair fallen | NOT ASSESSED | The assault was lost (timeout) |
| B33 | AR-04: host musters after the 6th lair and marches | **PASS** (staged) | Shot 99 |
| B34 | AR-04: the host can be beaten | NOT ASSESSED | Lost 4 v 6 against Tyrant Lv 10 with a staged army |
| B35 | CDX-01: Codex is the home of beasts and doctrines; Trial returns to the Codex | **PASS** | Doctrines segment after the first doctrine was met (1/5). Shots 56, 58, 61 |
| B36 | DLG-01: Reduce motion, shake, flash, Left hand, battle speed | **PASS** | Shot 64; rows present (the visual effect of Reduce motion was not checked) |
| B37 | DUE-01: FIGHT clear of the floor grid; Team and Armoury in one row | **PASS** | Shot 73 |
| B38 | DUE-02: leaderboard and raids sub-screens | **PASS** | Empty states read well |
| B39 | WAR-02: no English in Clan for ru; Leave away from the primary | **PASS** | m-clan-360-ru, shot 87 |
| B40 | WAR-02 / S21: Merchant buy confirms | **PASS** | Shot 82 |
| B41 | SHP-01: Pass shows the season card and Claim without scrolling | **PASS** | Shot 89 |
| B42 | SHP-01 / MKT-01: Market Back returns to the Shop | **PASS** | Shot 90 |
| B43 | HUB-01: no dead ends | **FAIL** | The online Shop is a dead end (S1-1). Shot 107 |
| B44 | Practice from Codex grants nothing (practice-fight GDD) | **PASS** | As A20 |
| B45 | A11Y-14: single-tap equip (tap an item, then Equip) | **PASS** | Compare sheet → Equip |

### C. Not assessed this run (named, per skill-authoring obligation 3)

- Live ranked or unranked match: needs two live players (online-e2e covers it).
- Orb, Feint and the 3rd-battle unlock.
- Mixed-bundle SV-03..05.
- Telegram Desktop hover (A11Y-22).
- Reduce-motion visuals.
- Battle-speed persistence after a reload.
- A raid against a real defence log.

## Findings

### S1: blocker

**S1-1. The online Shop hub is a dead end: tab-bar taps hit hidden cosmetic cards.**

- **Screen:** S23 Shop (online, signed in), 390x844 en.
- **Repro:**
  1. Sign in online (`?devuser=…`) and tap the Shop tab.
  2. Without scrolling, tap the Campaign, Duels or Codex label, or the War medallion's centre (195, 752).
- **Actual:** the scene stays on Shop and a cosmetic item sheet opens instead (Bronze duellist shield, Gorgoneion). 4 of 4 tabs fail. A hit-test at the Codex label returns `tab.codex`, `cosmetic:duel_emblem_bronze` and a Rectangle: the masked rows of the cosmetics grid below the viewport stay interactive under the tab bar and win the tap. Hubs are roots, so the player has no Back. In the offline Shop (error state, no grid) and in the Codex, tabs work.
- **Expected:** the tab bar wins; masked rows are not hit-testable.
- **Shot:** 107.
- **Suspected:** `src/scenes/ShopScene.ts` (the cosmetics grid build order and depth vs the tab bar) and `src/ui/kit.ts` ScrollArea (input on clipped children). The tab art is in `src/ui/mosaic/TabBar.ts`.

### S2: major

**S2-1. Camp defeat death spiral: the winning band attacks again as soon as the map returns.**

- **Screen:** S04 World (field camp), 390x844 en.
- **Repro:**
  1. Pitch camp on the map.
  2. Lose a battle to a band that attacks the camp.
  3. Tap Onward.
- **Actual:** within about 1 s, "They fall upon your camp! … They won't let you go" again. I reproduced it 5 times in a row (fit men 7→4→3→2→1→0). Flee at 46–64% failed twice ("They cut off your escape"). Each defeat still paid +20 gold.
- **Cause (read from code):** `afterPartyBattle` sets `safeUntil = time + 3` game hours (`src/game/campaign.ts:645`) and weakens the band with 3 h idle, but the camp's waiting state keeps running in `WorldScene.update` at WAIT_SPEED. 3 game hours pass in about a second, so the protection is gone before the player can act. Measured: time 36.30 vs safeUntil 36.26 when the next attack opened.
- **Expected:** after a defeat, waiting stops (or the respite is in real time), so the player can break camp or flee.
- **Shots:** 49, 54.
- **Suspected:** `src/game/campaign.ts` (afterPartyBattle), `src/scenes/WorldScene.ts` (update / setWaiting after a battle).

**S2-2. The encounter sheet miscounts the army and misjudges the fight.**

- **Screen:** S04 encounter sheet, 390x844 en.
- **Repro:** continue S2-1 until the status chip shows **0/5** fit.
- **Actual:** the sheet says "Your army: 5 fit, 5 wounded" and "An even match", then deploys all 5 wounded men. Fit + wounded > total, and the even-match verdict is based on the wrong count. The player decides Attack or Flee on false information.
- **Expected:** a correct fit count and a fair verdict; and a clear rule on whether wounded men fight when the camp is attacked.
- **Shot:** 54.
- **Suspected:** `src/ui/sheets/encounter.ts` (army line), `src/scenes/WorldScene.ts` openEncounter (the info passed in).

### S3: minor (fix before release)

1. **The paused state has no message after an auto-pause.** The "First contact / Flanked / Routs" banner expires after 6 s, but the battle stays paused. The only cue is the red Play key; a manual pause shows a persistent "Paused. Give orders, then tap Play." pill. **Repro:** campaign battle, wait for an auto-pause, wait 8 s. **Shots:** 47 (vs 22). **Suspected:** `src/scenes/BattleScene.ts` autoPause / fieldBanner (RD-02 BannerLife).
2. **Dead groups keep their cards, and the selection can stay on a dead group.** Cards read "Phalanx 0 men · holding" or "Flank 0 men · charging", with the order bar still on the dead group and every key disabled (CT-01 AC3, controls R1.4). **Repro:** lose a group in any battle (raid at 3:41; host at 0:17). **Shot:** 102. **Suspected:** `src/ui/battlePanel.ts`, BattleScene selection on a disband.
3. **Deployment does not frame both armies (CT-05 AC1).** The enemy is off-screen, with only an edge marker, in the campaign, camp-attack, assault and ladder deployments. The edge marker also sits over our own IV badge. **Shots:** 19, 94. **Suspected:** `src/scenes/BattleScene.ts` deploy camera (CT-05 K1).
4. **The lair assault stalls into a timed-out "defeat" with a false why-line, and it pays.** The "Rush: charges at once" garrison never left the palisade. The battle ran to 5:00 and closed as Defeat with "Outnumbered 8 to 16 at the clash" (no clash happened), yet paid +90 XP and +20 gold for 0 kills. A timeout needs its own why-line rule; the doctrine tell should say garrisons hold their walls; and a timeout should not pay XP. **Shots:** 93, 94, 96. **Suspected:** `src/game/report.ts` (why rules), `src/i18n/why.en.ts` and `src/i18n/why.ru.ts`, `src/data/doctrines.ts` copy for garrisons (also the known swarm "retreats" text).
5. **The ladder deploy timer runs under the first-time "Orders by touch" hint.** "12 to deploy" counts down while the hint covers the field, and the floor started before I pressed Ready. The deploy start text also says "You can pause this floor". **Shot:** 69. **Suspected:** BattleScene deploy timer and hint (pause the timer while the hint is up).
6. **Hero Perks tab at 320x640:** the tier cards start below the fold (HERO-01 AC2). **Shot:** m-hero-320-ru. **Suspected:** `src/scenes/HeroScene.ts`.
7. **The Hero hint toast renders behind the perk cards** (ru 390): "…вещь, или перетащите её со склада." shows between the cards. **Shot:** m-hero-390-ru. **Suspected:** HeroScene toast depth.
8. **A group can be dropped onto another group in deployment.** Their badges stack (I hidden under II), and the next press grabs the hidden group. There is no overlap guard or nudge. **Shot:** 18. **Suspected:** `src/ui/dragFormation.ts` / deploy `form` validation.
9. **First-contact pause came late (host battle).** At the 0:17 "First contact!" pause, Skirmish II and Flank IV were already wiped out. The contact rule may not count missile or rider kills. **Shot:** 102. **Suspected:** BattleScene `pauseContact` event (around line 1652).
10. **Badge clutter in melee.** At 8 v 8 the I, II and IV badges and the enemy badge stack into one cluster. **Shot:** 23.
11. **Codex beast sheet contradiction.** "Drops rare, epic or legendary gear and a trophy" sits right above "Practice with your army: no spoils". Say "In the campaign, its lair drops…". **Shot:** 58. **Suspected:** Codex beast sheet copy.
12. **Shop info banner is ellipsized** ("…town markets, w…"), a C1 violation. **Shot:** 88. **Suspected:** `src/scenes/ShopScene.ts`.

### S4: polish

- Group numerals I, II, IV with "3 groups" in a fresh campaign (III is empty): stable by design, but it puzzles a new player. Shot 19.
- The tutorial reward screen has a large empty band in the middle. Shot 12.
- Tutorial copy: "Tap Then…, then Charge". The generic "Orders by touch" hint is shown again on the first campaign deployment, right after the tutorial taught it all.
- Army header: "Theron has a perk point to spend" while his badge says 3 (2 stat points + 1 perk).
- Contradictory copy: "Consider fleeing or resting" when flight is impossible; "You have caught up with them … They won't let you go" (host); "food -0 a day". Shot 49.
- Gear filter chips mix casing ("ALL" vs "Any rarity"). Pass rewards are lower case ("healing salve") next to "War gold". Shot 89.
- At 320 the order keys change their words ("Withdraw" becomes "Back off", "Advance" becomes "Adv."), and the cards say "hold", not "holding". This goes against the V5-063 spirit (one name at every width). Shot m-battle-320-en.
- "Set defence" is red text on parchment (A11Y-05: red only for alerts).
- The Found-a-clan prompt is a plain HTML form outside the kit style.
- War map: the side rail covers the region label at 360 ru ("Олкадская равнин…"); the six resource chips have no labels. Shot m-war-360-ru.
- Content variety: 5 of the 6 lairs in one seed are named "Galatae camp". Shot 99.
- The practice-defeat why-line against a single Nemean lion reads "Their line held longer than ours".
- The zoom chip ("3×") and the speed chip ("1×") look the same. Shot 06.
- The event card portrait is still a placeholder (known). Shot 38.
- Two taps on open ground near Lokroi entered the town: the town's tap area reaches well past its picture. Players who want to camp just outside must guess. Shot 16.

## Decisions per first battle (VISION target ≥ 8)

**9.** The list is in A1. The battle lasted 0:44; the swarm band withdrew. The deployment gave 2 real choices (placement); the battle gave 7 (shoot, focus ×2, charge, flank move, Then-charge, refocus). Paused planning made all 7 calm and deliberate.

## EC-03 input (retrain cost)

- The Drillmaster shows "Retrain a perk · 40 g × tier".
- After the first win the purse was 57 g, and battles paid +32 g (win) or +20 g (loss).
- A tier-1 retrain is about 1.3 wins of pay; tier 5 (200 g) is about 6 wins.
- My only level-up choice was easy to explain, and I never wanted to retrain.

**Recommendation:** keep 40 × tier. No evidence for a change from one proxy tester.

## What feels great

- **First five minutes.** The painted splash, Nikias's voice and a 2.5-minute tutorial that never covers what it asks you to tap. The tutorial teaches plan-while-paused, Then… and flank arcs naturally.
- **The encounter sheet.** Doctrine, tell, captain and an honest verdict in one card. Swarm captain Abdmelqart withdrew and came back weaker, which made a small story.
- **The perk choice.** A/B side by side with exact deltas, and a confirm that says what you give up. I hesitated, which is the design goal.
- **Event cards.** Short, flavourful writing with outcomes in words.
- **Why-lines.** "Our army broke after 2 groups routed" and "Group II broke, and the rout spread down the line" teach the morale system after every defeat.
- **The settlement.** The painted vignette, an instant hire with Undo, and a Sell confirm.
- **Practice from the Codex.** It is clearly labelled, and it returns to the Codex.
- **Duels.** Clean ladder chapters, pause and 0.5×/2× on the ladder, server-verified results, and readable empty states (leaderboard, raids).
- **War.** The hex panel, the Merchant buy confirm, and Merchant Back returning to the open hex panel.
- **The ru localisation** reads natively. The clan has no English, and why-lines wrap at 320.

## Skills applied

- **team-qa:**
  - Resolved the active set (individual) and announced it.
  - Checked smoke status before QA.
  - Applied the verdict order: NOT APPROVED first for the open S1/S2.
  - Gave every scope item a row, with NOT ASSESSED where nothing was executed.
- **playtest-report:**
  - Session info, first impressions, gameplay flow and moments of delight ("What feels great").
  - Defects routed to Findings, not to pain points.
  - Design, balance, bug and polish routed (EC-03 input; why-line rules; doctrine copy).
- **smoke-check:** ran smoke.mjs and tutorial-smoke.mjs against the build under test, and named the gates that were not re-run.
- **skill-authoring rule:** every skipped area and every staged step is named in the report.
