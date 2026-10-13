# Landing build notes

## V6-LAND-03: features, classes and modes (truth check)

Every name on these sections exists in the game. Checked by hand against the sources below, and the
class names by `landing/scripts/sections-check.mjs` (`npm run test:sections`), which reads
`src/data/classes.ts`.

### Features (`#features`)

| Item | Source |
|---|---|
| Real-time battles; pause and give orders while paused, **in the campaign** | GAMEPLAY › Controls ("Offline battles pause any time"; online battles never pause, so the copy says "in the campaign") |
| Line, column, wedge, loose order, shield wall; drag to move, turn by the knob | GAMEPLAY › Controls (formation drags, the bronze knob) |
| Flanked lines waver, rear hits make them run | GAMEPLAY › Rules (side ×1.8 and rear ×2.8 morale damage, routs) |
| Every man has a name, class, gear and perks; permadeath | GAMEPLAY › Heroes and the army |

Dropped from STRUCTURE.md: the optional "4th century BC" line (no source in the game docs).

### Classes (`#classes`)

Twelve cards, each a class in `src/data/classes.ts` with its `role` and `cultures`; culture names are
the game's own `CULTURE_LABEL` (Hellenes, Carthaginians, Galatae). Lines paraphrase each class's `desc`
or the GAMEPLAY class table.

Spartan hoplite (heavy), Thracian rhomphaia (heavy), Celtic swordsman (heavy), Cretan archer (ranged),
Rhodian slinger (ranged), Scythian horse archer (ranged, mounted), Peltast (light), Thracian falx
(light), Companion cavalry (cavalry), Scythed chariot (cavalry), Royal guard (elite), Sacred Band
(elite). The other six are named in one line: militia, thureophoroi, peltast javelineers, Gallic
warbands, fanatics, Thessalian horse. 18 classes + 3 beasts = the "twenty-one classes" of the intro.

Beasts: Wolf, Wild boar, Brown bear (`role: 'beast'`). Mythical lairs on the war map: hydra, cyclops,
harpies, Nemean lion, minotaur, chimera (DESIGN_V2 › Mythical beasts; `src/data/beasts.ts`). The kraken
and titan are world bosses, not lairs, so they are not named.

Busts: the shipped v5 portraits, `public/ui/busts/bust_<id>.jpg`, copied unchanged to
`landing/public/classes/` (288x288 JPEG, 19.7–25.4 kB, all ≤ 25 kB).

### Modes (`#modes`)

| Mode | Copy source | Clip (real recording, V6-019 A4) |
|---|---|---|
| Campaign | GAMEPLAY › Campaign ("time passes only while the party moves or camps") | M1, overland map |
| Duels | DUELS › Summary (live and async 1v1, separate duel army, no losses, Glory, duel shop) | M2, ranked duel |
| War | DESIGN_V2 › Map, Garrisons, Clans, Mythical beasts | M3, war map |
| Forge | ITEMS › Reforging at the Smith (campaign only, a town's Services tab) | M4, the Smith screen |

Clips and posters moved from `landing/assets-staging/video/` to `landing/public/video/` (V6-027).

## Budget (measured 2026-10-13, Lighthouse 12.8.2, three runs each)

| Metric | Mobile | Desktop | Budget |
|---|---|---|---|
| Performance / A11y / BP / SEO | 99 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | ≥ 90 (95) / 95 / 95 / 100 |
| LCP (p75) | 1.97 s (v6 before this story: 1.81 s) | 0.53 s | ≤ 2.0 s / ≤ 1.2 s |
| CLS / TBT | 0 / 0 ms | 0 / 0 ms | ≤ 0.02 / ≤ 100 ms |
| First-view bytes | 176 kB | 470 kB | 350 kB / 650 kB above the fold |

Critical first-party JS is about 3.1 kB gzip (inline modules about 2.0 kB plus the 1.1 kB hero
starter; the 7.3 kB lazy hero module is outside the 15 kB row). HTML 12.7 kB gzip, inline CSS 6.0 kB.

**Why the stills are JS-lazy:** native `loading="lazy"` let Chromium fetch every bust and two posters
during the first view on a phone (its lazy distance is 1250–2500 px), which pushed mobile LCP to 2.9 s.
`landing/src/scripts/lazy.ts` loads them 600 px ahead instead, with `<noscript>` twins. It is imported
once from `Base.astro` so it is inlined rather than costing a request before LCP.

**Headroom warning for LAND-04/05:** mobile LCP has about 30 ms left under 2.0 s, and most of the
growth over v6 came from HTML weight (7.2 → 11.8 kB on the wire). Keep new section markup lean.
