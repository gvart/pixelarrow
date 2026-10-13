# Epic: Linked accounts, nicknames, deletion and privacy (ADR-0009)

> **ID**: v6-linking-privacy (stories V6-LINK-NN)
> **Layer**: Core
> **GDD / spec**: design/ux/accounts-v6.md flows 5–8; design/gdd/systems-index.md #46 and #49; V6-011
> **Architecture Module**: server/migrations/0018, server/src/names/**, server/src/account/**, src/ui/account/**, landing/public/privacy*
> **Status**: Ready
> **Engine Risk**: LOW (plain D1 and the existing initData HMAC)
> **Manifest Version**: docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md (2026-10-13)
> **Stories**: 7, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 22.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

One player, several log-in methods: a Telegram player adds email and password, a web player links Telegram through the Mini App with confirmation on both sides, conflicts keep one account and never merge state, and purchases always survive. Public surfaces show only a generated or chosen nickname (V6-011). Deletion is in-app, immediate and complete, checked by a schema-driven test, and the privacy notice draft is written for owner sign-off.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0009: Linked accounts, display names and deletion | One player id, two-sided proof to link, never merge (keep one), validated unique nicknames, immediate deletion with an anonymised tombstone. | LOW |
| ADR-0008: Accounts and sessions | Identities, sessions, email tokens, re-auth timestamp. | MEDIUM |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-link-001 | Telegram player adds email and password and plays the same account on the web | ADR-0009 §2 |
| TR-v6-link-002 | Web player links Telegram later; one player id, several methods | ADR-0009 §3 |
| TR-v6-link-003 | Unlink without stranding; conflicts never merge | ADR-0009 §4–§5 |
| TR-v6-link-004 | Player-chosen display name everywhere public | ADR-0009 §6 |
| TR-v6-link-005 | In-app account deletion; privacy notice linked from sign-up, Settings and the landing footer | ADR-0009 §7–§8 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-LINK-01 | Nicknames: migration 0018, the shared validator, display_name on every public surface, rename, public-boards opt-out, GET /api/account, admin rename | Integration | Ready | S5 | 3 | V6-ACCT-02 |
| V6-LINK-02 | Re-auth, add email (Telegram → web), change email, unlink, the account delete route, and notices by email and bot | Integration | Ready | S7 | 3 | V6-LINK-01, V6-LINK-04, V6-ACCT-03 |
| V6-LINK-03 | Web → Telegram link codes with two-sided confirmation, and conflict resolution | Integration | Ready | S8 | 3.5 | V6-LINK-02, V6-LINK-04 |
| V6-LINK-04 | Account deletion engine: DELETION_MAP with a schema-driven test, resumable jobs, tombstone, ban tombstones, bot /delete_my_data button | Integration | Ready | S6 | 3.5 | V6-LINK-01 |
| V6-LINK-05 | Account management UI: sign-in method rows, Confirm it's you, Add email and password, Change email and password, Remove a method | UI | Ready | S11 | 3 | V6-ACCT-07, V6-LINK-02 |
| V6-LINK-06 | Linking UI: Link Telegram steps with QR code, the Mini App link request, and Choose which account to keep | UI | Ready | S12 | 3.5 | V6-LINK-03, V6-LINK-05, V6-PLAT-05 |
| V6-LINK-07 | Nickname UI, Delete account UI and the privacy notice draft with its entry points | UI | Ready | S13 | 3 | V6-LINK-01, V6-LINK-02, V6-LINK-04, V6-ACCT-07 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-LINK-01: Nicknames: migration 0018, the shared validator, display_name on every public surface, rename, public-boards opt-out, GET /api/account, admin rename

| Field | Value |
| --- | --- |
| Goal | Nicknames: migration 0018, the shared validator, display_name on every public surface, rename, public-boards opt-out, GET /api/account, admin rename. |
| Type | Integration |
| Sprint and port slot | S5 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-ACCT-02 |
| Governing ADRs and specs | ADR-0009 §6 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/network-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/migrations/0018_names_deletion.sql
- server/src/names/{validate,blocklist,reserved}.ts (new)
- server/src/account/{routes,summary}.ts (new)
- server/src/index.ts (mount /api/account)
- server/src/players.ts
- server/src/online/store.ts
- server/src/online/clans.ts (clan-name validation)
- server/src/admin/** (rename, search)
- server/test/**

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/index.ts`, `server/src/account/routes.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Validator tests: length, character set, mixed Latin and Cyrillic refused, reserved words, homoglyph folding, blocklist substrings, uniqueness through the key, rename cooldown, freed names held 30 days.
- [ ] A recursive scan over online, duel and war responses finds no other player's first_name, username or telegram_id.
- [ ] `GET /api/account` returns `hasPurchases` and the name status (accounts-v6.md Q5); `PUT /api/account/public-boards` works.
- [ ] Admin rename resets to a generated name, locks it and writes admin_audit; `/security-audit` clean.
- [ ] Gates: G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LINK-02: Re-auth, add email (Telegram → web), change email, unlink, the account delete route, and notices by email and bot

| Field | Value |
| --- | --- |
| Goal | Re-auth, add email (Telegram → web), change email, unlink, the account delete route, and notices by email and bot. |
| Type | Integration |
| Sprint and port slot | S7 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-LINK-01, V6-LINK-04, V6-ACCT-03 |
| Governing ADRs and specs | ADR-0009 §1, §2, §4, §7 (request) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/security-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/src/account/{reauth,email,unlink,notices}.ts (new)
- server/src/account/routes.ts
- server/src/auth/flows.ts (add_email and change_email verify purposes)
- server/src/email/templates.ts (append)
- server/src/notify/templates.ts (bot notices)
- server/test/**

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/account/routes.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Re-auth by password or fresh initData (≤ 10 min) sets `reauth_at`; sensitive routes answer `401 reauth_required` without it (Q1).
- [ ] Add email from a bearer session, with the 5 per hour throttle and mail caps, completes only through the emailed link; an address that belongs to another account gets the same 202 and a conflict email.
- [ ] Unlink refuses the last identity (`409 last_login_method`); unlinking Telegram clears the mirror, bot rows and bearer sessions; unlinking email revokes cookie sessions.
- [ ] `DELETE /api/account` with re-auth and `confirm: 'DELETE'` calls deleteAccount (V6-LINK-04).
- [ ] Every identity change sends the email and bot notices (tests with fakes); `/security-audit` clean.
- [ ] Gates: G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LINK-03: Web → Telegram link codes with two-sided confirmation, and conflict resolution

| Field | Value |
| --- | --- |
| Goal | Web → Telegram link codes with two-sided confirmation, and conflict resolution. |
| Type | Integration |
| Sprint and port slot | S8 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 3.5 d expected (2.5–5); confidence Medium |
| Depends on | V6-LINK-02, V6-LINK-04 |
| Governing ADRs and specs | ADR-0009 §3, §5 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/security-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/src/account/{link,conflicts}.ts (new)
- server/src/account/routes.ts
- server/src/account/cron.ts (prune link_codes and link_conflicts)
- server/test/**

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/account/routes.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Link codes are 16 random bytes, hashed, 10 minutes, single use and bound to the creating session; a code completed in the Mini App but never confirmed on the web links nothing.
- [ ] complete checks the initData HMAC, `auth_date` ≤ 10 min and `start_param = link_<code>`; status and confirm accept only the creating web session.
- [ ] Conflict classes tested: other side empty → auto-delete; both with progress → choice with proof and typed name; purchases force the survivor; both with purchases → `409 contact_support`; busy → `409 busy_try_later`.
- [ ] The link happens in one D1 batch with the mirror; `/security-audit` clean.
- [ ] Gates: G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LINK-04: Account deletion engine: DELETION_MAP with a schema-driven test, resumable jobs, tombstone, ban tombstones, bot /delete_my_data button

| Field | Value |
| --- | --- |
| Goal | Account deletion engine: DELETION_MAP with a schema-driven test, resumable jobs, tombstone, ban tombstones, bot /delete_my_data button. |
| Type | Integration |
| Sprint and port slot | S6 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 3.5 d expected (2.5–5); confidence Medium |
| Depends on | V6-LINK-01 |
| Governing ADRs and specs | ADR-0009 §7 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/security-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/src/account/{delete,deletionMap}.ts (new)
- server/src/account/cron.ts (new: finish interrupted jobs)
- server/src/index.ts (scheduled hook line)
- server/src/bot/handlers.ts (/delete_my_data button)
- server/src/auth/identity.ts (ban tombstone check)
- the DO kick call sites (RegionDO, DuelDO, Matchmaker) as needed
- server/test/deletion*.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/index.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/save-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] A test seeds a player in every table that references players and fails if any table is missing from DELETION_MAP.
- [ ] After deletion no personal row is left; purchases, entitlements, ledger, market_audit and admin_audit point only at the tombstone; other players see "Deleted player".
- [ ] Interrupted runs resume from deletion_jobs and the cron finishes them; steps are idempotent.
- [ ] A banned player's identities live only as hashes in ban_tombstones for 180 days and block re-sign-up, Telegram log-in and linking.
- [ ] `/security-audit` clean.
- [ ] Gates: G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LINK-05: Account management UI: sign-in method rows, Confirm it's you, Add email and password, Change email and password, Remove a method

| Field | Value |
| --- | --- |
| Goal | Account management UI: sign-in method rows, Confirm it's you, Add email and password, Change email and password, Remove a method. |
| Type | UI |
| Sprint and port slot | S11 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-ACCT-07, V6-LINK-02 |
| Governing ADRs and specs | ADR-0009 §1, §2, §4; accounts-v6.md §8.2–§8.4, §8.8 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/mosaic/AccountRow.ts (new)
- src/ui/account/{methods,reauth,addEmail,changeEmail,changePassword,removeMethod}.ts (new)
- src/ui/account/accountPage.ts (rows section)
- src/i18n/account.* (append)
- tests

**Shared files touched** (see SPRINTS.md "Shared files"): `src/i18n/account.en.ts / account.ru.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] accounts-v6.md §8.11 criteria for AU-09 rows, AU-10, AU-11, AU-12 and AU-15 pass.
- [ ] End to end: in Telegram emulation add an email → the link from dev_outbox opens the web signed in as the same player.
- [ ] `reauth_required` opens AU-10 and retries the action once; Telegram uses the Reopen path.
- [ ] Screenshots across the matrix in en and ru.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LINK-06: Linking UI: Link Telegram steps with QR code, the Mini App link request, and Choose which account to keep

| Field | Value |
| --- | --- |
| Goal | Linking UI: Link Telegram steps with QR code, the Mini App link request, and Choose which account to keep. |
| Type | UI |
| Sprint and port slot | S12 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 3.5 d expected (2.5–5); confidence Medium |
| Depends on | V6-LINK-03, V6-LINK-05, V6-PLAT-05 |
| Governing ADRs and specs | ADR-0009 §3, §5; accounts-v6.md §8.5–§8.7, §12 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/mosaic/{StepList,ChoiceCard,qr}.ts (new)
- src/ui/account/{linkTelegram,linkRequest,conflict}.ts (new)
- src/scenes/BootScene.ts (startapp=link_ route line)
- src/i18n/account.* (append)
- tests (QR encoder test vectors)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/BootScene.ts`, `src/i18n/account.en.ts / account.ru.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] accounts-v6.md §8.11 criteria for AU-13, AU-14 and AU-16 pass; ChoiceCards lay out two-up at ≥ 600 px and stack below.
- [ ] The QR encoder matches reference vectors; the QR has a Copy link companion and alt text.
- [ ] End to end locally: web creates a code → a Telegram-emulated session completes it → the web confirms → one player with both identities; a conflict path keeps the chosen account.
- [ ] Screenshots across the matrix in en and ru.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-LINK-07: Nickname UI, Delete account UI and the privacy notice draft with its entry points

| Field | Value |
| --- | --- |
| Goal | Nickname UI, Delete account UI and the privacy notice draft with its entry points. |
| Type | UI |
| Sprint and port slot | S13 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-LINK-01, V6-LINK-02, V6-LINK-04, V6-ACCT-07 |
| Governing ADRs and specs | ADR-0009 §6–§8; accounts-v6.md §9, §10, §11.1 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/account/{nameSheet,rename,deleteAccount}.ts (new)
- hook lines in src/scenes/duel/DuelScene.ts, src/scenes/online/OnlineScene.ts, src/scenes/FirstRunScene.ts
- landing/public/privacy.html and landing/public/ru/privacy.html (draft text, marked pending owner sign-off)
- docs/v6/OWNER_ACTIONS.md (append: notice sign-off, retention years, minimum age)
- src/i18n/account.* (append)

**Shared files touched** (see SPRINTS.md "Shared files"): `docs/v6/OWNER_ACTIONS.md`, `src/i18n/account.en.ts / account.ru.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/localize/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] accounts-v6.md §9.7 and §10.3 criteria pass; the shared validator gives instant feedback and the server stays authoritative.
- [ ] Delete lists what is lost, warns in bold about purchases, offers unlink when two identities exist, needs re-auth and typed DELETE; local data handled per UXA-11.
- [ ] The privacy notice follows ADR-0009 §8 sections 1–11 in EN and RU; it is linked from sign-up, Settings → Account, the delete screen and the landing footer.
- [ ] Screenshots across the matrix in en and ru; the notice page at the six landing widths.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

*Note:* The privacy text is drafted in the writer role as well (read the writer agent file); legal sign-off is an owner action.
