# v5 Epics

Phase 3 (Plan), written with `/create-epics` at `standard` rigor, `autonomous` automation, `lean` review (PR-EPIC skipped: lean mode, see ANSWERS.md). Each epic has its file at `production/epics/<slug>/EPIC.md`; the index is `production/epics/index.md`. Stories: [STORIES.md](STORIES.md). Waves: [SPRINTS.md](SPRINTS.md).

Days are agent-days: one implementation agent working one focused day, gates included. No sprint history exists, so these are **not calibrated to velocity** (estimate skill).

| Epic | Name | Layer | GDD / spec | Stories | Est. days O / **E** / P | Waves |
| --- | --- | --- | --- | --- | --- | --- |
| EP-01 | [UI foundation: design system and kit](../../../production/epics/ui-foundation/EPIC.md) | Foundation | design/ux/interaction-patterns.md, design/accessibility-requirements.md, design/art/art-bible.md (S2-ART-BIBLE) | 7 | 7 / **10** / 17 | W1, W2, W3, W5, W6, W9, W21 |
| EP-02 | [Input layer](../../../production/epics/input-layer/EPIC.md) | Foundation | design/gdd/controls.md (R1, R2, R11), design/ux/interaction-patterns.md | 2 | 3 / **4** / 6 | W1, W8 |
| EP-03 | [Live fixes left over](../../../production/epics/live-fixes/EPIC.md) | Core | docs/v5/AUDIT.md (Live-player bugs), docs/v5/audit/PLAY.md (B3, B5, B6), new design/gdd/practice-fight.md | 3 | 2.5 / **4.5** / 7.5 | W2, W4, W7 |
| EP-04 | [Sim train 2 (SIM_VERSION 2) and the v5 save bump](../../../production/epics/sim-train-2/EPIC.md) | Core | docs/v5/VISION.md (Release shape), design/gdd/campaign-arc.md (Save impact), every [SERVER] GDD | 4 | 4 / **6** / 10 | W1, W2, W4, W14 |
| EP-05 | [AI doctrines and band captains](../../../production/epics/ai-doctrines/EPIC.md) | Feature | design/gdd/ai-doctrines.md | 3 | 4.5 / **7** / 11.5 | W3, W5, W7 |
| EP-06 | [Formations and orders](../../../production/epics/formations-orders/EPIC.md) | Feature | design/gdd/formations-orders.md | 3 | 4.5 / **7** / 11 | W3, W4, W6 |
| EP-07 | [Perk paths, signature actives and the Standard](../../../production/epics/abilities/EPIC.md) | Feature | design/gdd/abilities.md | 3 | 5.5 / **8** / 12.5 | W7, W8, W9 |
| EP-08 | [Campaign arc](../../../production/epics/campaign-arc/EPIC.md) | Feature | design/gdd/campaign-arc.md | 4 | 5.5 / **9** / 14.5 | W8, W12, W13, W15 |
| EP-09 | [Overland event deck](../../../production/epics/campaign-events/EPIC.md) | Feature | design/gdd/campaign-events.md | 3 | 4 / **6** / 9.5 | W10, W11, W14 |
| EP-10 | [Field works](../../../production/epics/field-works/EPIC.md) | Feature | design/gdd/field-works.md | 3 | 4.5 / **7** / 11 | W10, W11, W14 |
| EP-11 | [Battle controls (touch first)](../../../production/epics/controls/EPIC.md) | Feature | design/gdd/controls.md | 7 | 10.5 / **15** / 23.5 | W5, W7, W8, W9, W10, W13, W15 |
| EP-12 | [Battle readability](../../../production/epics/battle-readability/EPIC.md) | Presentation | design/gdd/battle-readability.md, design/ux/hud.md | 3 | 4 / **5.5** / 8 | W11, W12, W14 |
| EP-13 | [Screens 1: hubs and navigation](../../../production/epics/screens-hubs/EPIC.md) | Presentation | design/ux/ia.md, design/ux/screen-flow.md, design/ux/screens-campaign.md C-3, docs/v5/ux/HUB_DIRECTIONS.md | 2 | 3 / **4** / 6 | W9, W10 |
| EP-14 | [Screens 2: tutorial and first run](../../../production/epics/screens-onboarding/EPIC.md) | Presentation | design/ux/screens-campaign.md C-1, C-2; design/gdd/controls.md; design/gdd/battle-readability.md | 2 | 3 / **4.5** / 7.5 | W11, W17 |
| EP-15 | [Screens 3: army and hero](../../../production/epics/screens-army-hero/EPIC.md) | Presentation | design/ux/screens-campaign.md C-7, C-8; design/gdd/abilities.md R1, R7 | 2 | 4 / **5** / 8 | W12, W13 |
| EP-16 | [Screens 4: battle HUD chrome and Results](../../../production/epics/screens-battle-results/EPIC.md) | Presentation | design/ux/hud.md, design/ux/screens-campaign.md C-9, C-10 | 2 | 4 / **5.5** / 8.5 | W16, W17 |
| EP-17 | [Screens 5: settlements, camp and world](../../../production/epics/screens-campaign-world/EPIC.md) | Presentation | design/ux/screens-campaign.md C-4, C-5, C-6 | 4 | 8 / **10** / 16 | W16, W17 |
| EP-18 | [Screens 6: duels and war](../../../production/epics/screens-duels-war/EPIC.md) | Presentation | design/ux/screens-modes.md M-2 .. M-11 | 4 | 8 / **11** / 16 | W18, W19 |
| EP-19 | [Screens 7: shop and market](../../../production/epics/screens-shop-market/EPIC.md) | Presentation | design/ux/screens-modes.md M-12, M-13 | 2 | 3.5 / **4.5** / 7 | W16, W18 |
| EP-20 | [Screens 8: Codex](../../../production/epics/screens-codex/EPIC.md) | Presentation | design/ux/screens-modes.md M-1, design/ux/ia.md §4 | 1 | 2 / **2.5** / 4 | W15 |
| EP-21 | [Screens 9: remaining dialogs](../../../production/epics/screens-dialogs/EPIC.md) | Presentation | design/ux/screens-modes.md M-15, design/ux/screen-flow.md sheets register | 2 | 3 / **4** / 6 | W15, W20 |
| EP-22 | [Assets (Gemini queue, assets agent only)](../../../production/epics/assets/EPIC.md) | Presentation | design/art/art-bible.md, docs/v5/art/ASSET_LIST.md, docs/v5/art/ASSET_PIPELINE.md (S2-ART-BIBLE), docs/v5/ux/HUB_DIRECTIONS.md | 6 | 5.5 / **8.5** / 17 | W1, W2, W3, W4, W5, W6 |
| EP-23 | [Feel and audio](../../../production/epics/feel-audio/EPIC.md) | Polish | design/gdd/battle-readability.md R4, R6; design/ux/interaction-patterns.md (Animation, Sound) | 4 | 5.5 / **7.5** / 11.5 | W18, W19, W20, W21 |
| EP-24 | [Economy and balance deferred items](../../../production/epics/economy-balance/EPIC.md) | Feature | docs/v5/vision/GDD_REVIEW.md (Deferred 1-3), docs/v5/balance/BASELINE.md (R1, R3, J1), new design/gdd/forge-reroll.md | 4 | 5.5 / **7.5** / 12 | W12, W13, W19, W23 |
| EP-25 | [Final QA](../../../production/epics/final-qa/EPIC.md) | Polish | docs/v5 brief Phase 8 | 6 | 8 / **11.5** / 17.5 | W6, W20, W22, W23, W24, W25 |
| | **Total** | | | **86** | 122.5 / **175** / 279 | W1–W25 |

## Layer order

1. **Foundation**: EP-01 UI foundation, EP-02 input layer (plus the EP-04 plumbing ST-01, ST-03, ST-02, which every Core story needs).
2. **Core**: EP-03 live fixes, EP-04 sim train 2 and the save bump.
3. **Feature**: EP-05 to EP-11 (the six expansions, controls), EP-24 economy.
4. **Presentation**: EP-12 readability, EP-13 to EP-21 (screens in the brief's order), EP-22 assets (runs from W1 in its own serial lane).
5. **Polish**: EP-23 feel and audio, EP-25 final QA.

## Already done (not planned again)

Saves (S4-FIX-SAVES), sim versioning (S4-SIM-VERSION), the scene-data bugs B1/B2, audits, vision, the eight GDDs and their review, IA (S2-UX-IA), staying on Phaser 3.90 (V5-028). In progress and planned around: the art bible (S2-ART-BIBLE), which gates F-01 and AS-01.
