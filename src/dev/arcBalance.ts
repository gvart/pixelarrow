/**
 * Campaign arc balance (headless): the rows of design/gdd/campaign-arc.md
 * "Balance targets". `npm run balance` prints them.
 *
 * AR-01 (the opening, R1): an army against a bandit band, both sides
 * bot-driven on a campaign battlefield, the way a campaign battle is set up
 * (src/game/campaignBattle.ts campaignSetup). Two kinds of band:
 *  - start: the lair bandit bands a new world has (World.fresh). Bandits
 *    spawn at their lair, where danger is 0.66-1.0 on real maps.
 *  - starter: the starter zone's bands near the starting town (V5-054,
 *    World.spawnStarterBands), the first fights of a new campaign.
 * Armies: the 8-man opening, the old three-man start, and the five
 * volunteers of a destroyed army. Bands that are a beast (src/game/beasts.ts
 * bandBeast) are left out: the rows measure men against men.
 * AR-03 (R3, R6, R7, `lateRows`): the tier-3 share of new bands by date and
 * lairs fallen, the rare set pieces tier-3 bands carry, their power and loot
 * against the same band at tier 2, lair hoards, and the level 6-10 pacing.
 * Lair assaults and the host come with AR-02 and AR-04.
 */
import type { BalanceRow } from './balance';
import { armySpec } from '../game/armySpec';
import { bandBeast } from '../game/beasts';
import { Campaign } from '../game/campaign';
import { makeHero, openingParty, starterParty, type IdSource } from '../game/heroes';
import { MAX_LEVEL, xpToNext, type Hero } from '../data/units';
import { itemDef, itemValue, type Item } from '../data/items';
import { buildArmy } from '../game/enemy';
import { lateXpMult } from '../game/loot';
import { lairHoard } from '../game/sources';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import { heroPower } from '../sim/stats';
import { generateBattlefield, randomSite } from '../world/battlefield';
import { VOLUNTEER_RULES, World, partyArmy, type PartyState } from '../world/world';

export type OpeningArmy = 'opening' | 'old3' | 'volunteers';

export interface OpeningFight {
  won: boolean;
  /** Band power over the army's (heroPower sums, as the map's plate). */
  ratio: number;
  bandSize: number;
}

/** A new campaign's bandit bands (not beasts): `starter` = the starter zone's (home: the starting town), else the lairs'. */
export function startBands(seed: number, starter = false): PartyState[] {
  const w = Campaign.fresh(seed).world;
  return w.s.parties.filter((p) => p.kind === 'bandits' && !bandBeast(p.seed) && (p.home === w.map.start) === starter);
}

function army(kind: OpeningArmy, rng: Rng, ids: IdSource): Hero[] {
  if (kind === 'opening') return openingParty(rng, ids);
  if (kind === 'old3') return starterParty(rng, ids);
  const out: Hero[] = [];
  for (let i = 0; i < VOLUNTEER_RULES.destroyed; i++) out.push(makeHero(rng, ids, 'greek', 'raw', 1, 1, i < 3 ? 0 : 1, out));
  return out;
}

/** One battle: the `kind` army (bot-driven) against `band` on a campaign battlefield. */
export function runOpening(seed: number, band: PartyState, kind: OpeningArmy = 'opening'): OpeningFight {
  const ids = { nextId: 1 };
  return runFight(seed, army(kind, new Rng(seed), ids), band, ids);
}

/** One battle: `mine` (bot-driven) against `band` on a campaign battlefield. */
function runFight(seed: number, mine: Hero[], band: PartyState, ids: IdSource): OpeningFight {
  const foe = partyArmy(band, ids);
  const terrain = generateBattlefield(seed, randomSite(new Rng(seed ^ 0x51735c1)));
  const b = new Battle({ seed, armies: [armySpec(mine, true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine }], terrain });
  b.startBattle();
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) b.step();
  const power = (hs: Hero[]) => hs.reduce((a, h) => a + heroPower(h), 0);
  return { won: b.winner === 0, ratio: power(foe.heroes) / power(mine), bandSize: foe.heroes.length };
}

const pct = (k: number, n: number) => `${Math.round((100 * k) / Math.max(1, n))}%`;

function rowOf(label: string, r: OpeningFight[], target: string): BalanceRow {
  const n = r.length;
  const ratio = r.reduce((a, x) => a + x.ratio, 0) / Math.max(1, n);
  const size = r.reduce((a, x) => a + x.bandSize, 0) / Math.max(1, n);
  return { label: `${label} (${n} fights, band ${size.toFixed(1)} men, x${ratio.toFixed(2)})`, measured: pct(r.filter((x) => x.won).length, n), target };
}

/**
 * `n` sets the sample: n/4 new worlds (two or three starter bands and about
 * two lair bandit bands each). The GDD target (R1, V5-054) is
 * the 8-man opening against the starter zone's bands.
 */
export function arcRows(n: number): BalanceRow[] {
  const worlds = Math.max(4, Math.round(n / 4));
  const start: { seed: number; band: PartyState }[] = [];
  const starter: { seed: number; band: PartyState }[] = [];
  for (let s = 1; s <= worlds; s++) {
    for (const band of startBands(s)) start.push({ seed: (band.seed ^ s) >>> 0 || 1, band });
    for (const band of startBands(s, true)) starter.push({ seed: (band.seed ^ s) >>> 0 || 1, band });
  }
  const run = (set: typeof start, kind: OpeningArmy) => set.map((x) => runOpening(x.seed, x.band, kind));
  const openStart = run(start, 'opening');
  return [
    rowOf('8-man opening vs starter-zone bandits', run(starter, 'opening'), '55-70% (R1, V5-054)'),
    rowOf('8-man opening vs lair bandits at the start', openStart, 'none (Strong plate mostly)'),
    rowOf('before: 3-man start vs start bandits', run(start, 'old3'), 'none (reference)'),
    rowOf('5 volunteers (destroyed army) vs start bandits', run(start, 'volunteers'), 'none stated'),
    ...lateRows(n),
  ];
}

// ------------------------------------------------------------------ AR-03: tier 3, sources, pacing (R3, R6, R7)

/** New bands (men, not beasts) a world spawns at `day` with `fallen` lairs destroyed: 16 spawns, 1 in 4 from a town. */
export function lateBands(seed: number, day: number, fallen = 0): PartyState[] {
  const w = new World(World.fresh(seed));
  for (const st of w.map.settlements.filter((s) => s.kind === 'lair').slice(0, fallen)) w.s.lairs[st.id] = { fallen: true, lost: 0, lostAt: 0 };
  w.s.time = day * 24;
  const out: PartyState[] = [];
  for (let i = 0; i < 16; i++) {
    const p = w.spawnParty(i % 4 === 3 ? 'town' : 'lair');
    if (p && !bandBeast(p.seed)) out.push(p);
  }
  return out;
}

/** The same band at gear tier 2 (what it would have been before R3). */
const atTier2 = (p: PartyState): PartyState => ({ ...p, tier: 2 });

/** What a won fight's loot sells for: the `picks` dearest pieces of the whole band's gear (every man killed), at corpse wear. */
function lootValue(p: PartyState, picks = 4): number {
  const vals = partyArmy(p, { nextId: 1 }).heroes.flatMap((h) => Object.values(h.equip).filter((it): it is Item => !!it).map((it) => itemValue({ ...it, cond: Math.max(5, it.cond - 5) })));
  return vals.sort((a, b) => b - a).slice(0, picks).reduce((a, v) => a + v, 0);
}

/** Battle pay of a win where every man of a `size` band is killed (src/game/loot.ts resolveBattle, no gilded gear). */
const winPay = (size: number) => 20 + 12 * size + 60;

/** A Greek line army as many and as seasoned as `band`, tuned to the power `band` had at tier 2: the army that was even against it before R3. */
function evenArmy(seed: number, band: PartyState, ids: IdSource): Hero[] {
  const target = partyArmy(atTier2(band), { nextId: 1 }).power;
  return buildArmy(new Rng(seed ^ 0x2545f491), ids, { culture: 'greek', count: band.size, level: band.level, tier: 2, targetPower: target, mix: 'line' }).heroes;
}

/** Campaign battles a hero needs from level `a` to `b` at `perBattle` XP, gains times `mult(level)`. */
export function battlesBetween(a: number, b: number, perBattle: number, mult: (level: number) => number): number {
  let n = 0;
  for (let l = a; l < b; l++) n += xpToNext(l) / (perBattle * mult(l));
  return n;
}

function lateRows(n: number): BalanceRow[] {
  const worlds = Math.max(4, Math.round(n / 8));
  const share = (day: number, fallen: number) => {
    const bs = Array.from({ length: worlds }, (_, i) => lateBands(i + 1, day, fallen)).flat();
    return `${pct(bs.filter((p) => p.tier === 3).length, bs.length)}`;
  };
  const t3: { seed: number; band: PartyState }[] = [];
  for (let s = 1; s <= worlds; s++) for (const band of lateBands(s, 60, 2)) if (band.tier === 3) t3.push({ seed: (band.seed ^ s) >>> 0 || 1, band });
  // set pieces a tier-3 band's men carry (all killed: every one is in the loot pool, the player picks it)
  let pieces = 0;
  for (const { band } of t3) for (const h of partyArmy(band, { nextId: 1 }).heroes) for (const it of Object.values(h.equip)) if (it && itemDef(it.def).set) pieces++;
  const per = pieces / Math.max(1, t3.length);
  const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / Math.max(1, xs.length);
  const power = mean(t3.map(({ band }) => partyArmy(band, { nextId: 1 }).power / partyArmy(atTier2(band), { nextId: 1 }).power));
  const loot3 = mean(t3.map(({ band }) => lootValue(band)));
  const loot2 = mean(t3.map(({ band }) => lootValue(atTier2(band))));
  const pay = mean(t3.map(({ band }) => winPay(band.size)));
  const chests = n * 10; // cheap: no battles
  const hoards = Array.from({ length: chests }, (_, i) => lairHoard(`bal${i}`, (['greek', 'phoenician', 'celtic'] as const)[i % 3], { nextId: 1 }));
  const hoardSets = hoards.filter((h) => !!itemDef(h[0].def).set).length;
  const hoardGold = mean(hoards.map((h) => h.reduce((a, it) => a + itemValue(it), 0)));
  const fights = t3.slice(0, Math.max(8, Math.round(n / 4)));
  const vs = (tier2: boolean) => fights.map(({ seed, band }) => {
    const ids = { nextId: 1 };
    return runFight(seed, evenArmy(seed, band, ids), tier2 ? atTier2(band) : band, ids);
  });
  const xpPer = 26; // docs/v5/balance/BASELINE.md: a typical survivor's XP per battle
  const before = battlesBetween(6, MAX_LEVEL, xpPer, () => 1);
  const after = battlesBetween(6, MAX_LEVEL, xpPer, lateXpMult);
  const toSix = battlesBetween(1, 6, xpPer, lateXpMult);
  return [
    { label: 'tier-3 share of new bands: day 49 / day 50', measured: `${share(49.9, 0)} / ${share(50, 0)}`, target: '0% before day 50, then where danger > 0.85 (R3)' },
    { label: 'tier-3 share of new bands: 2 lairs fallen, day 10', measured: share(10, 2), target: 'raiders, mercs and danger > 0.85 (R3)' },
    { label: `rare set pieces per tier-3 band (${t3.length} bands)`, measured: per.toFixed(2), target: '> 0: reachable offline (R3, I2)' },
    { label: 'tier-3 band power over the same band at tier 2', measured: `x${power.toFixed(2)}`, target: 'none stated (the plate shows it)' },
    rowOf('army even at tier 2 vs the band at tier 3', vs(false), 'none stated (the plate warns)'),
    rowOf('the same army vs the band at tier 2', vs(true), 'none (reference, about even)'),
    { label: 'loot resale per tier-3 win, 4 picks (tier 2)', measured: `${Math.round(loot3)} g`, target: `none stated; was ${Math.round(loot2)} g at tier 2, battle pay ${Math.round(pay)} g` },
    { label: `lair hoard (${chests} chests): epic set piece`, measured: pct(hoardSets, chests), target: '25% (R6)' },
    { label: 'lair hoard resale (3 picks, one-time x6)', measured: `${Math.round(hoardGold)} g`, target: 'none stated' },
    { label: `levels 6-10, battles at ${xpPer} XP (before ${before.toFixed(0)})`, measured: after.toFixed(0), target: `< 46: 32·L from level 6 (R7); level 6 at ${toSix.toFixed(0)}` },
  ];
}
