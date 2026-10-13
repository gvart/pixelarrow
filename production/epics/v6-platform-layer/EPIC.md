# Epic: Platform layer migration (ADR-0006)

> **ID**: v6-platform-layer (stories V6-PLAT-NN)
> **Layer**: Foundation
> **GDD / spec**: design/gdd/systems-index.md #42 Platform layer (no GDD; brief Goal 4, V5-076)
> **Architecture Module**: src/platform/{core,telegram,web}/, src/platform/{index,detect,haptics}.ts; every game file that imports src/platform/telegram.ts
> **Status**: Ready
> **Engine Risk**: MEDIUM (Telegram SDK version gates; Context7 was unavailable for ADR-0006)
> **Manifest Version**: docs/v6/plan/CONTROL_MANIFEST_PLATFORM.md (Manifest Version 2026-10-13)
> **Stories**: 7, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 12 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Moves every Telegram call behind neutral interfaces in `src/platform/core/`, with a Telegram adapter and a web adapter, so the same build runs at play.pixelarrow.app in a browser and inside Telegram. It follows ADR-0006 migration steps M1–M10 as one behaviour-preserving commit each. Order (clarified in ARCH_REVIEW.md): M1–M5, then M8; M6 pairs with the accounts work, M7 is V6-PAY-01, M9 pairs with the sign-in UI; M10 is last. The boundary test enforces the brief's review gate: no `if (telegram)` in game code.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0006: The platform layer | Ten core interfaces, one adapter per platform, detected once in selectPlatform(), a boundary test whose allowlist only shrinks, migration M1–M10. | MEDIUM |
| ADR-0012: Input v6 | Adds InputHints.keyLabels() and the any-pointer rule for finePointer(). | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-plat-001 | Neutral interfaces for auth, payments, storage, haptics, back, share, safe area, input hints, notifications (brief Goal 4) | ADR-0006 |
| TR-v6-plat-002 | Platform detected once at startup; no re-detection | ADR-0006 |
| TR-v6-plat-003 | Each adapter tested on its own; game code tested against a fake | ADR-0006 |
| TR-v6-plat-004 | No platform checks in game code (review gate) | ADR-0006 boundary test |
| TR-v6-plat-005 | The web never loads the Telegram SDK | ADR-0006 |
| TR-v6-plat-006 | Room for steam/ and mobile/ adapters with no change outside src/platform/ | ADR-0006 validation |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-PLAT-01 | M1: core interfaces, Telegram and web adapters, detection, facade, FakePlatform and the boundary test | Integration | Ready | S1 | 3 | None |
| V6-PLAT-02 | M2 + M3: haptics import codemod and Back on platform.back | Integration | Ready | S3 | 1.5 | V6-PLAT-01 |
| V6-PLAT-03 | M4 + M5: storage, safe area, lifecycle and client info through the platform | Integration | Ready | S4 | 1.5 | V6-PLAT-02 |
| V6-PLAT-04 | M6: Auth transport, online.signedIn and canSignIn() replace online.available | Integration | Ready | S6 | 2 | V6-PLAT-05, V6-ACCT-02 |
| V6-PLAT-05 | M8: share, invite and launch parameters through the platform, plus the v6 deep-link routes | Integration | Ready | S5 | 1.5 | V6-PLAT-03 |
| V6-PLAT-06 | M9 + AU-01: signed-out copy and the "Sign in to play online" state replace every "inside Telegram" state | UI | Ready | S9 | 2 | V6-PLAT-04, V6-ACCT-05 |
| V6-PLAT-07 | M10: delete the telegram.ts shim and the boundary allowlist; prove a third adapter needs no outside change | Logic | Ready | S14 | 0.5 | V6-PLAT-02, V6-PLAT-03, V6-PLAT-04, V6-PLAT-05, V6-PLAT-06, V6-PAY-01 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-PLAT-01: M1: core interfaces, Telegram and web adapters, detection, facade, FakePlatform and the boundary test

| Field | Value |
| --- | --- |
| Goal | M1: core interfaces, Telegram and web adapters, detection, facade, FakePlatform and the boundary test. |
| Type | Integration |
| Sprint and port slot | S1 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 3 d expected (2–4.5); confidence Medium |
| Depends on | None |
| Governing ADRs and specs | ADR-0006 (primary), ADR-0012 Decision 6 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/platform/core/** (new)
- src/platform/telegram/** (new)
- src/platform/web/** (new)
- src/platform/detect.ts (new)
- src/platform/index.ts (new)
- src/platform/haptics.ts (new)
- src/platform/telegram.ts (becomes a re-export shim)
- src/main.ts (the selectPlatform() call only)
- src/scenes/BootScene.ts (platform.init() where initTelegram() is)
- tests/platform/** (new)
- tests/fakes/platform.ts (new)
- tests/platformBoundary.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/main.ts`, `src/platform/*`, `src/scenes/BootScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/improve-codebase-architecture/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `InputHints` includes `keyLabels()` (null on adapters without a layout map) and `finePointer()` uses `(any-pointer: fine)`.
- [ ] The shared contract suite (`tests/platform/contract.ts`) runs green for the Telegram and web adapters.
- [ ] Telegram adapter tests: version gates (6.0 vs 8.0), fullscreen only on phones, CloudStorage timeout falls back to the mirror, Back and Settings wiring, `openInvoice` status mapping, `inviteUrl` format, `silentProof()` with and without initData.
- [ ] Web adapter tests: matchMedia, `navigator.share` present and absent, a rejecting clipboard, in-memory localStorage, `popstate`, `beforeunload` while closing confirmation is on.
- [ ] Detection tests: `#tgWebAppData=`, `?tgWebAppStartParam=`, a webview proxy, plain play.pixelarrow.app, `VITE_PLATFORM`, the dev-only `?platform=` override.
- [ ] `tests/platformBoundary.test.ts` enforces rules 1–5 of ADR-0006 with an ALLOWLIST of exactly today's importers, and fails when a listed file stops violating.
- [ ] With `?platform=web` the game boots and plays the campaign offline with no request to telegram.org (Playwright network log in NOTES.md).
- [ ] Telegram emulation: smoke and tutorial smoke pass unchanged; layout-check shows 0 new violations.
- [ ] Gates: G-CODE, G-PLAT, G-MATRIX (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-PLAT-02: M2 + M3: haptics import codemod and Back on platform.back

| Field | Value |
| --- | --- |
| Goal | M2 + M3: haptics import codemod and Back on platform.back. |
| Type | Integration |
| Sprint and port slot | S3 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | V6-PLAT-01 |
| Governing ADRs and specs | ADR-0006 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- import lines only in the files that import haptic, hapticNotify, hapticSelect or setHaptics from src/platform/telegram (33 of the 36 importers listed by `grep -rlE "platform/telegram['\"]" src`, including src/ui/kit.ts and most scenes)
- src/platform/nav.ts
- tests/nav.test.ts
- tests/platformBoundary.test.ts (allowlist shrink only)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/platform/*`, `src/ui/kit.ts`, `src/scenes/BattleScene.ts`, `src/scenes/BootScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/improve-codebase-architecture/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `grep` finds 0 haptic imports from `platform/telegram`; the 178 call sites are unchanged (the diff touches import lines only, checked with `git diff -U0`).
- [ ] `NavHost` is built from `platform.back` plus `platform.haptics.select`; `showInGameBack()` is `!platform.back.native`.
- [ ] Telegram emulation: native Back closes sheets as before. `?platform=web`: browser Back (`popstate`) closes the top sheet, and leaving mid-battle triggers `beforeunload`.
- [ ] The boundary allowlist shrinks by every file that no longer violates.
- [ ] Gates: G-CODE, G-PLAT (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

*Note:* Touches import lines in about 33 files across src/scenes and src/ui, so its sprint holds no other story that edits those files.

### V6-PLAT-03: M4 + M5: storage, safe area, lifecycle and client info through the platform

| Field | Value |
| --- | --- |
| Goal | M4 + M5: storage, safe area, lifecycle and client info through the platform. |
| Type | Integration |
| Sprint and port slot | S4 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | V6-PLAT-02 |
| Governing ADRs and specs | ADR-0006, ADR-0002 (KV) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/platform/storage.ts
- src/platform/cloud.ts
- src/platform/safeArea.ts
- src/platform/monitoring.ts
- src/state.ts
- src/game/save.ts (KV re-export)
- src/scenes/online/regionMapView.ts (storage line only)
- src/audio/index.ts (onActive)
- src/ui/lang.ts (client())
- tests (save, audio, safe area)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/platform/*`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/improve-codebase-architecture/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/save-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `gameKV()` returns `platform.storage.save()`; `regionMapView.ts` and `monitoring.ts` use `platform.storage.device()`; `KV` lives in `core/storage.ts` and `save.ts` re-exports it.
- [ ] Save round-trip tests pass against `FakePlatform` storage.
- [ ] Audio pauses on `onActive(false)` and resumes on `true` (test).
- [ ] Layout-check with Telegram insets at 390x844 shows no change from the baseline.
- [ ] Gates: G-CODE, G-PLAT, G-MATRIX (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-PLAT-04: M6: Auth transport, online.signedIn and canSignIn() replace online.available

| Field | Value |
| --- | --- |
| Goal | M6: Auth transport, online.signedIn and canSignIn() replace online.available. |
| Type | Integration |
| Sprint and port slot | S6 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-PLAT-05, V6-ACCT-02 |
| Governing ADRs and specs | ADR-0006, ADR-0007 (transports), ADR-0008 §3 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/network-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/platform/online.ts
- src/platform/api.ts
- src/platform/cloud.ts (auth lines)
- src/online/client.ts (gate lines)
- src/duel/client.ts (gate lines)
- src/ui/econ/source.ts (gate lines)
- src/scenes/BootScene.ts (gate lines)
- tests (online, api)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/platform/*`, `src/scenes/BootScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/.claude/skills/improve-codebase-architecture/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `OnlineDeps.initData` becomes `auth: Auth`; `ApiClient` sends `Authorization: Bearer` with `credentials: 'omit'` for bearer, and `credentials: 'same-origin'` for cookie (api tests for both).
- [ ] A 401 on a bearer session triggers one silent re-auth with initData (24 h tokens, ADR-0008).
- [ ] `online.available` is gone (boundary rule 4); its 17 call sites read `online.signedIn` or `online.canSignIn()`.
- [ ] The web build stays offline with no sign-in method until V6-ACCT-05 (methods `[]`).
- [ ] online-smoke and duel-smoke pass in Telegram emulation against `wrangler dev` with DEV_AUTH.
- [ ] Gates: G-CODE, G-PLAT, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-PLAT-05: M8: share, invite and launch parameters through the platform, plus the v6 deep-link routes

| Field | Value |
| --- | --- |
| Goal | M8: share, invite and launch parameters through the platform, plus the v6 deep-link routes. |
| Type | Integration |
| Sprint and port slot | S5 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-PLAT-03 |
| Governing ADRs and specs | ADR-0006, design/ux/accounts-v6.md §14 Q3 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/online/ClanScene.ts (invite lines)
- src/scenes/BootScene.ts (launchParam)
- src/ui/notifySettings.ts (openExternal)
- src/scenes/ShopScene.ts (openExternal line)
- src/online/deeplink.ts
- tests/deeplink.test.ts
- clan tests

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/BootScene.ts`, `src/scenes/ShopScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/.claude/skills/improve-codebase-architecture/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Clan invites use `platform.share.inviteUrl()` and pick "sent" or "copied" copy from `share.invite()`'s result; `inTelegram()` is gone from ClanScene.
- [ ] `BootScene` reads `platform.launchParam()`; `deeplink.ts` parses `startapp=account`, `startapp=link_<code>` and the web hash routes `#login`, `#forgot`, `#account`, `#account/conflict/<id>` (tests).
- [ ] On `?platform=web` at 1280x800, invite opens `navigator.share` or copies and shows the copied toast (Playwright).
- [ ] Telegram invite flow unchanged (smoke).
- [ ] Gates: G-CODE, G-PLAT, G-SHOTS (Clan invite states) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-PLAT-06: M9 + AU-01: signed-out copy and the "Sign in to play online" state replace every "inside Telegram" state

| Field | Value |
| --- | --- |
| Goal | M9 + AU-01: signed-out copy and the "Sign in to play online" state replace every "inside Telegram" state. |
| Type | UI |
| Sprint and port slot | S9 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-PLAT-04, V6-ACCT-05 |
| Governing ADRs and specs | ADR-0006 M9, design/ux/accounts-v6.md §4.4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/i18n/*.en.ts / *.ru.ts (the 13 keys and RU twins listed in docs/v6/audit/PLATFORM.md)
- src/ui/econ/widgets.ts (signedOut and pending kinds replace outside)
- the addEconState call lines in DuelScene, OnlineScene, ClanScene, MerchantScene, MarketScene, ShopScene and notifySettings.ts

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/ShopScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/localize/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] No i18n key or text names Telegram where a capability can say it (a key test fails on new ones).
- [ ] AU-01 (both variants) shows on every owner screen when signed out, and its CTA opens Log in (accounts-v6.md §4.7 ACs).
- [ ] Signed-in Telegram players never see AU-01 (smoke).
- [ ] Screenshots of AU-01 on each owner screen across the matrix in en and ru on `?platform=web`.
- [ ] Gates: G-CODE, G-PLAT, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-PLAT-07: M10: delete the telegram.ts shim and the boundary allowlist; prove a third adapter needs no outside change

| Field | Value |
| --- | --- |
| Goal | M10: delete the telegram.ts shim and the boundary allowlist; prove a third adapter needs no outside change. |
| Type | Logic |
| Sprint and port slot | S14 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 0.5 d expected (0.5–1); confidence Low |
| Depends on | V6-PLAT-02, V6-PLAT-03, V6-PLAT-04, V6-PLAT-05, V6-PLAT-06, V6-PAY-01 |
| Governing ADRs and specs | ADR-0006 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/platform/telegram.ts (deleted)
- tests/platformBoundary.test.ts
- tests/platform/steamStub.test.ts (new, test-only stub adapter)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/platform/*`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/improve-codebase-architecture/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The boundary test passes with no allowlist.
- [ ] `grep -rn "platform/telegram" src` finds nothing outside `src/platform/`.
- [ ] A test-only `steam` stub passes the contract suite with no change outside `src/platform/`.
- [ ] Smokes pass in both platform modes (V6-GATE-02).
- [ ] Gates: G-CODE, G-PLAT (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
