# Hub mockup directions (for the assets agent)

Story S2-UX-IA, 2026-10-10. Three distinct directions for the **Campaign hub**, each with a companion **Codex hub** prompt, ready to feed Gemini at **390x844 portrait** (9:19.5). They are briefs, not decisions: the owner picks one (or none) after the assets agent renders them.

> **Art reference.** `design/art/art-bible.md` is **not merged** in this worktree.
> These briefs follow the locked look in `docs/redesign/V4_SPEC.md` ("Visual reference"), `docs/ART_STYLE.md` §11 (UI style) and the approved mockups `docs/redesign/reference/A1-campaign-hub.jpg` (attach it as the style reference), A2, A3.
> **TODO (art bible):** when `design/art/art-bible.md` lands, re-check palette names, the frame, type and the painted-vs-pixel rule against it, and update the shared style block below before rendering again.

## 0. Rules for every prompt (the honesty guard)

1. **Allowlist only.** Each prompt lists every element it may show. Anything else is an invented feature and the render is rejected. An earlier render invented a "Quests" tile; that is the failure this guards against.
2. **Never show:** quests, daily missions, mail, chat, friends, events calendar, battle pass on the Campaign hub, energy on the Campaign hub, a "Play" button, a level/XP bar for the player, gems, VIP, notifications bell, leaderboards on the Campaign hub, a units/lore section in the Codex.
3. Real, readable English text only, exactly the strings given. Numbers as given.
4. Painted chrome and illustrations; game sprites (if any) stay pixel art at integer scale, never upscaled into painted frames (UI.md G8).
5. Exactly one terracotta primary button per screen. Secondary actions are aged bronze. Grey stone only for the disabled Camp tile.
6. After rendering, the assets agent compares the image to the allowlist **tile by tile** and regenerates on any extra element (memory "verify generated mockups").

**Shared style block** (paste at the top of every prompt):

> Mobile game screen, portrait 390x844 (9:19.5), in the exact style of the attached reference: traditional antiquity, mosaic and parchment. Dark warm basalt page; a dark carved-stone frame with a gold-ochre Greek-key (meander) border and small round rosettes at the four corners framing the content; warm cream parchment panels (#ecdcb8 to #dcc394) with subtle fibres and a thin dark-brown inked edge; dark ink text (#3a2414). Titles, plaques, buttons and tab labels in Cinzel bold caps; body text and every number in Inter medium. Top bar: a dark stone strip with a centred teal stone plaque with a gold rim. Bottom tab bar: dark teal-stone with a gold top rim, five slots with an engraved icon and a Cinzel label: CAMPAIGN (banner icon), DUELS (crossed swords), WAR (centre, a big round bronze shield medallion with an engraved crossed-spears glyph, rising above the bar, its WAR label inside the bar), CODEX (closed book), SHOP (market stall). The selected tab is a parchment block. Minimum text height equivalent to 13 CSS px; buttons at least 44 px tall. No text other than the strings listed.

---

## Direction A: "Fresco Hall" (the approved A1, finished)

**Idea.** Keep A1's order and make it hold at every size: a painted fresco as the emotional centre, one big CTA, three stone tiles. The lowest-risk direction.

**Campaign hub allowlist** (code: MenuScene; IA: screens-campaign.md C-3):
- Top bar: plaque "PIXELARROW", gear icon at the right. No back arrow.
- Profile card: painted bust of a Greek strategos (bronze helmet, red crest) in a bronze-rimmed square; "Strategos Epameinon"; status line "Day 14 · in Rhegion · Lairs 2/6"; "240 Gold" with a coin icon, "3 Trophies" with a trophy icon, "Warband 9 Men" with a men icon.
- First-steps card: "First steps (2 of 4)", a 4-segment bar (2 gold with ticks, 2 dark), the line "Win a battle".
- Fresco banner (tappable): ancient Greek wall painting on cracked plaster, hoplites marching along a coast at dawn, in a dark bronze riveted frame.
- Primary button with pointed ends: "CONTINUE THE MARCH" (terracotta).
- Three square stone tiles in a row: "ARMY" (helmet icon) with a small red badge "2"; "STASH" (chest icon); "CAMP" (tent icon) greyed out, with the caption "Pitch camp on the map" under it.
- Tab bar with CAMPAIGN selected.

**Prompt A1 (Campaign hub):**
> [Shared style block] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom inside the frame: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a parchment profile card: a painted bust of a Greek strategos with a bronze helmet and red crest in a bronze-rimmed square at the left; at the right "STRATEGOS EPAMEINON" in Cinzel, then "Day 14 · in Rhegion · Lairs 2/6", then a coin icon "240 Gold", a trophy icon "3 Trophies", a men icon "Warband 9 Men"; (3) a parchment card titled "FIRST STEPS (2 OF 4)" with a 4-segment bar, two segments gold with check marks and two dark brown, and the line "Win a battle" centred under it; (4) a wide painted fresco in a dark bronze riveted frame: ancient Greek wall painting on cracked plaster, hoplites with round shields marching along a sunlit coast at dawn, ships on the sea; (5) one wide terracotta-red stone button with pointed chevron ends and a gold rim: "CONTINUE THE MARCH"; (6) three square carved stone tiles in a row with engraved bronze icons: "ARMY" (Corinthian helmet) with a small red square badge "2" at the top right, "STASH" (chest), and "CAMP" (tent) shown flat grey and faded as unavailable, with the small caption "Pitch camp on the map" under it; (7) the tab bar. Nothing else on the screen.

**Prompt A2 (Codex hub):**
> [Shared style block] Screen: the Codex hub, CODEX tab selected. Top bar plaque "CODEX", gear icon at the right, no back arrow. A wide painted fresco strip at the top of the content: a many-headed hydra rising from a marsh, painted on cracked plaster, dark bronze frame. Under it a two-part parchment segmented switch: "BEASTS" (selected, lighter with a bronze rim and a tick) and "DOCTRINES". Then a list of parchment rows, each with a square painted beast portrait at the left, the name in Cinzel, a two-line description in Inter, and a small state at the right: "LERNAEAN HYDRA" — "Five heads strike on long necks; each is a target of its own." — "Level 7"; "CYCLOPS" — "Hurls boulders at the tightest knot of men: stunned, thrown aside, shaken." — "Level 5"; "HARPIES" — "A flock of six circles out of reach." — "Level 4"; "NEMEAN LION" — "Arrows, javelins and sling stones glance off its hide." — "Level 6"; "MINOTAUR" — "Charges straight through lines, trampling and tossing men aside." — "Level 8"; "CHIMERA" — a dark silhouette with a small lock and "Not met"; "KRAKEN" — "Rooted at the shore: six arms slam men and drag them into the surf." — "World boss"; "TITAN" — "Hurls two boulders at once and stamps on the crowd." — "World boss". The tab bar at the bottom. Nothing else.

*(The beast lines are the real `myth.*.hint1` strings from `src/i18n/beasts.en.ts`; the levels are sample values of `myth.info.level`, which depends on the player's army.)*

---

## Direction B: "War Table" (the region first)

**Idea.** The hub answers "where are we?" before "who are we?". A painted parchment map vignette of the current region (an illustration, not the playable map) takes the fresco's place, with the party's banner and the next town; the arc progress sits on the map's edge. The profile collapses into a slim strip. Same elements as A, different hierarchy: place → verb → company.

**Campaign hub allowlist:** identical to A's, with two layout changes and nothing added:
- the fresco becomes a **painted map vignette** (still the tappable fresco slot): a hand-drawn parchment map of a coast with a small red banner marking the party and the town name "Rhegion" lettered on it;
- the profile card becomes a **one-line strip**: small bust, "Strategos Epameinon", coin "240", trophy "3", men "9"; the status "Day 14 · in Rhegion · Lairs 2/6" is lettered as a cartouche on the map's lower edge.

**Prompt B1 (Campaign hub):**
> [Shared style block] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a slim parchment strip: a small painted bust of a Greek strategos (bronze helmet, red crest) at the left, "STRATEGOS EPAMEINON" in Cinzel, then at the right a coin icon "240", a trophy icon "3", a men icon "9"; (3) a parchment card titled "FIRST STEPS (2 OF 4)" with a 4-segment bar, two segments gold with check marks and two dark brown, and the line "Win a battle"; (4) a tall painted map vignette in a dark bronze riveted frame, taking about a third of the screen: an antique hand-drawn map on aged parchment of a rocky Mediterranean coast with a sea in faded blue, small hills and olive trees drawn in ink, a walled town lettered "Rhegion", and a small red banner standing next to it; a dotted ink route leading off toward unexplored fog at the map's edge; at the bottom edge of the map a small parchment cartouche reading "Day 14 · in Rhegion · Lairs 2/6"; (5) one wide terracotta-red stone button with pointed chevron ends: "CONTINUE THE MARCH"; (6) three square carved stone tiles: "ARMY" (helmet) with a small red badge "2", "STASH" (chest), and "CAMP" (tent) flat grey and faded, with the caption "Pitch camp on the map"; (7) the tab bar. Nothing else on the screen.

**Prompt B2 (Codex hub):**
> [Shared style block] Screen: the Codex hub, CODEX tab selected. Top bar plaque "CODEX", gear icon right, no back arrow. The content looks like the pages of an ancient bestiary: a parchment segmented switch "BEASTS" | "DOCTRINES" with "DOCTRINES" selected (lighter, bronze rim, tick). Below, parchment rows, each with an engraved round bronze icon at the left, the name in Cinzel and one line in Inter: "STEADY" — "Flanks at 14 s, presses after 25 s."; "RUSH" — "Charges at once, flanks early, never retreats."; then three rows shown as faded ink with a small lock: "? Unknown doctrine". A short line at the bottom of the list: "Fight a doctrine to learn it." The tab bar at the bottom. Nothing else.

*(Doctrine names come from ai-doctrines.md R2: steady, rush, hammer, swarm, fury. The "rush" tell is the GDD's own example; the "steady" line restates its R2 timers (today's behaviour). Swap both for the i18n strings once they exist.)*

---

## Direction C: "Muster Roll" (the company first)

**Idea.** Pillar P4 "Every man has a name" made visible: the hub opens on the company. A horizontal roll of the men (painted class busts with their names) sits where the fresco was; tapping it opens the Army (the Army tile's door). The CTA stays the one primary; the tiles stay. No new data: the roll shows the roster the Army screen already has.

**Campaign hub allowlist:** A's elements, with:
- the fresco slot replaced by a **muster roll**: a parchment scroll band showing 5 small painted busts in a row with first names under them ("Lykon", "Damon", "Kleon", "Phaidros", "Nikias") and "+4" at the end; one bust has a small bandage glyph (wounded);
- the profile card unchanged from A.

**Prompt C1 (Campaign hub):**
> [Shared style block] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a parchment profile card: a painted bust of a Greek strategos (bronze helmet, red crest) in a bronze-rimmed square; "STRATEGOS EPAMEINON"; "Day 14 · in Rhegion · Lairs 2/6"; a coin icon "240 Gold", a trophy icon "3 Trophies", a men icon "Warband 9 Men"; (3) a parchment card "FIRST STEPS (2 OF 4)" with a 4-segment bar (two gold segments with ticks, two dark brown) and the line "Win a battle"; (4) a wide parchment scroll with rolled ends titled "THE COMPANY", holding a row of five small painted head-and-shoulders portraits of ancient Greek soldiers in round bronze frames (two hoplites in Corinthian helmets, a peltast with a light cap, a slinger bare-headed, an older veteran with a beard), each with a first name under it in Inter: "Lykon", "Damon", "Kleon", "Phaidros", "Nikias", and a small "+4" disc at the end of the row; the "Kleon" portrait has a small white bandage glyph on its frame; (5) one wide terracotta-red stone button with pointed chevron ends: "CONTINUE THE MARCH"; (6) three square carved stone tiles: "ARMY" (helmet) with a small red badge "2", "STASH" (chest), and "CAMP" (tent) flat grey and faded, with the caption "Pitch camp on the map"; (7) the tab bar. Nothing else on the screen.

**Prompt C2 (Codex hub):**
> [Shared style block] Screen: the Codex hub, CODEX tab selected. Top bar plaque "CODEX", gear icon right, no back arrow. A parchment segmented switch "BEASTS" (selected) | "DOCTRINES". Below it a grid of two columns of tall parchment cards, each with a painted beast portrait filling the top and the name in Cinzel under it plus one small line: "LERNAEAN HYDRA" / "Level 7"; "CYCLOPS" / "Level 5"; "HARPIES" / "Level 4"; "NEMEAN LION" / "Level 6"; "MINOTAUR" / "Level 8"; "CHIMERA" shown as a dark silhouette with a lock / "Not met"; "KRAKEN" / "World boss"; "TITAN" / "World boss" (the last row may be cut by the bottom of the screen, as in a scrolling list). The tab bar at the bottom. Nothing else.

---

## 1. Verification checklist (per render)

| Check | A | B | C |
| --- | --- | --- | --- |
| Only allowlisted elements (no quests, mail, energy, Play button…) | | | |
| Exactly one terracotta button | | | |
| Five tabs, correct labels and icons, War raised with a glyph | | | |
| Camp tile grey with its caption; no other grey control | | | |
| Text exactly as given, readable at phone size | | | |
| No upscaled pixel art inside painted frames | | | |
| Codex: Beasts and Doctrines only; no Units/Lore | | | |

## 2. Element provenance (why each element is allowed)

| Element in the prompts | Exists in |
| --- | --- |
| Plaque, gear, tab bar (5 tabs) | `src/ui/mosaic/hub.ts`, V4_SPEC |
| Profile card, status line, gold, trophies, warband | MenuScene (UI.md §2) |
| "Lairs 2/6" on the status line | campaign-arc.md (arc tracker); placement per ANSWERS Q30 |
| First-steps card | MenuScene `firstSteps()` |
| Fresco (A) / map vignette (B) / muster roll (C) in the fresco slot | MenuScene fresco (tappable banner); B and C reuse the slot with existing data (place and day; roster names and wounded state from the campaign save). **Direction C's roll is a new presentation of existing roster data and needs an owner OK before build.** |
| Continue the march | MenuScene |
| Army (count badge), Stash, Camp (disabled + caption) tiles | MenuScene tiles |
| Codex Beasts rows (8 beasts, Level n / World boss) | CodexScene, `src/data/beasts.ts` (`LAIR_BEASTS`, `WORLD_BOSSES`) |
| Codex Doctrines (steady, rush, hammer, swarm, fury; unknown until met) | ai-doctrines.md R2 and "Codex" |
| "Not met" state | ia.md §4 (a Codex entry state); flagged in REVIEW.md as a decision |
