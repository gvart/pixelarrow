# Game Concept: Pixelarrow v5

*Created: 2026-10-10 (S2-VISION, V5-007)*
*Status: Draft. Approved by the acting creative director in an autonomous run; the user's sign-off is pending.*

Short form: [docs/v5/VISION.md](../../docs/v5/VISION.md). Evidence: [docs/v5/AUDIT.md](../../docs/v5/AUDIT.md). Answers given for the user: [docs/v5/vision/ANSWERS.md](../../docs/v5/vision/ANSWERS.md).

---

## Elevator Pitch

> It's a pocket formation-tactics game: you command a named mercenary company in the ancient Mediterranean, through two-minute real-time battles where morale, flanks and javelins break lines, on your phone, inside Telegram.

---

## Core Identity

| Aspect | Detail |
| ---- | ---- |
| **Genre** | Real-time (pausable) formation tactics, with roguelite-leaning campaign RPG layers |
| **Platform** | Mobile web: a Telegram Mini App, portrait 390x844. Telegram Desktop with a mouse is secondary. |
| **Target Audience** | Mid-core tactics players on phones (see Target Player Profile) |
| **Player Count** | Single-player campaign. Online duels (live 1v1 and async) and a seasonal war map. |
| **Session Length** | 5–40 min. One battle is 60–120 s. |
| **Monetization** | Free to play. Stars buy Drachmae only, which buy cosmetics, the pass and consumables. No pay for power (unchanged, DESIGN_V2). |
| **Estimated Scope** | Large: v5 is about 3–4 months, solo plus agents, on a live codebase |
| **Comparable Titles** | Total War: Rome (the line and the rout), Battle Brothers (a named company with permadeath), Into the Breach (readable intent) |

---

## Core Fantasy

You are the strategos of a small mercenary company. You know every man by name. You read the enemy's line, and you break it where it bends.

The game delivers the moment a line you placed holds against a charge, and the moment your flank group hits the side of the enemy's line and the rout cascades across it. On a phone, in two minutes, with stakes that last.

## Unique Hook

It's like Total War's line battles, **and also** it fits in a thumb: a two-minute, pausable, touch-first battle on a deterministic sim that the server replays. The same sim, and the same army skills, carry the campaign, live duels and a seasonal war.

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics

| Aesthetic | Priority | How We Deliver It |
| ---- | ---- | ---- |
| **Challenge** | 1 | Enemy doctrines to read and counter. Morale and flank tactics. Permadeath stakes. |
| **Fantasy** | 2 | Named heroes, the ancient Mediterranean, captains as rivals, a company saga. |
| **Sensation** | 3 | A weighty clash: hit-stop, shake, the horn on a rout, the procedural soundscape. |
| **Expression** | 4 | Perk paths, army composition, formation choices. |
| **Narrative** | 5 | The event deck and the campaign arc to the final host. |
| **Fellowship** | 6 | Clans and the war map (existing). |
| **Discovery** | 7 | Learning doctrines and events. |
| **Submission** | N/A | — |

### Key Dynamics

- Players read a band's doctrine from its kind and its first moves, then counter it with shape and timing.
- Players plan cascades: break one group so the next one wavers.
- Players protect and grow favourite heroes, and grieve them.
- Players pick fights by the power plate and the captain's bounty, and decide whether to answer events.

### Core Mechanics

1. Deterministic real-time formation battle (morale cascade, facing and flanks, braced spears, held javelins) with pause-and-order.
2. Touch command: drag to move and face, tap to target, previews, a queue and undo.
3. Enemy doctrines and band captains.
4. Hero growth through branching perk paths and signature actives, with permadeath.
5. An overland campaign with an event deck and a lair-assault arc to the final host.

---

## Player Motivation Profile

| Need | How This Game Satisfies It | Strength |
| ---- | ---- | ---- |
| **Autonomy** | Which fights, which perk path, which event answer, which shape | Core |
| **Competence** | Doctrines get learned and countered; "why we lost" explains defeats; the ladder's difficulty climbs | Core |
| **Relatedness** | Named men, captains as rivals, clans and duels | Supporting |

**Player types**

- [x] **Achievers**: perk paths, the lair arc, ladder stars.
- [x] **Explorers**: doctrines, events, terrain.
- [ ] **Socializers**: clans exist, but they aren't the v5 focus.
- [x] **Competitors**: duels and the war map.

### Flow State Design

- **Onboarding curve.** The tutorial teaches select, drag, the knob, the shield wall, javelins, an ability and the flank, in about 3.5 min. The campaign then starts with **8 men**, the same scale the tutorial teaches. The first map visit gets 2 coach marks.
- **Difficulty scaling.** Danger grows with distance and with lairs. Doctrines come in by band kind. Tier 3 arrives with lair assaults. The final host closes the arc.
- **Feedback clarity.** Morale glyphs, flank arcs, range rings and the "why we lost" line.
- **Recovery from failure.** A defeat costs men, not the campaign. The army keeps survivors, and a destroyed army gets 5 volunteers.

---

## Core Loop

### Moment-to-Moment (30 seconds)
Read the line, give an order (drag, tap, or a "then"), watch the clash and the morale swing, respond. The target is a real decision every 10–15 s.

### Short-Term (5–15 minutes)
Pick a fight from the power plate, then deploy (and place field works) against a known doctrine. Fight, take spoils, tend the wounded.

### Session-Level (30–120 minutes)
March, answer 1–3 events, recruit, camp, assault a lair. Natural stops are after a battle, in camp, and after a lair falls.

### Long-Term Progression
Heroes grow down branching paths. Lairs fall one by one until the final host. Duels and war share the army skills.

### Retention Hooks
- **Curiosity**: unseen events, captains, doctrines.
- **Investment**: named veterans and their paths.
- **Social**: clans and the war season.
- **Mastery**: the ladder, ranked play, beating harder doctrines.

---

## Game Pillars

The definitions and design tests are in [VISION.md "Pillars"](../../docs/v5/VISION.md#pillars).

### Pillar 1: The line decides
Battles are won by where and when lines hold or break. Raw stats never decide them.

*Design test*: Between a feature that adds stat power and one that adds a choice about where or when a line breaks, choose the second.

### Pillar 2: Read it at a glance
Everything that decides a battle can be read on a 390-wide screen in under a second, and never by colour alone.

*Design test*: If a mechanic can't be shown on the field at 1× zoom, simplify it until it can, or cut it.

### Pillar 3: Command from the thumb
A few big gestures, each one previewed, forgiving (undo) and pausable offline.

*Design test*: Between a denser menu and a gesture with a preview, choose the gesture. Between commit-on-release and commit-with-undo, choose undo.

### Pillar 4: Every man has a name
Named heroes with growth choices and permadeath. Losses are fair and explained.

*Design test*: Close every exploit that dodges stakes. Explain every loss. Never soften permadeath.

### Pillar 5: One sim, everywhere
One deterministic, versioned sim, replayed by the server.

*Design test*: If a rule can't be deterministic and covered by `SIM_VERSION`, it is presentation, not sim.

### Anti-Pillars (What This Game Is NOT)

- **NOT an APM or micro game.** Micro would compromise P3 and drown out P1.
- **NOT a hero brawler.** No single unit carries a battle, and there's no commander avatar (P1).
- **NOT pay for power** (the monetization invariant).
- **NOT hidden information as difficulty** (P2).
- **NOT an economy builder.** The camp and towns serve the battles.

---

## Visual Identity Anchor

- **Direction**: "Mosaic & Parchment" (shipped v4). Pixel-art battlefield and map, inside painted Mosaic chrome.
- **One-line rule**: pixel art lives only on the map and the field; everything framed is painted.
- **Principles**:
  1. *Field first.* The battlefield is the hero. HUD chrome stays thin and labelled. Test: if a HUD element covers men, move it.
  2. *Meaning colours.* Terracotta is the primary action, bronze is neutral, grey is disabled, red is alerts only, and blue is real money only. Test: a red element must be an alert.
  3. *Integer-scaled sprites.* Never upscale pixel art into a painted frame. Test: no sprite crop in a niche without a 2× or 3× integer scale.
- **Colour philosophy**: muted bronze, crimson and earth on parchment, with the four group colours on the field.
- The art bible (`/art-bible`, a parallel Phase 2 story) expands this.

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| ---- | ---- | ---- | ---- |
| Total War: Rome | The line, flank and rout model | Two-minute battles, touch, pausable | It proves the fantasy |
| Battle Brothers | A named company, permadeath, contracts | Real-time battles, a lighter economy | It proves the attachment |
| Into the Breach | Readable intent, every action matters | Real time with pause | It sets the readability bar |

**Non-game inspirations**: Xenophon's *Anabasis* (a mercenary company far from home), Polybius on the phalanx against the legion, Greek vase painting for the chrome.

---

## Target Player Profile

| Attribute | Detail |
| ---- | ---- |
| **Age range** | 18–45 |
| **Gaming experience** | Mid-core |
| **Time availability** | 5–15 min bursts on the phone, 30–40 min evenings |
| **Platform preference** | Phone, inside Telegram |
| **Current games they play** | Total War (PC), Battle Brothers, mobile tactics (Into the Breach, Polytopia) |
| **What they're looking for** | Real tactics in short sessions on a phone |
| **What would turn them away** | Pay to win, unreadable chaos, twitch micro, losing men to exploits or bugs |

---

## Technical Considerations

| Consideration | Assessment |
| ---- | ---- |
| **Engine** | Phaser 3.90 + TypeScript + Vite (existing). The Phaser 4 question is V5-005 (the P4 spike). |
| **Key Technical Challenges** | Sim determinism and `SIM_VERSION` (V5-012). Save migrations for live players. Lockstep for live duels. Server replay in a Cloudflare Worker. |
| **Art Style** | A pixel field and map (procedural), painted UI chrome |
| **Art Pipeline Complexity** | Medium: procedural sprites plus a painted asset pass |
| **Audio Needs** | Moderate: procedural Web Audio with adaptive layers (existing) |
| **Networking** | Client-server: a Worker with D1 and Durable Objects. Lockstep for live duels. |
| **Content Volume** | 18 classes plus beasts, 178 items, 4 doctrines plus 1 default, about 24 events, 6 lairs plus the final host |
| **Procedural Systems** | The overland map, battlefields, armies, loot and events (all seeded) |

---

## Risks and Open Questions

### Design Risks
- Doctrines may become predictable once learned. Mitigation: a seeded jitter on every timer, plus the deferred utility-AI option.
- The decision budget may overload the HUD (P2 against P1). Mitigation: at most 3 medallions; the "Then" queue is only one step deep.

### Technical Risks
- Sim train 2 touches a lot of `battle.ts`, and determinism regressions are hard to see. Mitigation: replay-hash tests per feature, and the server replays every test log.
- A save bump for live players (one bump, with tested migrations, S4-FIX-SAVES first).

### Market Risks
- A niche genre on Telegram. Mitigation: the duel and war modes, and short sessions.

### Scope Risks
- The campaign arc is L-sized. It's flagged for `/design-system` before its epic.

### Open Questions
- Is an 8-man start too easy against the first bands? Answer with `npm run balance` small-army rows and a playtest.
- Should captains persist as nemeses across losses? This is deferred until the utility-AI retreat exists.

---

## MVP Definition

**Core hypothesis**: at the 8-man start, a campaign battle offers 8 or more real decisions, and players can read why they won or lost.

**Required for MVP**:
1. Controls and readability (controls.md, battle-readability.md).
2. The 8-man opening (campaign-arc.md "Opening").
3. Doctrines (at least 3) and the formation and order changes (sim train 2).

**Explicitly NOT in MVP**: the event deck, lair assaults and the final host, field works, perk paths.

### Scope Tiers

| Tier | Content | Features | Timeline |
| ---- | ---- | ---- | ---- |
| **MVP** | The existing campaign | Controls, readability, 8-man start, doctrines, formations | about 4 weeks |
| **Vertical Slice** | + 1 lair assault | + abilities and perk paths, captains | about 8 weeks |
| **Alpha** | All 6 lairs, about 24 events | + event deck, field works, the final host | about 12 weeks |
| **Full Vision** | Polished, with the art pass | + the deferred items as they earn their place | about 16 weeks |

---

## Next Steps

- [ ] User sign-off on the pillars and the expansion ranking (VISION.md).
- [ ] `/art-bible` and `/ux-design` (the parallel Phase 2 ART+UX story).
- [ ] ADRs (V5-008): determinism and replay contract plus `SIM_VERSION`, save migration, engine version.
- [ ] `/design-system` for campaign-arc and controls before their epics (they were flagged too large for quick-design).
- [ ] `/create-stories` per GDD, in the order given in VISION.md "Release shape".
