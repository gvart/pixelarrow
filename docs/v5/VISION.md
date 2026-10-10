# Pixelarrow v5 vision

Story S2-VISION, written through `/brainstorm` (standard tier, autonomous, lean review). The answers given for the user are in [vision/ANSWERS.md](vision/ANSWERS.md). The full concept document is [design/gdd/game-concept.md](../../design/gdd/game-concept.md) (V5-007). The problems this vision answers are in [AUDIT.md](AUDIT.md).

## Creative brief

v5 keeps pixelarrow's heart: a deterministic, real-time formation battle where lines hold or break on morale, flanks and timed javelins. It makes that heart **visible and decisive on a phone**.

Today, three things hide it:

- the campaign starts too small for formations to matter;
- the field doesn't show morale or flanks;
- nothing outside the clash asks the player to choose: perks are linear, the enemy has one doctrine and the campaign has no arc.

The target is a 60–120 s battle with a real decision every 10–15 s, inside a campaign of named men whose deaths are fair and final. It must be built by a small team on the live codebase, with every rule replayable by the server.

## Concepts considered

| | A. "Read the line" | B. "The Company" | C. "Thumb Strategos" |
| --- | --- | --- | --- |
| Pitch | Every enemy fights to a doctrine you learn to read and break. | A mercenary company's saga: events, contracts, lairs, a final host. | The best touch command scheme in mobile tactics: previews, a queue, undo. |
| Core verb | read, then break | lead | command |
| MDA | Challenge | Fantasy and Narrative | Challenge (competence) |
| Risk | The AI becomes predictable once it's learned. | Content volume. | Polish without depth. |

**Pick: combine.** A is the spine, because it deepens every battle. B supplies the campaign arc, because it deepens every session. C is the delivery layer, because without it A and B can't be played on a phone. A PvP-first pivot was rejected: the online modes inherit everything from the shared sim for free.

## Player fantasy

> **You are the strategos of a small mercenary company in the ancient Mediterranean. You know every man by name. You read the enemy's line, and you break it where it bends.**

**Elevator pitch.** A pocket Total War for the thumb: two-minute formation battles where morale, flanks and javelins decide the day, and every man in your company has a name, a path and a grave.

## Pillars

Pillars should pull against each other. P1 pulls toward depth and P2 toward simplicity. P4 pulls toward stakes and P3 toward forgiveness. P5 bounds everything.

| # | Pillar | Definition | Design test |
| --- | --- | --- | --- |
| P1 | **The line decides** | Battles are won by where and when lines hold or break: formation, facing, morale, flanks, timing. Raw stats never decide them. | Between a feature that adds stat power and one that adds a choice about where or when a line breaks, choose the second. |
| P2 | **Read it at a glance** | Every state that decides a battle (morale, flank threat, range, enemy intent) can be read on a 390-wide screen in under a second, and never by colour alone. | If a mechanic can't be shown on the field at 1× zoom, simplify it until it can, or cut it. |
| P3 | **Command from the thumb** | A few big gestures, every one previewed, forgiving (undo) and pausable offline. One hand is enough. | Between a denser menu and a gesture with a preview, choose the gesture. Between "commit on release" and "commit with undo", choose undo. |
| P4 | **Every man has a name** | Heroes are individuals with growth choices and permadeath. Losses hurt, are fair, and are explained. | Close every exploit that dodges stakes. Make every loss explainable ("why we lost"). Never soften permadeath itself. |
| P5 | **One sim, everywhere** | One deterministic, versioned sim serves the campaign, duels and war, and the server replays it. | If a rule can't be deterministic and covered by `SIM_VERSION`, it isn't a sim rule. It can still be presentation. |

### Anti-pillars

- **NOT an APM or micro game.** There's no per-soldier control beyond Solo/Join, no more than 3 ability medallions visible at once, and every active has a cooldown of at least 12 s. Micro would break P3 and drown out P1.
- **NOT a hero brawler.** No single hero or captain carries a battle, and there's no commander avatar on the field. That would break P1.
- **NOT pay for power.** Real money never buys battle strength. Ideas about money go to [PROPOSALS.md](PROPOSALS.md), never into a GDD.
- **NOT hidden information as difficulty.** No fog of battle and no hidden enemy intent. Weather that hides things is deferred. Hiding would break P2.
- **NOT an economy builder.** Camp and towns feed the battles. They are never a game of their own.

## Core loop

| Loop | What the player does | Decision source (v5) |
| --- | --- | --- |
| **30 s** | Read the line, give an order (drag, tap or a queued "then"), watch the clash and the morale swing, respond. | Formations and orders, signature actives, enemy doctrine tells, field works. |
| **5 min** | Pick a fight from the power plate, deploy against a doctrine, fight, take spoils, tend the wounded. | Doctrines are known per band kind. Captains are targets. Field works come from camp supplies. |
| **Session (20–40 min)** | March, answer events, recruit, camp, choose a lair to assault. | The event deck and the campaign arc. |
| **Long-term (weeks)** | Grow named heroes down branching paths, destroy lairs, face the final host. Duels and war run on the same army skills. | Branching perks, the arc, offline set sources. |

**Self-determination theory.**

- **Autonomy**: perk branches, which fight to pick, event choices.
- **Competence**: doctrines you learn to read, and a "why we lost" line after a defeat.
- **Relatedness**: named men, captains as rivals, duels and clans.

## Ranked mechanic expansions

Each expansion is ranked by the decision depth it adds **per battle** and **per campaign**, against its cost. MECHANICS.md §2 is the menu. The flags mean:

- **[SERVER]**: the sim is replayed by the server, so this needs a `SIM_VERSION` bump plus a client and server change (V5-012).
- **[SAVE]**: this needs a save migration.

| Rank | Expansion | Per battle | Per campaign | Cost | Flags | GDD |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Enemy doctrines and band captains** | High: every band fights differently, and its captain is a target. | High: band kinds have identities you learn. | S–M | SERVER, SAVE (captains) | [ai-doctrines.md](../../design/gdd/ai-doctrines.md) |
| 2 | **Formations and orders**: face without stopping, the orb, the feint, focus fire, cohesion and army break | High: flank counter-play, missile priority, cascades you can plan. | Medium | S–M | SERVER | [formations-orders.md](../../design/gdd/formations-orders.md) |
| 3 | **Perk paths and signature actives**, plus the standard | Medium-high: 7 signature actives, and the standard as a morale lever. | High: every level-up is a choice. | M | SERVER, SAVE | [abilities.md](../../design/gdd/abilities.md) |
| 4 | **Campaign arc**: an 8-man start, lair assaults, tier-3 bands, the final host, offline set sources | Medium: assault battles. | Highest: an end state, a goal, and the items become reachable. | M–L | SAVE, SERVER (assault terrain only) | [campaign-arc.md](../../design/gdd/campaign-arc.md) |
| 5 | **Overland event deck** | Low | High: 2–3 choices with lasting flags. | M | SAVE (offline only) | [campaign-events.md](../../design/gdd/campaign-events.md) |
| 6 | **Field works**: stakes, ditch, wagon laager, bought from camp supplies | Medium: a deployment decision that answers cavalry and flanks. | Medium: links the camp to battles. | M | SERVER (terrain cells) | [field-works.md](../../design/gdd/field-works.md) |

Two more GDDs carry the structural fixes and the controls: [controls.md](../../design/gdd/controls.md) and [battle-readability.md](../../design/gdd/battle-readability.md).

### Cut or deferred

| Item (MECHANICS ID) | Decision | Why |
| --- | --- | --- |
| Weather and light (2.3.2) | **Deferred** past v5 | Fog and dusk hide information (anti-pillar). The art cost is high. Revisit only as a readable modifier. |
| Utility-AI scoring (2.4.3) | **Deferred** | Doctrines first. Add response curves only if playtests still find doctrines predictable. Bot retreat (A3) is covered by the doctrine `retreatAt` knob. |
| Town contracts (2.5.3) | **Deferred**, folded in | The event deck carries contract-like chains through world flags. A full quest state machine waits until the deck proves out. |
| Forge reroll (2.6.2) | **Deferred** to the items pass | It's a good endgame gold sink (E2), but it doesn't add battle decisions. |
| Campaign consumables (2.6.3) | **Deferred** | The war horn already exists. Campaign consumables add HUD weight (P3 budget). |
| Ridge tune and the bot flanking hills (2.3.3) | **Kept as tuning**, not an expansion | It's handled inside the doctrine GDD (doctrines own the hill behaviour) plus one height knob. |
| Class re-cost: elites and militia vs cavalry (R1, R3) | **Kept as tuning** | It's a balance story measured with `npm run balance`. The signature actives give the elites their identity. |
| Melee hit chance by skill (B1) | **Deferred** | It's a sim-wide balance shift that would re-fit every class. Revisit after perk paths land. |
| Marketplace paid power (E4) | **Out of scope here** | It's a money decision, so it goes to [PROPOSALS.md](PROPOSALS.md). |
| A commander unit on the field, naval battles, siege engines | **Cut** | They break anti-pillars (hero brawler, scope). |

## Touch-first control scheme

The full spec is [controls.md](../../design/gdd/controls.md). It keeps everything the playtest praised and fixes C1–C8, K1 and K2.

1. **Selection.**
   - Tap a group card, a field badge or a soldier to select it.
   - A soldier of another group always wins over the selected group's knob (fixes C1).
   - The order bar takes the selected group's colour and numeral (fixes C3).
   - Only groups with men show cards (cut empty slots).
2. **Drag to order.**
   - Drag the group to move it.
   - Drag the knob to face. Facing now sends `face`, which keeps the current order (fixes MECH B2).
   - Tap the ground to move, tap an enemy to attack. With a missile group selected, a tap on an enemy focuses its fire.
   - Pan only on empty ground. Two fingers zoom.
3. **Previews and queue.**
   - Every drag shows ghost boxes, the facing arrow and the files×ranks label.
   - A selected missile group shows its range ring.
   - **Paused**: orders are staged as ghosts and committed on Play.
   - A **"Then…" chip** queues one follow-up per group (for example "move here, then Charge on arrival"). The queue lives on the client, so it needs no sim change.
4. **Undo and confirm.**
   - A 3 s **Undo** chip follows every order, and deployment keeps a 10-step undo stack.
   - Confirm only global or irreversible actions: Flee, Leave and Reset all. Hiring gets an Undo toast (fixes C5).
5. **Accessibility** (Standard tier, V5-013):
   - targets of 44 pt or more, and the knob drawn at 20 pt;
   - labelled HP and morale bars, plus a morale **glyph** (steady, wavering, routing);
   - flank arcs drawn with a chevron shape, not just red;
   - Reduce shake and Reduce flash settings;
   - a left-hand mirror of the medallion rail;
   - a 0.5× speed offline;
   - text never below 6.5 UI px in the HUD.

## Fixes for the audit's structural problems

| Problem | Fix | Where specified | Systems and files |
| --- | --- | --- | --- |
| **The 3-man start kills formations** (PLAY O1) | A new campaign starts with **8 men**: 4 hoplites, 2 peltasts and 2 slingers, matching the tutorial's lesson. Early bands are resized (bandits at least 5). Groups with no men show no card. A destroyed army gets 5 volunteers. | campaign-arc.md "Opening" | `src/game/heroes.ts` `starterParty`, `src/game/campaign.ts` (`fresh`, the volunteers at L406), `src/world/world.ts` `spawnParty`, `FOOD_RULES.startFood` in `src/world/camp.ts`, `src/ui/battlePanel.ts` |
| **Morale and flanks can't be read** (PLAY R1, R2; UI BTL-11, G13) | Morale glyphs over the group badges, flank arcs on the threatened side, labelled bars, and a "why we lost" line on Results. | battle-readability.md | `src/ui/battleHud.ts`, `battlePanel.ts`, `battleFx.ts`, `src/scenes/ResultsScene.ts`, `src/game/report.ts` (reads existing `flanked` and `rout` events, so no sim change) |
| **Pacing** (PLAY P1, P2) | Doctrines own the opening (no 25 s idle against a smaller army). An **army break** rule ends dead fights. The duel ladder allows pause and 2× (PvE). Auto-pauses within 5 s of each other merge. | ai-doctrines.md, formations-orders.md, battle-readability.md | `src/sim/ai.ts`, `src/sim/battle.ts` end check, `BattleScene.ts` (`online` flag split into `realtimeLocked`), `src/duel/ladder.ts` |
| **Feedback and juice** (PLAY F1, C4, R3, R4, O5) | Three juice tiers: charge impact gets a 60 ms group hit-stop and a 0.2 shake; a rout gets a 0.4 shake, a horn and dust; an ability gets a flash ring. "Out of range" on the card. Damage numbers only on charges and kills. Banners expire after 6 s. | battle-readability.md | `src/ui/battleFx.ts`, `src/audio/hooks.ts`, `BattleScene.ts`, `src/ui/motion.ts` (reduced motion) |
| **Stakes leak** (MECH C1, I1, S1; PLAY B1, B2, B4) | S4-FIX-SAVES covers the save overwrite, the pending battle and the scene data. The Beast Trial becomes Practice: no loot, no gold, no pity (V5-011). | AUDIT.md "Live-player bugs" | `src/state.ts`, `src/game/save.ts`, `src/scenes/BeastTrialScene.ts` |

## Release shape: one sim train

Every [SERVER] change is batched into **sim train 2**: `SIM_VERSION` goes from 1 (today's sim) to **2**. Bumping once per train, not per feature, keeps the number of client and server lockstep deploys and invalidated raid snapshots to one.

The train ships only after **V5-012** (versioning plumbing) has landed. It contains:

- doctrines and captains (the AI part);
- the formation and order changes;
- the actives and perk stats;
- the field-work and assault terrain cells;
- the army-break rule.

Offline-only work ships independently of the train: the event deck, the arc's overland parts, controls and readability (presentation only). Campaign save changes are batched into **one save bump**: `SAVE_VERSION = (S4-FIX-SAVES version) + 1`. campaign-arc.md "Save impact" defines it.

**Suggested order**

1. Controls and readability. They're presentation only, so they ship first and make everything after them visible.
2. The 8-man opening.
3. Sim train 2: doctrines, then formations and orders, then abilities, then field works.
4. The event deck.
5. The campaign arc.

## Success measures (playtest and `npm run balance`)

| Measure | Today | v5 target |
| --- | --- | --- |
| Real decisions in the first campaign battle (PLAY method) | about 4 | **8 or more** |
| Campaign battle: time to first contact | 33 s | **15 s or less** |
| Matched battle median length | 82.5 s | 60–120 s |
| Mean ability impact (mirror) | 0–5 pts | **5–10 pts** each |
| Doctrine spread: the same army against each doctrine | n/a | each doctrine's win rate within **40–60%** of a matched army; the best counter-shape beats the doctrine by **8 points or more** |
| Defeats with an explained cause on Results | 0% | **100%** |
