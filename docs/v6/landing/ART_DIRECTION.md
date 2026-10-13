# Art bible addendum: the landing site (pixelarrow.app)

> **Status**: Draft, authored autonomously in story P2-LAND (art-director + ux-designer roles; the owner
> delegated the call in the v6 brief).
> **Extends**: `design/art/art-bible.md` (v5). Everything there still holds unless this file says
> otherwise for the landing site. The game's own screens are not changed by this file.
> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED 2026-10-13 — lean mode (autonomous run; self-review
> recorded in `DIRECTION_PICK.md`).
> **Direction**: B "Night Tabletop", amended (see `DIRECTION_PICK.md`). Mockup:
> `docs/v6/gemini/P2-LAND/landing_B_tabletop_2.jpg`.
> **Companions**: `STRUCTURE.md` (sections and copy), `design/adr/ADR-0011-landing-stack-and-budget.md`
> (tech and budget), `docs/v6/ASSET_LOG.md` (prompts and the asset queue).

## 1. Visual identity statement

**One-line rule:** *The game is a pixel tabletop in a dark room, and the landing page is the lamp held
over it.* The visitor first sees the real battlefield as a miniature diorama under one warm light; the
painted chronicle (busts, frescoes) frames it, never replaces it.

| # | Principle | Design test |
|---|---|---|
| L1 | **Show the real thing first.** The hero is the game's own pixel battlefield, not an illustration of a game that does not exist. | If an image could be mistaken for gameplay, it must be gameplay (a capture or a render from the engine). Painted art may only appear where the game itself uses painted art (busts, plates, frescoes). |
| L2 | **One lamp, one accent.** Darkness everywhere, one warm light source from the upper left, one cool accent: the cyan formation lattice. | When something wants a colour, it gets warm light (cream, bronze, terracotta) or nothing. Cyan is only the lattice motif and the focus ring. |
| L3 | **Pixels stay pixels.** (v5 P1 and ART_STYLE §14 carried over.) | Pixel art is shown at an integer scale with `image-rendering: pixelated`, never rotated, blurred, or scaled by fractions. If a layout cannot give an integer scale, crop instead of scaling. |
| L4 | **Readable in the dark.** (v5 P2 carried over.) | Text sits on solid dark ground or parchment, never on art. Body text ≥ 16 CSS px, contrast ≥ 4.5:1; captions ≥ 14 CSS px. |

## 2. Mood and atmosphere

| Section | Emotional target | Light | Descriptors | Energy |
|---|---|---|---|---|
| Hero | "That is a real battle, and I can command it" | One warm lamp from the upper left on the diorama; the room falls to near-black at the edges; dust motes in the beam | hushed, tactile, expectant | held breath |
| Features | Clarity | The lamp's spill: low, even, warm | plain, confident | measured |
| Classes | Pride in your men | Each bust lit from the upper left like the game's busts; dark ground behind | warm, personal | calm |
| Modes / clips | Breadth | Each pixel still is a small lit window into the game | busy inside, quiet outside | rising |
| Live stats | "The war is happening now" | Parchment under the lamp | ledger, record | measured |
| FAQ / footer | Calm, trustworthy | Dimmest part of the page | quiet | low |

**The one orchestrated moment** (frontend-design rule: one moment, not effects everywhere): as the
visitor scrolls out of the hero, the two pixel formations on the diorama advance toward each other
(two separate layers moving on the iso axis by whole pixels), the lamp beam narrows, and the cyan
lattice under the player's formation fades in. By the time the features row arrives the lines have
met. Everything else on the page enters plainly (a short opacity rise at most). Reduced motion:
the formations sit at the moment of contact, lattice visible, nothing moves.

## 3. Shape language

- **The diamond.** The iso diamond (2:1, 36x18 game px cell from the game) is the page's one shape
  motif: the diorama slab, the lattice dividers between sections (1 CSS px cyan lines at 25% opacity,
  a single small diamond node at the centre), list bullets, the focus ring's corner notches.
- **Base plates.** Cards and tiles are dark slabs with a 1 px warm outline and a 2 px darker lower edge,
  like the base of a miniature. Radius 2 px (the game's rule), never pill shapes except buttons.
- **Buttons.** Primary: terracotta slab with cream Cinzel capitals; secondary: transparent with a 1 px
  cream outline. Both 48 px tall minimum (44 pt rule plus margin). No chevron ends on the web (the
  chevron CTA is the game's hub primary).
- **Arches only for busts.** The class bust strip uses square frames with a bronze edge (the game's
  portrait well), not circles.
- **No Greek-key band** on the landing page: the meander belongs to the game's screen frame; using it
  here would make the site look like a game menu.

## 4. Colour system

The landing page runs on the game's warm palette with a darker ground. The mockup's slate-blue night
is replaced by the game's basalt (amendment from `DIRECTION_PICK.md`): it keeps P4 "bronze, ochre and
lamplight" and the page reads as the same world as the game's menus.

| Token | Hex | Job |
|---|---|---|
| `night` | #100d0b | Page ground at the edges and below the fold (a step darker than the game's `page` #16120f) |
| `basalt` | #16120f | Section ground (the game's `page`) |
| `stone` | #26211b | Cards and tiles (the game's `stone1`) |
| `stoneEdge` | #463d33 | 1 px card outlines and dividers (the game's `stone3`) |
| `lamp` | #f2c879 at 0–18% | The lamp glow only (radial gradient, upper left) |
| `cream` | #f0e3c2 | Headlines and primary text on dark (the game's `parchHi`) |
| `creamSec` | #c9b896 | Body and secondary text on dark |
| `parch` / `ink` | #e7d6ad / #3a2414 | Leaderboard tables and the FAQ answer panels (the game's page and ink) |
| `terra` | #a8432c | The one primary action per viewport ("Play in browser", "Play") |
| `bronze` | #b08a3a | Frame edges, icon strokes |
| `lattice` | #7fd0e0 | The formation lattice motif and the keyboard focus ring; never text, never buttons |
| `alert` | #b3261e | Errors only (the stats fetch never shows an error to visitors; this is for the 404 page) |

Rules:
- One `terra` button per viewport. "Open in Telegram" is always the secondary style.
- No pure black or white. No neon; the cyan is the game's selection cyan, used thin.
- Contrast pairs to check in the build (WCAG AA): `cream`/`basalt`, `creamSec`/`basalt`,
  `creamSec`/`stone`, `cream`/`terra` (button label, large text ≥ 3:1, aim for 4.5:1), `ink`/`parch`,
  `lattice`/`basalt` for the focus ring (≥ 3:1).
- Colour-blind safety: nothing on the landing page uses colour alone; the leaderboard's rank uses a
  numeral, clan colours (if shown) sit next to the clan name.

## 5. Characters on the page

- **Class busts:** the shipped v5 painted busts (`public/ui/busts/`), unchanged: they already follow
  the one-headgear-per-class rule (art bible §5.2). Mockups that invented a crested helmet for the
  Thracian falx (A, C) are not a reference for this.
- **Pixel sprites:** each bust may pair with its class's in-game sprite on a base plate, at integer
  scale, in its own frame (L3; v5 P1).
- **Beasts:** the v5 beast plates; mythical beasts appear in the classes section's beast row and in
  the war clip, never as invented key art.
- **No commander figure** stands on the field in the game, so none stands in the hero.

## 6. Environment: the diorama

- The hero diorama is a cut slab of the real battlefield: olive and straw tuft grass, a river with the
  concentric bank bands, a few tree clusters and mauve rocks (ART_STYLE §7), two formations on base
  plates. Its sides show 6–10 game px of earth in three hue-shifted browns (the world palette's soil
  ramp), lit side left, shadow side right.
- **Source:** a render from the game (a battle field captured at integer scale with the HUD hidden,
  transparent around the slab) is preferred to a generated image, because Gemini cannot hold a pixel
  grid (PROMPTS_ART §6). Gemini may supply only the slab's earth sides, pixel-processed with
  `scripts/art/process.mjs` (`pixel` kind).
- Layers for the scroll moment: slab (static), player formation, enemy formation, lattice, dust.
  The formations are separate transparent PNGs drawn by the game's own sprite code.

## 7. UI on the landing page

- **Type:** Cinzel 700 for section titles and buttons, capitals only (art bible §7.2; Cinzel's lower
  case is small caps). Inter (variable, 400–600) for everything else, sentence case. Scale (CSS px):
  hero title clamp(44, 7vw, 96); section title clamp(28, 4vw, 44); lead 20; body 17; caption 14.
  Line length ≤ 70 characters. Line height 1.5 body, 1.1 titles.
- **Icons:** feature icons are drawn in code as 1.5 px bronze line icons in the game's engraved
  style (a shield, a wedge of three diamonds, a cracked shield, a helmet). No badges or numbers on
  them (mockup B #1 was rejected for exactly that).
- **Motion:** compositor-only (`transform`, `opacity`). Entrances 200–300 ms, `cubic-bezier(0.25, 1, 0.5, 1)`;
  pixel layers move in whole pixels (`steps()` timing or rounding) so sprites never shimmer. Hover:
  buttons warm by one step and gain a 1 px lattice-cyan inner line; clip tiles brighten the still by
  6%. No bounce, no parallax on text.
- **Focus:** a 2 px `lattice` ring with a 2 px dark gap, on every focusable element; never removed.
- **Video tiles:** a thin `stoneEdge` frame, poster, a round terracotta play glyph with a cream
  triangle; when playing, the glyph fades out; a small "Pause" control stays reachable by keyboard.

## 8. Asset standards (landing only)

| Asset | Source | Delivered as | Budget (ADR-0011) |
|---|---|---|---|
| Hero diorama layers | Engine render (+ optional Gemini earth sides) | PNG master at 1x game px; AVIF/WebP at 2x, 3x, 4x integer scales | ≤ 450 kB desktop, ≤ 180 kB mobile for all layers |
| Class busts | v5 `public/ui/busts/` | AVIF/WebP 144, 288 px | ≤ 25 kB each |
| Beast plates | v5 `public/ui/beasts/` | AVIF/WebP | ≤ 25 kB each |
| Pixel stills / posters | First frame of each clip | AVIF at the clip size | ≤ 40 kB |
| Clips | `video` agent | WebM + MP4, nearest-neighbour upscaled | per ADR-0011 |
| OG image | Composite in code | JPEG 1200x630 | ≤ 150 kB |
| Favicons | v5 app icon set | as `scripts/art/appicons.mjs` writes | — |

Names follow the art bible: `landing_<subject>[_<variant>].<ext>`, lowercase snake case. Generated
text is never used: the wordmark and every label are live text or code-set SVG.

## 9. Reference direction

| Reference | Take | Avoid |
|---|---|---|
| The game's own battle screen (`docs/v5/audit/shots/battle-fight-390x844.png`) | The grass, river bands, base plates and the cyan lattice exactly | Its HUD (the landing is not a game screen) |
| Tabletop miniature photography under a single desk lamp | Fall-off into darkness, the slab's cut earth edge, dust in the beam | Shallow depth of field blur on pixel art (breaks L3) |
| The game's v5 busts and frescoes | Painted warmth for people and myth | Painted battle scenes standing in for gameplay |
| Mockup A (Lamplit Chronicle) | Parchment tables and FAQ panels on dark stone; warm gold headlines | The meander bands; painted night hero as the first image |
| Mockup C (Wine-dark Dusk) | Generous section spacing; the arched-niche idea is rejected, but its quiet light-shaft section breaks may be used as the section ground gradient | The coral palette and the wordmark-behind-silhouettes hero (a second "big moment" would compete with the diorama) |

## Not authored this run
Nothing: all nine sections are written for the landing scope. Sections 5 and 8 lean on the v5 bible
rather than repeating it.
