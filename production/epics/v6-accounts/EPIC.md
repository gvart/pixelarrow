# Epic: Accounts, sessions and bot protection (ADR-0008), starting with the PBKDF2 spike

> **ID**: v6-accounts (stories V6-ACCT-NN)
> **Layer**: Core
> **GDD / spec**: design/ux/accounts-v6.md flows 1–4; design/gdd/systems-index.md #45 and #48
> **Architecture Module**: server/src/auth/**, server/src/email/**, server/migrations/0017, server/src/middleware.ts, src/platform/web/{auth,turnstile}.ts, src/ui/form/, src/ui/account/, auth/ pages
> **Status**: Ready
> **Engine Risk**: MEDIUM (Email Service is Beta; the PBKDF2 ceiling is undocumented)
> **Manifest Version**: docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md (2026-10-13)
> **Stories**: 7, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 19.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Email and password accounts with verification and reset through Cloudflare's email service, revocable server-side sessions, durable rate limits, Turnstile on the anonymous forms, and the web sign-in UI with guest play and no account wall (V6-017). It starts with the spike that V6-014 requires before accepting the iteration count. Every story gets workerd tests and a `/security-audit` before merge (brief).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0008: Accounts and sessions | Identities table, PBKDF2 plus pepper, D1 sessions (web cookie, Telegram bearer), Rate Limiting binding plus D1 throttle, Turnstile, verified before online play. | MEDIUM |
| ADR-0006: The platform layer | The Auth interface and transports. | LOW |
| ADR-0007: Hosting | Same-origin API, `__Host-pa_sid` host-only on play, Origin checks. | MEDIUM |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-acct-001 | Email and password sign-up, log-in, verification and reset through Cloudflare email | ADR-0008 §4 |
| TR-v6-acct-002 | Slow server-side hash suited to Workers | ADR-0008 §2 + spike |
| TR-v6-acct-003 | Sessions as secure cookies (web), bearer for Telegram, revocable | ADR-0008 §3 |
| TR-v6-acct-004 | Rate limits on log-in and reset, per IP and per account | ADR-0008 §5 |
| TR-v6-acct-005 | Turnstile on sign-up and log-in; verified before online play | ADR-0008 §6–§7 |
| TR-v6-acct-006 | Guest play on the web; guest save uploads on sign-up | design/ux/accounts-v6.md (V6-017); no ADR needed |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-ACCT-01 | PBKDF2 spike: measure the highest safe iteration count on workerd and set it in ADR-0008 | Logic | Ready | S1 | 1 | None |
| V6-ACCT-02 | Identity and sessions core: migration 0017, pa2 sessions, requireSession and requirePlayable, cookies, Origin checks, no ?token= | Integration | Ready | S3 | 4 | V6-HOST-02 |
| V6-ACCT-03 | Passwords and email flows: hashing at the spike value, policy, throttle and mail caps, EmailSender, sign-up, verify, resend, log-in, reset, change password | Integration | Ready | S4 | 3.5 | V6-ACCT-01, V6-ACCT-02 |
| V6-ACCT-04 | Bot protection and config: Turnstile siteverify, Rate Limiting bindings, the gate order, send_email binding, DEV flag guard, test keys | Integration | Ready | S5 | 2 | V6-ACCT-03 |
| V6-ACCT-05 | Web sign-in client: web Auth adapter, Turnstile slot, AuthForm, Log in, Create account, Check your email, Forgot password | UI | Ready | S7 | 4 | V6-PLAT-04, V6-ACCT-04 |
| V6-ACCT-06 | Standalone email-link pages /auth/* (sign-up and reset variants, ready for add_email and change_email) | UI | Ready | S8 | 2 | V6-ACCT-03, V6-ACCT-05 |
| V6-ACCT-07 | Account page base and guest flow: Settings → Account, Log out (everywhere), Signed-in devices, guest tip, Two campaigns, guest save upload | UI | Ready | S10 | 3 | V6-ACCT-05, V6-PLAT-03, V6-RSCR-01 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-ACCT-01: PBKDF2 spike: measure the highest safe iteration count on workerd and set it in ADR-0008

| Field | Value |
| --- | --- |
| Goal | PBKDF2 spike: measure the highest safe iteration count on workerd and set it in ADR-0008. |
| Type | Logic |
| Sprint and port slot | S1 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 1 d expected (0.5–1.5); confidence Medium |
| Depends on | None |
| Governing ADRs and specs | ADR-0008 §2 and Verification Required (1); V6-014 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/security-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/scripts/pbkdf2-probe/** (new: a probe Worker and a probe wrangler config that is never deployed)
- server/test/pbkdf2-spike.test.ts (new)
- docs/v6/qa/PBKDF2_SPIKE.md (new)
- design/adr/ADR-0008-accounts-sessions.md (§2 only)
- docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md (M-PW-1 only)
- docs/v6/OWNER_ACTIONS.md (append the deployed-preview confirmation step)

**Shared files touched** (see SPRINTS.md "Shared files"): `docs/v6/OWNER_ACTIONS.md`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/prototype/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] A table of 100k, 200k, 310k and 600k iterations under local workerd (vitest-pool-workers and `wrangler dev` on the story's ports): accepted or refused, and wall time per hash over 20 runs.
- [ ] The chosen value is the highest one that workerd accepts and that fits the CPU budget (target ≥ 310k, floor 100k), with the reasoning in PBKDF2_SPIKE.md.
- [ ] ADR-0008 §2 and M-PW-1 carry the number; a decision line for DECISIONS.md is proposed in the report (the Director logs it).
- [ ] Because this run never deploys, the confirmation on real Workers CPU limits is an exact owner action (deploy the probe to a throwaway Worker, read `cpu_ms`, delete it).
- [ ] Gates: G-SERVER, G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-ACCT-02: Identity and sessions core: migration 0017, pa2 sessions, requireSession and requirePlayable, cookies, Origin checks, no ?token=

| Field | Value |
| --- | --- |
| Goal | Identity and sessions core: migration 0017, pa2 sessions, requireSession and requirePlayable, cookies, Origin checks, no ?token=. |
| Type | Integration |
| Sprint and port slot | S3 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 4 d expected (3–6); confidence Medium |
| Depends on | V6-HOST-02 |
| Governing ADRs and specs | ADR-0008 §1, §3, §7 (primary), ADR-0007 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/network-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/migrations/0017_accounts.sql (incl. dev_outbox)
- server/src/auth/{sessions,identity,cookies,origin}.ts (new)
- server/src/names/generate.ts (new: generated display names)
- server/src/session.ts (replaced)
- server/src/middleware.ts
- server/src/routes/auth.ts (telegram, logout, logout-all, sessions)
- server/src/index.ts
- requireAuth call-site lines across server/src/** (about 50)
- server/src/env.ts (Session type)
- src/online/client.ts and src/duel/client.ts (socket auth lines only)
- server/test/**

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/index.ts`, `server/src/env.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Migration 0017 rebuilds players (nullable telegram_id, display_name and key) and creates auth_identities, password_hashes, sessions, email_tokens, auth_throttle and dev_outbox.
- [ ] Workerd tests: create, lookup, idle and absolute expiry, the 30 s cache bound, revoke one, revoke all, both transports on one request → 400, cookie token refused as bearer and the reverse, `?token=` refused, cookie unsafe method without matching Origin → 403, WebSocket upgrade Origin check, the identity–mirror invariant after every write, the daily prune.
- [ ] Telegram log-in issues a 24 h bearer session; sockets authenticate by cookie or `Sec-WebSocket-Protocol` only.
- [ ] `pa1`, `SESSION_SECRET` use and the `?token=` path are gone from server and client.
- [ ] online-smoke, duel-smoke and online-e2e pass in Telegram emulation with DEV_AUTH; `/security-audit network` shows no open HIGH.
- [ ] Gates: G-CODE, G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-ACCT-03: Passwords and email flows: hashing at the spike value, policy, throttle and mail caps, EmailSender, sign-up, verify, resend, log-in, reset, change password

| Field | Value |
| --- | --- |
| Goal | Passwords and email flows: hashing at the spike value, policy, throttle and mail caps, EmailSender, sign-up, verify, resend, log-in, reset, change password. |
| Type | Integration |
| Sprint and port slot | S4 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 3.5 d expected (2.5–5); confidence Medium |
| Depends on | V6-ACCT-01, V6-ACCT-02 |
| Governing ADRs and specs | ADR-0008 §2, §4, §5 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/security-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/src/auth/{password,throttle,flows}.ts (new)
- server/src/auth/common-passwords.ts (new, bundled list)
- server/src/email/{sender,log,templates}.ts (new, EN and RU)
- server/src/routes/auth.ts (the email endpoints)
- server/test/**

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Hash string `pbkdf2-sha256$<iter>$<pepperId>$<salt>$<dk>` at the V6-ACCT-01 value; rehash on log-in when parameters or pepper id are old; dummy-hash timing for unknown emails; constant-time compare.
- [ ] Policy: 10–128 characters after NFKC, the common list, not the email or its local part, never truncated.
- [ ] Uniform responses: sign-up, reset and resend always 202; log-in always `401 invalid_credentials` (tests compare status and body for known and unknown emails).
- [ ] Lockout after 5 failures doubling from 1 minute to 1 hour; mail caps 3 per hour and 10 per day per address, silent over the cap; single-use and expired tokens refused; reset revokes all sessions and issues one; change revokes the others.
- [ ] A log spy proves no password, hash or raw token is ever logged; `/security-audit` clean.
- [ ] Gates: G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-ACCT-04: Bot protection and config: Turnstile siteverify, Rate Limiting bindings, the gate order, send_email binding, DEV flag guard, test keys

| Field | Value |
| --- | --- |
| Goal | Bot protection and config: Turnstile siteverify, Rate Limiting bindings, the gate order, send_email binding, DEV flag guard, test keys. |
| Type | Integration |
| Sprint and port slot | S5 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-ACCT-03 |
| Governing ADRs and specs | ADR-0008 §5, §6, Owner actions |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/security-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/src/auth/turnstile.ts (new)
- server/src/routes/auth.ts (gate order lines)
- wrangler.jsonc (RL_AUTH_IP 6001, RL_TG_AUTH_IP 6002, EMAIL send_email remote)
- server/src/env.ts
- server/scripts/deploy-config.mjs
- server/.dev.vars.example, .env.example (Turnstile test keys)
- docs/v6/OWNER_ACTIONS.md (append ADR-0008 owner steps)
- server/test/**

**Shared files touched** (see SPRINTS.md "Shared files"): `wrangler.jsonc`, `server/src/env.ts`, `docs/v6/OWNER_ACTIONS.md`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Turnstile tests with the dummy token against the 1x (pass), 2x (fail) and 3x (timeout-or-duplicate) secrets; action, hostname allow-list, `challenge_ts` ≤ 300 s and `idempotency_key` checked; siteverify errors fail closed.
- [ ] A spy test proves hashing never runs when the IP limit or Turnstile fails (order IP → Turnstile → throttle → hash).
- [ ] `deploy-config.mjs` fails when DEV_AUTH or DEV_EMAIL is in vars (test).
- [ ] `npx wrangler deploy --dry-run` passes; no Turnstile on the Telegram route.
- [ ] Gates: G-SERVER, G-DRYRUN, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-ACCT-05: Web sign-in client: web Auth adapter, Turnstile slot, AuthForm, Log in, Create account, Check your email, Forgot password

| Field | Value |
| --- | --- |
| Goal | Web sign-in client: web Auth adapter, Turnstile slot, AuthForm, Log in, Create account, Check your email, Forgot password. |
| Type | UI |
| Sprint and port slot | S7 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 4 d expected (3–5.5); confidence Medium |
| Depends on | V6-PLAT-04, V6-ACCT-04 |
| Governing ADRs and specs | ADR-0008, ADR-0006 (new optional capability in every adapter), accounts-v6.md §5–§7, §12 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/platform/core/auth.ts (optional humanCheck capability)
- src/platform/web/{auth,turnstile}.ts
- src/platform/telegram/auth.ts (capability absent)
- tests/platform/** (adapter tests)
- src/ui/form/authForm.ts (new)
- src/scenes/online/textInput.ts (thin wrapper)
- src/ui/account/{login,signup,checkEmail,forgot}.ts (new)
- src/ui/mosaic/CountdownLabel.ts (new)
- src/i18n/account.en.ts / account.ru.ts (new) and one line in src/i18n/index.ts
- src/scenes/kit/formsPage.ts (new)
- src/scenes/KitScene.ts (register the Forms tab)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/platform/*`, `src/i18n/index.ts`, `src/i18n/account.en.ts / account.ru.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The web adapter reports `methods() = ['password']` and cookie transport; the capability is added to the core interface and every adapter in one commit with tests (ADR-0006 rule).
- [ ] accounts-v6.md acceptance criteria §5.7, §6.5 and §7.4 pass; no message reveals whether an account exists.
- [ ] Local end to end (vite plus `wrangler dev` with DEV_EMAIL): sign up → verify link from dev_outbox → signed in by cookie → log out → log in → lockout message.
- [ ] Inputs carry the right autocomplete attributes so password managers work; Turnstile renders with the test site key and loads only when a form needs it.
- [ ] Tab, Enter and Esc work in every form; screenshots of each form and state across the matrix in en and ru.
- [ ] Gates: G-CODE, G-PLAT, G-MATRIX, G-SHOTS, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-ACCT-06: Standalone email-link pages /auth/* (sign-up and reset variants, ready for add_email and change_email)

| Field | Value |
| --- | --- |
| Goal | Standalone email-link pages /auth/* (sign-up and reset variants, ready for add_email and change_email). |
| Type | UI |
| Sprint and port slot | S8 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-ACCT-03, V6-ACCT-05 |
| Governing ADRs and specs | ADR-0008 §4 (fragment tokens), accounts-v6.md §5.4, §7.2, §12 "Auth page shell" |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- auth/** (new: standalone HTML, CSS and a small TS entry)
- vite.config.ts (multi-page input)
- tests/authPages.test.ts (new)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- plugin skill `frontend-design:frontend-design` (invoke with the Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The page reads `#t=`, POSTs it, never puts the token in a query, a log or the Referer; states per accounts-v6.md §5.4 and §7.2.
- [ ] Under 30 KB of script and CSS, no Phaser or game bundle; EN/RU switch without reload.
- [ ] Width check at 320, 390, 768, 1280, 1440 and 1920; Playwright flows using links from dev_outbox.
- [ ] Gates: G-CODE, G-SEC, G-SHOTS (six widths) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-ACCT-07: Account page base and guest flow: Settings → Account, Log out (everywhere), Signed-in devices, guest tip, Two campaigns, guest save upload

| Field | Value |
| --- | --- |
| Goal | Account page base and guest flow: Settings → Account, Log out (everywhere), Signed-in devices, guest tip, Two campaigns, guest save upload. |
| Type | UI |
| Sprint and port slot | S10 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-ACCT-05, V6-PLAT-03, V6-RSCR-01 |
| Governing ADRs and specs | ADR-0008 §3 endpoints, accounts-v6.md §4, §8.2, §8.9, §14 Q2, Q4, Q6 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/settings.ts (the Account row only)
- src/ui/account/{accountPage,devices,twoCampaigns}.ts (new)
- src/platform/saveSync.ts (decideOnLoad ask)
- src/scenes/MenuScene.ts (guest tip line)
- src/i18n/account.* (append)
- tests/saveSync*.test.ts

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/settings.ts`, `src/platform/*`, `src/i18n/account.en.ts / account.ru.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/save-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] accounts-v6.md §4.7 and the AU-09 base and AU-17 criteria of §8.11 pass.
- [ ] `decideOnLoad` returns `ask` when there is no sync metadata and both copies have a won battle; AU-08 resolves it (tests).
- [ ] End to end: a guest with campaign progress signs up and the progress is on the account.
- [ ] Log out everywhere follows what the server revokes (Q6); `403 banned` shows the banned message (Q4).
- [ ] Screenshots across the matrix in en and ru.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
