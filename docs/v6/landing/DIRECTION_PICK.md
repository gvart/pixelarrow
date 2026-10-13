# Landing direction pick

Story P2-LAND, 2026-10-13. Three full-page directions were generated with Gemini (prompts and
verdicts: `docs/v6/ASSET_LOG.md` › P2-LAND) and reviewed with `/ux-review`.

| Direction | Mockup |
|---|---|
| A "Lamplit Chronicle" | `docs/v6/gemini/P2-LAND/landing_A_lamplit_1.jpg` |
| B "Night Tabletop" | `docs/v6/gemini/P2-LAND/landing_B_tabletop_2.jpg` (B #1 rejected: a level-like badge) |
| C "Wine-dark Dusk" | `docs/v6/gemini/P2-LAND/landing_C_dusk_1.jpg` |

## Decision

**B "Night Tabletop", with three amendments.** The hero is the game's real pixel battlefield as a
lamp-lit diorama; the page around it is quiet.

Amendments (all written into `ART_DIRECTION.md`):
1. **Ground:** the mockup's cool slate-blue night becomes the game's warm basalt (`#16120f` / `#100d0b`),
   so the site reads as the same world as the game's menus (art bible P4).
2. **Tables and FAQ:** take A's parchment panels with dark ink for the leaderboards and FAQ answers
   (better contrast and more "ledger" than B's grey rows).
3. **Lattice dividers:** keep B's cyan diamond lattice as the one accent, but thinner (1 px, 25%) and
   without the repeated chain pattern, which looked like a template border at full strength.

## Why B

- **It shows the actual game first.** The brief's risk is a landing page that sells something the game
  is not. A's and C's heroes are painted epics; a visitor who clicks "Play" then lands on pixel art.
  B's hero *is* the pixel battlefield, so the promise and the product match (ART_DIRECTION L1, the
  owner's "never invent features" rule).
- **It is the most distinctive.** A dark page with a painted hero is what most strategy game sites
  look like; A in particular reads like a template with a fresco dropped in. A miniature diorama
  under one lamp is specific to a formation-tactics game played "on a tabletop" (art bible §1:
  "The world is a pixel tabletop").
- **Its signature motif is real.** The cyan lattice is the formation footprint the player drags in
  every battle (ART_STYLE §9), not decoration.
- **It gives the one orchestrated scroll moment for free:** the two formations advance and meet as
  the hero scrolls away (ART_DIRECTION §2). It is cheap to build with two transparent layers and CSS
  scroll timelines (ADR-0011), and it degrades to a still frame.
- **It scales best.** The diorama is roughly square, so at 320–390 px it sits under the headline at
  full width; at 1920+ it sits beside the text. C's wordmark-behind-silhouettes needs precise layer
  alignment that breaks across aspect ratios; A's wide night painting crops faces on phones.
- **It is honest to produce.** The slab and formations can be rendered by the game's own sprite code
  at integer scale. Gemini cannot hold a pixel grid (PROMPTS_ART §6), so A and C would need large new
  painted key art, and C's would need four aligned parallax plates.

What we give up: A's warmth and C's cinematic drama. Amendment 1 brings A's warmth back; C's drama is
deliberately not used, because two big moments would compete.

## /ux-review

The mockups are direction boards, not UX specs, so the review used checklist **3A (UX Spec)**, assumed
by file type, against the brief, `STRUCTURE.md` and `design/accessibility-requirements.md` (Standard
tier, WCAG 2.1 AA, committed in V5-013). Input methods: touch, mouse and keyboard (the landing page is
web; the brief requires 320 px to 4K). Dimensions that need a spec rather than a picture (states,
events, data owners) were checked against `STRUCTURE.md`, which is part of this story.

### Per direction

| Check | A Lamplit | B Tabletop | C Dusk |
|---|---|---|---|
| Every section of STRUCTURE.md present, in order | Yes | Yes | Yes |
| Nothing invented (feature allowlist) | Notes: pixel smithy scene for Forge (misleading); Campaign tile shows the battle, not the overland map | B #1 rejected (level-like "8" badge); B #2 clean apart from garbled copy (set in code anyway) | Notes: falx bust shares the hoplite's crested helmet; placeholder numbers in tables |
| Player need on arrival ("what is this game, how do I start") answered above the fold | Partly: says "epic battle", not "pixel tactics" | **Yes**: the battlefield itself | Partly: wordmark first, game later |
| Primary action unambiguous (one terracotta button per view) | Yes | Yes | Yes (coral) |
| Text never on art | Yes (dark sky) | **Yes** (text beside the diorama) | Risky: the wordmark is over painted sky by design |
| Contrast of body text (AA) | Good (cream on stone; ink on parchment) | Good; slate rows weaker → amendment 2 | Cream on plum OK; coral on plum for the primary is borderline |
| Phone layout risk (320–390) | Medium: wide painting crops | **Low**: square diorama stacks | High: layered wordmark composition |
| Reduced-motion fallback | Static painting | Still frame at contact | Static layers; wordmark overlap must still read |
| Performance (ADR-0011 budget) | One large painted hero (heavy at 2560) | **Small**: pixel layers compress well as PNG/AVIF at integer scale | Four painted plates (heaviest) |
| Recognisably the game's world and palette | Yes (menus) | Yes (battlefield); amendment 1 for palette | Partly (title-screen plum/coral, not the menus) |

### Findings for the build (apply to B)

1. **States** [BLOCKING for the stats build]: the live section needs loading (fixed-height slots),
   populated, empty ("first season is just starting") and error (same as empty, silently) states.
   Specified in STRUCTURE.md §5; the mockups only show a placeholder.
2. **Keyboard** [BLOCKING]: skip link, visible focus ring (`lattice` 2 px), focus order nav → hero
   buttons → sections → FAQ `<details>` → footer; clip tiles are buttons with a pause control; no
   hover-only content. Specified in ART_DIRECTION §7 and STRUCTURE.md.
3. **Touch targets** [BLOCKING]: buttons ≥ 48 px tall; nav anchors ≥ 44 px; FAQ rows full-width
   targets (A11Y-06, A11Y-07).
4. **Colour-only state** [ADVISORY]: leaderboard ranks are numerals; clan colours next to names only.
5. **Text size** [ADVISORY]: the mockups' table and caption text is about 11–12 px at 1440; the build
   uses ≥ 16 px body, ≥ 14 px captions (ART_DIRECTION §7).
6. **Clip honesty** [BLOCKING for assets]: every still and clip comes from a recording of the real
   game (STRUCTURE.md › Clips needed); the Forge is the town's Services tab, never a smithy scene.
7. **Localization**: English only by brief; Cinzel capitals headlines should stay ≤ 24 characters so
   they hold one line at 320 px ("FOUR WAYS TO FIGHT" is 18).
8. **Performance criterion**: ADR-0011 budget (LCP ≤ 2.0 s mobile, CLS ≤ 0.02).
9. **Resolution criterion**: verified at 320, 390, 768, 1280, 1440 and 1920 widths (brief).

### Verdict

`UX Review: landing directions — NEEDS REVISION` for the mockups as specs (they are pictures; findings
1–3 and 6 must be built as specified in `STRUCTURE.md` and `ART_DIRECTION.md`, not copied from the
images). **Direction verdict: B approved for the build with the three amendments above.**
Accessibility: Standard tier (committed in `design/accessibility-requirements.md`); the mockups cannot
show focus or target sizes, so those are carried as blocking build criteria above.
