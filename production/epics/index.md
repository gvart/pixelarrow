# Epics Index

Last Updated: 2026-10-10
Engine: Phaser 3.90 + TypeScript + Vite (V5-028, ADR-0003 Rejected)

Source of truth for stories: `docs/v5/plan/STORIES.md` (one row per story). Waves: `docs/v5/plan/SPRINTS.md`. Progress: `docs/v5/PROGRESS.md` (V5-009).

| Epic | Layer | System | GDD | Stories | Status |
|------|-------|--------|-----|---------|--------|
| UI foundation: design system and kit (EP-01) | Foundation | ui-foundation | design/ux/interaction-patterns.md | 7 stories | Ready |
| Input layer (EP-02) | Foundation | input-layer | design/gdd/controls.md | 2 stories | Ready |
| Live fixes left over (EP-03) | Core | live-fixes | docs/v5/AUDIT.md | 3 stories | Ready |
| Sim train 2 (SIM_VERSION 2) and the v5 save bump (EP-04) | Core | sim-train-2 | docs/v5/VISION.md | 4 stories | Ready |
| AI doctrines and band captains (EP-05) | Feature | ai-doctrines | design/gdd/ai-doctrines.md | 3 stories | Ready |
| Formations and orders (EP-06) | Feature | formations-orders | design/gdd/formations-orders.md | 3 stories | Ready |
| Perk paths, signature actives and the Standard (EP-07) | Feature | abilities | design/gdd/abilities.md | 3 stories | Ready |
| Campaign arc (EP-08) | Feature | campaign-arc | design/gdd/campaign-arc.md | 4 stories | Ready |
| Overland event deck (EP-09) | Feature | campaign-events | design/gdd/campaign-events.md | 3 stories | Ready |
| Field works (EP-10) | Feature | field-works | design/gdd/field-works.md | 3 stories | Ready |
| Battle controls (touch first) (EP-11) | Feature | controls | design/gdd/controls.md | 7 stories | Ready |
| Battle readability (EP-12) | Presentation | battle-readability | design/gdd/battle-readability.md | 3 stories | Ready |
| Screens 1: hubs and navigation (EP-13) | Presentation | screens-hubs | design/ux/ia.md | 2 stories | Ready |
| Screens 2: tutorial and first run (EP-14) | Presentation | screens-onboarding | design/ux/screens-campaign.md | 2 stories | Ready |
| Screens 3: army and hero (EP-15) | Presentation | screens-army-hero | design/ux/screens-campaign.md | 2 stories | Ready |
| Screens 4: battle HUD chrome and Results (EP-16) | Presentation | screens-battle-results | design/ux/hud.md | 2 stories | Ready |
| Screens 5: settlements, camp and world (EP-17) | Presentation | screens-campaign-world | design/ux/screens-campaign.md | 4 stories | Ready |
| Screens 6: duels and war (EP-18) | Presentation | screens-duels-war | design/ux/screens-modes.md | 4 stories | Ready |
| Screens 7: shop and market (EP-19) | Presentation | screens-shop-market | design/ux/screens-modes.md | 2 stories | Ready |
| Screens 8: Codex (EP-20) | Presentation | screens-codex | design/ux/screens-modes.md | 1 stories | Ready |
| Screens 9: remaining dialogs (EP-21) | Presentation | screens-dialogs | design/ux/screens-modes.md | 2 stories | Ready |
| Assets (Gemini queue, assets agent only) (EP-22) | Presentation | assets | design/art/art-bible.md | 6 stories | Ready |
| Feel and audio (EP-23) | Polish | feel-audio | design/gdd/battle-readability.md | 4 stories | Ready |
| Economy and balance deferred items (EP-24) | Feature | economy-balance | docs/v5/vision/GDD_REVIEW.md | 4 stories | Ready |
| Final QA (EP-25) | Polish | final-qa | docs/v5 | 6 stories | Ready |

## v6 epics (P3-PLAN, 2026-10-13)

Source of truth for v6 stories: each `production/epics/v6-*/EPIC.md` (stories V6-<EPIC>-NN with goal, files, dependencies, acceptance criteria, skills, agent, port slot and estimate; V6-005). Sprints: `docs/v6/plan/SPRINTS.md`. Architecture review: `docs/v6/plan/ARCH_REVIEW.md`. Progress: `docs/v6/PROGRESS.md`. Engine: Phaser 3.90 + TypeScript + Vite; Cloudflare Workers; Astro (landing).

| Epic | Layer | System | GDD | Stories | Status |
|------|-------|--------|-----|---------|--------|
| Platform layer migration (ADR-0006) (v6-platform-layer) | Foundation | v6-platform-layer | design/gdd/systems-index.md #42 Platform layer | 7 stories | Ready |
| Hosting split and landing package scaffold (ADR-0007, ADR-0011) (v6-hosting) | Foundation | v6-hosting | design/gdd/systems-index.md #51 Landing site (hosting part) | 3 stories | Ready |
| Layout-check matrix and gates extension (v6-gates) | Foundation | v6-gates | Brief "Hard constraints: screen matrix" and "Verification" | 3 stories | Ready |
| Responsive foundation: scale policy, size classes, layout primitives, layout-check rules, wheel (v6-responsive-foundation) | Foundation | v6-responsive-foundation | design/ux/landscape-v6.md §1–§5, §14, §16 (accepted, V6-020) | 4 stories | Ready |
| Responsive screens: every screen family in landscape and tablet (v6-responsive-screens) | Presentation | v6-responsive-screens | design/ux/landscape-v6.md §6–§16 (accepted, V6-020) | 11 stories | Ready |
| Input layer: action map, keyboard, mouse, focus and rebinding (ADR-0012) (v6-input) | Foundation | v6-input | design/ux/input-v6.md | 6 stories | Ready |
| Accounts, sessions and bot protection (ADR-0008), starting with the PBKDF2 spike (v6-accounts) | Core | v6-accounts | design/ux/accounts-v6.md flows 1–4 | 7 stories | Ready |
| Linked accounts, nicknames, deletion and privacy (ADR-0009) (v6-linking-privacy) | Core | v6-linking-privacy | design/ux/accounts-v6.md flows 5–8 | 7 stories | Ready |
| Payments interface and the web "coming soon" placeholder (v6-payments) | Feature | v6-payments | design/gdd/systems-index.md #47 | 2 stories | Ready |
| Public stats API (ADR-0010) (v6-public-stats) | Feature | v6-public-stats | design/gdd/systems-index.md #50 | 3 stories | Ready |
| Landing site build (pixelarrow.app, with the V6-015 wow amendments) (v6-landing) | Presentation | v6-landing | docs/v6/landing/{STRUCTURE,ART_DIRECTION,DIRECTION_PICK}.md | 6 stories | Ready |
| QA and release (Phase 8) (v6-qa-release) | Release | v6-qa-release | Brief Phase 8 and "Done means" | 5 stories | Ready |
