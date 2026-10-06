# Pixelarrow — design notes (milestone 1)

Mobile-first pixel-art formation tactics set in the ancient Mediterranean
(Hellenes, Carthaginians, Galatae). It runs as a Telegram Mini App and in any
mobile browser. This milestone covers one loop:

**Main menu → Army → Deployment → Battle vs bot → Results / loot → Army.**
Sailing and camp are out of scope for now.

## Heroes and the army

- 1 hero = 1 soldier. Up to 20 heroes. Each hero has a level (1–10), XP,
  1–2 traits, a look (skin, hair, beard, tunic colour) and five equipment slots.
- HP, morale and stamina are derived from level, traits and gear
  (`src/sim/stats.ts`). Heroes heal fully between battles.
- **Permadeath:** heroes killed in battle are removed with their gear.
  Recruits cost 40 gold and arrive as raw levies with worn, cheap gear.
  If the whole army dies, four volunteers join for free.
- **Traits** (`src/data/traits.ts`): Veteran, Steady, Swift, Brute, Keen-eyed,
  Stalwart, Tough and the negative Skittish. Heroes may gain a trait at levels
  3, 5 and 8 (Skittish turns into Steady).
- **Groups:** heroes belong to one of four battle groups —
  I Phalanx, II Skirmish, III Reserve, IV Flank — assigned in deployment.

## Equipment

All items are data in `src/data/items.ts`. Slots: weapon, shield, helmet,
body armour, trinket (passive, not drawn). Each owned item has a
**rarity** (common / fine / rare / heroic, scaling its positive stats),
a **condition** 0–100 (low condition weakens it; repairs cost gold) and
optional **paint** (shield emblem and colours, helmet crest colour).

| Weapon | Role | Notes |
| --- | --- | --- |
| Spear (dory) | melee | reach 1.9–2.0, braces against charges |
| Sword (xiphos, kopis, falcata, longsword) | melee | faster, short reach |
| Axe | melee | slow, pierces shields |
| Club | melee | cheap, extra morale shock |
| Sling | ranged | long range, lots of ammo |
| Bow | ranged | two-handed (no shield), longest range |
| Javelins | hybrid | 3–4 heavy throws, then a short spear |

Shields block frontal attacks (hoplon > oval > buckler). Hoplon and oval
shields allow the **shield wall**. A bow and a shield are exclusive.

## Battle simulation (`src/sim`)

A pure TypeScript, real-time simulation with no Phaser imports:

- Fixed timestep of 20 ticks/s, a seeded `Rng` (mulberry32) and no
  `Math.random`. Facing is a unit vector (no trigonometry), units are updated in
  id order. Same seed + same orders at the same ticks ⇒ the same battle
  (`Battle.hash()` fingerprints the state; tests check replay).
- Orders (`Order` in `src/sim/types.ts`) are logged with their tick.
  `issue()` applies an order immediately between steps; `schedule()` applies
  it at the next step, which is what a future lockstep PvP layer will use.
- The renderer only reads state and drains events (`hit`, `block`, `death`,
  `contact`, `flanked`, `rout`, `shot`, `impact`, `end`, ...).

### Rules

- **Facing and flanking:** a hit is front / side / rear, judged by the
  target's facing. Side hits do ×1.3 damage and ×1.8 morale damage; rear hits
  do ×1.6 damage and ×2.8 morale damage. Units fighting one enemy keep facing
  it, so a second enemy on their flank gets these bonuses.
- **Shields:** block chance applies to frontal hits (only 35% of it from the
  side, never from behind) and is improved against missiles. Shield wall:
  +15% frontal block, harder to push, but half speed and slower attacks.
  Charges into a braced wall lose 30% of their impact and do not stun.
- **Reach:** a weapon's reach decides who strikes first and lets the second
  rank of spearmen fight.
- **Charges:** units running for 0.8 s build momentum; the first blow lands
  with ×1.4+ damage, extra morale damage and a short stun. Spearmen holding
  their ground punish chargers with a brace bonus.
- **Missiles:** slings, bows and javelins fire projectiles with travel time,
  lead and scatter; they hit whatever stands at the landing point. Ammo is
  limited. Javelin groups keep their throws until ordered (or when charging).
- **Stamina:** running, fighting and blocking tire soldiers. Below 30 stamina
  they move and strike slower and block worse; resting recovers it.
- **Morale:** damage, nearby deaths and nearby routs lower morale (the
  cascade); enemy deaths raise it. Being outnumbered in melee erodes it.
  Below 25% of maximum a soldier routs and runs for his own edge (taking
  extra damage); out of danger he regains morale and rallies above 55%.
  Fleeing off the field saves his life but he takes no further part.
- **Spacing:** soldiers are discs that push each other apart; braced shield
  walls are harder to shove.
- **End:** a side with nobody left standing (dead, routing or fled) loses.
  After 5 minutes the stronger side wins, or it is a stalemate.

### Bot AI (`src/sim/ai.ts`)

Uses the same orders as the player. The main line waits briefly (shield wall
if shot at), then advances keeping formation and charges at close range.
Skirmishers move into range and loose, then retire behind the line when
threatened or out of ammo. Flankers swing wide around the enemy's largest
group and charge its side. The reserve follows the line and is committed when
the line wavers, the enemy breaks or time runs on.

The enemy army (`src/game/enemy.ts`) is generated from a random culture with
matching kit, sized to the player's army, and tuned until its combat power is
about 95% of the player's (rising slowly with victories).

## Controls

- Tap a group tag, tab or soldier to select a group. Tap the same soldier again
  to select that hero alone; any order then detaches him (Solo / Join).
- Drag on the ground with a group selected to draw its front line: the length
  sets the frontage (files) and therefore depth, the facing is perpendicular to
  the line towards the enemy. Dashed placement boxes show every target slot.
- Tap the ground to move a group keeping its shape; tap an enemy to attack him.
- Orders: Hold, Advance, Charge, Throw/Loose, Shield wall, Fall back.
  Formations: Line, Column, Wedge, Loose (skirmish), Shield wall.
- One-finger drag with nothing selected pans; two fingers pinch-zoom and pan
  (zoom snaps to whole multiples so pixels stay crisp). Mouse wheel zooms.
- Pause any time; orders can be given while paused. Auto-pause (settings):
  first contact, a group flanked, a group routing, a hero death (off by default).

## Loot and rewards

After a battle only enemies **your side actually killed** drop their real
gear, with their condition and battle wear. You pick: 3 items for a victory,
4 if you lost at most 20% of your men, 5 for a flawless one, 1 for a
stalemate, none for a defeat. Gold: 20 + 12 per kill (+60 for a win).
XP per survivor: 12 + 10 per kill (+12 for a win), modified by XP bonuses.

## Saves

`src/game/save.ts` holds a versioned schema (`SAVE_VERSION`, migration chain,
validation). The JSON is split into ≤3800-character chunks (`px_part_N` +
`px_meta`) because Telegram CloudStorage values are limited to 4096 chars.
Inside Telegram (Bot API 6.9+) the save goes to CloudStorage and is mirrored to
localStorage; in a normal browser localStorage is used.

## Art pipeline (`src/art`)

Everything is generated at boot from code; there are no image files.

- `paperdoll.ts` — layered soldier generator. Sheet format: 32×40 frames,
  feet at y = 37; 13 columns (`idle0 idle1 walk0-3 atk0-2 hit die0-2`) by
  2 rows (row 0 facing down-right, row 1 facing up-right; left-facing is a
  horizontal mirror). Layers, back to front: back-view shield, legs, tunic,
  body armour, head/hair/beard, helmet, arm, front-view shield, 1px outline,
  weapon. Each layer is keyed by the item's `art` id, so a hand-drawn sheet per
  layer in the same grid can replace a draw function later.
- `emblems.ts` — 7×7 shield emblems (lambda, owl, horse, trident, sun wheel,
  lion, eye, scorpion, boar, Tanit, club, star).
- `ground.ts` — dithered isometric grass (value noise + Bayer 4×4), tufts,
  flowers, dirt; blood decals; shadows; selection rings.
- `font.ts`, `icons.ts`, `uiTextures.ts` — pixel font, dark-red pictograms
  and parchment panels / scroll rolls.
- `/preview.html` on the dev server shows sample sprite sheets.

The ground is an isometric plane: field coordinates (x lateral, y depth) map to
the screen as `(x·24, y·12)`, which is exactly an isometric projection of a
45°-rotated grid. Sprites are drawn upright and depth-sorted by y.

## Known gaps (milestone 1)

- Balance is a first pass. Bot-vs-bot battles last 20–90 s; a passive stand-off
  ends at the 5-minute limit as a stalemate. There is no "retreat" button yet.
- No sound or music, no tutorial beyond the in-battle hint strip.
- Shield emblems are painted on round shields; oval shields get bands and a
  boss. Seen from behind (your own line facing up) shields show their inside.
- Determinism relies on IEEE doubles and `Math.sqrt` (correctly rounded), so
  replays match on the same engine; cross-platform lockstep PvP should add
  periodic `hash()` desync checks or move to fixed-point maths.
- Heroes do not carry wounds between battles (planned for the camp).
- The Phaser bundle is ~1.3 MB (~365 KB gzipped) in a single chunk.

## Next steps

Camp (wounds, repairs, training) and sailing between ports; more troop types
(cavalry, elephants, archers on foot vs. mounted); terrain (hills, rivers,
woods); lockstep PvP over Telegram using `schedule()` and state hashes; sound;
hand-drawn sprite sheets dropped into the documented layer format.
