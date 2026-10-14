# Pixelarrow: UI redesign prompt for Claude Design

> Paste everything below the line into Claude Design. Attach the current screenshots from
> `docs/redesign/current/*.png` and `docs/screenshots/*.png` as "before" references (to show what
> the screens contain and what to move away from, **not** as style references).

---

## 1. Who you are and what we're building

You are a senior mobile product designer. Redesign the complete UI of **Pixelarrow**, a mobile
pixel-art **formation tactics game** set in the ancient Mediterranean (Greek hoplites, javelins,
shield walls, morale that breaks). It runs as a **Telegram Mini App** (it also works in a plain
mobile browser).

- **Canvas:** portrait phone, design at **390×844**. Every layout must also work at **360×780** and stay
  usable at **320×640 / 320×568**.
- **Telegram context:** Telegram draws its own header at the top (with Close / ⋯) and gives us a
  system **BackButton**. Respect top and bottom safe areas. Nothing interactive in the outer 8 pt.
- **Languages:** English and Russian. Russian runs **~30–40% longer**, so every label, button and
  chip must fit RU without ellipsis. Show at least 3 key screens in RU.
- **Theme:** light only.
- **Players:** casual Telegram users first, strategy fans second. A newcomer must understand any screen
  in 3 seconds; the depth (stats, perks, formations) reveals itself as they go deeper.

## 2. The problem with the current design

The current UI (see the attached screenshots) is "dark carved stone + parchment": brown-on-brown,
a bevelled bordered box around every single element, 5–8 equally loud buttons per screen. Players
say it feels **bulky and depressing**, and the battle screen feels like **flying a plane, not using
a mobile app**.

Specifically, move away from:
- dark brown and olive backgrounds, muddy low-contrast palettes;
- frames, bevels, gold rims and borders around every card, button and chip;
- walls of same-weight buttons (cockpit feel), dense HUD bars;
- ornate serif type on buttons and body text.

## 3. Design direction: "Sunny Mediterranean"

Bright, airy, warm and friendly, like a Greek island on a summer morning: whitewashed walls, deep
Aegean blue, terracotta roofs, olive leaves, sun-bleached sand. Calm and modern, the way a
well-made app feels, with the antiquity theme carried by colour, illustration and small motifs
rather than heavy ornament.

**Starting palette (refine it and define it as tokens):**

| Role | Suggestion | Use |
| --- | --- | --- |
| Background | warm white `#FBF8F3` | page background |
| Surface | white `#FFFFFF` | cards, sheets |
| Surface alt | sand `#F3ECE1` | grouped sections, inputs, inactive segments |
| Ink | deep navy `#1E2A3A` | primary text (not pure black) |
| Ink secondary | `#5E6B7A` | secondary text, captions |
| Primary | Aegean blue `#1F6FD1` | the main action on a screen, selection, links |
| Accent | terracotta `#E06A43` | highlights, badges, "new"/attention, hero moments |
| Success | olive `#6E9A45` | ready, claimable, victory, healthy |
| Reward / currency | sun gold `#E8B23A` | gold, glory, stars, rewards |
| Danger | coral red `#D9483B` | errors, losses, destructive actions, alerts only |
| Hairline | `#E7E0D5` | dividers (use rarely) |

Rules:
- **Grouping by space, not by borders.** White cards on a warm-white page with a soft shadow
  (or none), 16–20 px radius, generous padding. Dividers only inside lists. No bevels, no rims, no
  9-slice frames, no textures behind text.
- **Visual hierarchy per screen:** one clearly primary action (filled blue), secondary actions as
  tinted/outlined buttons, tertiary as text buttons or icons. You may use progressive disclosure
  (⋯ menus, sheets, "more" rows) wherever it makes a screen calmer; **never remove a feature**.
- **Typography:** your choice. It must be friendly, very readable at small sizes, have tabular
  numerals, and support **Cyrillic**. You may use one Greek-flavoured display face for big titles
  only, if it stays light and legible. No serif body text, no all-caps paragraphs.
- **Iconography:** one consistent rounded icon set (2 px stroke or soft filled), friendly, not
  cartoonish. Icons always have a text label on first-level actions.
- **Theme motifs:** sparing. A thin meander line, an olive sprig, a laurel on a victory, a
  sun/sea illustration in headers. Decoration never competes with content.
- **The game world stays pixel art.** Battlefield, world map, war hex map, camp, soldier sprites
  and portraits are pixel art and are **not** redesigned. Design the UI around them: pixel art is
  shown at integer scale inside clean rounded containers, and the UI around it is crisp vector.
  On top of the pixel-art field, overlays need a light backing plate or outline so they stay readable
  on grass, sand, water and forest.
- **Colour is never the only signal:** rarity also has a letter/gem, threat an icon, selection a ✓ or
  ring, the 4 battle groups a numeral (I–IV) as well as a colour.
- **Real money** (Telegram Stars purchases) must be unmistakable: Telegram Star icon, explicit price
  in Stars, a confirmation step. Never pay-to-win imagery.
- **Accessibility:** 4.5:1 text contrast, 3:1 UI contrast, every touch target ≥ 44×44 pt with
  ≥ 8 pt gaps, meaningful text ≥ 13 px, numbers never truncated (use compact "12.4K"). Long-press is
  never the only way to get information. Motion respects a Reduce-motion setting.
- **Rarity scale** for items: Common (grey), Uncommon (olive), Rare (blue), Epic (violet), Legendary
  (gold), each with a letter gem.

## 4. Navigation: please propose two options

The game has **three modes**: **Campaign** (single player), **Duels** (PvP ladder and arena) and
**War** (seasonal online map with clans). **Codex** (beast and enemy encyclopedia) and **Shop**
(cosmetics, Season Pass, wallet, player market) are **features of War** and live inside it; they
are not top-level destinations. The current 5-tab global bottom bar (Campaign · Duels · War · Codex ·
Shop) should go away.

Propose **two navigation models**, show the Home and one inner screen of each mode for both, and
recommend one. Ideas to consider (not mandatory): a bright Home with three big illustrated mode
cards plus mode-specific navigation inside each mode; a minimal 3-item bottom bar; a swipeable mode
carousel.

Constraints for any option:
- From Home, a mode's main action is at most **2 taps** away (Continue the march, Fight floor n /
  Find match, Collect / Attack in War).
- War needs quick access to its own areas: Map, Army, Clan, Codex, Shop (Shop has Shop · Pass ·
  Wallet), plus Market.
- **Settings** is reachable from every top-level screen (gear icon) and from the battle menu.
- Back behaviour: the Telegram BackButton and the on-screen back arrow always do the same thing;
  a sub-screen returns to the screen that opened it; mode roots have no back arrow.
- Sheets: at most one bottom sheet plus one confirm dialog on screen at once; deeper content opens
  as a page inside the sheet (with a back chevron), never a second stacked sheet.

## 5. Deliverables (in this order)

1. **Design system:** colour tokens, type scale, spacing scale, radius, elevation, iconography and
   components with all their states (default, pressed, disabled with a reason, loading, selected):
   buttons (primary/secondary/tertiary/destructive), icon buttons, chips (resource, status, filter),
   badges (count), segmented control, tabs, list rows, cards, hero row, item cell (rarity), stat
   stepper, progress bars (XP, health, morale), bottom sheet, confirm dialog, toast (with Undo),
   banner, empty state, skeleton, top bar, mode navigation, Telegram-safe layout grid.
2. **Navigation proposals** (two, see §4) with a recommendation.
3. **Every screen and sheet in §6** as 390×844 mockups, in the recommended navigation.
4. **Key states** for every screen: loading (skeleton), empty (with a next action), error (one line +
   Retry), offline, "outside Telegram" (online modes: "Open in Telegram"), locked/disabled (always
   with a one-line reason), and a 320×568 check of the densest screens.
5. **Clickable prototype** linking the flows in §7.

Use real, plausible game text everywhere (names like Epameinon, Simonides, Doros; places like
Rhegion, Kroton; beasts like Lernaean Hydra, Chimera, Cyclops). No lorem ipsum. Don't invent
features that aren't described here (for example, there are **no quests and no daily missions**).

## 6. Every screen, with its content and functionality

Notation: **Primary** = the one main action of the screen. Everything listed must stay reachable,
but you decide how prominent it is and whether it sits behind a ⋯, a sheet or a tab.

### 6.0 Global

**Boot / loading.** Logo, a short localized status line ("Mustering the hoplites…"), progress bar.
Error state: "Couldn't load" + Retry. Auto-routes in under 1 s (to first run, a live duel to rejoin,
a deep link, or Home).

**First run (onboarding), 4 steps.**
- *Offer:* the narrator Nikias (old strategos portrait) welcomes the player in a speech card over a
  key-art illustration. Primary: **Tutorial (recommended)**. "Skip" as a quiet text link under it
  (skip asks for confirmation).
- *Resume:* the same, with **Resume tutorial** if it was interrupted.
- *Reward:* after the tutorial battle: gold count-up and a reward item card. Primary: **Continue**.
- *Three ways to fight:* three mode cards with a one-line pitch each: Campaign, Duels, War.
  Tapping one enters that mode.

**Home / mode selection** (depends on your navigation proposal). Must show at a glance, for each
mode, why to go there now: Campaign (day n, gold, men, "2 heroes have points to spend"), Duels
(Glory, next floor, chest ready), War (income waiting to collect, challenges in the Lobby, season
time left). Also the "First steps · 2 of 4" onboarding progress card until it's done (4-segment bar
+ next step).

**Settings (bottom sheet, from every top-level screen and from the battle menu).** Sections:
- Audio: Sound on/off; Music and Effects volume 0–10.
- Language: Auto / English / Русский.
- Battle: Damage numbers on/off; auto-pause on first contact / when flanked / when a group routs /
  on hero death.
- Accessibility: Reduce motion, Reduce shake, Reduce flash, Haptic feedback, Left-hand mode.
- Account & help: Tutorial (Replay / Resume), Notifications (opens a page with 9 notification
  toggles and a note when the Telegram bot is blocked), About (opens a page with purchase note,
  Terms, Privacy, Refund links), Usage statistics toggle, cloud-sync status, **New campaign** (a
  destructive action: confirm dialog listing what is lost and what is kept).

**Shared sheets used across modes** (design once, reuse):
- *Item card / compare:* item art, name in rarity colour + gem, slot, stats, condition bar, a
  verdict line first ("Better: +34 power" / "Worse: −12 power") with ± deltas against the equipped
  item, requirement warning, actions depending on context: Equip, Take off, Repair, Sell (in town),
  Scrap (in camp), Salvage / Sell on Market (War).
- *Recruit card:* sprite, name, level, class, role, trait, price; Hire. Hiring shows a 4-second
  **Undo** toast instead of a confirm.
- *Confirm dialog:* for destructive or costly actions (dismiss a hero, retreat, buy, sell, new
  campaign). Cancel is always the safe default; the destructive button uses the danger style and is
  never next to the primary.
- *Toasts* (with optional Undo), *banners* (6 s, top), *coach marks* (first-visit tips with a
  spotlight).

### 6.1 Campaign mode

**Campaign hub (the campaign's root).** "How does my company stand, and get back on the march in
one tap."
- Profile: leader portrait, "Strategos {name}", status line "Day 14 · in Rhegion · Lairs 2/6"
  (plus hurt men), Gold, Trophies (battles won), Warband (n men).
- An illustrated banner of the campaign (tap = continue).
- **Primary: Continue the march** (opens the world map, or the town if the company is inside
  one). With no save: "Begin the march".
- Shortcuts: **Army** (count badge = heroes with unspent points), **Stash** (opens Army on its Stash
  tab), **Camp** (enabled only when a camp is pitched; otherwise disabled with "Pitch camp on the
  map").
- States: no save (Army/Stash disabled "Begin the march first"); campaign won ("The Tyrant is
  beaten"); sync failed (small error chip that opens Settings); "A newer save from another device was
  loaded (day n)" notice sheet.

**World map** (pixel-art map; design only the UI around it). "Where do I go next, and is it a fight
I can win?"
- Top: back, "Day 14 · Ionian coast", **Lairs 2/6** chip (opens the Arc sheet), settings.
- Situation line: time of day, region, danger level (icon), "next: Rhegion".
- Resource chips in a fixed order: gold, men fit/total, food (days left), supplies.
- Map overlays: settlement labels, enemy band labels (men count + threat icon), lair garrison labels,
  burnt lairs, the enemy host's banner and dotted march line, the route to the target, "next town"
  marker at the fog edge. Follow-party toggle and a zoom button (single-tap alternative to pinch).
- Interactions: tap land to march, tap a band to pursue it, tap a town to march/enter, tap a lair to
  open the Assault sheet; pan, pinch.
- Bottom actions: **Camp** (pitch / open), **Stop / Rest** (pause the march), **Party** (→ Army,
  count badge). Marching is done by tapping the map, so there is no "march" button.
- Banners: band spotted, town found, ransom paid, "No way there", host marches on a town.
- 2 coach marks on the first visit.
- Sheets:
  - **Encounter (decision sheet, map paused):** band name and art, threat + men count,
    culture/level, mood, comparison with your army, advice; enemy **doctrine** row (icon, name,
    one-line tell, (i) opens the full doctrine text inside the sheet) and enemy **captain** row
    (name, level, crest). Actions: **Attack** (primary), Take ransom, Let them go / Flee (n% chance).
    Back = "Let them go"; if the band hunts you, Back shakes and highlights Flee ("They won't let you
    go").
  - **Assault (lair):** garrison art, size, power comparison, threat, doctrine row, captain row,
    reward chest. **Assault** (primary) / Leave; closable.
  - **Event card (decision, map paused):** vignette illustration, title, story text ≤ 280 chars,
    2–3 choices with cost chips (icon + number), exactly one choice is free. Cannot be dismissed; a
    costly choice asks "Choose: {label}?".
  - **Arc sheet** with two tabs: *Lairs* (each lair: name, state standing n men / fallen ✓ / reborn;
    tap = centre the map on it) and *Journal* (last 20 story lines).
  - **Strike camp** confirm.

**Field camp** (pixel-art camp scene). "Rest, build, prepare the men."
- Title "Field camp · Day n hh:00"; chips gold, food, supplies, men.
- Build drawer: 5 structures, each with name, cost, build time, how many, and a reason when
  disabled. Placing a structure: ghost on the map with valid ✓ / invalid ✗, Cancel / Place.
- Actions: **End day** (primary), Muster (assign men to Formation vs Reserve, by class, with
  steppers), Loot (→ Army › Stash), Temper (forge: improve an item, shows cost in each currency),
  Strike camp (confirm, kept well away from End day).
- End day can trigger an encounter (→ World) or a night event card.

**Settlement** (village or town). "Hire, resupply, heal, sell, retrain."
- Header: illustrated vignette by culture, "Town of the Bruttians", chips gold, men n/20, hurt.
- Tabs: towns **Hire · Buy · Sell · Services**; villages **Hire · Rest**.
  - *Hire:* recruit rows (portrait → recruit card, name · level, class, role, trait, price); marked
    "Volunteer" rows (cheap recruits when the army is small); footer "New volunteers in nh"; empty
    state.
  - *Buy:* item rows (icon → item card, name in rarity colour + gem, slot, stats, price); sold out.
  - *Sell:* stash grid with the sell price on each item → item card → sell confirm.
  - *Services / Rest:* wounded list with heal times, rate note, provisions, Buy Food +10, Buy
    Supplies +10, **Rest 8 hours** (primary), Physician: heal all; **Drillmaster** (towns only):
    "Retrain a perk · 40 g × tier" → pick a hero → Hero › Perks in retrain mode.
- Actions: Army, Leave (→ World).
- States: sacked by the enemy host (Hire/Buy show "Reopens in n days", Services stays), no
  volunteers, all fit, arrival event card.

**Army** (shared template: also used for the War army and the Duels team). "Who is in my company,
how are they grouped and equipped?"
- Status sentence ("Epameinon and 8 more have points to spend · 1 hurt") and chips men / hurt / gold.
- Selected hero card: pixel portrait, name, stars (1–5), class ("Spartan hoplite"), level, role
  (heavy infantry…), Power, **battle group I–IV** selector, 5 gear slots + mount. Collapses to one
  line when scrolling.
- Tabs **Roster n/20 · Stash n**.
  - *Roster:* filter + sort; hero rows (portrait, group numeral in group colour, power, name, points
    badge, level + class or "Wounded 20h", stars). First tap selects, second opens Hero.
  - *Stash:* slot filters (6), rarity filter, sort; item grid (rarity + gem, condition bar, "upgrade"
    arrow when better than equipped). Tap item → item card; equip by drag to a slot **or** tap item
    then tap slot.
- Actions: **Open hero** (primary), Dismiss (confirm; blocked on the last fit hero with a reason).
- Pick mode (from the Drillmaster): "Retrain whom?".
- Empty: "Volunteers wait in {town}".

**Hero.** "Grow this man: stats, gear, perks, abilities."
- Pager ‹ 3/9 › (also swipe), Power, large pixel sprite, level, stars, class, role, traits, XP bar
  ("0/240 XP to level 7"), wounded line, 5 gear slots + mount.
- Tabs with badges **Stats · Gear · Perks · Skills**:
  - *Stats:* free points; STR / AGI / END / WIL with a one-line meaning and − / + steppers; derived
    stats with a preview of the change; battle record; traits; Respec (duel heroes).
  - *Gear:* stash grid in equip context.
  - *Perks:* tiers as rows of **two choice cards (A or B)**; a free point highlights both; tap opens a
    sheet with details and "Take {name}?"; taken card ✓ "Taken", the other "Not taken". Retrain mode
    (from the Drillmaster or a free retrain): cost 40 g × tier, confirm.
  - *Skills:* the hero's signature active ability, auras, the standard (if he carries it),
    cooldowns; empty → go to Perks.
- Actions: when points are pending: **Confirm n** (primary) + Undo; Dismiss for duel heroes.

**Results** (after every battle in every mode). "Did we win, why, who did well, what do I take?"
- Outcome header: **Victory / Defeat / Stalemate / Retreat** (laurels and a light celebration on a
  victory, sober on a defeat), "vs Bandits of Kroton", "verified" for online fights.
- **Why line** (always on defeat, also on victory): one plain sentence, ≤ 2 lines, e.g. "Their
  cavalry hit your flank at 0:42."
- Tabs **Summary · Heroes · Spoils**:
  - *Summary:* tiles Time, Kills, Losses, Gold (or Glory), XP (tap = explanation); MVP card
    (portrait, name, class, kills); level-ups and promotions; report notes as chips; bounty line
    ("Captain captured: +n g").
  - *Heroes:* each hero: portrait, name, level, XP bar with +XP, status (wounded, fallen).
  - *Spoils:* "Pick 2 of 3": face-down cards that flip to reveal rarity, name and condition;
    tap → inspect with compare, Take / Put back. "Lair hoard" header for lair rewards.
- Primary changes with progress: **See spoils → / Take spoils 2/3 / Onward** (returns to where the
  battle started: World, Codex, Duels, War). Back with unseen spoils opens Spoils first.
- Variants: practice fight ("No spoils in practice", no Spoils tab); online verifying ("Verifying…",
  or "Couldn't verify: rewards will arrive later"); **Campaign won** full-screen variant (roll of
  surviving heroes by name, then a reveal, "Continue the campaign").

### 6.2 Battle (all modes): please design two HUD concepts

The battle is real-time with pause (offline modes). The pixel-art battlefield must get as much of
the screen as possible (target: chrome ≤ 25–30% of the height at 390×844). Players control up to
**4 groups** (I–IV), each a formation of men. The main gesture is **dragging a group to move it**
(with a ghost preview of the new position and facing); tap-to-move also works.

Deliver **two different HUD concepts** (for example: A, "contextual" where orders appear only when
a group is selected, as a compact pill/radial near the thumb; B, a "slim fixed bar" with one row of
icon orders and compact group chips) and recommend one. Each concept must cover:

- **Top info:** battle clock (or deployment countdown 0:20), strength comparison "You 54% vs 46% Foe"
  with a split bar, **Pause/Play** and **speed** (0.5× / 1× / 2× / 3×; hidden in live online
  fights), a **⋯ battle menu** (Settings, Retreat; in deployment: Leave, Reset all; in the tutorial:
  Skip tutorial; online live: Retreat and Sound only).
- **Contextual top items:** enemy doctrine chip (icon + name; tap = how they fight and how to
  counter), ladder ticket timer (last 5 min), boss health bar (beast battles), zoom button, follow
  camera toggle.
- **Groups:** for each group: numeral + group colour, leader portrait, group name ("Phalanx",
  "Skirmish"), men count, **health** and **morale** bars, state ("Holding", "→ Charge", "Out of
  range", "Flanked!"), a standard-bearer marker. Selected group clearly highlighted.
- **Orders for the selected group:** Advance, Charge, Hold, Shoot (Loose/Throw), Withdraw (or Feint
  with a cooldown for eligible groups); Formation/shape.
- **Abilities:** up to 3 round ability buttons + "more", with cooldown sweep and use pips.
- **Short-lived chips:** Undo (3 s after an order), "Then…" (queue the next order on arrival),
  "Advance to range" when a missile group is out of range, "Clear plan" when paused.
- **On-field overlays** (drawn over pixel art, must stay readable): group badges (numeral + morale
  glyph: shield / cracked shield / fleeing flag), flank-threat arcs, range ring, move/charge
  previews and ghosts, off-screen group pointers at the screen edge, facing direction pips.
- **Banners** (one at a time, top centre, 6 s): contact, flanked, group routs, standard lost, army
  breaks, victory. **Paused** pill with the auto-pause reason.
- **Selected soldier** mini panel: HP / morale / stamina + Alone / Rejoin.
- **Phases/states to mock:** Deployment (shape/formation, **Works**: a tray of 3 field fortifications
  with cost and how many remain, placed by drag or tap-cell + ✓; Groups assignment sheet; Undo;
  **FIGHT!**), Live fight, Paused/planning (queued orders drawn as dashed ghosts with ✕), live online
  fight (no pause, no speed, "Reconnecting…" banner), beast battle (boss bar), tutorial overlay
  (narrator bubble, spotlight, ghost hand), and the 320×568 layout. Left-hand mode mirrors the
  thumb controls.

### 6.3 Duels mode

**Duels hub: Ladder · Arena.** "Can I climb today?"
- Header: Glory (currency) chip, duel level chip (→ level sheet), **Team** (badge when something
  needs attention) and **Armoury** buttons. Small illustration.
- Segmented: **Ladder | Arena**.
- *Ladder:* tip ("Chest ready to claim"); next-floor card (team points vs the floor's cap → Floor
  sheet: enemy list, star rules, "Pausable", Fight / Farm Glory); Farm-Glory progress; 5 chapters
  (collapsible, stars earned, 3 chests each → claim or preview contents, 5 floor tiles with stars,
  "next ▸" / "cleared ✓", locked chapters). **Primary: Fight floor n.**
- *Arena:* season line + time left; **Live PvP** card (rank, won/lost, rules, **Find match** or
  Rejoin, Unranked option, Top → leaderboard); locked Ranked card with its unlock condition; **Raids**
  (async PvP) card (standing, raids left today, your defence → Defence sheet, Raid → raid picks, Log
  → raid log, Top); season rewards (choose a piece).
- Sheets: Level, Floor, Chest preview / chest reward, Defence, Raid log, Season reward.
- States: loading, offline, closed, error, outside Telegram ("Open in Telegram"), demo note.

**Team.** "Who fights, in which preset." Preset chips (+ new); the active preset opens a sheet with
rename / duplicate / delete and **Use for Ladder / Arena / Defence**; team points bar vs cap; hero rows
(Army row template → Hero, duel source), bench toggle, Dismiss on bench heroes (confirm); symbols
legend behind (i). **Primary: Recruit** (recruit sheet, Undo toast; disabled with "Dismiss someone
first" when full).

**Armoury** (spend Glory on gear). Tabs **Today · Gear · Sell**; slot filter; offer cards (item,
rarity, stats, price in Glory, **Buy**); "Compare with" sheet against a team hero; sell grid.

**Leaderboard.** Segments Live / Legend / Raids; top 3 medals; rows with crest, name, rating; your
row pinned at the bottom; season line. States: loading, empty ("No ranked players yet"), error.

**Raid picks.** List of opponents in range (crest, name, power, reward); **Raid {name}**. Empty: "No
defenders in range · Retry".

**Search / Found.** Searching animation, timer, rating range widening, your team summary, **Cancel**
(the only exit). Found: both crests "vs", "Preparing…", then the battle.

### 6.4 War mode (seasonal online war; includes Codex and Shop)

**War map (the War root).** Pixel-art hex map of the region (keep the map; design the chrome).
"What does my war army need?"
- Situation line + resource chips: war gold, food, wood, bronze, recruits, energy (compact numbers,
  tap = what it is; may wrap to 2 rows, never truncate).
- **Collect** (primary when income is waiting).
- March bar while the army is moving (countdown, Halt).
- Quick access: Army, Clan, **Lobby** (live duel challenges, badge), Region map, Codex, Shop, Market
  (per your navigation proposal); zoom button.
- Map: owned and clan hexes marked with a crest glyph (not only a tint), region labels, fog.
- **Hex panel** (when a hex is tapped): name, tier, owner, yields per hour, defenders, siege status,
  boss HP, garrison, income, merchant kind; actions with reasons when unavailable: **March**,
  **Attack**, Camp, Garrison, Merchant, Beast/Raid it, Collect, "Codex ›" on beast/boss hexes.
- Sheets: Lobby (players: crest, level, Challenge / Cancel / Busy), Boss & lair info (leaderboard
  table, Raid it / Attack, reason when disabled), Attack result, Challenge popup (someone challenges
  you: Decline / Fight), 7 coach marks for first-timers.
- States: loading, season unavailable / outside Telegram ("Open in Telegram"), **Join the season**.

**War army** (Army template). Chips war gold, food, energy; hero card with group I–IV and gear slots;
tabs Roster · Stash (item card actions: Equip, Salvage, Sell on Market). **Primary: Recruit**;
secondary Market, Shop. *Garrison mode* (from a hex): pick heroes and **Station** them.

**War camp** (pixel-art camp scene). Title "War camp" + "Home / Forward · {place}"; chips war gold,
food, wood, bronze, recruits; build drawer with 5 buildings (name, cost, time, reason when
disabled); actions Muster, Loot (→ War army › Stash), Rest, **Build / Upgrade** (primary; or Collect
when waiting), Make camp.

**Clan.**
- No clan: what clans are (3 icon bullets + illustration), **Found a clan** (name + tag form), join
  offers from invites.
- In a clan: banner card "[TAG] Clan name", members n/30, regions held, your role; member rows
  (crest, name, role chip, power) → manage sheet (Make officer, Demote, Hand over lead, Kick);
  **Invite** (share to Telegram / copy link + code, valid 7 days; reason when disabled); Leave
  (confirm).

**Merchant** (travelling trader on a hex: Merchant / Crossroads / Harbour). Chips war gold and
Drachmae; info card (kind, what they sell, in reach ✓/✗, discount or who holds the hex, restock
time); sections Supplies & basic gear, Regional, Rare today; rows: item → item card, name, "Today
2/5" limit, description, price in gold or Drachmae, **Buy** (confirm); "Daily limit reached".

**Market** (player-to-player trading). Chips war gold, Drachmae. Tabs **Browse · Mine · Sell**.
- *Browse:* filters Kind / Currency / Sort (open as option sheets), search, clear; listing rows →
  listing card → buy confirm; Show more; expired listings shown disabled; empty "Nothing listed ·
  Sell something".
- *Mine:* "3/10 open"; your listings with status; **Cancel listing** (confirm).
- *Sell:* stash grid → sell form: quantity (numeric + ×1/×2/×5), currency toggle (gold / Drachmae),
  price stepper, fee, "You get", town picker sheet, **List**.

**Codex** (enemy encyclopedia). "What is this enemy, and how do I beat it?"
- Segmented **Beasts (8) · Doctrines (2/5)** (Doctrines appears after the first one is met).
- Beast rows: art, name, 2-line hint, level vs your army, "World boss" tag, "Defeated ✓".
- **Beast sheet:** large art, "Beast lair / World boss · Level n", How it fights (bullets), Counter,
  Loot; **Trial fight** (primary; caption "Practice: no spoils"; disabled with a reason when there
  are no fit men). Note: the Trial fight uses the player's **campaign company**, so the sheet
  should show which army will fight.
- Doctrine rows (icon, name, one-line tell); unmet ones as "? Unknown doctrine" (locked). **Doctrine
  sheet:** tells, counters, which enemy bands use it.

**Shop: Shop · Pass · Wallet.** Drachmae balance chip (→ Wallet); a small illustration.
- *Shop:* cosmetics per slot (Equipped / Owned / price / locked with where it comes from) →
  cosmetic dialog (preview, Equip / Take off / Open Pass / Open Duels / Buy / "Need n Drachmae" →
  Wallet); consumables note; a **Market** card ("Trade with other players").
- *Pass (season pass):* pinned season card (current tier, ends in, XP bar → "how to earn XP" sheet,
  **Unlock premium**, **Claim all**); columns Free / Premium; scrolling tier rows (tier badge, "You"
  marker, two reward cells, state locked / claimable / claimed); claim animates the reward flying to
  its balance.
- *Wallet:* Drachmae balance, overdrawn warning, 4 packs bought with **Telegram Stars** (one tagged
  "Best value") → Telegram payment confirm → success/failure toast; legal text, Terms / Refunds,
  purchase History.
- States: loading (card skeletons), outside Telegram, offline, closed, error.

## 7. Prototype flows to link

1. First open: Boot → First run offer → tutorial battle (deployment → fight) → reward → three
   modes → Campaign hub.
2. Campaign loop: Campaign hub → World → tap a band → Encounter → Attack → Battle (deploy, fight,
   pause, give orders) → Results (why line, spoils pick) → Onward → World.
3. Growth: Campaign hub → Army (badge) → hero → Hero › Stats (spend points, Confirm) → Perks (pick A
   or B) → back to Army → Stash → equip an item via item card.
4. Town: World → Settlement → Hire (Undo toast) → Services → Rest 8 hours → Leave.
5. Duels: Duels hub (Ladder) → Floor sheet → Fight → Results → claim a chest; Arena → Find match →
   Search → Found.
6. War: War map → Collect → tap a hex → hex panel → Attack → Results; War map → Clan; War map →
   Codex → beast → Trial fight; War map → Shop → Pass → Claim all → Wallet → buy a pack.
7. Settings from any top-level screen and from the battle menu.

## 8. Final checklist

- [ ] Light, sunny, friendly; no dark brown, no frame around every element.
- [ ] Each screen has a clear hierarchy (one primary action), with the rest calm or tucked away; no
      feature removed.
- [ ] Pixel-art world kept and framed cleanly; UI overlays readable on any terrain.
- [ ] Three modes; Codex and Shop inside War; two navigation proposals + a recommendation.
- [ ] Two battle HUD concepts + a recommendation; battlefield gets most of the screen.
- [ ] Design system before screens; every screen and sheet in §6; key states; clickable flows in §7.
- [ ] EN and RU fit without ellipsis; works at 320×568; 44 pt targets; never colour alone.
