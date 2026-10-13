# Epic: Landing site build (pixelarrow.app, with the V6-015 wow amendments)

> **ID**: v6-landing (stories V6-LAND-NN)
> **Layer**: Presentation
> **GDD / spec**: docs/v6/landing/{STRUCTURE,ART_DIRECTION,DIRECTION_PICK}.md; design/gdd/systems-index.md #51
> **Architecture Module**: landing/src/** (layouts, sections, scripts, assets), landing/public/**
> **Status**: Ready
> **Engine Risk**: MEDIUM (Astro 7 is young; CSS scroll timelines are not in every engine)
> **Manifest Version**: ADR-0011 budget table and the V6-015 amendments
> **Stories**: 6, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 16 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Direction B "Night Tabletop" with the three accepted changes, built section by section. The hero is a living diorama (V6-015): at least four parallax layers, real game sprites that march, clash and break, a lamp that follows the pointer, and a camera dive on scroll, with a static poster under reduced motion. Copy, clips and stats show only features that exist and only real numbers. LAND-06 runs the "would a stranger click Play?" pass and the budget.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0011: Landing stack and budget (accepted with the V6-015 amendments) | Astro static, CSS-first motion, ≤ 15 kB critical JS plus one lazy hero module ≤ 80 kB, Lighthouse budget at six widths. | MEDIUM |
| ADR-0010: Public stats API | PublicSummaryV1 drives the stats section. | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-land-001 | Dark, effects, parallax, scroll-driven animation, micro-interactions; looks like a studio launch site | ADR-0011 + V6-015 |
| TR-v6-land-002 | Gameplay clips from the real game, webm + mp4 with posters | ADR-0011 |
| TR-v6-land-003 | Gemini key art matched to the game | ART_DIRECTION.md (no ADR) |
| TR-v6-land-004 | Live stats from the public API; tasteful empty state | ADR-0010 |
| TR-v6-land-005 | CTAs, features, classes, modes, FAQ, privacy, footer; English only; SEO basics | ADR-0011; STRUCTURE.md |
| TR-v6-land-006 | 320 px to 4K, lazy media, reduced motion, no layout shift, Lighthouse budget | ADR-0011 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-LAND-01 | Chrome, tokens and SEO head: layout, fonts, nav, skip link, footer, section stubs, meta, Open Graph, JSON-LD, sitemap, robots, favicons | UI | Ready | S2 | 2.5 | V6-HOST-01 |
| V6-LAND-02 | Hero living diorama: four or more parallax layers, real sprites that march, clash and break, pointer lamp, camera dive, H1 ambient loop | Visual/Feel | Ready | S9 | 4 | V6-LAND-01, V6-GATE-03 |
| V6-LAND-03 | Features, classes and modes sections: hover-tilt class cards, modes clips M1–M4, self-drawing dividers | UI | Ready | S14 | 3 | V6-LAND-01, V6-GATE-03 |
| V6-LAND-04 | Live stats and leaderboards: one summary fetch, count-up, parchment tables, empty state with no invented numbers | UI | Ready | S14 | 2 | V6-STATS-03, V6-LAND-01 |
| V6-LAND-05 | Gameplay clips grid G1–G4, FAQ and the closing call to action | UI | Ready | S15 | 2 | V6-LAND-03 |
| V6-LAND-06 | Wow and verification pass: /ux-review and owner-eyes at 1440 and 390, motion tuning, SEO audit, Lighthouse budget, asset audit | Visual/Feel | Ready | S16 | 2.5 | V6-LAND-02, V6-LAND-03, V6-LAND-04, V6-LAND-05, V6-GATE-03 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-LAND-01: Chrome, tokens and SEO head: layout, fonts, nav, skip link, footer, section stubs, meta, Open Graph, JSON-LD, sitemap, robots, favicons

| Field | Value |
| --- | --- |
| Goal | Chrome, tokens and SEO head: layout, fonts, nav, skip link, footer, section stubs, meta, Open Graph, JSON-LD, sitemap, robots, favicons. |
| Type | UI |
| Sprint and port slot | S2 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 2.5 d expected (2–3.5); confidence Medium |
| Depends on | V6-HOST-01 |
| Governing ADRs and specs | ADR-0011 Decisions 1, 4; STRUCTURE.md "Global chrome", "SEO and metadata" |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/assets-staging/** (moved into the Astro package: favicon set to landing/public/, OG image, hero layers to landing/src/assets/hero/; staging folder removed; V6-019)
- landing/src/layouts/**
- landing/src/styles/**
- landing/src/fonts/**
- landing/src/components/{Nav,Footer,SkipLink,Seo}.astro
- landing/src/components/sections/*.astro (empty stubs, one per section, filled by later stories)
- landing/src/pages/index.astro (composes the stubs; later stories never edit it)
- landing/public/{robots.txt, favicon set, og image}

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/.claude/skills/design-principles/SKILL.md`
- plugin skill `searchfit-seo:schema-markup` (Skill tool)
- plugin skill `searchfit-seo:technical-seo` (Skill tool)
- plugin skill `searchfit-seo:on-page-seo` (Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Every file in `landing/assets-staging/` (V6-019: favicon, og, hero) is moved into the Astro package and referenced through `astro:assets` or `public/`; the staging folder is gone and its ASSET_LOG entries point at the new paths.
- [ ] Colour tokens follow ART_DIRECTION.md §4 with V6-015's changes (warm basalt, parchment panels, thin cyan dividers).
- [ ] Self-hosted Cinzel 700 and Inter variable (latin), metric-matched fallbacks; only Cinzel is preloaded; fonts ≤ 90 kB.
- [ ] Skip link is the first focusable element; nav collapses under 768 px and Play stays visible.
- [ ] Title, description, OG and Twitter (1200x630), JSON-LD VideoGame and WebSite validated with the schema-markup skill; sitemap and robots present.
- [ ] Width check at the six widths (no overflow); `landing/dist` contains no game file.
- [ ] Gates: G-LAND (build and widths), G-SHOTS (six widths) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LAND-02: Hero living diorama: four or more parallax layers, real sprites that march, clash and break, pointer lamp, camera dive, H1 ambient loop

| Field | Value |
| --- | --- |
| Goal | Hero living diorama: four or more parallax layers, real sprites that march, clash and break, pointer lamp, camera dive, H1 ambient loop. |
| Type | Visual/Feel |
| Sprint and port slot | S9 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 4 d expected (3–6); confidence Medium |
| Depends on | V6-LAND-01, V6-GATE-03, P5-LAND-ART layers (merged, V6-019), clip H1 (video agent) |
| Governing ADRs and specs | ADR-0011 + V6-015 amendments 1–3 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/technical-artist.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/src/components/sections/Hero.astro
- landing/src/scripts/hero/** (the lazy module)
- landing/src/assets/hero/** (after V6-LAND-01 moved the staging files)
- scripts/art/landing/** (only to re-render layers)
- landing/public/media/h1.*
- landing/package.json (only if PixiJS v8 is justified)

**Shared files touched** (see SPRINTS.md "Shared files"): `landing/package.json`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/.claude/skills/design-ship/SKILL.md`
- `/Users/v.gladis/.claude/skills/design-principles/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-feel/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/pixijs-rendering/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/create-game-assets/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The hero uses the V6-019 layers (Gemini sky, lamp beam and foreground table; terrain and formations from `scripts/art/landing/diorama.mjs`, re-run deterministically if needed).
- [ ] The headline, sub-line and both CTAs are never overlapped by the diorama at any width (V6-019 found the trees over the subtitle at 1440): a scrim or a shifted diorama keeps the text column clear, proved by screenshots at 320, 390, 768, 1280, 1440 and 1920.
- [ ] At least 4 depth layers (AVIF srcset; LCP layer ≤ 120 kB mobile with `fetchpriority="high"`); CSS scroll timelines drive parallax and the camera dive; only transform and opacity animate.
- [ ] The lazy module is ≤ 80 kB gzip, loads after LCP and idle, and is skipped under reduced motion, data saver and below 768 px; the poster stands in until it loads.
- [ ] Sprites are exported from the real game atlas at integer scale; the march, clash and break show only units and behaviours that exist.
- [ ] The lamp light follows the pointer on fine pointers only; nothing is hover-only.
- [ ] LCP and CLS within ADR-0011 at 390 and 1440; Firefox (no timelines) shows the finished static hero.
- [ ] Gates: G-LAND, G-SHOTS (six widths, reduced motion) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

*Note:* Pair with the ui-programmer role file for the Astro side.

### V6-LAND-03: Features, classes and modes sections: hover-tilt class cards, modes clips M1–M4, self-drawing dividers

| Field | Value |
| --- | --- |
| Goal | Features, classes and modes sections: hover-tilt class cards, modes clips M1–M4, self-drawing dividers. |
| Type | UI |
| Sprint and port slot | S14 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-LAND-01, V6-GATE-03, clips M1–M4 (video agent), class busts (assets agent) |
| Governing ADRs and specs | ADR-0011; STRUCTURE.md §2–§4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/src/components/sections/{Features,Classes,Modes}.astro
- landing/src/components/{Divider,TiltCard,Clip}.astro (new)
- landing/src/scripts/clips.ts (new: IntersectionObserver play and pause)
- landing/src/assets/{classes,modes}/**
- landing/public/media/m*.*

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/.claude/skills/design-ship/SKILL.md`
- `/Users/v.gladis/.claude/skills/design-principles/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-feel/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Mode cards use the real clip posters, not new art (V6-019, A4).
- [ ] Every feature, class and mode named exists in the game (checked against docs/GAMEPLAY.md and the class data; list in NOTES.md).
- [ ] Cards tilt only under `(hover: hover) and (pointer: fine)`; dividers draw on view under no-preference reduced motion only.
- [ ] Clips set their source only near the viewport, play muted when visible, pause when not; one at a time on phones.
- [ ] Budget rows hold; width check and screenshots at the six widths.
- [ ] Gates: G-LAND, G-SHOTS (six widths) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LAND-04: Live stats and leaderboards: one summary fetch, count-up, parchment tables, empty state with no invented numbers

| Field | Value |
| --- | --- |
| Goal | Live stats and leaderboards: one summary fetch, count-up, parchment tables, empty state with no invented numbers. |
| Type | UI |
| Sprint and port slot | S14 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-STATS-03, V6-LAND-01 |
| Governing ADRs and specs | ADR-0010 (PublicSummaryV1), ADR-0011 Decision 3 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/src/components/sections/Stats.astro
- landing/src/scripts/page.ts (stats part)
- landing/src/scripts/countUp.ts (new)
- landing/scripts/stats-check.mjs (new)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-feel/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] One request to `/api/public/v1/summary` after load fills fixed-size slots; no CLS when data arrives.
- [ ] Rendered values equal the fixture's exactly (stats-check); `[]` boards and small totals show the empty state; a 503 shows it too.
- [ ] Counters count up on view (static under reduced motion); "as of" time from `generatedAt`.
- [ ] Top duelists and War standings (clan, score, members) per STRUCTURE.md §5 as amended.
- [ ] Gates: G-LAND, G-SHOTS (six widths, empty and filled) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LAND-05: Gameplay clips grid G1–G4, FAQ and the closing call to action

| Field | Value |
| --- | --- |
| Goal | Gameplay clips grid G1–G4, FAQ and the closing call to action. |
| Type | UI |
| Sprint and port slot | S15 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-LAND-03, clips G1–G4 (video agent) |
| Governing ADRs and specs | ADR-0011; STRUCTURE.md §6–§8 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/src/components/sections/{Clips,Faq,ClosingCta}.astro
- landing/public/media/g*.*

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/.claude/skills/design-principles/SKILL.md`
- plugin skill `searchfit-seo:schema-markup` (Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] 2x2 grid on desktop, snap scroller or column on phones; reuses Clip.astro and clips.ts unchanged; posters AVIF ≤ 40 kB; VideoObject JSON-LD per clip in the section.
- [ ] FAQ answers match STRUCTURE.md §7 and only claim features that exist (web purchases "not available yet").
- [ ] Budget rows hold; screenshots at the six widths.
- [ ] Gates: G-LAND, G-SHOTS (six widths) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LAND-06: Wow and verification pass: /ux-review and owner-eyes at 1440 and 390, motion tuning, SEO audit, Lighthouse budget, asset audit

| Field | Value |
| --- | --- |
| Goal | Wow and verification pass: /ux-review and owner-eyes at 1440 and 390, motion tuning, SEO audit, Lighthouse budget, asset audit. |
| Type | Visual/Feel |
| Sprint and port slot | S16 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2.5 d expected (2–4); confidence Low |
| Depends on | V6-LAND-02, V6-LAND-03, V6-LAND-04, V6-LAND-05, V6-GATE-03 |
| Governing ADRs and specs | ADR-0011 + V6-015 amendment 4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ux-designer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/src/** (fixes only)
- docs/v6/qa/LANDING.md (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `landing/package.json`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/.claude/skills/design-ship/SKILL.md`
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-feel/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- plugin skill `searchfit-seo:seo-audit` (Skill tool; substitute for seo-check, V6-007)
- plugin skill `searchfit-seo:on-page-seo` (Skill tool)
- plugin skill `searchfit-seo:technical-seo` (Skill tool)
- plugin skill `searchfit-seo:schema-markup` (Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/asset-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] A written answer to "would a stranger want to click Play?" at 1440 and 390, with screenshots; iterate until yes.
- [ ] Lighthouse mobile and desktop p75 meet every ADR-0011 row; the six widths pass; reduced motion and no-timeline passes pass.
- [ ] seo-audit, on-page-seo, technical-seo and schema-markup findings fixed or logged.
- [ ] asset-audit of landing media (sizes, formats, names) clean.
- [ ] Gates: G-LAND, G-SHOTS (six widths) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

*Note:* Run as general-purpose with the ux-designer role file plus performance-analyst (V6-004).
