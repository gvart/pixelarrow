# v5 audit: UI, menus and art

Story S1-AUDIT-UI. Audited on 2026-10-10 against branch `v5` @ ea5af21 (UI v4 "Mosaic & Parchment", docs/redesign/V4_SPEC.md).

## How this was done

- **Screens.** I staged every screen with the layout-check fixtures from `scripts/layout-check.mjs`: 150 states over 20 scenes. That ran in my own headless Playwright, on Vite at port 5191, in English, without Telegram insets, at 390x844, 360x780 and 320x640. Port 5181 was already taken by another agent's server.
- **Saved shots.** 209 of them are in `shots/`, named `<state>-<w>x<h>.png`, quantized to 256 colours (about 60 KB each):
  - 97 states at both 390x844 and 360x780.
  - 15 hubs and key screens at 320x640.
  - `?scene=Kit` is covered by the `kit-*` states.
  - BootScene was not captured. It shows a single line of text for under a second.
- **Inventories.** Each element inventory comes from reading the scene code, with file:line references. Every finding marked *(seen)* was checked by eye on a screenshot. Findings marked *(code)* come from reading the source.
- **Severity.**
  - **blocker:** information or an action is unusable, or the screen is wrong.
  - **major:** it hurts comprehension, the brand, or the accessibility of a core flow.
  - **minor:** polish or consistency.
- **Units.** "UI px" are kit units (`src/ui/kit.ts:42`), where S ≥ 2 CSS px per UI px. So TAP = 22 UI px is 44 pt, and size 6 is 12 CSS px.

### Automated layout check, my run

At 390 and 360 there were 0 violations. At **320x640 there were 9 new ones**. CI only tests 320x568.

- `hero.prev` overlaps the trinket slot. This hits `hero`, `hero-gear`, `hero-perks`, `hero-skills` and `duel-hero`.
- OnlineArmy group button IV and its label sit **outside the canvas**. This hits `online-army` and `online-army-stash`.

### Creative-director answers to the skills' questions (the user is asleep)

| Question (skill) | Answer |
| --- | --- |
| Accessibility tier? (ux-review Phase 2; `design/accessibility-requirements.md` does not exist) | **Accessibility: NOT ASSESSED against a committed tier.** For this audit I *assumed* "Standard": WCAG AA contrast (4.5:1 text, 3:1 UI), 44 pt targets, body text at least 12 CSS px, and no colour-only state. That matches what V4_SPEC already promises ("all pairs must pass WCAG AA"). The tier still has to be committed with `/ux-design accessibility`. |
| Input methods in scope? (ux-review, accessibility-specialist) | Touch first (Telegram Mini App, portrait). Mouse on Telegram Desktop is secondary. **Keyboard and gamepad focus navigation is out of scope for v5**, but no information may be reachable *only* by long-press. |
| Platform sizes? | 390x844 is the reference. 360x780 must be clean. 320 must be usable: nothing hidden that matters. |
| Reference look? | Mockups A1-A3 stay the visual truth. Where a screen drifts from them, the mockup wins. |
| Is the pixel world plus painted chrome a keeper? | Yes. But pixel art must never be upscaled into a painted frame as if it were an illustration (see G8). |

---

## Global issues (referenced from the scenes)

| ID | Issue | Sev | Fix direction |
| --- | --- | --- | --- |
| G1 | **Cinzel titles split words and swallow spaces**, on every screen *(seen)*. Examples: "Strat egos", "First st eps", "Duel s", "Beast s", "Cycl ops", "Avail abl e in Tel egram", "Online unavail abl e", "Spo il s", "Tit an". Word spaces vanish in "Battle pausesandnumbers", "Account:and help" and "Howit fights". This is a rendering bug in Cinzel glyph spacing (letterSpacing or fallback measuring), not a translation issue. | major | Find the cause in `src/ui/textfit.ts` / `src/ui/fonts.ts`: Cinzel letter-spacing against the canvas `measureText`, and the font-ready race. Add a visual regression test on 5 known words. |
| G2 | **Grey stone is used for enabled controls**, while the spec reserves grey for "unavailable" *(seen)*. Examples: CLOSE in the cosmetic dialog; Settings "Replay" / "Open"; FLEE in battle; DISMISS in Army and Hero; the "−" stepper next to a bronze "+"; the *selected* "DEFENCE" use button; unselected slot filters. Players read live buttons as disabled. | major | Map every neutral or secondary action to bronze. Keep grey only for disabled. Add a lint so that a `neutral` variant on an enabled `MButton` is flagged. |
| G3 | **Red is used outside "errors, losses, alerts"** *(seen)*. Examples: hero names in Assign groups; red group-I disc on every roster row; red "Lv" pill (OnlineArmy); a red "!" disc on the normal "Paused" hint; red section headers ("Stats", "The wounded: 5", "Formation 8/12", STR/AGI line); a terracotta 3rd-place medal on leaderboards. | major | Recolour group discs with the 4 group colours already in battle (and not red for I). Use ink for headers. Use a bronze 3rd medal. Use an info glyph for hints. |
| G4 | **Blue used for non-money**: the "Heavy infantry" role pill (Army, Hero, Town, Duel floor). V4_SPEC: "Real money stays blue." | minor | Give role pills ink or earth tones. |
| G5 | **Close affordances are inconsistent** *(seen)*. Most sheets have both an X and a CLOSE button (cosmetic, recruit card, trial info, boss info, inspect). Lobby has CLOSE only. The world encounter has neither (only Back with "Let them go"). | minor | One rule: sheets get an X; a footer CLOSE appears only when there is no other action. |
| G6 | **No scrim** under the Settings sheet, the New-campaign confirm, the nested Notifications modal or the cosmetic dialog *(seen)*. The parchment-on-parchment stacking gives weak layering, and two X buttons are visible at once (Notifications over Settings). | minor | A 40-50% basalt scrim under every modal. Nested modals replace the sheet content instead of stacking. |
| G7 | **Two chrome families.** Hubs and sub-screens are Mosaic parchment with a meander frame. World, Camp and the Battle HUD use dark stone bars with no frame, and the World encounter dialog is a legacy dark-brown v3 dialog *(seen)*. | major | Finish the V4 "Battle HUD restyle" phase and the map chrome. Delete the v3 dialog path (`openEncounter`, WorldScene.ts:1184). |
| G8 | **Pixel art upscaled into painted frames** *(seen)*. Examples: settlement "fresco" banners (a blurry crop of the map tile); recruit and roster portraits (blocky sprite crops); the Results MVP portrait (torso crop with the head cut off); pixel laurels on the smooth Results plaque; pixel chests in painted sheets; the blurry arena icon in Search; 1× sprites lost in big dark niches (Hero, recruit card). Painted placeholders (`public/ui/banner_campaign.jpg`, `portrait_leader.jpg`) are crops from mockup A1. | major | An art pass. Painted settlement vignettes, painted class portraits (bust, 1:1) and a painted beast plate set. Stage sprites at 2× or 3× integer scale, filling the niche. Pixel art only on the map and the battlefield. |
| G9 | **Fixed head plus fixed CTA leave a sliver for content**, with no scroll cue *(seen)*. Examples: Hero (4 stat rows), Army (3.5 rows), Duel ladder (floor tiles under FIGHT FLOOR), Duel team (6 control rows before the list), Town rest (2 of 5 wounded visible), Shop pass (season card scrolled away). | major | Collapse heads on scroll. Make the CTA part of the flow, or reserve space for it. Add a fade or "more" cue at the clip edge. |
| G10 | **Type below 12 CSS px.** Tab labels step down to 4 UI px, 8 CSS (`TabBar.ts:23`); RoundButton labels 5.5 (`RoundButton.ts:25`); Battle HUD 5-5.6 (`battleHud.ts`, `battlePanel.ts:542`); Shop "You" 5.5 (`ShopScene.ts:550`); dozens of size-6 lines with negative line spacing *(code, seen)*. | major | Floor of 6.5 UI px (13 CSS) for any text that carries meaning. Use icon-only plus a long-press legend instead of shrinking type. |
| G11 | **Badge inflation** *(seen)*. Army shows red "!" next to every hero, "9" on Roster, "!" on SHEET and "!" on PARTY. Duels show "!" on TEAM. The badge no longer means "act now". | minor | One badge per destination, counts not "!", and only for actionable states (unspent points, claimable rewards). |
| G12 | **Strings outside i18n** *(code)*. All of ClanScene. The World encounter dialog, banners and strike dialog (about 30 literals). `STRUCTURES` names and descriptions. Boot "Mustering the hoplites...". Raw rarity id "(common)" (CampScene.ts:1032). Raw roles "leader/officer/member". Russian players see English. | major | Move the strings to i18n tables. The layout check's `ru` run then catches the overflow. |
| G13 | **Colour-only state** *(code, seen)*: rarity as frame colour in stash grids; World band threat plates on the map; Camp placement tint (cyan/red); group-card HP and morale bars (3.4 px, no label); selected segments shown only by a lighter fill; floor tile "next vs cleared". | minor | Add a rarity gem or letter on the cell corner, a threat icon on the plates, ✓/✗ glyphs on the placement ghost, and labelled bars in the expanded card. |
| G14 | **Truncation is the default overflow strategy, even for key info** *(seen)*. Examples: War gold "1....", the recruit trait "+Wears down slow…", Codex/Trial hints, the camp cost line "…90 Gold, 30 Food…", the season reward "…piece of yo…", "Team 43 pts ·…" at 320, order label "Adva…", "Armour pie…". The full text is often reachable only by long-press. | major | Mark must-show fields in the layout registry and fail the layout check when they ellipsize. Let them wrap or move. |
| G15 | **Long-press is the only path to some info** (tips, the full text of truncated rows, chip meaning) *(code)*. It cannot be discovered and does not work for mouse users on Telegram Desktop. | minor | A visible (i) or chevron where details exist. Mouse hover shows the same tip. |
| G16 | **Layout-check blind spots** *(run)*. CI never tests 320x640, where 9 violations appear. The OnlineArmy garrison fixture passes `{q,r}` where the API type is a number (`src/online/client.ts:33`), so the screen it renders shows "Holds #[object Object]" (`shots/online-army-390x844.png`) and still passes. Truncated must-show text is not a violation. | minor | Add 320x640, fix the fixture, add a "must not ellipsize" rule (G14). |

---

## Scenes

Shot names below are relative to `shots/`. `{w}` means both 390x844 and 360x780.

### 1. BootScene: loading

**(a) Inventory**
- A single text line, "Mustering the hoplites..." (BootScene.ts:52, hard-coded English).
- Nothing is tappable.
- Routing (:67-82):
  - a live duel → Duel (rejoin);
  - otherwise first run → FirstRun;
  - otherwise a deep link → `sceneForRoute`;
  - otherwise `?scene=Kit` → Kit;
  - otherwise Menu.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| BOOT-1 | The first frame of the game is plain text, with no logo or art. It is not localized (G12). | minor | A painted splash with the logo and a progress bar; an i18n key. |

### 2. MenuScene: the Campaign hub (plus the Settings, Notifications, About and New-campaign dialogs)

Shots: `menu-{w}`, `menu-320x640`, `menu-settings-{w}`, `menu-settings-end-{w}`, `menu-settings-notify-{w}`, `menu-settings-about-{w}`, `menu-reset-{w}`, `menu-shop-{w}`.

**(a) Inventory**

*Hub shell*
- Top bar: title plaque "Pixelarrow"; gear → Settings; sync badge at the top left (tooltip `legend.sync.*`).
- Tab bar (`hub.ts:15`):
  - Campaign → Menu
  - Duels → Duel
  - War (centre medallion) → Online
  - Codex → Codex
  - Shop → Shop
  - Red count badges; long-press shows the tab name.

*Profile card* (MenuScene.ts:48), display only:
- Portrait.
- "Strategos {name}" or "New campaign".
- A status line: no save / fresh / "{n} men are hurt" / "Day n · in {place}" / "Day n on the march".
- Gold, Trophies, "Warband n Men".

*First-steps quest card*, shown until done:
- Title "First steps · n of 4" and a 4-segment bar.
- The next step: tutorial / win a battle / hire a 4th man / put on gear.

*Actions*
- Fresco banner (tappable) and the hero button "Continue the march" / "Begin the march": → Settlement (if inside a town) or World. With no save → reset → World.
- Stone tiles:
  - **Army**: "!" badge when points or perks are pending; → Army.
  - **Stash** → Army (stash tab).
  - **Camp**: disabled with the caption "Pitch camp on the map"; → Camp (field).

*Settings sheet* (`src/ui/settings.ts:84`)
- Audio:
  - Sound toggle.
  - Music and Effects steppers, 0-10.
- Language: segmented Auto / English / Русский.
- Battle pauses and numbers:
  - Damage numbers.
  - Pause on first contact.
  - Pause when flanked.
  - Pause when a group routs.
  - Pause on hero death.
- Accessibility:
  - Reduce motion.
  - Haptic feedback.
- Account and help:
  - Tutorial Replay/Resume → Battle tutorial.
  - Notifications Open.
  - About Open.
  - Usage statistics toggle.
  - New campaign "Start…" → confirm.
- Closes with X, a tap outside, or Back.

*Notifications modal*
- A bot note, or an offline/blocked/failed state.
- Toggles: Attacks, Marches, Full treasury, Duels, Clan, World bosses, Season end, Market sales, Quiet at night.

*About modal*
- A purchase note.
- Terms of Service, Privacy Policy, Refund Policy (external links).

*New-campaign confirm*
- A "lost / kept" list.
- Cancel / Begin (destructive) → World.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| MENU-1 | At **320x640 the Army / Stash / Camp tiles are below the fold** with no scroll cue. The profile name shrinks to about 9 px and the fresco becomes a thin strip *(seen, menu-320x640)*. | major | A compact hub layout under VH 330: the fresco becomes a 1-line banner, or drop it; the tiles always stay above the fold. |
| MENU-2 | The War medallion is a blank bronze disc with no glyph, and its "WAR" label sits under the rim *(seen)*. The most important tab is the least legible one. | major | Engrave crossed spears / a helmet on the shield; put the label in the bar like the other tabs. |
| MENU-3 | Tab icons drift from mockup A1: Codex is a **paw** (A1: book), Campaign is a signpost (A1: banner). At 320 the "Campaign" label switches to small title case while the others stay caps *(seen, menu-320x640)*. | minor | Atlas icons: book, banner. One label style; abbreviate instead of switching case. |
| MENU-4 | The tiny red cloud sync badge at the top left of the bar has no label. It reads as an error indicator *(seen)*. | minor | Show the sync state as a small text chip in Settings › Account; in the bar only on error. |
| MENU-5 | G1 on the hub: "Strat egos", "First st eps · 2 of 4". | major | G1. |
| MENU-6 | Settings sheet: a full-height sheet that **covers the top bar** with no scrim. The list runs off the bottom with only a thin scrollbar *(seen)*. The section titles "Battle pausesandnumbers", "Accessibil ity" and "Account:and help" break (G1). | major | A max-height sheet with a scrim and a sticky title; collapse sections, or show a fade at the bottom. |
| MENU-7 | Settings › Account: the REPLAY / OPEN / OPEN buttons are **grey**, which looks disabled (G2). The "New campaign (from day 1)" label wraps to 2 tiny lines *(seen)*. | major | Bronze buttons; the label becomes "New campaign" with a sub line. |
| MENU-8 | The Notifications modal stacks on top of the Settings sheet: parchment on parchment, two X buttons visible, no scrim *(seen)*. | minor | Push it as a page inside the sheet, with a back chevron. |
| MENU-9 | The New-campaign confirm has no scrim; the bright hub stays fully legible behind a destructive confirm *(seen)*. | minor | G6. |
| MENU-10 | Fresco and leader portrait are placeholder crops from the mockup (memory; `public/ui`). | major | Art pass (G8). |
| MENU-11 | Camp tile disabled plus a caption is correct, but at 360 the caption wraps against the frame edge *(seen menu-360x780)*. | minor | One-line reason; the full reason on tap. |

### 3. FirstRunScene: onboarding offer, resume, reward and modes

Shots: `first-run-offer-{w}`, `first-run-resume-{w}`, `first-run-reward-{w}`, `first-run-modes-{w}`, `first-run-skip-{w}`.

**(a) Inventory**
- Top bar with the title: "Welcome, strategos" / "Training complete" / "Two ways to fight". Back only in reward and modes.
- Narrator speech card: Nikias portrait with a blink animation, name, text up to 6 lines.
- Offer: Tutorial (recommended) → Battle tutorial; Skip → modes.
- Resume: Resume tutorial; Skip → confirm (Skip / Stay).
- Reward: gold count-up card and item card (icon, name, rarity); Continue → modes.
- Modes:
  - Campaign info card and Online war info card.
  - Online → Online; Campaign → Settlement / World.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| FR-1 | **The very first screen is about 60% blank parchment** with a small pixel portrait and no key art *(seen first-run-offer)*. It is the weakest first impression in the game. | major | A painted key-art splash (the hoplite line on the beach, like the fresco) with the narrator over it, and the CTA at thumb height. |
| FR-2 | Skip is a full-width button placed **above** the primary "Tutorial (recommended)" *(seen)*. Both are the same size. | minor | Primary at the bottom, full width; Skip as a text link under it. |
| FR-3 | "Two ways to fight" offers Campaign and Online. The tab bar has **three** modes (Campaign, Duels, War); Duels is folded into "Online war… duel live" *(seen)*. That conflicts with the IA the player meets one screen later. | major | Three mode cards that match the tab bar (Campaign / Duels / War), each with art and a one-line pitch. |
| FR-4 | The reward screen has no moment. A Gold row and an item row float mid-page with large gaps *(seen first-run-reward)*. | minor | A centred reward plinth, item art at 3×, a glow, and the count-up kept. |
| FR-5 | The narrator is a pixel portrait while the hub leader is painted (G8). | minor | A painted Nikias bust. |

### 4. Tutorial overlay (inside BattleScene)

Shots: `tutorial-intro-{w}`, `tutorial-sling-{w}`, `tutorial-move-{w}`, `tutorial-skip-{w}`.

**(a) Inventory**
- Narrator panel: portrait, name, typewriter text, ✕ = "Skip tutorial" → confirm, tap-to-continue arrow.
- Spotlight (dims the screen and cuts a hole round the target), ghost hand, field flag marker, praise pill.
- Steps: intro, select, pan, zoom, sling, fight, move, wall, loose, charge, ability, flank, win/defeat.
- Skip confirm: Skip / Stay. Skip → FirstRun modes. Finish → FirstRun reward.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| TUT-1 | The narrator panel docks at the bottom and **covers the Shape row and the FIGHT! button**, while the hint pill above says "Place your men, then tap Fight." *(seen tutorial-intro, tutorial-sling)*. | major | Dock the narrator at the top during deployment, or shrink it to a speech bubble near the spotlight. Hide the generic hint pill during the tutorial. |
| TUT-2 | The narrator's ✕ means "Skip the whole tutorial", but it reads as "close this bubble". The confirm saves it, but users will hit it by mistake. | minor | Label it "Skip" with a text link; ✕ only dismisses the bubble. |

### 5. CodexScene: Codex hub

Shots: `codex-{w}`, `codex-320x640`.

**(a) Inventory**
- Hub shell and the title "Codex".
- Section "Beasts", one row per beast:
  - Thumbnail, name, hint 1, and "Level n" / "World boss".
  - Tap → BeastTrial `{from:'Codex', open}`.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| CDX-1 | A whole tab for one list, which is **the same list as BeastTrial** (the rows are identical) *(seen codex vs trial)*. | major | Make Codex the bestiary (lore, counters, sightings) with the Fight action in the sheet, and retire BeastTrial as a separate screen (NAV D3). Add the other promised sections (units, items) only if they exist. |
| CDX-2 | Every hint is ellipsized ("Five heads strike on long n…"). The thumbnails are about 24 px of pixel art in big frames *(seen)*. G1: "Beast s", "Cycl ops". | minor | Two-line hints; 2× beast art; a seen/defeated state. |
| CDX-3 | At 320 the "Lernaean Hydra" title falls back to small Inter while the other rows stay Cinzel *(seen codex-320x640)*. | minor | Shrink every row title to the same size. |

### 6. BeastTrialScene

Shots: `trial-{w}`, `trial-info-{w}`.

**(a) Inventory**
- Top bar "Beast trial" with back → `from` (Menu or Codex).
- Sub line "Fight any beast with your army".
- Beast rows: thumbnail, name, hint, Level / World boss.
- Beast sheet:
  - Stage art; "Beast lair / World boss - Level n".
  - How it fights (bullets), Counter, Loot.
  - Close; Fight it → Battle (disabled when the army has no fit men).

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| TRL-1 | After **Fight it** the player goes Battle → Results → Army → World. They never come back to the Trial or the Codex *(code BeastTrialScene.ts:90, ResultsScene.ts:693)*. | major | Results "Onward" returns to the origin (Codex) for trial fights. |
| TRL-2 | The sheet has both ✕ and CLOSE (G5). Bullets are typed dashes. "HOW IT FIGHTS" has double spaces. A parchment card is nested in a parchment sheet *(seen)*. | minor | Real bullet glyphs, one close, a flat sheet. |

### 7. KitScene (debug, `?scene=Kit`)

Shots: `kit-controls-{w}`, `kit-items-{w}`, `kit-lists-{w}`, `kit-v3-{w}`, `kit-mosaic-{w}`, `kit-parts-{w}`, `kit-shell-{w}`.

**(a) Inventory**
- Tabs: Controls / Items / Lists / V3 / Mosaic / Parts. A Shell demo opens from Parts.
- Each tab shows every component in every state; taps only toast.
- Back → Menu.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| KIT-1 | The legacy **V3** gallery still ships next to Mosaic. Tab labels truncate ("Con…", "Mos…") *(seen)*. The category colour bars are colour-only. | minor | Delete V3 once its last users are gone; shorter tab names. |
| KIT-2 | Kit has no "states" matrix for disabled vs neutral vs secondary, which is how G2 slipped through. | minor | Add a variant × state grid and a contrast readout per pair. |

### 8. WorldScene: the campaign map

Shots: `world-{w}`, `world-320x640`, `world-encounter-{w}`, `world-encounter-320x640`.

**(a) Inventory**
- Map:
  - Painted map, settlement name plates, fog of war.
  - Party sprite, enemy bands with man-count plates on a threat colour, dotted route and target.
  - Camp zone and life, night tint.
- Top bar "Day n · Region" and back → Menu.
- Situation line: the "Day, hour · region, danger" sentence plus a hint.
- Chips: gold, men fit/total, food "n (Xd)", supplies.
- Follow (eye) toggle; sync badge.
- Action bar:
  - No camp: Camp (pitch), Stop (while moving), Party "!" → Army.
  - With a camp: Camp → CampScene, Rest/Pause, Party.
- Banners (spotted, found town, camp pitched or struck, ransom, "No way there"…).
- Discovery pan.
- Strike-camp confirm.
- Encounter dialog: band name, figure, threat + men, culture/level, mood, "Your army", advice; Attack / Take ransom / Let them go or Flee n%.
- Gestures: pan, pinch zoom 1-4, wheel. Tap a band → pursue; tap a settlement → march or enter; tap empty land → march.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| WLD-1 | The start island sits in **flat peach fog that fills over 60% of the screen** *(seen world-390x844)*. The map reads as unfinished, and the next goal has no visual pull. | major | Painted fog with landmarks hinted at the edges, a sea texture, and a "next town" marker on the fog edge. |
| WLD-2 | The encounter dialog is the **legacy dark v3 dialog**: red title and red advice on dark brown. At 320 the enemy sprite **covers the band name** ("rcenaries") *(seen world-encounter-320x640)*. No visible close: Back is refused unless you let them go. | major | Rebuild it as a Mosaic BottomPanel: band art in a niche, a threat chip with an icon, and Attack (primary) / Ransom / Let go-or-Flee. |
| WLD-3 | The town label "Rhegion" is red on pink parchment, which is low contrast (estimated below 3:1) *(seen)*. | minor | Ink plates with a stone backing. |
| WLD-4 | There is no primary action on the bar (Camp and Party are both bronze); the main verb "tap the map to march" exists only as text *(seen)*. | minor | A pulsing march target and the next town on the situation line; Party stays secondary. |
| WLD-5 | Chip order (gold, men, food, supplies) differs from Camp (gold, food, supplies, men) *(seen)*. | minor | One order everywhere. |
| WLD-6 | Banners, the encounter and strike dialogs, the threat and culture labels and the structure names are English-only (G12). | major | i18n. |
| WLD-7 | Dead code: the `placing` path and the "tap Build" banner are stale *(code WorldScene.ts:777, 139)*. | minor | Remove them (note only; out of audit scope). |

### 9. CampScene: the isometric camp (field and online)

Shots: `camp-{w}`, `camp-320x640`, `camp-muster-{w}`, `camp-temper-{w}`, `camp-place-{w}`, `online-camp-{w}`.

**(a) Inventory**
- Top bar: field "Day n · hh:00", or online "Home/Forward camp · name". Back → World or the back target.
- Chips:
  - Field: gold, food, supplies, men.
  - Online: war gold, food, wood, bronze, recruits (hidden under VW 200).
- Right rail:
  - Field: 5 structures (tent, fire, wall, anvil, swords) with count badges and disabled reasons; tap = place.
  - Online: 5 buildings (Palisade, Granary, Forge, Barracks, Watchtower) with levels.
  - Zoom (eye).
- Action bar:
  - Field: Muster (icon), Loot (icon) → Army stash, End day (primary), Strike; while placing, Cancel / Place.
  - Online: Muster, Loot, Rest, Build/Upgrade, Make camp.
- Info line.
- Dialogs: Temper (forge), Muster (class steppers and per-man list), Strike confirm.
- Gestures: drag pan, tap a structure or tile.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| CMP-1 | The right build rail is 5 ghosted icons with tiny "1" counts and **no names or costs** *(seen)*. Building is the camp's core verb. | major | A labelled build drawer (name, cost, time); the rail opens it. |
| CMP-2 | Muster and Loot are icon-only (people, amphora). At 320 **Strike collapses to a tent icon**, the same glyph as the tent building *(seen camp-320x640)*, so a destructive action becomes ambiguous. | major | Keep text labels for Strike; move Muster and Loot into labelled buttons, or a "Camp" menu. |
| CMP-3 | Muster: the header "Formation 8/12" is dark red on a dark band (fails AA). Row fonts mix (Cinzel vs small Inter fallback per row). The hint is truncated. A grey "+" next to a bronze "−" looks disabled. "1/2 (1)" is cryptic *(seen)*. | major | A two-column Formation / Reserve list with drag or toggle, a legend for the counts, and bronze steppers. |
| CMP-4 | Temper rows show a **coin price** while the subtitle says "6 supplies". The rarity shows as the raw "(common)" *(seen)*. | major | One explicit cost line (icon + amount for each currency); localized rarity. |
| CMP-5 | Placing: the instruction is clear, but no ghost footprint is visible in the viewport after "Tent" is picked *(seen camp-place)*. The valid/invalid tint is colour-only (G13). | minor | Spawn the ghost centred in view; add ✓/✗ on the tile. |
| CMP-6 | Online camp: the plaque "HOME CAMP · CAVARIAN MEADOWS" is squeezed to tiny caps. The info line "…90 Gold, 30 Food…" is truncated. REST and BUILD are disabled with **no reason shown** *(seen online-camp)*. | major | Two-line title (kind, then place); the cost on its own row; reasons under disabled buttons (the spec's own rule). |
| CMP-7 | Dark map chrome with no meander frame (G7). | minor | G7. |

### 10. SettlementScene: village or town

Shots: `village-{w}`, `town-recruits-{w}`, `town-market-{w}`, `town-sell-{w}`, `town-rest-{w}`, `town-recruit-card-{w}`.

**(a) Inventory**
- Sub-shell with the name and back → World.
- Banner, and "Town/Village of the {people}".
- Chips: gold, men n/20, hurt.
- Tabs: Hire / Buy / Sell / Rest (a village has Hire / Rest).
- Hire rows: portrait (→ class card with Hire), name · Lv, class, role pill, "+trait", Hire price; footer "New volunteers in nh"; empty state.
- Buy rows: item icon (→ item card), name in rarity ink, slot, 1-2 stats, Buy price; footer; sold out.
- Sell: stash grid → item card → sell confirm.
- Rest:
  - "The wounded: n" with a list (portrait, hours).
  - Rate note and provisions line.
  - Food +10, Supplies +10, Rest 8 hours, Physician: heal all.
- Action bar: Army → Army; Leave (primary) → World.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| SET-1 | **The banner is a blurry upscale of the world-map tile** (pixel blobs on grass) in a painted riveted frame *(seen village, town)*. | major | Painted vignettes per settlement kind and culture (G8). |
| SET-2 | Recruit portraits are blocky sprite crops. The key selling line (the trait) is truncated: "+Wears down slow…", "+Holds the line, be…" *(seen town-recruits)*. | major | Painted busts; the trait on its own line. |
| SET-3 | **Leave is the terracotta primary** and duplicates the back arrow; the real primary actions on the page (Hire, Buy) are bronze *(seen)*. | minor | Leave becomes bronze, or is removed (back exists); the page's primary is contextual. |
| SET-4 | Rest tab: "The wounded: 5", but the list window shows 2. Prices are jammed into labels ("FOOD +10 6", "SUPPLIES +10 12", "PHYSICIAN: HEAL ALL 62") with no coin icon. Four bronze buttons have equal weight *(seen town-rest)*. | major | Price chips with a coin icon; a scrollable wounded list sized to its content; Rest 8 h as the primary. |
| SET-5 | The coin glyph on bronze price buttons is a near-white disc that does not read as a coin *(seen)*. | minor | A gold coin icon with a dark outline on bronze. |
| SET-6 | Village pages are about 45% empty under 2 recruits *(seen village)*. | minor | Show the village's bonus or lore, or the next volunteers' timer as a card. |
| SET-7 | The recruit card stages a 1× sprite tiny in a large dark room; it has both CLOSE and ✕; the STR/AGI line is red *(seen)*. | minor | G8, G5, G3. |
| SET-8 | The Sell tab is a 3rd copy of the stash grid UI (NAV D4). | minor | Fine as a component; make the sell price visible on the cell. |

### 11. ArmyScene

Shots: `army-{w}`, `army-320x640`, `army-stash-{w}`, `army-town-item-{w}`, `stash-compare-{w}`.

**(a) Inventory**
- Sub-shell "Army": back, sync badge.
- Status sentence: points pending / hurt / men count / stash count.
- Chips: men, gold, hurt.
- Selected hero card:
  - Stage niche, name, rank stars, class, Lv pill, role pill, Power.
  - Group buttons I-IV and the group name.
  - 5 gear slots plus a mount socket (tap → stash filter or item card; drop target).
- Tabs: Roster n/20 (badge) | Stash n.
- Roster:
  - Filter (All/Phalanx/Skirmish/Reserve/Flank/Wounded/Fit) and Sort (power/level/class/group).
  - Rows: portrait, group disc, power, name, "!", Lv and class or wounded, stars. 1st tap selects, 2nd opens Hero.
  - Empty state.
- Stash:
  - 6 slot filters, rarity filter, sort.
  - Grid with a rarity frame, condition bar and upgrade arrow.
  - Tap → item card (Sell in town / Scrap in camp / Repair / Equip / Take off); long-press drag onto a slot.
- Action bar: back-labelled "Map"/"Town"/"Camp"; Sheet (primary, "!") → Hero; Dismiss → confirm.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| ARM-1 | Opened from the Campaign hub, **the back button says "MAP" but returns to the Menu** *(code ArmyScene.ts:221, 120; seen label)*. | major | Label from `from` (Menu → "Back"/"Camp hub"), or drop the footer back and rely on the top arrow. |
| ARM-2 | Badge and red noise: red "!" beside every name, a red "I" disc on every row, "9" on Roster, "!" on SHEET *(seen)*. | major | G11, G3: one points badge per hero; group discs in group colours. |
| ARM-3 | Only 3.5 roster rows fit under the fixed hero card *(seen)*. | major | G9: the card collapses to a 1-line header on scroll. |
| ARM-4 | Abbreviations "Hoplt", "Pelt" in the row sub line *(seen)*. | minor | Full class names on a second line, or the class icon. |
| ARM-5 | Stash filters: 6 icon-only slot buttons plus "ANY RARITY" and "BY RARITY" (a filter and a sort that read alike). Rarity is frame colour only *(seen)*. | minor | Label "Sort: rarity"; add a rarity gem (G13). |
| ARM-6 | The item card / compare is a wall of 12+ numbers. Red is used for the section header, negative deltas and a requirement warning alike. **EQUIP stays the terracotta primary while "Short by 5: stats −50%" is shown** *(seen stash-compare)*. | major | A verdict line first ("Worse: −34 power"); a warn variant on Equip when requirements fail; ink headers. |
| ARM-7 | DISMISS is grey with a skull, so it looks disabled (G2). | minor | G2. |
| ARM-8 | Slot order differs from Hero (Army: weapon, shield, helmet, armour, trinket; Hero: helmet/armour/trinket left, weapon/shield right) *(seen)*. | minor | One slot layout. |

### 12. HeroScene (campaign and duel sources)

Shots: `hero-{w}`, `hero-320x640`, `hero-gear-{w}`, `hero-perks-{w}`, `hero-skills-{w}`, `duel-hero-{w}`.

**(a) Inventory**
- Top bar with the hero name and back → Army (or Duel).
- Power chip; pager ‹ i/n ›; wounded line.
- Stage niche (swipe = next or previous hero).
- 5 slots plus a mount; Lv pill and stars; class, role pill, traits; XP bar "XP to level n".
- Tabs (badges): Stats | Gear | Perks | Skills.
- Stats:
  - Points header.
  - STR/AGI/END/WIL rows with −/+.
  - Derived stat bars with preview, Record (kills/battles/fit), Traits.
  - Respec (duel).
- Gear: stash grid plus drag to slot; item cards.
- Perks: a tier tree (level, node, name, status learned/available/locked/needs) → perk modal with Learn and a confirm.
- Skills: abilities and auras with cooldowns; an empty state with a Perks action.
- Action bar: Undo / Confirm n while points are pending; Dismiss (duel source).

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| HRO-1 | The fixed head takes about 60% of the height; the tab content gets about 4 rows, and the "Health" row is cut by the frame *(seen hero)*. | major | G9: the niche collapses on scroll; Stats is the default open content. |
| HRO-2 | The sprite is about 1/6 of the arch niche (1× pixel) *(seen)*. | major | G8: a 3× integer-scaled sprite, or a painted bust. |
| HRO-3 | Attribute descriptions are truncated ("Damage, health, c…"); at 320 almost nothing is left *(seen hero-320x640; code HeroScene.ts:446)*. | major | The description goes under the name, full width. |
| HRO-4 | **At 320x640 the pager's ‹ overlaps the trinket slot** (layout-check violation) *(run)*. | major | The pager goes under the niche. |
| HRO-5 | Grey "−" vs bronze "+" (G2); a blue role pill (G4); an empty XP bar at 0/240 reads as broken *(seen)*. | minor | Bronze steppers; earth role pill; show "0%" or a notch. |
| HRO-6 | The Gear tab duplicates Army › Stash (the same grid and filters) (NAV D4). | minor | Keep one, with drag to the slots in Hero. |
| HRO-7 | Duel source: the full-width grey DISMISS is the only footer action (G2) *(seen duel-hero)*. | minor | Bronze; a destructive confirm already exists. |

### 13. BattleScene (offline, online, beast, duel)

Shots: `battle-deploy-{w}`, `battle-groups-{w}`, `battle-fight-{w}`, `battle-fight-320x640`, `battle-shapes-{w}`, `battle-retreat-{w}`, `battle-online-deploy-{w}`, `battle-online-fight-{w}`, `battle-beast-{w}`.

**(a) Inventory**
- Top bar:
  - Deployment: Leave → confirm, Men → Assign groups.
  - Battle: Pause/Play, speed 1×/2×/3×, Flee → retreat confirm.
  - Online: Follow/Watch, Flee.
  - Clock or men count or deploy countdown.
  - Strength row "You n% vs n% Foe".
- Follow eye; hint pill; banners (deploy, contact, flanked, routing, victory…).
- Ability medallions (Horn and selected-unit abilities, cooldowns).
- Group cards (≤4: portrait, numeral, name, men · order, HP and morale bars; tap selects).
- Header: "Orders · group", Shape chip → shape sheet (Line/Column/Wedge/Loose/Wall), Reset (deployment), Alone/Rejoin (single soldier).
- Bottom: Fight! / Ready (deployment), or 5 orders (Advance, Charge, Hold, Shoot, Back).
- Selected-soldier panel (HP/MOR/STA).
- Group tags over the field.
- Gesture hint; terrain info by long-press.
- Gestures: pan, tap to move, drag formation, facing knob, pinch zoom, wheel.
- Dialogs: Assign groups, Leave, Retreat, Shape; Settings pauses the battle.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| BTL-1 | **Beast battle: the boss HP bar ("Cyclop…") is covered by the "Paused" hint pill** *(seen battle-beast)*. The boss state is hidden every time the player pauses to give orders. | major | The boss bar gets its own row under the top bar; the hint pill moves below it, or into the top bar's second row. |
| BTL-2 | An unexplained **black square** sits on the field in the beast battle (right of the phalanx) *(seen battle-beast)*. It may be a missing or unloaded texture. | major | Check in the scene (the `__MISSING` key or the beast's shadow sprite); fix the asset. |
| BTL-3 | The HUD is the dark v3 family (G7); text at 5-6 UI px (G10); order labels truncate at 320 ("Adva…"); group cards abbreviate to "I PHAL. 2 adv." *(seen 320)*. | major | Restyle the HUD (V4 phase); icon-first order keys with labels ≥ 6.5. |
| BTL-4 | The **"Paused" state uses a red "!" error disc**; even the calm "Phalanx I holding" hint has a "!" disc *(seen)*. | minor | G3: an hourglass for paused, an info glyph for hints, red only for flanked/routing. |
| BTL-5 | The order label **"Back"** collides with navigation Back *(seen)*. | minor | "Fall back" / "Withdraw". |
| BTL-6 | FLEE is grey (G2); online uses title-case "Follow/Flee" while offline uses caps "PLAY/FLEE" *(seen)*. | minor | One case style; Flee becomes bronze with the flag. |
| BTL-7 | Assign groups: hero names in **red**; the legend wraps; portraits cropped; the selected group is a lighter fill only; about 40% empty *(seen battle-groups)*. | minor | Ink names; a group-colour chip on the selected one; a compact sheet. |
| BTL-8 | Deployment: the empty RESERVE/FLANK cards have the same weight as the filled ones; the orphan "SHAPE" label; "MEN" doesn't say it opens group assignment; units about 20 px tall at the default zoom *(seen battle-deploy)*. | minor | Dim empty groups; rename Men → "Groups"; open at 1.5× zoom on deploy. |
| BTL-9 | Retreat copy: "The battle is lost, but the army escapes. 0 of 4 men … (pursuit 100%)" is confusing when no one is engaged *(seen)*. | minor | Branch the copy by state. |
| BTL-10 | Dead radial-ring code still drives copy: `battle.sit.quiet` says "an order on the ring" *(code BattleScene.ts:2157, 195)*. | minor | Update the copy (note only). |
| BTL-11 | Group-card HP and morale bars are 3.4 px with no label: colour only (G13). | minor | G13. |

### 14. ResultsScene

Shots: `results-{w}`, `results-heroes-{w}`, `results-spoils-{w}`, `results-inspect-{w}`, `results-320x640`.

**(a) Inventory**
- Banner plaque: Victory / Defeat / Stalemate / Retreat, with laurels, confetti and shake; "vs name · verified".
- Tabs: Summary | Heroes | Spoils.
- Summary:
  - Tiles: Time, Kills, Losses, Gold/Glory, XP (tap = tip).
  - MVP card (portrait, name, class, kills · damage).
  - Level-up line and report notes.
- Heroes: rows (portrait, name, Lv, XP bar fill, +XP, status, fallen).
- Spoils:
  - Pick counter.
  - Face-down cards that flip, then show rarity, name and condition.
  - Tap → inspect modal (compare bars, Take / Put back).
- Primary: Spoils → / Take spoils k/n / Onward. Back = finish.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| RES-1 | **The MVP portrait is a crop of the sprite torso with the head cut off** *(seen results)*. The hero of the battle is literally headless. | major | A painted class bust, or a correctly framed sprite at 3×. |
| RES-2 | Chunky pixel laurels on the smooth teal plaque (G8) *(seen)*. | minor | Painted laurels. |
| RES-3 | Heroes tab: **the XP bars start under the portrait** (x=23 vs text x=30), and stray white pixels show at the bar starts *(seen results-heroes; code ResultsScene.ts:465)*. | minor | Align the bar to the text column. |
| RES-4 | The Spoils empty state is a tiny grey dot icon in a huge empty card. "Spo il s" (G1) *(seen results-spoils)*. | minor | A chest illustration and a short line; a compact card. |
| RES-5 | Report notes are plain centred lines (Rating +18, Promoted…, Demo…) with no hierarchy *(seen)*. | minor | Chips with icons; promotions as a badge moment. |
| RES-6 | System Back runs `finish`, which takes the spoils and leaves with no confirm *(code ResultsScene.ts:126)*. | minor | Back goes to the Spoils tab first if there are unseen spoils. |
| RES-7 | Inspect: better or worse shown as blue/red bars (numbers present), about 60% empty, X plus CLOSE *(seen)*. | minor | G5, G13. |

### 15. ShopScene: Shop hub (Shop, Pass, Wallet)

Shots: `shop-shop-{w}`, `shop-shop-320x640`, `shop-pass-{w}`, `shop-wallet-{w}`, `shop-cosmetic-{w}`, `menu-shop-{w}` (loading).

**(a) Inventory**
- Hub shell "Shop" (back only when opened with `back`).
- Drachmae chip → Wallet; fresco (when tall enough); tabs Shop | Pass (claim badge) | Wallet.
- States: loading / outside / offline / closed / error plus Retry.
- Shop page:
  - Tip; Cosmetics: per-slot OfferCard grids (Equipped / Owned / price / locked with source) → cosmetic dialog (preview, Equip / Take off / Open Pass / Open Duels / Buy / Need n Dr).
  - Consumables note.
- Pass page:
  - Season card: tier, ends in, XP bar → XP sheet, Unlock premium, Claim all.
  - Free/Premium columns; tier rows (badge, You, two reward cells, state) → claim with fly-to-chip, or a tooltip.
- Wallet page:
  - Balance, overdrawn warning, note.
  - 4 Drachmae packs (Stars, best value) → purchase confirm → toasts.
  - Legal text, Terms / Refunds, History (30 rows).
- Dialogs: buy confirm, unlock premium, need Drachmae → Wallet.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| SHP-1 | **Pass opens auto-scrolled to the current tier**, so the season card (tier, ends-in, Unlock premium, Claim all) and the Free/Premium headers are scrolled off the top *(seen shop-pass)*. The paying CTA is never seen on entry. "Claim" is small green text, not a button. | major | Pin the season card and the column headers; scroll only the track; claimable cells get a real Claim button and a glow. |
| SHP-2 | Cosmetic dialog: **CLOSE is grey** (looks disabled) next to a terracotta buy; the price is stated twice; X plus CLOSE *(seen shop-cosmetic)*. | minor | G2, G5. |
| SHP-3 | Wallet: the best pack's "+…" bonus chip is truncated; the "Best value" tag overlaps the card edge; the "1000 STARS" label shrinks to a smaller size than its siblings *(seen shop-wallet)*. | major | Real-money surfaces must be pixel-perfect: a 2-line pack card, fixed label size, the tag inside the card. |
| SHP-4 | The loading state is one faint grey line in an empty card, with "–" in the chip *(seen menu-shop)*. | minor | A skeleton of cards (as Duels already does). |
| SHP-5 | The banner is a pixel-art market strip, while the Campaign fresco is painted (G8) *(seen)*. The locked "Season victor emblem" label is faded below AA. | minor | A painted shop fresco; locked labels in ink with a lock chip. |
| SHP-6 | "Shop" now names 5 places: the Shop hub, the Duels shop, Market, Merchant and the Town Buy tab (NAV D2). | major | See NAV. |

### 16. MarketScene: player market

Shots: `market-browse-{w}`, `market-mine-{w}`, `market-sell-form-{w}`, `market-detail-{w}`.

**(a) Inventory**
- Top bar "Market" with back → `back.scene` (default Online).
- Chips: war gold, Drachmae.
- Tabs: Browse | Mine | Sell.
- Browse:
  - Cycle filters Kind / Currency / Sort, Find… (item picker), a clear ✕.
  - Rows (icon, qty × name, seller · time left, price button) → listing card → buy confirm; Show more; empty state.
- Mine: "n/max listings open"; rows with status; withdraw ✕ → confirm.
- Sell:
  - Grid of stash items, resources and consumables → sell form: quantity, currency toggle, price stepper with bounds, fee and "you get", town picker, List.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| MKT-1 | Browse rows marked **"Expired" still show an active-looking price button** *(seen market-browse; demo data)*. | major | An expired listing uses the disabled style with the reason, or is hidden from Browse. |
| MKT-2 | The three cycle buttons (ALL / ANY COIN / NEWEST) hide their options; each tap mutates state with no menu *(seen)*. | minor | Dropdown sheets with the option list. |
| MKT-3 | Sell form: a ± stepper is the only way to set a price in a 200-100000 range (worth 96). The selected currency is shown only by a lighter fill. The town is a cycling button "TOWN OPPIDUM VETUS" *(seen)*. | major | A numeric entry (or presets ×1 / ×2 / ×5 of worth); a ✓ on the selected currency; a town list sheet. |
| MKT-4 | **Market can only be reached from War › Army › Market** (and a deep link) (NAV D5). | major | Link it from the Shop hub and from Campaign towns. |
| MKT-5 | Item cards are laid out 4 UI px wider than their sheet at VW < 222, so the right button hangs 8 CSS px outside it *(code: ParchmentSheet.ts:97 vs MarketScene.ts:378, 624; sheet.ts:477)*. | minor | Lay out from the sheet's own width. |

### 17. OnlineScene: the War hub (season map)

Shots: `online-{w}` (unavailable), `online-map-{w}`, `online-map-320x640`, `online-hex-neutral-{w}`, `online-hex-own-{w}`, `online-march-{w}`, `online-lobby-{w}`, `online-boss-info-{w}`, `online-coach-home-{w}`, `online-result-{w}`.

**(a) Inventory**
- Hub shell "Pixelarrow" with gear; tab bar (War).
- States: loading / unavailable (Back to menu) / join (Back, Join).
- Situation line; chips war gold, food, wood, bronze, recruits (VW ≥ 200), energy (tap = tip).
- March bar: countdown and Halt.
- Round buttons: Army → OnlineArmy, Clan → OnlineClan, Lobby (online-count badge) → lobby sheet, Region map → centre on the army.
- Collect (primary when income waits).
- Hex panel:
  - Title and tier; owner, yields, defenders, siege meter, boss HP, garrison, waiting income, merchant kind.
  - Actions: Merchant, Camp, Beast, March, Attack, Garrison, Collect, with disabled reasons.
- Sheets:
  - Attack and duel result info modals.
  - Lobby (players: Challenge / Cancel / Busy).
  - Boss and lair info (Raid it / Attack).
- Coach marks (7 steps); challenge popup (duelInvites: Decline / Fight).
- Gestures: tap a hex, pan, pinch, wheel.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| WAR-1 | **Resource chips truncate the numbers.** War gold shows "1…." at 390, and at **320x640 every chip shows "…"** *(seen online-map-390x844, online-map-320x640)*. The player cannot see any War resource on a small phone. | blocker | Compact number format (1.2K) plus icon-only chips, in 2 rows if needed; never ellipsize a number (G14). |
| WAR-2 | Round-button labels are white Cinzel at about 9 CSS px over light terrain (illegible); they drop entirely at 320; the region plate "Cavarian Meadows" is white on pale *(seen)*. | major | A stone rail with labelled keys, like the Camp rail fixed; region plates in ink on parchment. |
| WAR-3 | A white fog band washes out the top of the map; the map reads pale and low-contrast *(seen)*. | minor | Tone the fog and day tint. |
| WAR-4 | The floating Collect sits over the map and **overlaps the region plate** when the hex panel is open *(seen online-hex-neutral)*. | minor | Collect lives in the situation strip, or in the panel only. |
| WAR-5 | Unavailable state: an empty situation band is left blank above the card; "Back to menu" is the primary while the tab bar already offers Campaign *(seen online)*. | minor | Hide the HUD band; primary "Open in Telegram" when outside it. |
| WAR-6 | The coach card covers the Clan and Lobby round buttons *(seen online-coach-home)*. | minor | Place the coach card opposite the rail. |
| WAR-7 | Boss info is dense: the leaderboard is plain text lines with " - " separators; "Howit fights"; RAID IT is disabled with no reason visible *(seen online-boss-info)*. | major | A table with clan chips; the reason under the button. |
| WAR-8 | The lobby lists names only (no level or crest); CLOSE only, no ✕ (G5) *(seen)*. | minor | Add a crest and level. |
| WAR-9 | Attack/duel result modals are centred text lines with no icons or hierarchy *(seen online-result)*. | minor | Reuse the Results tile language. |
| WAR-10 | Dead code: `openCampPanel` / `campPanel.ts` is unreachable *(code OnlineScene.ts:855)*. | minor | Note only. |

### 18. OnlineArmyScene (War army and garrison picker)

Shots: `online-army-{w}`, `online-army-320x640`, `online-army-recruit-{w}`.

**(a) Inventory**
- Sub-shell "Online army" / "Garrison" with back → Online.
- Chips: war gold, food, energy.
- Hero head: stage, name, stars, class, Lv, Power, status pill, group I-IV, gear slots.
- Garrison head and pick mode.
- Tabs: Roster | Stash.
- Roster rows (portrait, group, power, name, Lv class or status, stars).
- Stash grid → item card (Market / Salvage, Equip).
- Footer: Recruit (primary) → recruit sheet (Hire, class card), Market → Market, Shop → Shop, Map (icon) → Online; in garrison mode, Station.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| OAR-1 | **At 320x640 group button IV and its label are outside the canvas** (layout-check violation), and the name truncates to "Epam…" *(run, seen online-army-320x640)*. | major | Group buttons on their own row (as Army compact does). |
| OAR-2 | The 4th footer button (Map/back) is **an empty bronze square**: the icon doesn't render or is invisible *(seen)*. The footer labels shrink inconsistently ("RECRUIT"/"MARKET" small, "SHOP" big; at 320 "Recr…", "Mar…"). | major | Drop the map button (back exists); 3 equal labels at a fixed size. |
| OAR-3 | The food chip uses a **heart** icon *(seen)*. | minor | The food (wheat) icon used everywhere else. |
| OAR-4 | The status "Holds {hex}" is red for a normal state; the Lv pill is red (Army's is bronze); "Hoplt/Pelt" abbreviations (G3) *(seen)*. | minor | Ink or teal status; a bronze Lv pill. |
| OAR-5 | Garrison mode tests `if (this.garrisonHex)` (falsy for hex 0) in 6 places, but `!== null` elsewhere *(code OnlineArmyScene.ts:169, 279, 293, 323, 350, 363)*. Hex id 0 would show the normal roster instead of the picker. | minor | Use `!== null` consistently (note for engineering). |

### 19. ClanScene (`OnlineClan`)

Shots: `online-clan-{w}`, `online-clan-none-{w}`, `online-clan-manage-{w}`.

**(a) Inventory**
- Sub-shell "Clan" with back → Online.
- States: loading / offline / error.
- No clan: info card and "Found a clan" → HTML prompt (name, tag).
- Clan: header "[TAG] Name", "n/30 men - r regions - role"; member rows → manage (Make officer, Demote, Hand over lead, Kick, Close).
- Footer: Invite (→ share sheet or copied link; code, 7 days) and Leave (confirm).
- Join offer popup. Flash messages.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| CLN-1 | **Not localized at all** (G12); raw lowercase roles "leader/officer/member"; " - " separators *(code, seen)*. | major | i18n; role chips. |
| CLN-2 | The clan header is styled like a member row: no crest, banner or stats hierarchy; about 65% of the page is empty *(seen)*. | major | A clan banner card (the shop's Clan flags cosmetic, region count, rank), then the members. |
| CLN-3 | Invite is disabled with no reason *(code)*. The HTML prompt's buttons are about 36-40 CSS px high and use English defaults *(code textInput.ts)*. | minor | A reason line; 44 px buttons; localized. |
| CLN-4 | The no-clan state is text plus one button in a 116 px card on an empty page *(seen online-clan-none)*. | minor | Art plus "how clans work" in 3 icon bullets. |

### 20. MerchantScene (map merchants)

Shots: `merchant-town-{w}`, `merchant-buy-{w}`.

**(a) Inventory**
- Sub-shell "Merchant / Crossroads / Harbour" with back → Online.
- Chips: war gold, Drachmae.
- Info card: kind and goods, in reach ✓/✗, discount or holder, restock timer.
- Sections: Supplies and basic gear, regional goods, Rare today.
- Offer rows: icon (→ item card), name, "Today n/cap", description, buy with gold (bronze) and Drachmae (blue), each with a disabled reason → buy confirm.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| MER-1 | The discount "(-10%)" is repeated on every button and crowds the price; descriptions truncate *(seen)*. | minor | Show the discount once in the info card and strike through the list price. |
| MER-2 | Capped rows are grey with no reason line visible *(seen War horn row)*. | minor | "Daily limit reached" under the row. |
| MER-3 | The Merchant is a 4th "shop" surface with its own layout (NAV D2). | minor | See NAV. |

### 21. DuelScene: the Duels hub (Ladder, Arena, Team, Shop, boards, search)

Shots: `duel-closed-{w}`, `duel-ladder-{w}`, `duel-ladder-320x640`, `duel-ranked-{w}`, `duel-ranked-320x640`, `duel-ranked-locked-{w}`, `duel-floor-{w}`, `duel-team-{w}`, `duel-shop-gear-{w}`, `duel-raid-{w}`, `duel-searching-{w}`, `duel-found-{w}`, `duel-hero-{w}`, `duel-board-legend-{w}`, `duel-chest-item-{w}`, `duel-season-reward-{w}`.

**(a) Inventory**
- States: loading skeleton / outside / offline / closed / error, plus Retry.
- Hub top:
  - "Duels", a Demo note.
  - Glory chip, Lv chip → level sheet, Team ("!") and Shop buttons, fresco.
  - Ladder | Arena switch.
- Ladder:
  - Tip; next-floor card → floor sheet (wells: your team / enemy / allowed, stars rule, enemy list, Fight/Farm).
  - Farm-Glory bar.
  - 5 chapters (toggle, stars, 3 chests → claim or preview, floor tiles).
  - CTA "Fight floor n".
- Arena:
  - Season line.
  - Live PvP card (standing, won/lost, rule, Find match / Rejoin, Unranked, Top → board).
  - Locked card (ranked).
  - Raids card (standing, raids left, defence row → defence sheet, Raid → raid picks, Log → raid log, Top).
- Raid picks: candidates and "Raid {name}".
- Boards: Live / Legend / Raids, pinned "You" row.
- Search: rings, timer, range bar, team card, Cancel.
- Found: crests, "vs", Preparing.
- Season rewards → choose a piece.
- Team:
  - Roster card, Symbols legend, preset chips (+), rename/duplicate/delete, Use for Ladder/Arena/Defence, points bar.
  - Hero rows (→ Hero; bench toggle); Recruit sheet.
- Shop: Today / Gear / Sell, slot filter, Compare-with sheet, offer cards (Buy), Sell grid.

**(b-d)**

| ID | Issue | Sev | Fix |
| --- | --- | --- | --- |
| DUE-1 | **Ladder: the fixed "FIGHT FLOOR 5" CTA covers the floor-tile row**: floors 1-5 are cut in half, and the locked floors and Chapter 2 are not visible at all. At 320 the whole chapter grid is gone below the CTA *(seen duel-ladder-390x844, -320x640)*. Mockup A2 shows two full rows plus Chapter 2 above the CTA. | major | Match A2: chips, Team and Shop in **one** row; the banner shrinks; the CTA sits in the flow, or the content gets bottom padding equal to the CTA. |
| DUE-2 | **The leaderboard title says "LIVE LEADERBOARD" while the "LEGEND" segment is selected** *(seen duel-board-legend)*. | major | The title follows the board, or becomes "Leaderboard" with the segment as the only state. |
| DUE-3 | Leaderboard: the 3rd medal is terracotta red; the season line is truncated; every crest is identical; no pinned "You" row is visible; about 50% empty *(seen)*. | minor | A bronze medal; wrap the season line; show the player's crest; pin "You". |
| DUE-4 | Header chips are dark stone bars, not A2's parchment chips; Team/Shop take a second full row *(seen vs A2)*. | minor | Follow A2. |
| DUE-5 | Team: 6 control rows before the first hero; rename/copy/delete are icon-only, and delete is an unclear grey jar; **the active "DEFENCE" use button is grey** (looks disabled); the RECRUIT CTA overlaps the 5th row *(seen duel-team)*. | major | Fold preset management into a sheet behind the preset chip; label the icon buttons; the selected use gets ✓ plus bronze-lit; G9. |
| DUE-6 | Search shows a back arrow, but Back is refused ("Cancel the search first"), which is a false affordance. The arena icon is a blurry upscaled raster *(seen duel-searching)*. | minor | Hide the back arrow while searching; a crisp icon. |
| DUE-7 | Arena: the season line has a grey placeholder disc icon; the Raids card is cut by the frame with no scroll cue *(seen duel-ranked)*. | minor | A season icon; G9. |
| DUE-8 | Duels "Shop" (top bar "SHOP") collides with the Shop hub tab; the Team ↔ Shop buttons cross-link in a loop *(seen)*. | minor | Rename it "Armoury" / "Glory shop" (NAV D2). |
| DUE-9 | The outside-Telegram state is honest but has no action (no link to the bot); about 70% empty *(seen duel-closed)*. | minor | An "Open in Telegram" button. |
| DUE-10 | Season rewards: the key line "+ a Sacred Band of Thebes piece of yo…" is truncated *(seen duel-season-reward)*. | minor | G14. |
| DUE-11 | The chest-reward sheet puts a low-res pixel chest inside a painted modal (G8) *(seen duel-chest-item)*. | minor | G8. |
| DUE-12 | The floor sheet uses blue role pills (G4) and leaves part of the tab bar peeking under it *(seen duel-floor)*. | minor | G4; the sheet covers the full width down to the bottom. |
| DUE-13 | `openDismiss` is never called. Dismiss lives only in the Hero footer, while the roster-full reason says "dismiss someone first" with no path from Team *(code DuelScene.ts:2444)*. | minor | A Dismiss entry on the bench rows, or point the reason at the Hero sheet. |

---

## Cross-cutting summary

1. **The v4 shell is right; the content inside it is not finished.** The hubs follow A1-A3 closely: frame, tab bar, parchment, terracotta primary. Three problems undo it:
   - a global type bug (G1);
   - colour roles broken against the spec's own rules (G2 grey, G3 red, G4 blue);
   - two chrome families still alive: World, Camp, the Battle HUD and the encounter dialog (G7).
2. **Art is the biggest quality gap.** Pixel sprites are upscaled into painted frames everywhere a portrait or vignette should be (G8): settlement banners, recruit portraits, the MVP portrait, Hero and recruit niches, chests, laurels. The painted hub assets are placeholders cropped from the mockup.
3. **Space management fails on real phones.** Fixed heads plus fixed CTAs leave slivers (G9). Truncation hides key facts (G14). 320 loses whole sections:
   - the hub tiles;
   - the duel chapters;
   - every War resource number.
4. **Navigation duplicates and dead-ends** (see NAV.md):
   - 5 "shop" surfaces and 3-5 stash grids;
   - Codex vs BeastTrial;
   - Market reachable only via War › Army;
   - beast fights that strand you in the campaign;
   - an Army back button that lies about its target.
5. **Accessibility is NOT ASSESSED against a committed tier.** Against the assumed Standard tier there are several gaps: text down to 8 CSS px (G10); colour-only state (G13); long-press-only info (G15); red text on dark or pink (WLD-3, CMP-3); and about 30 English-only strings, plus the whole Clan screen (G12).

### Counts

- 20 scenes registered in `main.ts`. 21 sections above (the tutorial overlay is split out). BaseScene is the abstract base.
- 150 states staged; 209 shots saved.
- **143 issues: 1 blocker, 58 major, 84 minor.** That is 16 global (G1-G16) and 127 scene-specific.

## Top 15 (ranked by player impact × reach)

| # | ID | Issue | Sev |
| --- | --- | --- | --- |
| 1 | WAR-1 | War resource chips truncate to "…" (all of them at 320; war gold at 390). | blocker |
| 2 | G1 | Cinzel spacing breaks words and swallows spaces on every screen. | major |
| 3 | G2 | Grey used for live buttons (Close, Flee, Dismiss, Settings Open, the active Defence…). They read as disabled. | major |
| 4 | DUE-1 | The Duels ladder's floor grid is hidden under the fixed CTA (gone at 320); drift from A2. | major |
| 5 | G8 / RES-1 / SET-1 | Upscaled pixel art in painted frames: the headless MVP portrait, blurry settlement banners, blocky recruit portraits. | major |
| 6 | G7 / WLD-2 | Legacy dark encounter dialog and dark map/battle chrome. At 320 the enemy sprite covers the band name. | major |
| 7 | G9 / HRO-1 / ARM-3 | Fixed heads leave about 4 rows of content in Hero and Army, with no scroll cue. | major |
| 8 | MENU-1 | The Campaign hub at 320x640 pushes Army/Stash/Camp below the fold. | major |
| 9 | BTL-1 | The Paused hint pill covers the boss HP bar in beast battles. | major |
| 10 | SHP-1 | The Pass opens scrolled past its season card and the Unlock/Claim-all CTAs. | major |
| 11 | DUE-2 | The leaderboard title says "Live" while Legend is selected. | major |
| 12 | ARM-1 | Army's back button says "Map" but goes to the Menu. | major |
| 13 | G3 | Red used for names, group I, headers, the Paused state and the 3rd medal. Alerts lose their meaning. | major |
| 14 | MKT-4 / SHP-6 | 5 "shop" surfaces; the player market is reachable only through War › Army. | major |
| 15 | FR-1 / FR-3 | The first screen is 60% blank, and the "Two ways to fight" mode pitch conflicts with the three-mode tab bar. | major |

## Open questions (for the Director and the owner)

1. Should Codex absorb BeastTrial (CDX-1, TRL-1)? I recommend yes.
2. Should 320x640 join the CI layout matrix (G16)? I recommend yes. 320x568 alone missed 9 violations.
3. Which accessibility tier will we commit to? Standard was assumed here.
4. Should BTL-2 (the black square on the beast field) be confirmed by the play audit (audit-play) in a live beast fight?
