# Landing QA: V6-LAND-06 (wow and verification pass)

Date 2026-10-14. Build: `landing/` at this story's head. Media (not committed): `qa-land-06/` in the story
worktree (scroll videos at 1440x900 and 390x844 before and after, section shots, Lighthouse JSON).

## Would a stranger want to click Play?

**1440x900: yes.** The hero is the strongest thing on the page: a real battle marching, clashing and
breaking on a lit war table, with the dive into the board on scroll. Before this pass the page went flat
after it: four quiet sections, flat clip rectangles, and a closing band that was a gradient and two
buttons. The pass gives the second half a pulse and ends the page on the board it opened with.

**390x844: yes, with one reservation.** The phone hero now plays the light battle and the board leans in
as you scroll; the closing band brings the board back. The reservation: the phone diorama is 432 CSS px
wide (the whole-pixel rule, ART_DIRECTION L3), so the men are small. A tighter phone crop of the battle
is the next lever, and it is an art-direction call, not a bug.

## Wow changes (all off under reduced motion; scroll-driven ones only where `animation-timeline` exists)

| Change | Why | Cost |
|---|---|---|
| Closing band: the hero diorama returns under "Your phalanx is waiting", and the camera pulls back out of it on scroll (the dive reversed) | The page ends where it began; the last thing seen is the game, not a gradient | In the lazy `below.css`; the image is already cached |
| Clips: lamp-lit vignette and bronze edge; under a fine pointer the picture leans in (scale 1.04, 700 ms ease-out) and the edge warms | Clips read as windows onto the table, not flat rectangles | ~120 B gzip inline |
| Primary buttons: lamplight runs once across on hover (behind the label); every button sinks 1 px with a flipped bevel when pressed | Press feedback that returns to rest (game-feel) | ~150 B gzip inline |
| Feature icons engrave themselves on scroll, finished a quarter up the screen | Ties the band to the self-drawing dividers | ~100 B gzip inline |
| Phones: the hero board lags the scroll and swells (12 %, 1.12x) as the hero leaves | Phones had no depth motion at all | ~40 B gzip inline |
| Empty leaderboards: the two ruled ledgers stay blank and a slip with a terracotta wax seal drops across them, a degree off square | Charm for the launch-day state, and the section keeps its size | In the lazy stats CSS |

## Fixes

- **HTML bytes (V6-056):** 14,185 → 13,667 B gzip (13.9 kB on the wire with headers). Component styles are
  all BEM-prefixed and Astro's `where` scoping adds no specificity, so `is:global` produced byte-identical
  CSS and markup (checked by normalising both builds) minus 547 `data-astro-cid` attributes (−788 B).
- **Deep link to #leaderboards (V6-056):** CLS was 0.25–0.69 at the six widths (the title painted alone,
  then the slots pushed the clips; the count-up moved centred counters). Now 0.0000: the section is at
  least one screen tall and the counters fill their cell. The empty state used to shrink the section by
  ~720 px under 900 px; it now keeps the filled boards' size. stats-check covers both from first paint.
- **FAQ (V6-036):** three answers promised UI that has not landed. Now: the campaign plays in the browser
  with no account, online duels and the war are in Telegram for now; mouse and keyboard with battle
  hotkeys (no "rebind"); cloud sync in Telegram; deletion through `/delete_my_data` (bot, privacy notice).
- **Title (V6-025):** 68 → 58 characters; description 133 → 151.

## ux-review (WCAG 2.2 AA, axe-core 4.14 with every lazy part loaded, filled and empty, 390 and 1440)

0 violations. Keyboard walk: 29 stops at 390, 33 at 1440, skip link first, every stop visible with the
lattice ring. Contrast by hand where axe cannot see the background: cream on the hover terracotta was
3.87:1 (15 px bold is not large text) → hover is now redder, 4.74:1; the hover light runs behind the label.
Closing title over the board ≥ 6.7:1. Alt text: hero, clip posters described; busts decorative (name in
the h3). Reduced motion: every new animation is gated (sections-check asserts icons and board).

## SEO (seo-audit, on-page-seo, technical-seo, schema-markup)

Pass: one h1, ordered h2/h3, canonical, OG and Twitter 1200x630 with alt, JSON-LD WebSite + VideoGame and
one VideoObject per clip, sitemap (7 URLs), robots (Disallow /api/), 404 noindex. Fixed: title length,
description length; the six legal pages had no description or canonical and relative, one-way hreflang
(now absolute pairs). Logged: no FAQPage schema (deliberate, V6-036).

## Asset audit (ASSET_SPEC and ADR-0011 budgets; sizes from `stat`)

| Budget | Limit | Measured | Verdict |
|---|---|---|---|
| Clip WebM / MP4 | 800 kB / 1.1 MB | max 783.5 kB / 1,062.0 kB | pass |
| Clip poster AVIF | 40 kB | max 39.7 kB (M3) | pass (tight) |
| Class busts | 25 kB each | max 25.4 kB = 24.8 KiB (chariot) | pass in KiB; at the line in kB |
| Fonts | 90 kB (Cinzel 30, Inter 60) | 63.4 kB (15.2, 48.3) | pass |
| Hero mobile / LCP layer | 180 / 120 kB | 98.1 / 87.1 kB | pass |
| Hero desktop | 450 kB | 142.3 kB | pass |
| OG image | 150 kB | 146.8 kB | pass |

Orphans: 16 hero files (440 kB: separate terrain and unit layers, 960 px beam and foreground, every AVIF sky
and beam, PNG twins of WebP-only layers) had no reference; removed (regenerated by
`scripts/art/landing/diorama.mjs`). Missing: none. Naming: clips (`M1.webm`, `G1-poster.avif`), `og.jpg`
and the favicon set keep their web and ASSET_LOG names: renaming lengthens eight inline URLs per clip on a
page at the LCP cliff. `icon-512.png` (378 kB) is manifest-only, never on the page.

## Lighthouse 12.8.2 (astro preview, 3 runs each)

| | Perf / A11y / BP / SEO | LCP | CLS | TBT | Budget |
|---|---|---|---|---|---|
| Mobile | 99 / 100 / 100 / 100 ×3 | 1.96, 1.96, 1.88 s (p75 1.96) | 0 | 0 ms | LCP ≤ 2.0 s, CLS ≤ 0.02, TBT ≤ 100 |
| Desktop | 100 / 100 / 100 / 100 ×3 | 0.46, 0.47, 0.46 s | 0 | 0 ms | LCP ≤ 1.2 s |

Mobile LCP is unchanged from LAND-04 (1.96 s): 69 % of it is render delay in the simulation, not bytes.
HTML now sits ~530 B under the cliff instead of ~15 B.
