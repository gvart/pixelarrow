# Epic: Payments interface and the web "coming soon" placeholder

> **ID**: v6-payments (stories V6-PAY-NN)
> **Layer**: Feature
> **GDD / spec**: design/gdd/systems-index.md #47; brief Goal 7; accounts-v6.md §11.2 (AU-20)
> **Architecture Module**: src/platform/{core,telegram,web}/payments.ts, src/ui/econ/source.ts, src/ui/econ/widgets.ts, src/scenes/ShopScene.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Manifest Version**: docs/v6/plan/CONTROL_MANIFEST_PLATFORM.md (Feature layer: pay only through platform.payments)
> **Stories**: 2, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 3 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

The shop pays only through `platform.payments` (ADR-0006 M7). Telegram keeps Stars exactly as today. The web adapter reports "coming soon" with a reason, and the Shop → Wallet shows the AU-20 card with no Stars prices, ready for a real provider later without touching the shop or the server's grant logic. Pricing does not change (brief).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0006: The platform layer | Payments.status() and pay(); Telegram keeps Stars; web reports coming_soon; the server invoice and grant logic never change for a provider. | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-pay-001 | A Payments interface; Telegram keeps Stars exactly as today | ADR-0006 |
| TR-v6-pay-002 | Web placeholder "coming soon" with a reason in the shop | ADR-0006; accounts-v6.md AU-20 |
| TR-v6-pay-003 | Ready for a real provider without touching the shop or the server grant logic | ADR-0006 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-PAY-01 | M7: the shop pays through platform.payments; Stars copy keyed to the provider | Integration | Ready | S10 | 1.5 | V6-PLAT-04 |
| V6-PAY-02 | AU-20: the web wallet "payments coming soon" card and purchase buttons with their reason | UI | Ready | S13 | 1.5 | V6-PAY-01, V6-PLAT-06, V6-RSCR-06 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-PAY-01: M7: the shop pays through platform.payments; Stars copy keyed to the provider

| Field | Value |
| --- | --- |
| Goal | M7: the shop pays through platform.payments; Stars copy keyed to the provider. |
| Type | Integration |
| Sprint and port slot | S10 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-PLAT-04 |
| Governing ADRs and specs | ADR-0006 M7 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/platform/online.ts (openInvoice)
- src/platform/telegram/payments.ts, src/platform/web/payments.ts
- src/ui/econ/source.ts
- src/scenes/ShopScene.ts (legal copy lines)
- tests/platform/*payments*, tests/payments*.test.ts

**Shared files touched** (see SPRINTS.md "Shared files"): `src/platform/*`, `src/scenes/ShopScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `OnlineDeps.openInvoice` becomes `platform.payments`; the dynamic import of the Telegram module in econ/source.ts is gone.
- [ ] Telegram: invoice statuses map exactly as before (adapter test); a Stars purchase in Telegram emulation against wrangler dev grants as before.
- [ ] Web: `status()` returns coming_soon, signed_out or offline; Stars legal copy shows only for `provider: 'telegram_stars'`.
- [ ] server/test payments tests pass unchanged (the grant logic is not touched).
- [ ] Gates: G-CODE, G-PLAT, G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-PAY-02: AU-20: the web wallet "payments coming soon" card and purchase buttons with their reason

| Field | Value |
| --- | --- |
| Goal | AU-20: the web wallet "payments coming soon" card and purchase buttons with their reason. |
| Type | UI |
| Sprint and port slot | S13 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-PAY-01, V6-PLAT-06, V6-RSCR-06 |
| Governing ADRs and specs | ADR-0006; accounts-v6.md §11.2 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/econ/widgets.ts (comingSoon kind)
- src/scenes/ShopScene.ts (wallet tab)
- src/i18n/shop.* (append)
- docs/v6/PROPOSALS.md (append: how a provider plugs in)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/ShopScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/localize/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] accounts-v6.md §11.2 criteria pass; no Stars price appears on the web; Pass and cosmetics buttons show the reason when tapped.
- [ ] Telegram shop unchanged (screenshots compare).
- [ ] Screenshots of Shop → Wallet across the matrix in en and ru on `?platform=web`.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
