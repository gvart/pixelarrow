# Playtest Report: S1-AUDIT-PLAY (v5 hands-on audit)

## Session Info

- **Date**: 2026-10-10
- **Build**: branch `v5` @ `ea5af21` (Vite dev server on :5182, no backend: every `/api/**` call answered 503)
- **Duration**: about 25 minutes of game time over one browser session, plus one reload
- **Tester**: S1-AUDIT-PLAY agent (first time with the game, read GAMEPLAY.md, DUELS.md and OPS.md first)
- **Platform**: mobile web, headless Chromium, 390x844 portrait, DPR 2, `hasTouch` + `isMobile`
- **Input method**: touch only. Taps are touchstart/touchend dispatched on the canvas (as `scripts/lib/harness.mjs` does), drags and pinches are CDP touch events. A few setup steps (placing a band next to the party, opening the duel and war demos) were scripted. Every game action below was a real tap or drag.
- **Session type**: first time, then targeted

Screenshots are in [`play/`](play/): 42 JPEGs at 390x844. File names are cited as `play/NN-*.jpg`.

### What was played

| Flow | How it ended |
| --- | --- |
| First launch: offer, tutorial (all 13 steps), reward, the "two ways" screen | Tutorial won in 0:44 of battle time and about 3.5 minutes of wall time. Reward: 60 gold and a Chalcidian helm. |
| Campaign: world map, a town (one hire), march, encounter, deployment, battle, results, back to the map | **Defeat** in 0:58 against 5 bandits rated "even" (my 4 men). See bugs B1 and B2 for the two failed attempts before that. |
| Duel: hub, ladder floor 5, deployment, battle, results | **Defeat** in 3:02, demo source (`DemoDuelSource`). |
| War map: offline state, demo shard, collect, select a hex, attack, march | The attack answered "Preview map: nothing is sent", the march ran. |

Not covered: the live lockstep duel and the server-verified war attack. Both need `wrangler dev` with D1 migrations, and `server/node_modules` is not installed in any worktree. Installing it would have meant a package download, so I used the in-memory demos the smoke scripts use. Nothing touched production.

### Answers I gave to the skills' own questions (the user was asleep)

- `/playtest-report` mode: **analyze**, run on my own session notes.
- Review mode: **solo**, so the CD-PLAYTEST creative-director gate was skipped. The synthesis step (S1-AUDIT-SYNTH) can run it.
- Save path: the skill proposes `production/qa/playtests/...`. The brief names `docs/v5/audit/PLAY.md`, and the brief wins.
- qa-tester and game-designer "may I write" prompts: the orchestrated-run exception applies, because the brief names a new file under `docs/`.

## Test Focus

Onboarding clarity. Giving orders on a phone (selection, drag-to-order, mistaken orders, undo and confirm, feedback, fat-finger targets). The camera. Whether a battle is readable (who is winning, morale, flanks). Pacing and game feel. How many real decisions one battle offers. Bugs.

## First Impressions (first 5 minutes)

- **Understood the goal?** Partially. The tutorial teaches the battle well. Afterwards the world map says only "Tap the map to march, a town to enter": nothing about which fights to pick or why (`play/21-world-first.jpg`).
- **Understood the controls?** Yes, for the basics. The tutorial's ghost-hand drags and spotlight make select, drag, knob turn, tap to move and the order bar clear (`play/07-tut-drag-preview.jpg`, `play/15-tut-flank.jpg`).
- **Emotional response**: engaged in the tutorial. Deflated in the first real fight: 4 men, a "phalanx" of 2, lost in under a minute with no explanation.
- **Notes**: the gap in scale between the tutorial (6 hoplites and 2 slingers against 11) and the campaign start (2 hoplites, a peltast and one hire against 5) is the single biggest onboarding problem. The tutorial sells formation tactics, and the first real battle cannot deliver them.

## Gameplay Flow

### What worked well

- **Gestures.** Drag the group to move it and drag the knob to turn it. The live `6x1` / `2x1` files-by-ranks label and the dashed placement boxes are clear (`play/07`, `play/39`). A one-finger drag on empty ground pans, as documented.
- **Pause-and-order.** Auto-pause on contact or rout, with "Paused: give orders, then play", turns a twitchy real-time fight into a readable one (`play/53-flank-charge.jpg`).
- **The You/Foe strength bar** answers "who is winning" at a glance (`You 62% vs 82% Foe`).
- **Band plates on the world map** ("EVEN - 5 men, about Lv 1") and the encounter dialog set expectations honestly (`play/28-encounter.jpg`).
- **Tutorial craft.** The spotlight blocks taps outside the lit element, the battle pauses while the narrator talks, there is a ghost-hand demo for each gesture, Skip asks first, and an interrupted tutorial is offered again.
- **Terrain is visible.** The river, ford stepping-stones, woods and beach read well at 1x zoom (`play/60-duel-after-fight-tap.jpg`).

### Pain points

Each finding has a severity (blocker, major or minor) and a fix direction.

#### Onboarding

| # | Finding | Sev | Fix direction |
| --- | --- | --- | --- |
| O1 | The tutorial army (8 men in 2 real groups) does not match the campaign start (3 men plus hires). The first real deployment has a 2-man "Phalanx" and two empty cards (`play/38-deploy.jpg`). Formation, shield wall and flanking stop meaning anything. | major | Start the campaign with 8–10 men, or make the first encounters fights between small war bands and teach formations when the army reaches about 6 men. |
| O2 | The narrator box sits over the Shape/Reset row in every deployment step (`play/03`, `play/07`), so the formation controls the tutorial later asks for are hidden while it talks. | minor | Dock the narrator above the panel during deployment, or slide the panel up. |
| O3 | The flank step asks you to turn a line that is already locked in frontal melee toward a lone raider (`play/15-tut-flank.jpg`). In the sim that exposes the front, so it teaches a doubtful move. | minor | Stage the flank threat before contact, or teach "send the reserve" instead of "turn the line". |
| O4 | After the tutorial the player gets "Two ways to fight" and then a bare world map. Nothing says to fight weaker bands, recruit or heal. | major | One or two coach marks on the first world-map visit, using the same coach system as the online map (`OnlineCoach`). |
| O5 | The first campaign defeat explains nothing. Results shows Time, Kills 0 and Losses 0 (`play/55-battle-end.jpg`). | major | Add a one-line "why" to Results, for example "Your phalanx was outnumbered 2 to 4 and broke", built from the rout and flank events the sim already emits. |

#### Giving orders on a phone

| # | Finding | Sev | Fix direction |
| --- | --- | --- | --- |
| C1 | **Knob overlaps another group's soldier.** In deployment the selected group I's turn knob is drawn on top of group II's man (`play/38-deploy.jpg`). A press there turned group I by 60 degrees (`play/39`, `play/40`) when I meant to grab group II. "The closer one wins" picks the knob. | major | Draw the knob on the side away from friendly groups, or give a friendly soldier priority when the press lands on its sprite. Show a ghost of the old facing until release. |
| C2 | **No undo for one bad drag.** Deployment has only *Reset*, which resets every group. In battle a formation drag or tap-to-move commits on release, with no confirmation unless the game is paused. | major | Add a single-step undo chip (deployment and pause) that appears for about 3 s after each formation order, and keep Reset for "all". |
| C3 | **Wrong group ordered.** Orders go to the selected group. Its name is a small "SKIRMISH II" label left of the formation button (`play/47`), and the selected card has only a thin gold outline. I ordered the wrong group once. | minor | Tint the order bar with the selected group's numeral, and pulse the selected group's on-field badge for 300 ms after each order. |
| C4 | **"Shoot" out of range gives no feedback.** My slingers (range 11) sat at about 15 paces with *Shoot* lit for 30+ s and threw nothing (`play/47`, `play/48-battle-3.jpg`, ammo still 20/20). | major | When a *loose* group has no target in range, show "out of range: advance?" on the card and draw a range ring while the group is selected. |
| C5 | One tap on a recruit's price in a town hires him (gold 120 → 105, `play/22-town.jpg`). There is no confirm and no undo. | minor | Use a two-step buy, or an "Undo" toast for 4 s. |
| C6 | **Touch target sizes.** The order bar (5 × about 74 pt), the group cards and FIGHT/READY are comfortable. The knob is a 12 pt disc (with a 30 px grab radius), and the on-field I/II badges are about 30 pt and sit right on the soldiers. | minor | Leave the targets as they are. Enlarge the knob art to about 20 pt so it can be found without the tutorial. |
| C7 | A tap on unreachable ground on the world map does nothing (no route, no message). | minor | Flash a "can't march there" tick at the tap point. |
| C8 | War-map hex panel: after *March*, the *Attack* and *March* buttons swap places (`play/73` vs `play/77`). | minor | Keep the button order fixed and disable instead. |

#### Camera

| # | Finding | Sev | Fix direction |
| --- | --- | --- | --- |
| K1 | The campaign deployment opens with the enemy off screen ("5 foes" but none visible, `play/38`). I had to pan to find them (`play/42`). | major | Frame both deployment zones on open (the doc already says "more if both armies fit"), or pin an edge arrow pointing at the enemy. |
| K2 | The follow camera tracks the melee and loses your own groups. In the duel, group I and the selected group III are off screen while their cards say "advancing" (`play/64-duel-fight-5.jpg`, `play/64-duel-fight-7.jpg`). | major | When the selected group is off screen, show an edge pointer, and double-tap its card to centre on it. |
| K3 | Pinch, pan and the eye "Follow" button work and are taught. | — | Keep. |

#### Battle readability

| # | Finding | Sev | Fix direction |
| --- | --- | --- | --- |
| R1 | **Morale has no label.** Each card has a red bar and a teal bar with no legend (`play/50-contact.jpg`). Morale on the field is invisible until "routing" appears in the card text. | major | Label the bars on first sight (a tooltip), and add a wavering icon over a group below 50% morale. |
| R2 | **Flanks are not shown.** A flank shows up only as a banner when auto-pause is on. Nothing on the field shows which side of a formation is threatened. | major | Draw a red arc on the flanked side of the group badge for 2 s after a `flanked` event. |
| R3 | Damage numbers are 2–4 px digits floating over the men (`play/53`). They read as noise. | minor | Drop them for routine hits. Pop numbers only on charge impacts and kills. |
| R4 | The status banners go stale: "Flank III advancing. Contact soon." stayed up for 30+ s with nothing nearby (`play/64-duel-fight-7.jpg`). | minor | Expire banners after about 6 s, or recompute "contact soon" from the real distance. |
| R5 | At 1x zoom a man is about 34 px tall, so the battle is readable on a 390-wide screen. Group badges sit above the men. | — | Keep. |

#### Pacing

| # | Finding | Sev | Fix direction |
| --- | --- | --- | --- |
| P1 | Campaign battle: 0:00–0:33 nothing happens (the bot's idle rule waits until about 25 s), then the fight is decided in 20 s. | major | Let the bot advance straight away against a smaller army, or offer 2x until first contact. |
| P2 | Duel ladder floor: 3:02, the last 90 s with one survivor walking around. The header says "Live", and there is no pause and no speed-up in a PvE fight against a bot (`play/62-duel-ready.jpg`). | major | Allow pause and 2x on the ladder (it is PvE, so the live-PvP rules do not apply), and end a fight when one side has no men able to fight. |
| P3 | The tutorial is about 3.5 minutes, as promised. Good. | — | Keep. |

#### Game feel

| # | Finding | Sev | Fix direction |
| --- | --- | --- | --- |
| F1 | **No impact juice in battle.** There is no camera shake and no hit-stop (only `beastView.ts` shakes). A charge landing, a rout or Shield Bash have no visual emphasis. The bash shows only its cooldown dial (`play/14-tut-bash-fx.jpg`). | major | Follow game-feel tiers. Small: block or hit sound plus spark (exists). Medium: charge impact gets a 60 ms hit-stop on that group's sprites only and a 0.2 trauma shake. Large: a group rout gets a 0.4 trauma shake, a horn and a dust burst. Add a "reduce shake" setting. |
| F2 | Hit feedback is blood decals, small numbers and a rich synth soundscape: per-hit clash, block, death, a horn on charge, a battle cry on contact, a low horn on rout (`src/audio/hooks.ts`). I judged the sound from the code, because headless Chromium has no audio output. | — | Keep the audio. Add visual weight to match it. |
| F3 | Scene changes are hard cuts: map to deploy to results. | minor | Add a 150–200 ms fade or iris on map→battle and battle→results. |
| F4 | The tutorial "praise" chime and haptics on completed steps feel good. | — | Keep. |

#### Depth of decisions per battle

- **Tutorial**: about 9 decisions, all scripted.
- **Campaign battle (4 against 5)**: 4 real decisions in total. Two placement drags, *Shoot* (which did nothing, C4) and one flank move with a charge. Formation choice does not matter with 2 men, and no abilities are available at Lv 1.
- **Duel (6 against 6)**: 4 orders, then nothing worth doing for 2 minutes.
- **Verdict**: at the campaign's starting scale the core loop offers almost no decisions. The systems that create depth (brace against charges, flank multipliers ×1.3/×1.6 and morale ×1.8/×2.8, javelins kept until ordered, terrain) only show up from about 8 men per side.

### Confusion points

- What the teal bar on a card means (R1).
- Why *Shoot* did nothing (C4).
- Why the deployment and results screens for a band attack showed a different army (B2).
- "Losses 0" on a screen where every one of my men died (B4).

### Moments of delight

- The ghost hand demonstrating a drag, then my drag snapping into a clean 6x1 line.
- The auto-pause banner "Phalanx is routing! Paused: give orders, then play" is a real decision point.
- The war map's parchment art and the marching dotted route (`play/77-war-marching.jpg`).

## Bugs Encountered

All repros are on `v5` @ `ea5af21`, same session, no reload in between.

| # | Description | Severity | Reproducible |
| --- | --- | --- | --- |
| B1 | **Campaign Attack restarts the tutorial.** Repro: 1) clear localStorage and launch; 2) play the tutorial to the reward, then Continue, then Campaign; 3) walk into any band and tap *Attack*. Result: the tutorial battle ("Hail, young strategos! Raiders are coming", 8 men against 11) opens instead of the band fight (`play/29-deploy-hint.jpg`). *Leave* asks "Skip the tutorial?" (`play/30-bug-tutorial-again-skip.jpg`). *Skip* sets `settings.tutorial.status = 'skipped'` on a tutorial that was already finished, sends you to the first-run modes screen and leaves the encounter pending. After a reload the attack works. | blocker | yes, every time |
| B2 | **Campaign Attack after a duel opens the duel ladder battle.** Repro: 1) Duels → Fight floor N, play it to Results → Onward; 2) Campaign → Continue the march; 3) attack any band. Result: the deployment shows the 12-man ladder fight with *READY* (`play/66` then `play/67-bug-campaign-attack-after-duel.jpg`) while `state.pending.partyId` is the band. | blocker | yes |
| B1/B2 root cause | `WorldScene.ts:1292` calls `this.scene.start('Battle')` with no data. Phaser's `Systems.start` only replaces `settings.data` when data is passed (`if (data) settings.data = data`), so `BattleScene.create` gets the last run's `{ tutorial: {} }` or `{ source }`. `BeastTrialScene.ts:95` does the same and is probably affected too (not tested). Fix: `this.scene.start('Battle', {})` at both call sites, plus a regression test that runs tutorial → campaign attack and duel → campaign attack. | — | — |
| B3 | **Group numerals change at the start of a duel.** Deployment shows card and badge "IV Flank". In battle the card says "III Flank" while the field badge still says IV (`play/60` vs `play/62`). | major | yes (any army with an empty Reserve) |
| B4 | **Results "Losses" counts only the dead in a campaign, and shows 0 in duels** even when all 6 men died (`play/65-duel-end.jpg`). In the campaign, 2 fled and 1 was knocked out and it still said 0 (`play/55`). It also names a "Hero of the battle" with 0 kills in a defeat. | minor | yes |
| B5 | Stale "Contact soon" banners (R4). | minor | yes |
| B6 | *Shoot* stays lit with no target in range, and nothing tells you (C4). | major (UX defect) | yes |

No page errors or console errors were captured during the whole session (`captureErrors` with `echo`).

## Feature-Specific Feedback

### Formation drags (move and knob)

- **Understood the purpose?** Yes. **Engaging?** Yes.
- **Suggestions**: C1, C2, C6.

### Auto-pause

- **Understood the purpose?** Yes. **Engaging?** Yes. With 4 men it fired twice within 5 s, both times for lost causes (`play/53`, `play/54-fight-1.jpg`).
- **Suggestions**: merge pauses that come within 5 s of each other.

### Duel ladder

- **Understood the purpose?** Yes. The hub is clear (`play/59-duel-hub.jpg`).
- **Engaging?** Partly. See P2.
- **Suggestions**: P2, B3.

### War map (demo)

- **Understood the purpose?** Yes. The hex panel states its income, garrison and siege (`play/73-war-neighbour.jpg`).
- **Engaging?** Not judged: in the demo no attack battle runs.
- **Suggestions**: C8. The gold counter is cut to "1…." in the resource bar (that one is for the UI audit).

## Quantitative Data

- **Battles**: tutorial won (0:44 battle time). Campaign lost (0:58: 2 fled, 1 knocked out, 1 survived; 0 kills). Duel lost (3:02: 6 dead, 1 kill).
- **Orders given by touch**: tutorial 9 (scripted). Campaign 6, of which 3 were deployment drags, including one turn by mistake (C1). Duel 5.
- **Time to the first enemy contact**: tutorial about 10 s after Fight. Campaign 33 s. Duel 48 s.
- **Features found vs missed**: found drag, knob, pan, pinch, auto-pause, Follow, Flee and Reset. Missed: abilities (none at Lv 1 in the campaign), long-press terrain info (not discoverable), the 2x speed button (it exists offline; I never needed it until the duel, where it is absent).

## Overall Assessment

- **Would play again?** Yes for the tutorial battle and the duel ladder. Maybe for the campaign as it starts today.
- **Difficulty**: too hard at the very start. An "even" 4-against-5 was a rout with reasonable orders, and nothing told me why.
- **Pacing**: too slow before contact, too fast after it, and too long at the end of a duel.
- **Session length preference**: battles should be 60–120 s with something to decide every 10–15 s.

## Core loop: keep / cut / expand

**Keep**

- The control model: drag the group to move it, drag the knob to turn it, take formation shapes only from buttons, drag empty ground to pan.
- Pausable real time with orders while paused, and auto-pause on contact and rout.
- The morale and rout cascade, and the flank and rear multipliers. They are the right spine for "formation tactics, morale breaks, flanking".
- The You/Foe strength bar, the band strength plates and the honest encounter dialog.
- The tutorial's structure: spotlight, ghost hand, a pause while the narrator talks, resume and skip.
- Terrain that matters and reads: the river and ford, woods, high ground.

**Cut**

- Four fixed group slots when the army has 3–6 men. Empty Reserve and Flank cards take half the panel (`play/38`). Show only groups that have men, and offer "split group" as an action.
- The 25 s bot idle opening at small army sizes (P1).
- "Live" rules (no pause, no speed) in PvE ladder fights (P2).
- Routine floating damage numbers (R3).

**Expand**

- **Scale at the start**: 8–10 men from day one, so the phalanx, a screen of skirmishers and a reserve exist. That alone multiplies the decisions per battle.
- **Flank and morale on the field** (R1, R2): arcs, wavering icons, a "why we lost" line.
- **Javelins as a moment**: *Throw* is held until ordered, which is a great decision. Give the volley an order-bar countdown and an impact burst with a small shake.
- **Juice on the big three events** (F1): charge impact, group rout, ability use.
- **Order feedback** (C4): range rings, "out of range", and a single undo (C2).

## Top 3 priorities from this session

1. Fix B1 and B2 (scene data reuse). Both break the core loop for anyone who finishes the tutorial or plays a duel before attacking a band.
2. Make the first campaign battles deliver formation tactics: start with 8–10 men, frame both armies (K1), add a "why we lost" line (O5).
3. Make morale and flanks visible on the field, and add impact juice (R1, R2, F1). These are the core fantasy, and today they show only in banners and logs.

## Action routing (Phase 3)

- **Design changes**: O1, O3, O4, P1, P2, the keep/cut/expand list. Run `/propagate-design-change` on `docs/GAMEPLAY.md` (Controls, Bot AI) and `docs/DUELS.md` (ladder rules).
- **Balance**: the opening at 3–4 men and the bot's idle timer. Run `/balance-check` on small-army battles.
- **Bugs**: B1–B6. Use `/bug-report`. B1 and B2 are the same one-line fix plus a test.
- **Polish**: C3, C5–C8, R3, R4, F3, O2.
- **CD-PLAYTEST**: skipped (solo review mode, autonomous run).
