# v6 sprint plan

> **Written**: 2026-10-13 by P3-PLAN (`/sprint-plan`, `/estimate`), in the producer and lead-programmer roles.
> **Stories**: 64 in 12 epics, in `production/epics/v6-*/EPIC.md` (V6-005). Index: `production/epics/index.md` (v6 section).
> **Inputs**: the v6 brief, DECISIONS V6-001..020, ADOPT.md, the audits (PLATFORM, SERVER, HOSTING, UI), ADR-0006..0012, both control manifests, design/ux/{input,accounts,landscape}-v6.md, docs/v6/landing/*, systems-index #42–#51, ARCH_REVIEW.md.
> **Effort**: about 148.5 agent-days of expected story effort; about 58 days wall-clock if each sprint lasts as long as its longest story (18 sprints). Not calibrated: there is no sprint history in `production/sprints/` (estimate skill), so confidence is Medium overall and Low for V6-ACCT-02, V6-LAND-02 and V6-RSCR-02.
> **Gates skipped (review mode lean, V6-012)**: PR-EPIC, PR-SPRINT feasibility and QL-STORY-READY. Each story starts with `/story-readiness` instead, and the Director reviews.

## Rules for every sprint

1. **At most 4 stories run in parallel**, one agent each, `isolation: "worktree"`, launched in one message (brief Phase 6).
2. **File-disjoint.** The stories in a sprint own disjoint files. The few overlaps below are new files in a shared folder (each story writes its own test files in `server/test/` or `tests/`, its own allowlist file in `scripts/layout-allowlist/`) or different files inside `src/platform/`. They never edit the same file.
3. **Dependencies point backwards.** A story only depends on stories in earlier sprints (checked by the generator), and on external inputs listed in its card (the `video` agent's clips, the assets agent's art).
4. **Port slot = table position** for stories that start servers: slot n uses ports 61n0–61n9 (V6-002). Check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, start with `--strictPort` (or `--port` plus a fixed inspector port for wrangler), stop only the PIDs you started.
5. **Every story names its skills and agent file** (absolute paths in its card) and ends its report with "Skills applied".
6. **Platform rule.** Reject any story that adds a platform check to game code or grows the boundary allowlist (brief review gate).
7. **Security.** Auth, account, linking, deletion, rate-limit and public-API stories get workerd tests and a `/security-audit` before merge.
8. A sprint can start its next story as soon as a slot frees up, as long as the new story's dependencies are merged and its files are disjoint from the stories still running. The sprint boundaries are the planned order, not a barrier.

## Gate sets (referenced by every story's acceptance criteria)

| Gate | What runs | Pass |
| --- | --- | --- |
| **G-CODE** | `npx tsc --noEmit`; `npx vitest run`; `npx vite build`; the smokes `scripts/{smoke,tutorial-smoke,duel-smoke,fullscreen-smoke,audio-smoke,online-smoke}.mjs` against `vite preview` on the story's port (Telegram emulation, plus plain web once V6-GATE-02 lands); `npm run regression` | all green; flakes re-run alone once and reported with both runs |
| **G-SERVER** | `cd server && npx vitest run` (workerd) | all green |
| **G-MATRIX** | `node scripts/layout-check.mjs http://localhost:<port>/` across the ten-size matrix (390x844, 360x780, 320x693, 844x390, 768x1024, 820x1180, 1024x768, 1280x800, 1440x900, 1920x1080), en and ru, plain and Telegram insets; before V6-GATE-01 merges, the old sizes | 0 new violations |
| **G-SHOTS** | screenshots of every touched screen and state at all ten sizes (landing: the six widths), en and ru, JPEG ≤ 150 KB in `docs/v6/shots/<story>/`; open and look at them; input stories also play the feature with mouse and keyboard and with touch emulation | reviewed, issues fixed |
| **G-PLAT** | `tests/platformBoundary.test.ts` | green; allowlist not grown |
| **G-REPLAY** | `node scripts/replay-hash.mjs chromium` | fixtures match |
| **G-SEC** | `/security-audit` on the story's surface | no open HIGH |
| **G-DRYRUN** | `npx wrangler deploy --dry-run` on each wrangler config the story touched (wrangler pinned in `server/`) | passes; nothing deployed |
| **G-LAND** | `npm run build` in `landing/`; after V6-GATE-03, `landing/scripts/layout-widths.mjs` and `landing/scripts/lighthouse.mjs` | build green; widths and ADR-0011 budget (with V6-015) met |
| **G-DOCS** | links and paths in the changed docs resolve; no secrets | reviewed |

Disk rules from the brief apply: integrators delete `shots/` and `dist/` after gates; under 5 GB free, symlink `node_modules` and run layout checks with `--no-shots`.

## Shared files

These files are touched by more than one story across the plan. No two stories in the same sprint touch the same one.

| File | Stories (sprint) | Rule |
| --- | --- | --- |
| `src/main.ts` | PLAT-01 (S1), INP-02 (S6) | one call or config line each |
| `src/platform/*` | PLAT-01 (S1), PLAT-02 (S3), PLAT-03 (S4), PLAT-05 (S5), INP-02 (S6, nav.ts), PLAT-04 (S6, online/api/cloud), ACCT-05 (S7, core/web/telegram auth), INP-04 (S8, nav.ts), ACCT-07 (S10, saveSync.ts), PAY-01 (S10, payments), PLAT-07 (S14) | ADR-0006 rule: a core interface change lands in every adapter in the same commit; same-sprint stories touch different files (nav.ts vs online.ts; saveSync.ts vs payments.ts) |
| `server/src/index.ts` | HOST-02 (S2), ACCT-02 (S3), LINK-01 (S5), LINK-04 (S6), STATS-01 (S7), STATS-02 (S8) | one per sprint; cron work goes through `server/src/account/cron.ts` and `server/src/public/` hooks so later stories add one line |
| `wrangler.jsonc` | HOST-02 (S2), ACCT-04 (S5), STATS-02 (S8) | one per sprint; G-DRYRUN after each |
| `server/src/env.ts` | ACCT-02 (S3), ACCT-04 (S5), STATS-02 (S8) | one per sprint |
| `server/src/account/routes.ts` | LINK-01 (S5, creates), LINK-02 (S7), LINK-03 (S8) | one per sprint |
| `src/ui/kit.ts` | PLAT-02 (S3, import line), RFND-01 (S2, uiMetrics), RFND-04 (S5, ScrollArea), INP-04 (S8, tappable/Button), RSCR-11 (S15, legacy column removal) | one per sprint |
| `src/scenes/BattleScene.ts` | PLAT-02 (S3), RFND-04 (S5), INP-02 (S6), INP-03 (S7), RSCR-02 (S10) | one per sprint; scene diff stays routing only (ADR-0004/0012) |
| `src/scenes/BootScene.ts` | PLAT-01 (S1), PLAT-02 (S3), PLAT-05 (S5), PLAT-04 (S6), LINK-06 (S12), RSCR-11 (S15) | one per sprint |
| `src/scenes/ShopScene.ts` | PLAT-02 (S3), PLAT-05 (S5), PLAT-06 (S9), PAY-01 (S10), RSCR-06 (S11), PAY-02 (S13) | one per sprint |
| `src/ui/settings.ts` | PLAT-02 (S3), ACCT-07 (S10), INP-05 (S11), RSCR-10 (S13) | one per sprint |
| `scripts/layout-check.mjs` | GATE-01 (S1), RFND-03 (S3), RFND-02 (S4, own fixtures), INP-06 (S12, own fixtures), RSCR-11 (S15) | one per sprint; fixtures append-only |
| `scripts/layout-allowlist/` | GATE-01 splits it into one file per owner story; every RSCR story deletes only its own file | never edit another story's file |
| `.github/workflows/deploy.yml` | GATE-01 (S1, layout job), HOST-03 (S3, changes and landing jobs), GATE-03 (S4, landing-build step), GATE-02 (S6, smoke job) | one per sprint; never run remotely |
| `landing/package.json` | HOST-01 (S1), GATE-03 (S4), LAND-02 (S9, only if PixiJS), LAND-06 (S16) | one per sprint; exact pins ≥ 2 weeks old |
| `src/i18n/index.ts` and `src/i18n/account.*` | INP-01, INP-05, ACCT-05, ACCT-07, LINK-05, LINK-06, LINK-07 | append-only, one namespace file per area; integrator keeps both sides |
| `docs/v6/OWNER_ACTIONS.md` | ACCT-01 (S1), HOST-03 (S3), ACCT-04 (S5), LINK-07 (S13), QA-05 (S18) | append-only sections |

## Sprints

### Sprint 1 (S1): about 3 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-PLAT-01**: M1: core interfaces, Telegram and web adapters, detection, facade, FakePlatform and the boundary test | v6-platform-layer | Integration | 3 | lead-programmer | src/main.ts, src/platform/*, src/scenes/BootScene.ts |
| 2 (6120–6129) | **V6-GATE-01**: Layout-check matrix: ten sizes, size-scoped allowlist, per-size shots and CI sharding | v6-gates | Integration | 1.5 | tools-programmer | scripts/layout-check.mjs, .github/workflows/deploy.yml |
| 3 (6130–6139) | **V6-HOST-01**: Landing package scaffold: Astro package, landing Worker with the proxy and redirects, legal pages moved, dry-run gate | v6-hosting | Integration | 2 | devops-engineer | landing/package.json |
| 4 (6140–6149) | **V6-ACCT-01**: PBKDF2 spike: measure the highest safe iteration count on workerd and set it in ADR-0008 | v6-accounts | Logic | 1 | security-engineer | docs/v6/OWNER_ACTIONS.md |

### Sprint 2 (S2): about 2.5 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RFND-01**: Scale policy: ADR-0013, no 0.64 cap, the UIMetrics contract with size classes and whole-number S, content caps, legacy column for unmigrated scenes | v6-responsive-foundation | Logic | 2.5 | lead-programmer | src/ui/kit.ts |
| 2 (6120–6129) | **V6-HOST-02**: Game Worker on play: routes and vars, CORS, frame-ancestors, the Origin-check scaffold, and play links everywhere | v6-hosting | Integration | 1.5 | devops-engineer | wrangler.jsonc, server/src/index.ts |
| none | **V6-INP-01**: I1: the action map and pure bindings with per-device storage | v6-input | Logic | 1.5 | gameplay-programmer | src/i18n/index.ts |
| 4 (6140–6149) | **V6-LAND-01**: Chrome, tokens and SEO head: layout, fonts, nav, skip link, footer, section stubs, meta, Open Graph, JSON-LD, sitemap, robots, favicons | v6-landing | UI | 2.5 | ui-programmer | none |

### Sprint 3 (S3): about 4 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-PLAT-02**: M2 + M3: haptics import codemod and Back on platform.back | v6-platform-layer | Integration | 1.5 | lead-programmer | src/platform/*, src/ui/kit.ts, src/scenes/BattleScene.ts, src/scenes/BootScene.ts |
| 2 (6120–6129) | **V6-RFND-03**: The nine landscape layout-check rules and their registry hooks, enforced per migrated family | v6-responsive-foundation | Logic | 3 | tools-programmer | scripts/layout-check.mjs |
| 3 (6130–6139) | **V6-ACCT-02**: Identity and sessions core: migration 0017, pa2 sessions, requireSession and requirePlayable, cookies, Origin checks, no ?token= | v6-accounts | Integration | 4 | network-programmer | server/src/index.ts, server/src/env.ts |
| none | **V6-HOST-03**: CI split and the single-domain doc fixes: deploy.yml changes/landing jobs, README, OPS.md, ROADMAP, cutover owner actions | v6-hosting | Config/Data | 1 | devops-engineer | .github/workflows/deploy.yml, docs/v6/OWNER_ACTIONS.md |

### Sprint 4 (S4): about 3.5 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RFND-02**: Kit layout primitives (Columns, MasterDetail, SidePanel, edge clusters with a framing rect, RotateCard, Grid) and the Kit Layouts page in four variants | v6-responsive-foundation | UI | 3 | ui-programmer | scripts/layout-check.mjs |
| 2 (6120–6129) | **V6-PLAT-03**: M4 + M5: storage, safe area, lifecycle and client info through the platform | v6-platform-layer | Integration | 1.5 | lead-programmer | src/platform/* |
| 3 (6130–6139) | **V6-ACCT-03**: Passwords and email flows: hashing at the spike value, policy, throttle and mail caps, EmailSender, sign-up, verify, resend, log-in, reset, change password | v6-accounts | Integration | 3.5 | security-engineer | none |
| 4 (6140–6149) | **V6-GATE-03**: Landing gates: width check, reduced-motion and no-timeline passes, Lighthouse budget, wired into landing CI | v6-gates | Integration | 1.5 | performance-analyst | landing/package.json, .github/workflows/deploy.yml |

### Sprint 5 (S5): about 3 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RFND-04**: Wheel: scroll only the area under the pointer, WheelAccumulator, and one zoomAt anchored at the cursor in Battle, World, War and Camp | v6-responsive-foundation | Integration | 2 | gameplay-programmer | src/ui/kit.ts, src/scenes/BattleScene.ts |
| 2 (6120–6129) | **V6-PLAT-05**: M8: share, invite and launch parameters through the platform, plus the v6 deep-link routes | v6-platform-layer | Integration | 1.5 | lead-programmer | src/scenes/BootScene.ts, src/scenes/ShopScene.ts |
| 3 (6130–6139) | **V6-ACCT-04**: Bot protection and config: Turnstile siteverify, Rate Limiting bindings, the gate order, send_email binding, DEV flag guard, test keys | v6-accounts | Integration | 2 | security-engineer | wrangler.jsonc, server/src/env.ts, docs/v6/OWNER_ACTIONS.md |
| 4 (6140–6149) | **V6-LINK-01**: Nicknames: migration 0018, the shared validator, display_name on every public surface, rename, public-boards opt-out, GET /api/account, admin rename | v6-linking-privacy | Integration | 3 | network-programmer | server/src/index.ts, server/src/account/routes.ts |

### Sprint 6 (S6): about 3.5 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-INP-02**: I2: one key source, the KeyRouter, Esc and the battle hotkeys | v6-input | Integration | 2.5 | gameplay-programmer | src/main.ts, src/platform/*, src/scenes/BattleScene.ts |
| 2 (6120–6129) | **V6-PLAT-04**: M6: Auth transport, online.signedIn and canSignIn() replace online.available | v6-platform-layer | Integration | 2 | network-programmer | src/platform/*, src/scenes/BootScene.ts |
| 3 (6130–6139) | **V6-LINK-04**: Account deletion engine: DELETION_MAP with a schema-driven test, resumable jobs, tombstone, ban tombstones, bot /delete_my_data button | v6-linking-privacy | Integration | 3.5 | security-engineer | server/src/index.ts |
| 4 (6140–6149) | **V6-GATE-02**: Smokes and regression in both platform modes (Telegram emulation and plain web) | v6-gates | Integration | 1.5 | qa-lead | .github/workflows/deploy.yml |

### Sprint 7 (S7): about 4 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-INP-03**: I3: mouse buttons, right-click and right-drag orders, middle-drag pan, context menu, cursors and hover previews | v6-input | Integration | 2.5 | gameplay-programmer | src/scenes/BattleScene.ts |
| 2 (6120–6129) | **V6-ACCT-05**: Web sign-in client: web Auth adapter, Turnstile slot, AuthForm, Log in, Create account, Check your email, Forgot password | v6-accounts | UI | 4 | ui-programmer | src/platform/*, src/i18n/index.ts, src/i18n/account.en.ts / account.ru.ts |
| 3 (6130–6139) | **V6-LINK-02**: Re-auth, add email (Telegram → web), change email, unlink, the account delete route, and notices by email and bot | v6-linking-privacy | Integration | 3 | security-engineer | server/src/account/routes.ts |
| 4 (6140–6149) | **V6-STATS-01**: The snapshot: migration 0019, buildPublicSnapshot on the cron, read-only duel tops, monotonic counters, strict schema | v6-public-stats | Logic | 2.5 | network-programmer | server/src/index.ts |

### Sprint 8 (S8): about 3.5 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-INP-04**: I4: focus manager, focus ring and hover states for every kit and Mosaic control | v6-input | UI | 3 | ui-programmer | src/ui/kit.ts, src/platform/* |
| 2 (6120–6129) | **V6-ACCT-06**: Standalone email-link pages /auth/* (sign-up and reset variants, ready for add_email and change_email) | v6-accounts | UI | 2 | ui-programmer | none |
| 3 (6130–6139) | **V6-LINK-03**: Web → Telegram link codes with two-sided confirmation, and conflict resolution | v6-linking-privacy | Integration | 3.5 | security-engineer | server/src/account/routes.ts |
| 4 (6140–6149) | **V6-STATS-02**: The endpoint: GET/HEAD /api/public/v1/summary, caching headers, RL_PUBLIC_IP, the PublicApi RPC entrypoint | v6-public-stats | Integration | 1.5 | network-programmer | server/src/index.ts, wrangler.jsonc, server/src/env.ts |

### Sprint 9 (S9): about 4 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-01**: Shell and hubs: landscape and tablet layouts (AppShell tab bar or rail, hub and sub shells, ScreenFrame, TopBar, sheets as side panels, Menu) | v6-responsive-screens | UI | 3.5 | ui-programmer | none |
| 2 (6120–6129) | **V6-PLAT-06**: M9 + AU-01: signed-out copy and the "Sign in to play online" state replace every "inside Telegram" state | v6-platform-layer | UI | 2 | ui-programmer | src/scenes/ShopScene.ts |
| 3 (6130–6139) | **V6-STATS-03**: Landing proxy on the real entrypoint: two-Worker local run, cookie isolation check and the summary fixture | v6-public-stats | Integration | 1.5 | network-programmer | none |
| 4 (6140–6149) | **V6-LAND-02**: Hero living diorama: four or more parallax layers, real sprites that march, clash and break, pointer lamp, camera dive, H1 ambient loop | v6-landing | Visual/Feel | 4 | technical-artist | landing/package.json |

### Sprint 10 (S10): about 5 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-02**: Battle HUD and Results: landscape and tablet layouts (Battle in all states incl. online, duel, beast, assault and works; Results and Inspect) | v6-responsive-screens | UI | 5 | ui-programmer | src/scenes/BattleScene.ts |
| 2 (6120–6129) | **V6-RSCR-05**: Army and Hero: landscape and tablet layouts (Army, Hero, stash and compare) | v6-responsive-screens | UI | 3 | ui-programmer | none |
| 3 (6130–6139) | **V6-ACCT-07**: Account page base and guest flow: Settings → Account, Log out (everywhere), Signed-in devices, guest tip, Two campaigns, guest save upload | v6-accounts | UI | 3 | ui-programmer | src/ui/settings.ts, src/platform/*, src/i18n/account.en.ts / account.ru.ts |
| 4 (6140–6149) | **V6-PAY-01**: M7: the shop pays through platform.payments; Stars copy keyed to the provider | v6-payments | Integration | 1.5 | lead-programmer | src/platform/*, src/scenes/ShopScene.ts |

### Sprint 11 (S11): about 3.5 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-03**: War and the online hub: landscape and tablet layouts (Online war map, Online Army, Clan, Merchant) | v6-responsive-screens | UI | 3.5 | ui-programmer | none |
| 2 (6120–6129) | **V6-RSCR-06**: Settlements and economy: landscape and tablet layouts (Settlement (all tabs), Market, Shop (layout only; the web wallet card is V6-PAY-02)) | v6-responsive-screens | UI | 2.5 | ui-programmer | src/scenes/ShopScene.ts |
| 3 (6130–6139) | **V6-INP-05**: I5: Settings → Keyboard shortcuts page with capture, conflicts, reset and per-device save | v6-input | UI | 2 | ui-programmer | src/ui/settings.ts, src/i18n/index.ts |
| 4 (6140–6149) | **V6-LINK-05**: Account management UI: sign-in method rows, Confirm it's you, Add email and password, Change email and password, Remove a method | v6-linking-privacy | UI | 3 | ui-programmer | src/i18n/account.en.ts / account.ru.ts |

### Sprint 12 (S12): about 4 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-04**: Duels: landscape and tablet layouts (Duel hub, Ladder, Arena, Team, duel Shop and their sheets) | v6-responsive-screens | UI | 4 | ui-programmer | none |
| 2 (6120–6129) | **V6-RSCR-07**: World and Camp maps: landscape and tablet layouts (World, Camp) | v6-responsive-screens | UI | 2 | ui-programmer | none |
| 3 (6130–6139) | **V6-INP-06**: I6: key labels and glyphs, keycaps, the shortcuts sheet, keyboard tutorial lines, keyboard-smoke and the doc follow-ups | v6-input | UI | 2.5 | ui-programmer | scripts/layout-check.mjs |
| 4 (6140–6149) | **V6-LINK-06**: Linking UI: Link Telegram steps with QR code, the Mini App link request, and Choose which account to keep | v6-linking-privacy | UI | 3.5 | ui-programmer | src/scenes/BootScene.ts, src/i18n/account.en.ts / account.ru.ts |

### Sprint 13 (S13): about 3 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-09**: Codex: landscape and tablet layouts (Codex, beast and doctrine sheets) | v6-responsive-screens | UI | 1 | ui-programmer | none |
| 2 (6120–6129) | **V6-RSCR-10**: Settings and dialogs: landscape and tablet layouts (Settings, Notifications, About, confirms, Kit overlays) | v6-responsive-screens | UI | 1 | ui-programmer | src/ui/settings.ts |
| 3 (6130–6139) | **V6-PAY-02**: AU-20: the web wallet "payments coming soon" card and purchase buttons with their reason | v6-payments | UI | 1.5 | ui-programmer | src/scenes/ShopScene.ts |
| 4 (6140–6149) | **V6-LINK-07**: Nickname UI, Delete account UI and the privacy notice draft with its entry points | v6-linking-privacy | UI | 3 | ui-programmer | docs/v6/OWNER_ACTIONS.md, src/i18n/account.en.ts / account.ru.ts |

### Sprint 14 (S14): about 3 days wall-clock, 4 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-08**: First run and tutorial: landscape and tablet layouts (FirstRun, battle tutorial, online coach anchors) | v6-responsive-screens | UI | 1.5 | ui-programmer | none |
| 2 (6120–6129) | **V6-PLAT-07**: M10: delete the telegram.ts shim and the boundary allowlist; prove a third adapter needs no outside change | v6-platform-layer | Logic | 0.5 | lead-programmer | src/platform/* |
| 3 (6130–6139) | **V6-LAND-03**: Features, classes and modes sections: hover-tilt class cards, modes clips M1–M4, self-drawing dividers | v6-landing | UI | 3 | ui-programmer | none |
| 4 (6140–6149) | **V6-LAND-04**: Live stats and leaderboards: one summary fetch, count-up, parchment tables, empty state with no invented numbers | v6-landing | UI | 2 | ui-programmer | none |

### Sprint 15 (S15): about 2 days wall-clock, 2 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-RSCR-11**: Kit and Boot: landscape and tablet layouts (?scene=Kit pages, Boot, BeastTrial; removal of the legacy column and the pending mechanism) | v6-responsive-screens | UI | 1.5 | ui-programmer | src/ui/kit.ts, src/scenes/BootScene.ts, scripts/layout-check.mjs |
| 2 (6120–6129) | **V6-LAND-05**: Gameplay clips grid G1–G4, FAQ and the closing call to action | v6-landing | UI | 2 | ui-programmer | none |

### Sprint 16 (S16): about 2.5 days wall-clock, 2 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| none | **V6-QA-01**: QA plan and regression map for v6 | v6-qa-release | Config/Data | 1 | qa-lead | none |
| 2 (6120–6129) | **V6-LAND-06**: Wow and verification pass: /ux-review and owner-eyes at 1440 and 390, motion tuning, SEO audit, Lighthouse budget, asset audit | v6-landing | Visual/Feel | 2.5 | ux-designer | landing/package.json |

### Sprint 17 (S17): about 2 days wall-clock, 3 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (6110–6119) | **V6-QA-02**: Playthroughs and account flows end to end | v6-qa-release | Integration | 2 | qa-tester | none |
| 2 (6120–6129) | **V6-QA-03**: Performance: final Lighthouse on the landing and /perf-profile on the game in landscape | v6-qa-release | Integration | 1 | performance-analyst | none |
| none | **V6-QA-04**: Whole-branch code review, simplify and security audit | v6-qa-release | Integration | 2 | lead-programmer | none |

### Sprint 18 (S18): about 2 days wall-clock, 1 parallel

| Slot | Story | Epic | Type | Est. (E) | Agent | Shared files touched |
| --- | --- | --- | --- | --- | --- | --- |
| none | **V6-QA-05**: Release: checklists, gate check, milestone review, changelog, REPORT.md, owner go-live checklist, playbook and retrospective | v6-qa-release | Config/Data | 2 | producer | docs/v6/OWNER_ACTIONS.md |

## Sprint goals

| Sprint | Goal |
| --- | --- |
| S1 | **Foundation starts:** the platform core (M1), the ten-size layout-check matrix, the landing package scaffold with its Worker and dry-run gate, and the PBKDF2 spike that V6-014 requires before accounts. |
| S2 | The scale policy (cap removed behind the legacy column, ADR-0013), the game Worker on play, the pure action map, the landing chrome and SEO head (assets moved in from staging, V6-019). |
| S3 | Haptics and Back on the platform (M2–M3), the nine layout-check rules, the identity and sessions core, the CI split and single-domain doc fixes. |
| S4 | Kit layout primitives and the Layouts page, storage and safe area (M4–M5), password and email flows, landing gates (widths and Lighthouse). |
| S5 | Wheel and cursor-anchored zoom, share and launch (M8), Turnstile and rate-limit bindings, nicknames. |
| S6 | Key router and battle hotkeys, auth transport (M6), the deletion engine, smokes in both platform modes. |
| S7 | Mouse buttons and cursors, the web sign-in UI, re-auth and add-email, the stats snapshot. |
| S8 | Focus and hover, the /auth/* pages, link codes and conflicts, the stats endpoint. |
| S9 | Shell and hubs in landscape, signed-out copy (M9), the landing proxy on the real entrypoint, the hero diorama. |
| S10 | Battle HUD and Results, Army and Hero, the Account page and guest flow, payments through the platform (M7). |
| S11 | War and online, Settlements and economy, the Keyboard shortcuts page, account management UI. |
| S12 | Duels, World and Camp, keycaps and keyboard tutorial, linking UI. |
| S13 | Codex, Settings and dialogs, the web wallet card, nickname and delete UI with the privacy notice draft. |
| S14 | First run and tutorial, M10 (shim and allowlist gone), features/classes/modes and the stats section on the landing. |
| S15 | Kit and Boot with the legacy column and pending mechanism removed; clips, FAQ and closing CTA. |
| S16 | QA plan and regression map; the landing wow and verification pass. |
| S17 | Playthroughs and account flows end to end, performance, whole-branch review and security audit. |
| S18 | Fixes from S17 (fixer agents by area, scheduled as they come), then the release story. |

## Sprint 1 in detail (file-disjoint, ready to dispatch)

| Slot | Story | Owns | Why it is first |
| --- | --- | --- | --- |
| 1 (6110–6119) | V6-PLAT-01 | `src/platform/{core,telegram,web}/**`, `detect.ts`, `index.ts`, `haptics.ts`, the `telegram.ts` shim, one line in `src/main.ts` and `BootScene.ts`, `tests/platform/**`, `tests/fakes/platform.ts`, `tests/platformBoundary.test.ts` | Every platform, input, accounts and payments story builds on the interfaces and the boundary test. |
| 2 (6120–6129) | V6-GATE-01 | `scripts/layout-check.mjs`, `scripts/layout-allowlist/` (split per owner), `scripts/lib/**`, the layout job in `deploy.yml`, `docs/UI_KIT.md` | Every UI story after it is verified across the matrix; the per-owner allowlist files make the screen stories file-disjoint. |
| 3 (6130–6139) | V6-HOST-01 | `landing/**` (new), the legal pages moved from `public/` | The landing track and the stats proxy need the package, its Worker tests and the dry-run gate. |
| 4 (6140–6149) | V6-ACCT-01 | `server/scripts/pbkdf2-probe/**`, `server/test/pbkdf2-spike.test.ts`, `docs/v6/qa/PBKDF2_SPIKE.md`, ADR-0008 §2, manifest M-PW-1, an OWNER_ACTIONS append | V6-014 makes the spike the first accounts step; it touches no code any other S1 story touches. |

No S1 story edits a file another S1 story edits. `src/main.ts` and `BootScene.ts` are touched only by PLAT-01 in this sprint.

## Critical paths

- **Responsive (longest):** GATE-01 → RFND-01 → RFND-03 / RFND-02 → RFND-04 → INP-02 → INP-03 → INP-04 → RSCR-01 → RSCR-02 → INP-06 → RSCR-08 → RSCR-11 → QA-01. About 40 days wall-clock. design/ux/landscape-v6.md is merged (V6-020), so it does not block.
- **Accounts:** ACCT-01 → ACCT-02 → ACCT-03 → ACCT-04 → ACCT-05 → ACCT-07 → LINK-05 → LINK-06, with LINK-01 → LINK-04 → LINK-02 → LINK-03 on the server side.
- **Platform:** PLAT-01 → 02 → 03 → 05 (M8) → 04 (M6) → PAY-01 (M7) and PLAT-06 (M9) → PLAT-07 (M10), the order clarified in ADR-0006.
- **Landing:** HOST-01 → LAND-01 → GATE-03 → LAND-02 (hero) …; LAND-04 waits for STATS-03 (or builds against its fixture).

## External inputs (not stories in this plan)

| Input | Producer | Needed by |
| --- | --- | --- |
| Hero layers, OG image, favicon set (`landing/assets-staging/`, merged, V6-019) | assets agent (P5-LAND-ART) | LAND-01 moves them in; LAND-02 uses the hero layers |
| Clips H1, M1–M4, G1–G4, B1 with posters (`docs/v6/landing/STRUCTURE.md` "Clips needed") | video agent | LAND-02 (H1), LAND-03 (M1–M4, posters for the mode cards), LAND-05 (G1–G4) |
| Class busts and any pixel cursors | assets agent queue (`docs/v6/ASSET_LOG.md`) | LAND-03, INP-03 (cursors are optional) |
| Owner actions (Workers Paid, email onboarding, Turnstile widget, secrets, DNS and routes, BotFather, the PBKDF2 probe on real Workers, privacy sign-off) | owner, after the run | nothing in the run is blocked; local stand-ins and test keys are used |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| The legacy column in RFND-01 hides regressions until each family migrates | Medium | Medium | The `pending` files are reported every run and only shrink; RSCR-11 deletes the mechanism; landscape-v6.md §16 is the exit test. |
| The PBKDF2 value measured locally differs on real Workers | Medium | Medium | ACCT-01 records an owner action to confirm on a throwaway Worker; the hash format carries its parameters and rehash-on-login upgrades accounts. |
| Battle HUD (RSCR-02, XL) overruns | Medium | High | It has its own sprint lane; the sim is untouched (replay-hash gate); INP-06 waits for it. |
| Shared files collide when a sprint runs late and the next starts early | Medium | Low | Rule 8: start a story early only when its files are disjoint from the running ones; integrators merge in the listed order. |
| Telegram Desktop eats Esc, Tab or Space | Medium | Medium | INP-06 writes the manual check list; QA-02 runs it; `M` is a second binding for the battle menu. |
| Email Service Beta or Turnstile behaviour differs in production | Low | Medium | Fakes and test keys locally; `EmailSender` interface; owner actions verify after deploy. |

## Next step for the Director

Dispatch S1 (four agents, prompts from `docs/playbook/PROMPTS_AGENTS.md` §1 with each card's skill and agent paths and port slot). Log in DECISIONS.md: the plan itself, the legacy-column migration aid, the per-owner allowlist split, and the clarified ADR-0006 step order (ARCH_REVIEW.md C-01).
