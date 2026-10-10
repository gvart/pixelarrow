# Epic: Assets (Gemini queue, assets agent only)

> **ID**: EP-22
> **Layer**: Presentation
> **GDD**: design/art/art-bible.md, docs/v5/art/ASSET_LIST.md, docs/v5/art/ASSET_PIPELINE.md (S2-ART-BIBLE), docs/v5/ux/HUB_DIRECTIONS.md
> **Architecture Module**: docs/v5/gemini/**, docs/v5/ASSET_LOG.md, docs/v5/art/asset-manifest.json, public/art/v5/** (processed)
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 6, in `docs/v5/plan/STORIES.md` (section EP-22)

## Overview

The serial Gemini queue run by the one `assets` agent that owns Chrome: hub mockup directions first, then busts, icons, frescoes and vignettes, beast plates and reward art, and the pixel art the expansions need. Wiring each asset into a scene belongs to the consuming screen story.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Painted menu art only; chrome stays procedural; world sprites stay pixel art. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-art-mockups | 2-3 hub directions, honest allowlist, /ux-review pick | No ADR (informational) |
| TR-art-list | 56 listed assets + v5 expansion art | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| AS-01 | Hub mockup directions A, B, C rendered from HUB_DIRECTIONS, checked tile by tile, and the /ux-review pick. | Visual/Feel | Ready | 1 | W1 |
| AS-02 | 21 class busts and 3 narrator portraits (ART-012..). | Visual/Feel | Ready | 2 | W2 |
| AS-03 | Icons: the 8 atlas icons, the Codex book, and v5 icons (5 doctrines, 7 actives, standard, works, captain). | Visual/Feel | Ready | 1.5 | W3 |
| AS-04 | 5 frescoes, 6 settlement vignettes and the splash key art. | Visual/Feel | Ready | 1.5 | W4 |
| AS-05 | 8 beast plates, 3 reward chests and the laurels. | Visual/Feel | Ready | 1 | W5 |
| AS-06 | Expansion pixel art: works (stakes, ditch, wagon laager, palisade, rampart), captain marker, standard banner. | Visual/Feel | Ready | 1.5 | W6 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
