# Field Works

> **Type**: Addition (quick-design) to system #5 Battle terrain, linking #21 Field camp to battles
> **Status**: Draft (S2-VISION, 2026-10-10)
> **Vision rank**: 6 of 6
> **Pillars**: P1 The line decides (where the line can hold), P2 Read it at a glance
> **Fixes**: MECH F1 (a flank answer), R3 (a cavalry answer for foot that isn't massed militia), "nothing links the camp to battles" (§2.3.1)
> **Legacy reference**: docs/GAMEPLAY.md "Battle terrain"; MECHANICS.md §2.3.1

## Overview

In campaign deployment the player can spend **supplies** to place up to three **works** in their own deployment zone:

- a line of **stakes** (it breaks charges);
- a **ditch** (it slows and exposes attackers);
- a **wagon laager** (an impassable wall).

Works are new terrain cell kinds, placed with a deploy-phase order, so the server replays them like every other order. Lair assaults also use a generated **palisade** with a **rampart** behind it (campaign-arc.md R2).

## Player Fantasy

"Their horse will come round the left. Stakes there, my archers behind them, and let them try."

The aesthetic is Challenge (preparation pays off).

## Detailed Rules

### R1. Cell kinds

These are added to `TerrainKind` and `TERRAIN` in `src/data/terrain.ts`. Each one is a new code character.

| Kind | Code | Speed | Blocked | Cover | Scatter | Block | No wall | Brace | Horse speed / charge | Chariot speed / dmg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `stakes` | `x` | 0.7 | no | 0 | 0.15 | 0.9 | yes | 0 | **0.3 / 0** | 0.2 / 6 |
| `ditch` | `d` | 0.45 | no | 0 | 0.3 | 0.75 | yes | 0 | 0.35 / 0.2 | 0.15 / 5 |
| `laager` | `L` | 0 | **yes** | 0 | 0 | 1 | yes | 0 | 0 / 0 | 0 / 0 |
| `palisade` | `P` | 0 | **yes** | 0 | 0 | 1 | yes | 0 | 0 / 0 | 0 / 0 |
| `rampart` | `p` | 0.9 | no | **0.35** | 0 | 1.1 | no | 1.2 | 0.8 / 0.6 | 0.6 / 0 |

### R2. Special rules

1. **Ditch.** A melee hit **against a man standing in a ditch** from a man not in a ditch does **×1.2 damage**: the defender strikes down from the lip. It's applied in `applyDamage` beside the height factor, and doesn't stack with height: the larger of the two applies.
2. **Stakes.**
   - A charge whose path crosses a stakes cell loses its charge momentum (the charge bonus is reset to 0). The sim emits `{ type: 'stakesBreak'; tick; unit; x; y }` once per unit per crossing, where (x, y) is the stakes cell. It's a new `SimEvent`, output only and not hashed.
   - Mounted units entering a stakes cell take a hit at 0.5× of their own charge damage (impaled), once per unit per crossing.
3. **Laager and palisade** are blocked like rocks: men slide along them, and slots on them move.
4. **Rampart** is generated only behind a palisade (campaign-arc.md R2). It gives the defenders cover from missiles and a better brace.

### R3. The `work` order (deploy phase only)

New order: `{ kind: 'work'; type: 'stakes' | 'ditch' | 'laager'; x: number; y: number; fx: number; fy: number }`.

- It places a **segment** centred on the cell (x, y), perpendicular to (fx, fy):
  - stakes and ditch: 3 cells;
  - laager: 2 cells.
- It's valid only in `phase === 'deploy'`, and every cell must:
  - be inside the issuing side's deployment zone;
  - be on open, scrub, sand or rough ground;
  - not be occupied by another work.

  An invalid order is ignored and logged.
- Each side's allowance travels in `ArmySpec.works?: { stakes: number; ditch: number; laager: number }`, as segment counts. The sim refuses orders beyond it. Missing means none.
- An undo in deployment (controls.md R4) removes a segment with `{ kind: 'unwork'; x; y }`, which is valid only in the deploy phase.
- At battle start the placed cells are written into the battle's terrain grid. They're part of `Battle.hash()`.

### R4. Allowance and cost (campaign)

1. Before an encounter's deployment, the player's allowance is bought from **supplies** (`WorldSave.supplies`):

   | Work | Cost |
   | --- | --- |
   | stakes | 6 supplies |
   | ditch | 8 supplies |
   | laager | 15 supplies |

   At most `WORKS_MAX` (3) segments.
2. **Time to dig**: when a band **caught** the player (it chased and made contact on the march), the allowance is capped at **1** segment. When the player attacked, or was in camp, the full allowance applies.
3. Supplies are spent only for segments **actually placed** when the battle starts. Undoing one refunds it.
4. **Lair garrisons** get their own allowance, keyed to the **lair**, not to the doctrine: every lair garrison (and every reborn lair) gets `GARRISON_STAKES` = **2 stakes** segments, free. They're placed in front of the palisade's gate gaps by the rule in R6. The final host is a field army, not a garrison, so it gets none. Field bands get no works in v5, whatever their doctrine.
5. **Duels and war: allowance 0 in v5.** Works are a campaign feature. The order kind is still part of the sim, so a later season can enable it by data.

### R5. Readability (P2)

- Each work has distinct iso art that reads at 1× zoom: pointed stake rows, a dark trench, wagons, a timber palisade, an earthen rampart.
- The deployment long-press tooltip lists its effects. There's also an (i) button, because long-press is never the only path (G15).
- A charge stopped by stakes (the `stakesBreak` event, R2) shows a "Broken on the stakes" banner, plus a splinter burst (battle-readability.md R4).

### R6. Bot placement

The bot places works in its deployment zone, at the end of its deploy step:

- **Stakes** (field bots, if a later season gives them an allowance): centred on the flank facing the enemy's cavalry group. Without one, in front of its skirmishers.
- **Garrison stakes**: one segment in front of each palisade gate gap, 2 paces out, facing the attacker's zone.
- **Ditch**: along its main line's front, two paces ahead.
- **Laager**: never in v5.

Doctrines don't decide whether works exist (R4). They only decide how bots attack through them. Attacking bots path through works by terrain speed (no special routing).

## Formulas

### F1. Ditch factor

```
dmg_mult_terrain = max(heightFactor, inDitch(target) ∧ ¬inDitch(attacker) ? 1.2 : 1)
```

`heightFactor` is 0.6–1.5 (from the existing height rules). The output range is 0.6–1.5, so the ditch never exceeds the high-ground cap.

### F2. Impale hit

```
dmg = 0.5 × C
```

C is the rider's own charge damage, with ×1.4+ impact (GAMEPLAY "Charges"). For example, a Companion whose charge blow would be 14 takes **7** on entering the stakes.

### F3. Allowance cost

```
supplies = 6·s + 8·d + 15·l
```

The constraint is s + d + l ≤ 3 (or 1 when caught). The maximum is 45 supplies (3 laagers).

## Edge Cases

- **A segment partly off the zone or on blocked ground**: the whole order is refused. The ghost turns to the invalid state, with a ✗ glyph (G13) and a reason.
- **Works over the centre of the deployment front**: allowed. The generator's "centre never blocked" rule is about generation, and the player may block themselves (a laager is a choice).
- **Laager enclosing your own men**: allowed. Men inside can still leave through any gap. A fully closed ring needs 4 laagers, which is more than WORKS_MAX.
- **Beasts**: they treat stakes as rough (no impale) and ditch normally. Myth bosses ignore works (their own movement rules).
- **Retreat**: works don't affect pursuit.
- **An old setup without `works`**: no allowance, and the battle plays as before (but under SIM_VERSION 2).

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| campaign-arc.md | is used by | `palisade` and `rampart` cells for assault fields; garrison allowances |
| ai-doctrines.md | uses | bot placement (R6). Attacking bots path by terrain speed, with no special routing. The garrison allowance is keyed to the lair, not the doctrine. |
| controls.md | is used by | the works placement gesture, ghosts and undo |
| battle-readability.md | is used by | renders the `stakesBreak` event: the "broken on the stakes" banner and burst |
| formations-orders.md | uses / is used by | the orb inside a laager. Stakes vs the feint bait: pursuers drawn across stakes lose their charge momentum (R2) and are disordered (formations-orders.md R3). The two effects stack. |
| #21 Field camp (`src/world/camp.ts`) | uses | the supplies economy |
| #32 / #34 server | constrains | zod: the `work` / `unwork` kinds, `ArmySpec.works`, the terrain codes |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| campaign-arc.md | R2 assault terrain | is used by |
| ai-doctrines.md | R2 doctrine table, R5 bot behaviour | uses |
| controls.md | R7 deployment tools | rendered by |
| battle-readability.md | R4 juice tiers (`stakesBreak`) | rendered by |
| formations-orders.md | R2 orb, R3 feint bait | uses / is used by |

## Tuning Knobs

The knobs live in `src/data/terrain.ts` (cells) and a new `WORKS` table in the same file.

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| Cell multipliers (R1) | table | ±30% | curve | the identity of each work |
| DITCH_MULT | 1.2 | 1.1–1.3 | curve | under the high-ground cap |
| IMPALE_MULT | 0.5 | 0.3–0.8 | curve | stakes punish riders |
| Segment length (stakes / ditch / laager) | 3 / 3 / 2 | 2–4 | feel | readable at 1× |
| Supply costs | 6 / 8 / 15 | 4–20 | curve | camp supplies matter |
| WORKS_MAX / WORKS_CAUGHT | 3 / 1 | 2–4 / 0–2 | gate | preparation vs ambush |
| GARRISON_STAKES | 2 | 0–3 | curve | assault difficulty; keyed to the lair (R4.4) |

## Touch UI needs

- **Deployment panel**: a **Works** button beside Shape. It opens a 3-item tray (icon, name, cost, remaining allowance) that fits at 320.
- **Placing**: pick a work, and a ghost segment follows the finger in the deploy zone, snapping to cells. Its rotation follows the facing knob, the same gesture as a group. Lift to place. Valid is shown with a ✓ glyph, invalid with ✗ (not colour only).
- **Removing**: a tap on a placed work selects it, and a ✕ chip removes it. The global Undo chip also works (controls.md R4).
- **Supplies**: the remaining supplies are shown in the tray header.
- **Strings**: i18n, en and ru.

## Online and server impact

- **Sim train 2**:
  - new terrain codes in `TERRAIN`, read by the server's replay;
  - the `work` and `unwork` order kinds and `ArmySpec.works` in the zod schema (`server/src/battle.ts`);
  - the terrain `cells` string validation must accept the new codes.
- **Duels and war**: the allowance is 0 in v5, so nothing changes in play. The code path ships so that a later season can enable works by data alone.
- **Lockstep**: `work` is a deploy order, held back with the other deploy orders in duels (not used in v5).

## Save impact

None new. `WorldSave.supplies` already exists, and spending it is an ordinary save write.

## Balance targets (`npm run balance`)

| Test | Target |
| --- | --- |
| 6 hoplites + 2 Companions (flank) vs 8 hoplites with **1 stakes** segment on the threatened flank | the defender gains **+10 to +15 pts** over no stakes |
| Companions charging through stakes into braced hoplites | the riders' charge damage is −80% or more; the hoplites still win (already 100%) |
| Reference army with 3 works (defending) vs matched bot | **≤ 62%**: works help but don't dominate |
| Ridge plus 3 works | **≤ 70%** (the ridge itself is retuned by ai-doctrines.md to 62–68%) |
| Ridge plus 3 works plus an orb reserve (the turtle) | **≤ 70%**. Swarm and hammer bots answer with a stand-off (ai-doctrines.md R5). |
| Ditch line vs a swordsman assault | the defender gains **+6 to +12 pts** |
| Lair assault at 1.0× power (palisade plus 2 stakes) | 38–48% for the attacker (campaign-arc.md) |

## Acceptance Criteria

- [ ] Each cell kind's multipliers apply in the sim. Unit tests for the ditch factor, the stakes charge reset and the impale hit.
- [ ] `work` orders outside the deploy phase or zone, or over the allowance, are ignored and logged.
- [ ] The server replays a battle with works to the same hash (zod plus replay test).
- [ ] Supplies are spent only for placed segments, and undo refunds them.
- [ ] Works read at 1× zoom in screenshots at 390 and 320 (a manual art check), and the tooltip has an (i) path.
- [ ] *Experiential*: a playtester uses stakes against cavalry unprompted after seeing the tooltip once.

## Files touched

- **Data**: `src/data/terrain.ts`.
- **Sim**: `src/sim/terrain.ts`, `src/sim/battle.ts` (`applyOrder` work/unwork, `applyDamage` ditch, charge reset, impale), `src/sim/types.ts` (`Order`, `ArmySpec.works`), `src/sim/ai.ts` (placement).
- **World and game**: `src/world/battlefield.ts` (`assault` palisade/rampart), `src/game/campaign.ts` (allowance, supplies), `src/game/enemy.ts` (garrison allowance).
- **Art**: `src/art/*` (iso ground and sprites for the works).
- **UI**: `src/ui/battlePanel.ts`, `src/ui/dragFormation.ts`, `src/scenes/BattleScene.ts`, `src/i18n/*`.
- **Server**: `server/src/battle.ts`.
- **Dev**: `src/dev/balance.ts`.
