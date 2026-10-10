# v5 audit synthesis

Story S1-AUDIT-SYNTH. This merges three audits into one view, grouped by area:

- **UI**: [audit/UI.md](audit/UI.md) and [audit/NAV.md](audit/NAV.md). 20 scenes, 143 issues.
- **PLAY**: [audit/PLAY.md](audit/PLAY.md). A hands-on touch playtest.
- **MECH**: [audit/MECHANICS.md](audit/MECHANICS.md) and [balance/BASELINE.md](balance/BASELINE.md). A 400-seed balance run.

All three audited `v5` @ ea5af21, which is the same code as `main` @ bd61069. This file doesn't repeat the source detail: the IDs point back to it. Where two audits found the same thing, both IDs are listed and the higher severity wins.

**Severity** uses one scale for all three sources:

| Here | UI / PLAY | MECH |
| --- | --- | --- |
| **blocker** | blocker | S1 |
| **major** | major | S2 |
| **minor** | minor | S3 |

## The diagnosis in five lines

1. **The battle core is right, but you can't see it.** The morale cascade, flank multipliers, braced spears and held javelins are deep (MECH 1.2, 1.3). On the screen, though, morale is an unlabelled bar and flanks show only as banners (PLAY R1, R2).
2. **The campaign start kills the core loop.** The tutorial sells formations with 8 men. The campaign then starts with 3, and offers about 4 real decisions per battle (PLAY O1, "Depth of decisions").
3. **Depth stops at the battle.** Perk trees are linear (H1). The AI has one doctrine (A1). The campaign has no events and no end (C2). Abilities are worth 0–5 points each (H2).
4. **The stakes leak.** You can escape permadeath by killing the app (C1). The Beast Trial is a free legendary farm (I1). A failed save migration overwrites the save (S1). Scene data leaks between battles (B1, B2).
5. **The v4 shell is right, but what's inside it is unfinished.** There's a type-spacing bug on every screen (G1). Colour roles are broken (G2, G3). Upscaled pixel art sits in painted frames (G8). The chrome comes in two families (G7).

---

## 1. UI (layout, type, colour, accessibility)

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| WAR-1 | War resource chips ellipsize their numbers: all of them at 320, war gold even at 390. | blocker | UI |
| G1 | The Cinzel font splits words and swallows spaces on every screen ("Strat egos"). | major | UI |
| G2 | Live buttons are drawn in grey, which the spec reserves for disabled (Flee, Close, Dismiss, the active Defence). | major | UI |
| G3 | Red is used for names, group I, headers and the Paused hint, so alerts lose their meaning. | major | UI |
| G9 | Fixed headers and fixed CTAs leave a sliver of content with no scroll cue (Hero, Army, Duel ladder, Pass). | major | UI |
| G10 | Text goes down to 8 CSS px (tabs, round buttons, the Battle HUD). | major | UI |
| G14 | Ellipsis is the default way to handle overflow, even for must-show facts. | major | UI |
| G12 | About 30 strings are outside i18n, plus all of ClanScene. Russian players see English. | major | UI |
| DUE-1 | The ladder's FIGHT CTA covers the floor grid (and all of it at 320). | major | UI |
| MENU-1 | At 320x640 the Army, Stash and Camp tiles are below the fold. | major | UI |
| SHP-1 | The Pass opens scrolled past its season card and the paying CTA. | major | UI |
| BTL-1 | The Paused pill covers the boss HP bar. | major | UI |
| BTL-3 / BTL-11 / G13 | The Battle HUD is in the dark v3 style with text at 5–6 UI px. Group HP and morale bars are 3.4 px, with no label (colour only). | major | UI, PLAY R1 |
| G13, G15, G4, G5, G6, G11 | Colour-only state, info reachable only by long-press, blue on non-money, mixed close affordances, no scrim, badge inflation. | minor | UI |
| G16 | CI never tests 320x640, which has 9 layout violations. A bad fixture renders "Holds #[object Object]". (Decided in V5-014 and V5-016.) | minor | UI |

**Accessibility.** V5-013 commits to the Standard tier. Against it, the open gaps are G10 (type size), G13 (colour-only state), G15 (long-press only) and G12 (i18n), plus red text on dark backgrounds (WLD-3, CMP-3).

## 2. Art

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| G8 / RES-1 / SET-1 / MENU-10 | Pixel sprites are upscaled into painted frames. The MVP portrait is headless, the settlement banners are blurry and the recruit portraits are blocky. The hub art is a placeholder cropped from the mockup. | major | UI |
| FR-1 | The first screen is about 60% blank parchment with no key art. | major | UI |
| G7 / WLD-2 | There are two chrome families. World, Camp, the Battle HUD and the encounter dialog still use dark v3 chrome. | major | UI |
| BTL-2 | A black square appears on the beast battlefield (a missing texture?). | major | UI |
| RES-2, RES-4 | Pixel laurels sit on a smooth plaque. The Spoils empty state is weak. | minor | UI |

## 3. Menus and navigation

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| NAV D2 / D5 / MKT-4 | There are five "shops". The player market is reachable only through War › Army. | major | UI/NAV |
| NAV D3 / CDX-1 | Codex and BeastTrial show the same list. (The IA plan decides this, V5-015.) | major | UI/NAV |
| NAV N1 / TRL-1 | A Trial fight strands you on the campaign map. | major | NAV |
| NAV N3 / ARM-1 | Army's back button says "Map" but goes to the Menu. | major | NAV |
| NAV D6 | There are three army screens (Army, OnlineArmy, Duel Team) with drifting layouts. | major | NAV |
| FR-3 / D10 | "Two ways to fight" conflicts with the three-mode tab bar. | major | UI/NAV |
| NAV N5–N10, D7–D12 | Smaller issues: a fake back arrow, the encounter dialog has no close, Results Back silently takes the spoils, the cloud-adopt jump, "Back" means three things, dead UI in the code. | minor | NAV |

## 4. Controls (battle input)

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| C1 | The turn knob is drawn over another group's soldier, so a press meant for group II turns group I. | major | PLAY |
| C2 | There's no single-step undo. Reset clears every group, and battle orders commit on release. | major | PLAY |
| C4 / B6 | *Shoot* stays lit when no target is in range, with no feedback (30 s of nothing). | major | PLAY |
| K1 | Deployment opens with the enemy off screen. | major | PLAY |
| K2 | The follow camera loses your selected group, and no edge pointer shows where it went. | major | PLAY |
| MECH B2 | `form` resets the group order to `hold`, so turning a charging group stops it. The bot hits this too. | major | MECH |
| C3 | The selected group is hard to see on the order bar, so orders go to the wrong group. | minor | PLAY |
| C5 | Hiring a recruit is a single tap, with no confirm or undo. | minor | PLAY |
| C6 | The knob art is 12 pt and can't be found without the tutorial. | minor | PLAY |
| C7, C8, BTL-5 | No feedback on an unreachable map tap. War buttons swap places. The "Back" order label clashes with navigation. | minor | PLAY/UI |
| Keep | Drag-to-move, the knob, shapes only from buttons, pan on empty ground, pinch, pause-and-order and auto-pause. | — | PLAY |

## 5. Mechanics (depth)

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| H1 | The perk "trees" are linear chains, so a level-up is not a decision. | blocker (v5 depth) | MECH |
| A1 | The AI has no personalities: every culture fights with the same fixed timers. | blocker (v5 depth) | MECH |
| C2 | The campaign has no arc, no end state and no events beyond encounter and arrive. | blocker (v5 depth) | MECH |
| F1 | Flank counter-play is thin: no orb, square, wheel or face-threat order. | major | MECH |
| J2 | Missile groups have no target order. | major | MECH |
| H3 | There are only 4 actives, and most classes have no signature. | major | MECH |
| M2 | There's no commander-level morale lever. | major | MECH |
| A2 / A3 | The AI follows exploitable fixed timers, and bots never fall back or retreat. | major | MECH |
| C3 | Bands never reach tier 3. The late game stops scaling. | major | MECH |
| C6 | Levels 6–10 are a dead zone of about 46 battles. | major | MECH |
| B1 | Melee hit chance is a flat 0.55, so a veteran and a levy hit equally often. | major | MECH |
| B3 | Groups have no cohesion: one group routing doesn't shake the rest. | minor (v5 opportunity) | MECH |

## 6. Balance

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| R1 | At equal cost the elites (Royal guard, Sacred Band) lose 92–100% to cheap shock infantry. | blocker | MECH/BASELINE |
| I1 | The Beast Trial is a free, repeatable legendary farm. | blocker | MECH/BASELINE |
| H2 | Abilities are worth 0–5 points each, and Eagle Eye is worth 0. | major | BASELINE |
| R3 | Militia beat all cavalry 100%. Chariots vs militia is 0%. Cavalry on the flank is only break-even (F2, 54%). | major | BASELINE |
| J1 | Archers (36%) and slingers (34%) sit at the bottom of the band. | major | BASELINE |
| Terrain | The ridge defender wins 74% (the doc says 63%). | major | BASELINE |
| E1 / E2 | Loot resale is the main gold faucet, the profitable play is punching down, and there's no endgame gold sink. | major | BASELINE |
| P1 (PLAY) | 4 vs 5 "even" fights are decided by attrition the player can't read. Small-army balance is unmeasured. | major | PLAY |
| M1, R5, E3, I3, I4 | Rout timing has drifted from the doc. 25-seed cells are noise. Repair arbitrage. Pity counts the pool, not the pick. Dead tier-1 trinkets. | minor | MECH |
| E4 / E5 | An indirect paid-power path through the market (Drachmae buy legendaries). The pass returns less than 600 Dr. | major (constrained) | MECH, see [PROPOSALS.md](PROPOSALS.md) |

## 7. Onboarding

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| O1 | The tutorial army has 8 men. The campaign starts with 3, which gives a 2-man "phalanx". | major (structural) | PLAY |
| O4 | After the tutorial comes a bare world map with no guidance. | major | PLAY |
| O5 | Defeat explains nothing ("Kills 0, Losses 0"). | major | PLAY |
| O2 / TUT-1 | The narrator covers the Shape row and the FIGHT button. | major | PLAY/UI |
| O3 | The flank step teaches you to turn a line that is already engaged. | minor | PLAY |
| TUT-2 | The narrator's ✕ means "skip the whole tutorial". | minor | UI |
| Keep | Spotlight, ghost hand, pause while the narrator talks, about 3.5 min long. | — | PLAY |

## 8. Feel and audio

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| F1 | No hit-stop and no camera shake in battle. Charge impact, rout and Bash have no weight. | major | PLAY |
| P1 | A campaign battle has 33 s of nothing, then 20 s of deciding. | major | PLAY |
| P2 | Duel ladder fights have no pause or speed-up, and the last 90 s are one survivor walking around. | major | PLAY |
| R3 / R4 / B5 | Routine damage numbers are noise. Status banners go stale. | minor | PLAY |
| F3 | Scene changes are hard cuts. | minor | PLAY |
| Auto-pause | Pauses fire twice within 5 s for lost causes. | minor | PLAY |
| Keep | The procedural soundscape (clash, block, horn, rout horn), the praise chime and haptics. | — | PLAY |

## 9. Tech and process

| ID | Issue | Sev | Source |
| --- | --- | --- | --- |
| O1 (MECH) / B5 | There's no `SIM_VERSION`. Any change to the sim, AI or data breaks in-flight tickets, mixed-build live duels and stored raids. (V5-012.) | blocker (process) | MECH |
| S1 | A failed migration overwrites the save. (Being fixed in S4-FIX-SAVES.) | blocker | MECH |
| C1 / S2 | The pending battle isn't saved, so killing the app escapes permadeath. (Being fixed in S4-FIX-SAVES.) | blocker | MECH |
| B1 / B2 (PLAY) | `scene.start('Battle')` with no data reuses the last run's data (WorldScene.ts:1292, BeastTrialScene.ts:95). | blocker | PLAY |
| C4 (MECH) | `weakenParty` rerolls a band's identity. | major | MECH |
| B3 (PLAY) | Group numerals renumber at the start of a duel when the Reserve is empty. | major | PLAY |
| B4 (PLAY) | Results "Losses" counts only the dead, and shows 0 in duels. The "Hero" can have 0 kills. | minor | PLAY |
| O2 / O3 (MECH) | Constraints: new `Order` kinds need the server zod schema, and everything must stay bit-deterministic. | constraint | MECH |
| Phaser 4 | Medium-low risk, with five fragile seams. Decided by the P4 spike (V5-005). | — | MECH §3 |
| C5, C7 (MECH) | The drill buffer isn't saved. Dead code: `generateEnemyArmy`, `Campaign.recruit`, the radial ring. | minor | MECH/NAV |

---

## Top 20 (ranked by player impact × reach × what it unblocks)

| # | Item | IDs | Area | Sev |
| --- | --- | --- | --- | --- |
| 1 | Scene data reuse breaks the campaign attack after the tutorial or a duel | PLAY B1, B2 | tech | blocker |
| 2 | No sim versioning, which blocks every v5 sim change | MECH O1 / V5-012 | tech | blocker |
| 3 | Save overwrite on a failed migration | MECH S1 | tech | blocker |
| 4 | App-kill escapes permadeath | MECH C1/S2 | tech | blocker |
| 5 | The 3-man campaign start kills formation play | PLAY O1, Depth | onboarding/mechanics | major (structural) |
| 6 | Morale and flanks aren't readable on the field | PLAY R1, R2; UI BTL-11, G13 | controls/feel | major |
| 7 | Beast Trial legendary farm | MECH I1 | balance | blocker |
| 8 | The AI has one doctrine on fixed timers | MECH A1, A2, A3 | mechanics | blocker (depth) |
| 9 | Linear perk trees, abilities worth 0–5 points | MECH H1, H2, H3 | mechanics | blocker (depth) |
| 10 | Cinzel word-splitting on every screen | UI G1 | UI | major |
| 11 | No undo, knob mis-grabs, wrong-group orders | PLAY C1, C2, C3 | controls | major |
| 12 | No arc or events in the campaign | MECH C2, C3 | mechanics | blocker (depth) |
| 13 | Pacing: idle opening, endless duel endings, no ladder pause | PLAY P1, P2 | feel | major |
| 14 | Silent *Shoot* out of range, and no missile target order | PLAY C4; MECH J2 | controls | major |
| 15 | No impact juice (hit-stop, shake) on charge, rout or ability | PLAY F1 | feel | major |
| 16 | Elite trap and militia vs cavalry polarity | MECH R1, R3 | balance | blocker |
| 17 | Grey and red colour roles broken | UI G2, G3 | UI | major |
| 18 | Upscaled pixel art in painted frames, plus the blank first screen | UI G8, FR-1 | art | major |
| 19 | The camera hides the enemy at deployment and loses your groups in battle | PLAY K1, K2 | controls | major |
| 20 | War chips ellipsize their numbers (the only UI blocker) | UI WAR-1 | UI | blocker |

## Live-player bugs

These hurt players on the shipped build today.

| Bug | IDs | Status |
| --- | --- | --- |
| A failed save migration overwrites the save (an older client, or a removed item def) | MECH S1 | **S4-FIX-SAVES** (V5-011) |
| Killing the app mid-battle escapes permadeath; the pending battle isn't persisted | MECH C1/S2 | **S4-FIX-SAVES** (V5-011) |
| Campaign Attack after the tutorial reopens the tutorial | PLAY B1 | **S4-FIX-SAVES** (scene-data fix) |
| Campaign Attack after a duel opens the ladder battle | PLAY B2 | **S4-FIX-SAVES** (scene-data fix) |
| Results "Losses" is wrong (0 in duels, only the dead in the campaign); a 0-kill "Hero" | PLAY B4 | **S4-FIX-SAVES** |
| BeastTrialScene has the same `scene.start('Battle')` with no data | PLAY B1 root cause | likely covered by the B1/B2 fix: add a regression test |
| Beast Trial is a repeatable legendary farm | MECH I1 | queued (V5-011 item 3, needs a /quick-design) |
| Group numerals renumber at the start of a duel | PLAY B3 | open: next fix story |
| `weakenParty` rerolls a band's identity (a beast becomes a band) | MECH C4 | open |
| War resource chips ellipsize the numbers | UI WAR-1 | open (UI story) |
| The OnlineArmy group IV button sits outside the canvas at 320x640 | UI G16 | open (V5-014) |
| Stale "Contact soon" banners | PLAY B5/R4 | open (polish) |
| The black square on the beast field | UI BTL-2 | open (needs a repro) |
