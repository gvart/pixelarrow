# pixelarrow.app: page structure and copy outline

Story P2-LAND. English only. Every claim below is checked against `docs/GAMEPLAY.md`,
`docs/DESIGN_V2.md`, `docs/DUELS.md` and `docs/ITEMS.md`; the source is given where a line could be
doubted. Copy marked **(v6)** depends on a v6 story (web accounts, linking, web payments placeholder)
and must be re-checked against what actually merged before the page ships. Visual rules:
[ART_DIRECTION.md](ART_DIRECTION.md). Tech and budget: [ADR-0011](../../../design/adr/ADR-0011-landing-stack-and-budget.md).
Chosen direction: [DIRECTION_PICK.md](DIRECTION_PICK.md).

## Copy rules

- Plain, active, sentence case in body text; Cinzel capitals only for section titles and buttons
  (the game's own rule, art bible §7.2).
- A button says what happens: "Play in browser" opens play.pixelarrow.app; "Open in Telegram" opens
  the Mini App link (`https://t.me/<bot>/<app>`, from the same config the bot uses).
- No numbers we did not measure. Live figures come from `/api/public/*`; when there are few players the
  section shows its empty state, never a made-up count.
- No feature that is not in the game: no levels for "every soldier" icons, no app stores, no Steam,
  no Discord, no pricing table, no newsletter, no download.
- Names of classes, modes and items exactly as the game spells them.

## Global chrome

- **Top navigation** (sticky after the hero, transparent over it): wordmark "PIXELARROW" (code-set
  type, not an image); anchors "Features", "Classes", "Modes", "Leaderboards", "FAQ"; a small primary
  button "Play" (→ play.pixelarrow.app). At < 768 px the anchors collapse into a menu button; "Play"
  stays visible.
- **Skip link** "Skip to content" as the first focusable element.

## Sections, in order

### 1. Hero (`#top`)

Purpose: say what the game is in one look and give both ways in.

- Headline: **HOLD THE LINE**
- Sub-line: "Command pixel phalanxes in real-time battles across the ancient Mediterranean. Free in
  your browser and in Telegram."
- Primary button: **PLAY IN BROWSER** → `https://play.pixelarrow.app`
- Secondary button: **OPEN IN TELEGRAM** → the Mini App link.
- Small line under the buttons: "No download. Phones, tablets and laptops." (v6: landscape and
  keyboard support land in v6 goal 3.)
- Visual: layered parallax key art plus, on desktop only, a muted ambient loop (clip H1). The
  orchestrated moment: on scroll the foreground rank of shields slides past the camera and the
  battlefield below comes into view (ART_DIRECTION.md §2).

### 2. Features (`#features`)

Purpose: the four things that make battles different. Four items, each an icon (code-drawn SVG in
the game's engraved style) + title + one line.

| Title | Line | Source |
|---|---|---|
| Real-time battles you can pause | "Battles run live. Pause any time and give orders while the clock is stopped." | GAMEPLAY › Controls (offline battles pause; auto-pause options) |
| Formations: line, wedge, column | "Line, column, wedge, loose order and shield wall. Drag a group to move it, turn it by its knob." | GAMEPLAY › Controls |
| Morale breaks lines | "Flank a line and it wavers. Hit it from behind and it runs." | GAMEPLAY › Rules (side ×1.8 and rear ×2.8 morale damage, routs) |
| Every soldier is a hero with a name | "Each man has a name, a class, gear and perks. Lose him in battle and he is gone." | GAMEPLAY › Heroes and the army (permadeath) |

Optional fifth line under the row (small): "Greeks, Carthaginians and Celts, 4th century BC."

### 3. Classes and units (`#classes`)

Purpose: show the roster's variety. Title: **CHOOSE YOUR MEN**. Intro: "Twenty-one classes across
three cultures, from village levies to the Sacred Band, plus wolves, boars and bears." (GAMEPLAY ›
Unit classes: 18 human classes + 3 beasts = 21 rows.)

A horizontal strip of painted class busts (the shipped v5 busts in `public/ui/busts/`, re-exported
for the web), each with the class name and its role tag from the class table:

| Class | Role tag | One line (hover or tap) |
|---|---|---|
| Spartan hoplite | Heavy | "Braced spear wall. The line cavalry breaks on." |
| Thracian rhomphaia | Heavy | "Two-handed blade that breaks shields. Weak to missiles." |
| Cretan archer | Ranged | "Longest range, pierces armour." |
| Rhodian slinger | Ranged | "Carries the most ammunition." |
| Peltast | Light | "Throws, then closes. Hunts archers." |
| Thracian falx | Light | "Fast and hits hard, no shield." |
| Celtic swordsman | Heavy | "Shock infantry." |
| Companion cavalry | Cavalry | "Shock riders for flank and rear charges." |
| Scythian horse archer | Ranged (mounted) | "Shoots on the move." |
| Scythed chariot | Cavalry | "Breaks loose foot, dies in rough ground." |
| Sacred Band | Elite | "Elite line." |

Below the strip, a small "Beasts" row: wolf, wild boar, brown bear (painted beast plates), line:
"Wolves, boars and bears fight on the field. Mythical beasts hold lairs on the war map: hydra,
cyclops, harpies, Nemean lion, minotaur, chimera." (DESIGN_V2 › Mythical beasts.)

Pixel echo: next to the selected bust, the same class as its in-game pixel sprite at integer scale
(art bible P1: painted and pixel never in one frame, so the sprite sits in its own plate).

### 4. Modes (`#modes`)

Title: **FOUR WAYS TO FIGHT**. Four tiles, each a looping clip poster (plays in view) + name + two
lines.

| Mode | Lines | Clip | Source |
|---|---|---|---|
| Campaign | "March across an overland map, hunt or flee bands, recruit in villages and towns. Time passes only while you move." | M1 | GAMEPLAY › Campaign |
| Duels | "Ranked 1v1, live or against another player's saved defence. A separate duel army, no losses, Glory to spend in the duel shop." | M2 | DUELS › Summary |
| War | "A shared seasonal map of the western Mediterranean. Take regions, garrison them, join a clan, hunt mythical beasts in their lairs." | M3 | DESIGN_V2 › Map, Clans, Mythical beasts |
| Forge | "At a town's smith, reforge one stat line of an item. The campaign's endgame." | M4 | ITEMS › Reforging at the Smith |

Note for the build: the Forge exists only as the Smith row of a town's Services tab (campaign only).
Its clip is a recording of that real screen, never a smithy scene.

### 5. Live stats and leaderboards (`#leaderboards`)

Title: **THE WAR RIGHT NOW**. Data: `/api/public/*` (public stats API ADR; HOSTING.md option B proxy),
fetched after load, cached at the edge.

- Counters, from `PublicSummaryV1.totals` (ADR-0010): "Players", "Online battles" (the API counts only
  online battles; campaign battles are not on the server), and "Clans". Values appear only from real data.
- Table "Top duelists": rank, player display name (V6-011 nickname, never a Telegram name or id),
  league (and the rating for Legend only, as in the game). Top 10.
- Table "War standings": rank, clan, score, members, for the current season (`war.clans`). Top 10.
- Footnote: "Updated every few minutes." with the time of the data ("as of 14:05 UTC").
- **Empty state** (below a threshold set in the API ADR, or on error): the counters show "—" and the
  tables are replaced by one line, "The first season is just starting. Your name could be the first
  one here." with the "Play in browser" button. No fake rows, no skeleton that stays forever.
- Loading: fixed-height slots with a quiet shimmer under `prefers-reduced-motion: no-preference`,
  so nothing shifts when data arrives.

### 6. Gameplay clips (`#clips`)

Title: **SEE IT MOVE**. Intro: "Recorded from the game." A 2x2 grid on desktop, a single column (or
horizontal snap scroller) on phones. Each tile: poster, play button, caption; plays muted in view
(rules in ADR-0011). Clips G1–G4 below.

### 7. FAQ (`#faq`)

Title: **QUESTIONS**. Native `<details>` rows, one open at a time not enforced.

| Question | Answer outline |
|---|---|
| Is it free to play? | "Yes. In Telegram you can buy Drachmae with Telegram Stars for cosmetics, the season pass and shortcuts; gear and heroes are never sold. Purchases are not available on the web yet." (DESIGN_V2 › Monetization; v6 web payments placeholder) |
| Do I need Telegram? | "No. Play in your browser with an email account, or open the game in Telegram. (v6) You can link both to one account and keep your progress." |
| Can I play on a laptop or tablet? | "Yes. Phones, tablets and laptops, with touch, or mouse and keyboard with hotkeys you can rebind." (v6 goal 3) |
| Is my progress saved? | "Your campaign saves on your device and syncs to the cloud when you are signed in. Online war and duels live on the server." (GAMEPLAY › Saves, Cloud save; v6 for web accounts) |
| Which languages? | "The game is in English and Russian." |
| What happens to my data? | "We keep only what the game needs. Read the privacy notice, and delete your account from Settings at any time." (v6 goal 9) → link to `/privacy` |

### 8. Closing call to action

One band, no new information: line "Your phalanx is waiting." Buttons **PLAY IN BROWSER** and
**OPEN IN TELEGRAM**.

### 9. Footer

Wordmark; links "Privacy" (`/privacy`), "Terms" (`/terms`), "Refunds" (`/refunds`), "Telegram"
(the bot/Mini App link), "Русский" only if the Russian legal pages stay (they exist today under
`/ru/*`; the landing itself is English). Line: "© 2026 Pixelarrow". No social icons we do not run.

## SEO and metadata (for the build story)

- `<title>`: "Pixelarrow: pixel-art formation battles in the ancient Mediterranean"
- Meta description (≤ 155 chars): "Command pixel phalanxes in real-time battles. Campaign, ranked
  duels and a seasonal online war. Free in your browser and in Telegram."
- Open Graph and Twitter: a 1200x630 image cut from the hero key art with the wordmark set in code
  and exported (queue it in ASSET_LOG).
- JSON-LD: `VideoGame` (name, description, genre "Strategy", gamePlatform ["Web browser",
  "Telegram"], applicationCategory "Game", offers price 0) plus `WebSite`; one `VideoObject` per
  gameplay clip.
- `sitemap.xml` (landing pages + legal pages), `robots.txt`, favicon set from the v5 app icon
  (`scripts/art/appicons.mjs`).

## Clips needed (for the `video` agent)

Record from the real game with Playwright video (scripted, deterministic seeds), never staged in an
editor. Encoding rules and byte budgets: ADR-0011 (nearest-neighbour upscale, WebM + MP4, AVIF
poster, muted loops). Log each clip, its seed and script in `docs/v6/ASSET_LOG.md`.

| ID | Where | What it shows | Length | Size / aspect | How to get it |
|---|---|---|---|---|---|
| H1 | Hero ambient (desktop) | A slow pan over a battle: two lines closing, javelins in the air, the cyan formation lattice under the player's group; no HUD | 6–8 s seamless loop | 1280x720, 16:9 | Battle scene with HUD hidden (a capture flag), camera pan scripted; loop point on a calm frame |
| M1 | Modes: Campaign | Overland map: the party marches along a road to a town, a band's strength plate visible | 5–6 s | 960x540 | World map scene, scripted route |
| M2 | Modes: Duels | A ranked duel: two duel armies meet, a flank charge | 5–6 s | 960x540 | Local duel against the bot (async defence) with a fixed seed |
| M3 | Modes: War | The war map: regions, routes, a march along a route, clan colours | 5–6 s | 960x540 | War map with a local seeded shard or fixture |
| M4 | Modes: Forge | The Smith row in a town's Services tab: pick a line, reforge, the new value appears | 4–5 s | 720x720 or 960x540 | Town screen, Services tab, a seeded item |
| G1 | Clips: "A formation breaks" | A line is flanked, morale drops, the group routs | 6–8 s | 960x540 | Scripted skirmish, fixed seed, flank order at a set tick |
| G2 | Clips: "The war map" | Longer war-map shot: fog, a beast lair, a garrisoned region | 6–8 s | 960x540 | As M3 |
| G3 | Clips: "A ranked duel" | Deployment drag into the fight, shield wall holds a charge | 6–8 s | 960x540 | As M2 |
| G4 | Clips: "At the forge" | As M4 but with the item card in full | 5–6 s | 960x540 | As M4 |
| B1 | Classes (optional) | One class's pixel sprite idle and attack loop, on its base plate | 2–3 s | 360x360 | Kit or a scratch scene at integer scale |
| OG | Social image | Still, not a clip: the hero art + wordmark, 1200x630 | — | — | From the hero layers, in the asset job |

Posters: the clip's first frame unless a better frame is named in the log; AVIF ≤ 40 kB.
