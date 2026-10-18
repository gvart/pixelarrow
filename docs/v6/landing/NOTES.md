# Landing build notes

## V6-LAND-03: features, classes and modes (truth check)

Every name on these sections exists in the game. Checked by hand against the sources below, and the
class names by `landing/scripts/sections-check.mjs` (`npm run test:sections`), which reads
`src/data/classes.ts`.

### Features (`#features`)

| Item | Source |
|---|---|
| Real-time battles; pause and give orders while paused, **in the campaign** | GAMEPLAY › Controls ("Offline battles pause any time"; online battles never pause, so the copy says "in the campaign") |
| Line, column, wedge, loose order, shield wall; drag to move, turn by the knob | GAMEPLAY › Controls (formation drags, the bronze knob) |
| Flanked lines waver, rear hits make them run | GAMEPLAY › Rules (side ×1.8 and rear ×2.8 morale damage, routs) |
| Every man has a name, class, gear and perks; permadeath | GAMEPLAY › Heroes and the army |

Dropped from STRUCTURE.md: the optional "4th century BC" line (no source in the game docs).

### Classes (`#classes`)

Twelve cards, each a class in `src/data/classes.ts` with its `role` and `cultures`; culture names are
the game's own `CULTURE_LABEL` (Hellenes, Carthaginians, Galatae). Lines paraphrase each class's `desc`
or the GAMEPLAY class table.

Spartan hoplite (heavy), Thracian rhomphaia (heavy), Celtic swordsman (heavy), Cretan archer (ranged),
Rhodian slinger (ranged), Scythian horse archer (ranged, mounted), Peltast (light), Thracian falx
(light), Companion cavalry (cavalry), Scythed chariot (cavalry), Royal guard (elite), Sacred Band
(elite). The other six are named in one line: militia, thureophoroi, peltast javelineers, Gallic
warbands, fanatics, Thessalian horse. 18 classes + 3 beasts = the "twenty-one classes" of the intro.

Beasts: Wolf, Wild boar, Brown bear (`role: 'beast'`). Mythical lairs on the war map: hydra, cyclops,
harpies, Nemean lion, minotaur, chimera (DESIGN_V2 › Mythical beasts; `src/data/beasts.ts`). The kraken
and titan are world bosses, not lairs, so they are not named.

Busts: the shipped v5 portraits, `public/ui/busts/bust_<id>.jpg`, copied unchanged to
`landing/public/classes/` (288x288 JPEG, 19.7–25.4 kB, all ≤ 25 kB).

### Modes (`#modes`)

| Mode | Copy source | Clip (real recording, V6-019 A4) |
|---|---|---|
| Campaign | GAMEPLAY › Campaign ("time passes only while the party moves or camps") | M1, overland map |
| Duels | DUELS › Summary (live and async 1v1, separate duel army, no losses, Glory, duel shop) | M2, ranked duel |
| War | DESIGN_V2 › Map, Garrisons, Clans, Mythical beasts | M3, war map |
| Forge | ITEMS › Reforging at the Smith (campaign only, a town's Services tab) | M4, the Smith screen |

Clips and posters moved from `landing/assets-staging/video/` to `landing/public/video/` (V6-027).

## Budget (measured 2026-10-13, Lighthouse 12.8.2, three runs each)

| Metric | Mobile | Desktop | Budget |
|---|---|---|---|
| Performance / A11y / BP / SEO | 99 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | ≥ 90 (95) / 95 / 95 / 100 |
| LCP (p75) | 1.97 s (v6 before this story: 1.81 s) | 0.53 s | ≤ 2.0 s / ≤ 1.2 s |
| CLS / TBT | 0 / 0 ms | 0 / 0 ms | ≤ 0.02 / ≤ 100 ms |
| First-view bytes | 176 kB | 470 kB | 350 kB / 650 kB above the fold |

Critical first-party JS is about 3.1 kB gzip (inline modules about 2.0 kB plus the 1.1 kB hero
starter; the 7.3 kB lazy hero module is outside the 15 kB row). HTML 12.7 kB gzip, inline CSS 6.0 kB.

**Why the stills are JS-lazy:** native `loading="lazy"` let Chromium fetch every bust and two posters
during the first view on a phone (its lazy distance is 1250–2500 px), which pushed mobile LCP to 2.9 s.
`landing/src/scripts/lazy.ts` loads them 600 px ahead instead, with `<noscript>` twins. It is imported
once from `Base.astro` so it is inlined rather than costing a request before LCP.

**Headroom warning for LAND-04/05:** mobile LCP has about 30 ms left under 2.0 s, and most of the
growth over v6 came from HTML weight (7.2 → 11.8 kB on the wire). Keep new section markup lean.

## V6-LAND-02b: the phone hero and the line stagger (V6-029)

**Phones (< 768 px)** now play a lighter cut of the hero battle instead of only the poster. Everything
phone-specific is in the lazy module (`landing/src/scripts/hero/diorama.ts`): the back rank of each side
stays out (38 men, not 57), the canvas is 1x (648x426 instead of 1296x852, drawn from the 2x sheet at half
size, nearest), at most 30 draws a second, 16 motes and 120 dust grains, and no fetch until the diorama is
on screen. The starter in `Hero.astro` (generic, every width) now waits for load, then the poster's LCP
entry, then idle, so not even the module request lands before LCP; it keeps the poster under reduced
motion, data saver, 2g, or `navigator.deviceMemory <= 2`. The canvas pauses offscreen and in hidden tabs.

**Line stagger:** at contact the front ranks stand 2.25 cells apart (was 1.15) and the Celts' files close
onto the hoplites' file interval with a half-file offset, so each Celt shows between two hoplites and
the levelled spears bridge the gap. Same script and timings at every size.

**Tests:** `npm run test:hero` (`landing/scripts/hero-overlap.mjs`) now expects the canvas at every width
without reduced motion (1296x852 from 768 px, 648x426 below), and at 390x844 checks: ≤ 30 draws a second,
no draws offscreen and a resume when back, no canvas or sprite fetch while the page opens past the hero,
and no module or sprite request under reduced motion, data saver or deviceMemory 2.

| Lighthouse 12.8.2, 3 runs | Mobile | Desktop |
|---|---|---|
| Performance / A11y / BP / SEO | 99–100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| LCP | 1.88, 1.96, 1.96 s (phones gated off on the same machine: 1.88, 1.96, 1.96 s) | 0.47–0.51 s |
| CLS / TBT | 0 / 0 ms | 0 / 0 ms |

Mobile total bytes grow from 177 kB to 426 kB, all after LCP (terrain 49 kB, sprite sheet 199 kB, module
8 kB). The hero starter is 1.3 kB gzip (critical JS ≈ 3.3 kB in total); the lazy module 7.6 kB gzip.

## V6-LAND-05: clips, FAQ and closing (truth check)

### Clips (`#clips`)

G1–G4 from `landing/public/video/` (moved from staging, V6-027). Captions say only what each take
shows (ASSET_LOG › P5-VIDEO): G1 the Companions' flank charge and the Celts' rout (seed 207); G2 a pass
over the war map (towns, rivers, a rival army on the march; no fog or lair is in the take, so none is
claimed); G3 the shield wall holding in a duel (not a deployment drag); G4 a reforge at the smith.
Posters AVIF 25.6–38.1 kB (≤ 40 kB). One `VideoObject` per clip in the section (name, thumbnailUrl,
contentUrl, uploadDate 2026-10-13, duration); `description` left out for bytes (recommended, not
required). 2x2 from 768 px; a snap reel under 768 px, so only one take is half in view and plays.

### FAQ (`#faq`)

| Answer | Source | Status |
|---|---|---|
| Stars buy Drachmae for cosmetics, the season pass and shortcuts; gear and heroes never sold; no purchases on the web yet | DESIGN_V2 › Monetization; ROADMAP v6 Payments ("coming soon" on the web) | true today in Telegram; web placeholder is v6 goal 7 |
| Browser with no account; email sign-in for duels and the war; link Telegram | V6-017 (guest play, "Sign in to play online"); ROADMAP v6 Accounts, Linked accounts | **v6, re-check in LAND-06** (ACCT stories) |
| Phones, tablets, laptops; touch or mouse and keyboard; rebindable battle hotkeys | ROADMAP v6 Mouse and keyboard | **v6, re-check in LAND-06** (input stories) |
| Campaign saves on the device, syncs to the cloud when signed in; duels and war on the server | GAMEPLAY › Saves, Cloud save; V6-017 (guest save uploads on sign-up) | true today (Telegram); web accounts v6 |
| English and Russian | brief (game UI is EN and RU) | true today |
| Privacy notice; delete the account from Settings | ROADMAP v6 Privacy (goal 9); `/privacy` exists | **deletion is v6, re-check in LAND-06** |

No FAQPage JSON-LD: Google shows FAQ rich results only for government and health sites, and it would
cost bytes the first flight does not have.

### Closing band

"Your phalanx is waiting" and both buttons. V6-025 fixed: while the band is in view
(`html[data-closing]`, an IntersectionObserver in ClosingCta.astro) the nav's "Play" takes the outline
style, so "Play in browser" is the only terracotta button on screen (tested in sections-check).

### Budget: the first-flight cliff (measured, Lighthouse 12.8.2, astro preview, three runs each)

Mobile LCP is not linear in HTML bytes; it is a cliff. Padding the v6 page with incompressible bytes:
gzip body 12.8 kB → 1.95 s, 13.8 kB → 1.95 s, 14.18 kB → 1.95 s, **14.37 kB → 2.05–2.11 s** (one more
round trip). With these sections' CSS inline the body was 14.5–15.1 kB and LCP 2.04–2.11 s. A second
finding: **any request for the section CSS before LCP**, even one sent on the load event (local
`load` fires before the observed LCP), cost ≈ 75 ms in two of three runs. So:

- The clips, FAQ and closing styles live in `landing/src/styles/below.css` (2.2 kB, 0.96 kB gzip),
  fetched by `landing/src/scripts/below-css.ts` when `#clips` comes within 1500 px, or at once on a
  deep link (`#faq`); `<noscript>` link for no-JS. ADR-0011 inlines only critical CSS, so this fits it.
- Result: HTML 14.16 kB gzip (v6 before: 12.8 kB). Mobile 99/100/100/100, LCP 1.96 s (v6 before:
  1.95 s), CLS 0, TBT 0. Desktop 100/100/100/100, LCP 0.53 s, CLS 0.00004 (unchanged from v6).
- **Warning for LAND-04 and LAND-06:** the body is about 20 bytes under the last good measurement.
  New sections must move their own CSS into the late stylesheet (or a twin) and keep markup tiny; past
  ≈ 14.2 kB gzip, mobile LCP jumps by ≈ 100 ms.
