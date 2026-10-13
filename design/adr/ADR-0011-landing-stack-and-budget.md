# ADR-0011: The landing site's tech stack and performance budget

## Status
Accepted with amendments (Director, 2026-10-13, V6-015)

## Date
2026-10-13

## Last Verified
2026-10-13 (package versions from the npm registry and Context7 on that day)

## Decision Makers
Autonomous v6 run, story P2-LAND (art-director and ux-designer roles). The owner delegated the call in
the v6 brief ("The tech is your call (log it). Keep it light and separate from the game bundle").

## Summary
pixelarrow.app is a static, English-only marketing page with heavy visuals and almost no logic. It is
built with **Astro (static output, no UI framework, no client runtime)** in its own `landing/` package,
animated with **CSS scroll-driven animations** plus one small vanilla module, and served by the
assets-only landing Worker from HOSTING.md option B. No GSAP, no Lenis, no React. A hard budget
(below) is checked by Lighthouse in QA at 320, 390, 768, 1280, 1440 and 1920 widths.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None: the landing site does not load Phaser or any game code. |
| **Domain** | Web front end (marketing site) |
| **Knowledge Risk** | MEDIUM. Astro 7 is recent (7.0 landed in 2026); CSS scroll-driven animations are not in every engine yet. Both are verified at build time (see Validation). |
| **References Consulted** | Context7 `/withastro/docs` (Picture and `astro:assets`, `@astrojs/sitemap`, client scripts, the v6 → v7 upgrade guide); Context7 `/websites/gsap_v3` (ScrollTrigger, `gsap.matchMedia` and reduced motion); npm registry 2026-10-13; `docs/v6/audit/HOSTING.md` (option B); `docs/playbook/director-brief-v6.md` goal 2; `docs/v6/landing/ART_DIRECTION.md`; `docs/v6/landing/STRUCTURE.md`. |
| **Post-Cutoff APIs Used** | Astro 7 config (stable defaults that were experimental in 6). `animation-timeline: view()` / `scroll()` (CSS). |
| **Verification Required** | `npm run build` in `landing/`; Lighthouse (mobile and desktop presets) against the budget table; the layout pass at the six widths; a reduced-motion pass; a pass in a browser without scroll-driven animation support (Firefox at the time of writing). |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | The hosting ADR for pixelarrow.app / play.pixelarrow.app (V6-009, HOSTING.md option B: a separate assets-only landing Worker). The public stats API ADR (the shape of `/api/public/*`). |
| **Enables** | The landing build stories (section by section), the gameplay clip encode spec for the `video` agent, the landing key-art jobs in `docs/v6/ASSET_LOG.md`. |
| **Blocks** | Any landing code. |
| **Ordering Note** | Package versions are pinned exactly when `landing/package.json` is created, choosing releases at least two weeks old. |

## Context

### Problem Statement
The landing page must look like a game studio's launch site (dark, cinematic, parallax, scroll-driven
motion, gameplay video) and still be fast on a phone over mobile data, with no layout shift and with
`prefers-reduced-motion` honoured. It must not share a bundle, a build or a deploy with the game.

### Constraints
- Separate from the game: its own package, build and Worker (HOSTING.md option B). A landing deploy
  never touches the game Worker or its Durable Objects.
- English only. SEO basics: title, meta, Open Graph and Twitter images, JSON-LD, sitemap, robots,
  favicons.
- Works from 320 px phones to 4K.
- Live stats come from a cached, read-only, same-origin `/api/public/*` proxy; the page must render
  completely without them (empty state).
- Legal pages (`/privacy`, `/terms`, `/refunds`, `/ru/*`) move into the landing build at the same URLs
  (HOSTING.md), because bot texts and `LEGAL_BASE` link to them.
- One story slot's ports (V6-002) for any dev or preview server; never 4321 / 5173 / 4173 defaults.

### Requirements
- Zero framework runtime; JavaScript only where HTML and CSS cannot do the job (stats fetch, video
  play/pause on visibility, the FAQ needs none: `<details>`).
- Responsive images in AVIF and WebP with intrinsic sizes, so nothing shifts.
- Pixel-art stills and clips stay crisp (integer scale, nearest neighbour).
- Motion that degrades to a complete static page.

## Decision

1. **Astro, static output, in `landing/`.** Its own `package.json`, `astro.config.mjs` and
   `wrangler.jsonc` (the assets-only landing Worker of option B). Pages are `.astro` components with
   no UI framework integration. `@astrojs/sitemap` writes the sitemap. `astro:assets` `<Picture>`
   writes AVIF + WebP with `width`/`height` for every raster. Astro was at 7.3.8 and
   `@astrojs/sitemap` at 3.7.4 on 2026-10-13; pin the newest release that is at least two weeks old.
2. **Motion is CSS first.**
   - Parallax and scroll reveals use CSS scroll-driven animations (`animation-timeline: scroll()` for
     the hero layers, `view()` for section entrances), animating only `transform` and `opacity`.
   - Every motion rule sits inside
     `@media (prefers-reduced-motion: no-preference)` **and**
     `@supports (animation-timeline: view())`. Outside those, the page is the finished static
     layout: nothing starts hidden, so nothing depends on JS or a timeline to appear.
   - Hover micro-interactions only under `@media (hover: hover) and (pointer: fine)`.
   - One orchestrated moment, not effects everywhere (ART_DIRECTION.md §2): the hero's scroll-out.
3. **One small vanilla module** (`landing/src/scripts/page.ts`, bundled by Astro):
   - fetch `/api/public/stats` and `/api/public/leaderboards` after `load`, fill fixed-size slots,
     keep the empty state on any error;
   - an `IntersectionObserver` that plays a clip when it is in view and pauses it when it is not,
     and that only sets `src`/`preload` when a clip first comes near the viewport;
   - the hero video starter (rules in the budget below).
4. **Fonts:** self-hosted woff2, latin subset only: Cinzel 700 (display, the game's face) and Inter
   variable (text). `font-display: swap` with a metric-matched fallback (`size-adjust`,
   `ascent-override`) so the swap does not shift layout. Only Cinzel 700 is preloaded.
5. **Pixel art:** stills are exported at an integer multiple of the game's pixels and shown with
   `image-rendering: pixelated` at integer CSS scale where the layout allows; clips are upscaled
   with nearest neighbour before encoding (`-sws_flags neighbor`), never by the browser's bilinear
   filter from a small source.
6. **No smooth-scroll library and no scroll hijacking.** Native scrolling, native anchors, native
   find-in-page.

### Performance budget (checked by Lighthouse and the network panel in QA)

Lighthouse presets: mobile (simulated slow 4G, 4x CPU) and desktop. Numbers are the 75th percentile
of three runs.

| Metric | Mobile (390 px) | Desktop (1440 px) | Hard fail |
|---|---|---|---|
| LCP | ≤ 2.0 s | ≤ 1.2 s | > 2.5 s |
| CLS | ≤ 0.02 | ≤ 0.02 | > 0.1 |
| TBT (lab proxy for INP) | ≤ 100 ms | ≤ 50 ms | > 200 ms |
| INP (field, once live) | ≤ 150 ms | ≤ 150 ms | > 200 ms |
| Lighthouse Performance | ≥ 90 | ≥ 95 | < 85 |
| Lighthouse Accessibility / Best practices / SEO | ≥ 95 / ≥ 95 / 100 | same | any < 90 |

| Resource | Budget (compressed, on the wire) |
|---|---|
| First-party JS, whole page | ≤ 15 kB gzip (hard cap 30 kB). No third-party script, no analytics tag in v6. |
| CSS | ≤ 25 kB gzip total; critical CSS inlined, ≤ 14 kB |
| Fonts | ≤ 90 kB total (Cinzel 700 latin ≤ 30 kB, Inter variable latin ≤ 60 kB) |
| HTML | ≤ 30 kB gzip |
| **Above the fold, mobile 390x844** (HTML + CSS + fonts + hero images + JS) | **≤ 350 kB** |
| **Above the fold, desktop 1440x900** | **≤ 650 kB** |
| Hero parallax layers (AVIF) | at most 4 layers; ≤ 180 kB together on mobile, ≤ 450 kB on desktop; the LCP layer ≤ 120 kB mobile with `fetchpriority="high"` |
| Hero ambient video (desktop only) | 6–8 s seamless loop, 1280x720 (1920x1080 source not shipped), 24–30 fps, no audio: WebM (AV1, VP9 fallback) ≤ 1.2 MB, MP4 (H.264) ≤ 1.6 MB; never the LCP element |
| Each gameplay clip | 4–8 s loop, 960x540 (16:9) or 720x720 (1:1), no audio: WebM ≤ 800 kB, MP4 ≤ 1.1 MB; poster AVIF ≤ 40 kB |
| Section images below the fold | lazy (`loading="lazy"`, `decoding="async"`); each ≤ 80 kB AVIF at its largest rendered width; class busts ≤ 25 kB each |
| Whole page after a full scroll | ≤ 6 MB desktop with every clip played; ≤ 2.5 MB mobile with clips left on their posters |
| Requests before LCP | ≤ 12 |

Images are generated at the widths the layout needs (for example 390, 780, 1280, 1920, 2560) and
served through `srcset`/`sizes`; 4K screens get the 2560 source scaled by CSS (the painted layers
are soft, so this is acceptable; pixel stills keep integer scaling instead).

### Reduced motion, mobile and data-saver fallbacks

| Condition | What changes |
|---|---|
| `prefers-reduced-motion: reduce` | No parallax (layers sit at their resting offsets as one composed picture); no scroll reveals; the hero video never loads (poster only); gameplay clips do not autoplay: each shows its poster and a play button, and plays only when pressed; no hover lifts, only colour and outline changes. |
| No `animation-timeline` support | The static layout, fully visible. The JS module does not polyfill scroll timelines. |
| Width < 768 px | Hero is two layers (sky + flattened mid/foreground), no hero video; clips load their source only when 50% in view and play muted inline; at most one clip plays at a time. |
| `navigator.connection.saveData` or `effectiveType` of `2g`/`slow-2g` (where the browser exposes them) | As reduced motion for video: posters only, play on press. |
| JS disabled or failed | Everything but live numbers works: the stats area shows its empty state text, clips show posters with native `controls`. |
| `(hover: none)` | No hover-only information; everything shown by hover is also visible or reachable by tap. |

## Alternatives Considered

### Alternative 1: Vite multi-page app with hand-written HTML and TypeScript
- **Pros**: Same tool as the game (Vite 8), no new framework, smallest dependency list.
- **Cons**: We would rebuild what Astro gives for free: per-section components without a runtime,
  AVIF/WebP `<picture>` generation with intrinsic sizes, a sitemap. The image pipeline is where the
  budget is won or lost, and hand-rolled `srcset` sets drift.
- **Rejection Reason**: More code to own for the same output. Astro uses Vite underneath, so the
  build stays familiar.

### Alternative 2: GSAP 3.15 + ScrollTrigger for parallax and reveals
- **Pros**: Mature, now free including plugins; `gsap.matchMedia()` handles breakpoints and reduced
  motion; works in every browser.
- **Cons**: About 35–40 kB gzip for core plus ScrollTrigger, more than the whole JS budget; runs
  scroll work on the main thread; tempts a page full of effects.
- **Rejection Reason**: The budget's hard cap is 30 kB. CSS scroll timelines run on the compositor
  where supported and fall back to a finished static page. Revisit only if QA shows a needed effect
  that CSS cannot do, and then load it lazily below the fold.

### Alternative 3: Lenis smooth scrolling
- **Pros**: The "premium site" glide.
- **Cons**: Replaces native scrolling: breaks expected scroll physics on trackpads and phones,
  interferes with anchors, find-in-page and assistive tech, and adds main-thread work.
- **Rejection Reason**: Accessibility and feel cost for a cosmetic effect. Native scroll only.

### Alternative 4: A React-based framework (Next.js, Remix) or SvelteKit
- **Rejection Reason**: A client runtime and hydration for a page with almost no state. Fails the JS
  budget before any feature is built.

### Alternative 5: Put the landing page inside the game build
- **Rejection Reason**: The brief and HOSTING.md option B require separate bundles and deploys.

## Consequences

### Positive
- The landing page ships with almost no JavaScript; the budget is easy to hold.
- Motion degrades to a complete page in every engine and for reduced-motion users.
- Image sizes are generated, so no hand-made `srcset` drift and no layout shift.
- Deploys independently of the game.

### Negative
- A second toolchain in the repo (`landing/` with its own lockfile and CI job).
- Browsers without scroll-driven animations see no parallax (accepted: they get the static design).
- Astro 7 is young; pinning and the two-week rule mitigate it.

## Risks
- **Hero art too heavy.** Mitigation: the LCP layer's byte budget is checked per build; the hero
  composition is designed so the mid layer alone carries the picture (ART_DIRECTION.md §8).
- **Pixel clips blur in encoding.** Mitigation: nearest-neighbour upscale before encode, a CRF that
  keeps flat colours, and a QA check of a still frame at 100% zoom.
- **Stats API slow or down.** Mitigation: fetched after `load` into fixed-size slots; the proxy
  serves the last cached value; empty state otherwise. No CLS either way.
- **Lighthouse variance.** Mitigation: three runs, 75th percentile, both presets.

## GDD Requirements Addressed

| Source | Requirement | How this ADR addresses it |
|---|---|---|
| Brief goal 2 | Dark, effects, parallax, scroll-driven animation, micro-interactions | CSS scroll timelines, layered hero, hover rules for fine pointers |
| Brief goal 2 | Gameplay videos, small webm + mp4 with posters | Clip budget and loading rules |
| Brief goal 2 | Fast, 320 px to 4K, lazy media, reduced motion, no layout shift, budget in the ADR, Lighthouse in QA | The budget and fallback tables |
| Brief goal 2 | Light and separate from the game bundle | `landing/` package and Worker |
| Brief goal 2 | SEO basics | Astro sitemap, static meta, JSON-LD in the layout |

## Performance Implications
- **CPU**: compositor-only animation where supported; no main-thread scroll handlers.
- **Memory**: at most one playing clip on phones, two on desktop.
- **Load Time**: budgets above.
- **Network**: about 350 kB to first view on a phone; video only on demand or on desktop.

## Migration Plan
None: new package. Legal pages move from the game's `public/` into `landing/` in the hosting story.

## Validation Criteria
- Lighthouse mobile and desktop meet every row of the budget table at 390 and 1440 widths; a layout
  pass at 320, 390, 768, 1280, 1440 and 1920 shows no overflow and CLS ≤ 0.02.
- With reduced motion emulated: no element moves on scroll, no video requests before a press.
- With scroll timelines unsupported: every section is visible and complete.
- Network panel: before LCP ≤ 12 requests and the above-the-fold totals within budget.
- `landing/dist` contains no file from the game build.

## Related
- `docs/v6/landing/ART_DIRECTION.md`, `docs/v6/landing/STRUCTURE.md`, `docs/v6/landing/DIRECTION_PICK.md`
- `docs/v6/audit/HOSTING.md`, `docs/v6/DECISIONS.md` (V6-009)
