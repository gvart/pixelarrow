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
 * AR-02 (R2, `assaultRows`): lair assaults. A Greek line army tuned to a
 * multiple of a real lair garrison's power (Campaign.garrisonEnemy) attacks
 * it on its assault field (palisade, rampart, the garrison's stakes), both
 * sides bot-driven, the garrison holding the field.
 * AR-04 (R5, `hostRows`): the Tyrant's host, mustered by a real world for a
 * fit roster of 16, against the GDD's "prepared" army (16 Greek line men,
 * level 7, tier-3 gear all rare), both bot-driven on a campaign field, the
 * host holding it.
 */
import type { BalanceRow } from './balance';
import { armySpec } from '../game/armySpec';
import { bandBeast } from '../game/beasts';
import { Campaign } from '../game/campaign';
import { makeHero, openingParty, setBotLevel, starterParty, type IdSource } from '../game/heroes';
import { MAX_LEVEL, xpToNext, type Hero } from '../data/units';
import { itemDef, itemValue, type Item } from '../data/items';
import { buildArmy } from '../game/enemy';
import { lateXpMult } from '../game/loot';
import { lairHoard } from '../game/sources';
import { Battle } from '../sim/battle';
import { Rng, hashString } from '../sim/rng';
import { heroPower } from '../sim/stats';
import { generateBattlefield, randomSite } from '../world/battlefield';
import { VOLUNTEER_RULES, World, hostSize, partyArmy, type PartyState } from '../world/world';

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
    ...assaultRows(n),
    ...hostRows(n),
  ];
}

// ------------------------------------------------------------------ AR-04: the Tyrant's host (R5)

/** The host world `worldSeed` musters for a fit roster of `roster` (every lair razed first). */
export function musteredHost(worldSeed: number, roster: number): PartyState {
  const w = new World(World.fresh(worldSeed));
  for (const st of w.map.settlements) if (st.kind === 'lair') w.razeLair(st.id);
  return w.musterHost(roster)!;
}

/** The GDD's prepared army (Balance targets): `men` Greek line men at `level`, gear of `tier`, every piece rare. */
export function preparedArmy(seed: number, ids: IdSource, men = 16, level = 7, tier = 3): Hero[] {
  const heroes = buildArmy(new Rng(seed ^ 0x2545f491), ids, { culture: 'greek', count: men, level, tier, targetPower: 0, mix: 'line', tune: false }).heroes;
  for (const h of heroes) {
    setBotLevel(h, level);
    for (const it of Object.values(h.equip)) if (it) it.rarity = 'rare';
  }
  return heroes;
}

/** One battle: the prepared army (bot-driven) against the host of world `worldSeed`, which holds the field. */
export function runHost(worldSeed: number, roster = 16, men = 16, level = 7): OpeningFight {
  const host = musteredHost(worldSeed, roster);
  const ids = { nextId: 1 };
  const seed = hashString(`host:${worldSeed}`) || 1;
  const foe = partyArmy(host, ids);
  const mine = preparedArmy(seed, ids, men, level);
  const terrain = generateBattlefield(seed, randomSite(new Rng(seed ^ 0x51735c1)));
  const b = new Battle({ seed, armies: [armySpec(mine, true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine, holdField: foe.holdField }], terrain });
  b.startBattle();
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) b.step();
  const power = (hs: Hero[]) => hs.reduce((a, h) => a + heroPower(h), 0);
  return { won: b.winner === 0, ratio: power(foe.heroes) / power(mine), bandSize: foe.heroes.length };
}

/** The host rows (R5, Balance targets): `n` fights, one per world. */
export function hostRows(n: number): BalanceRow[] {
  const worlds = Array.from({ length: Math.max(4, n) }, (_, i) => i + 1);
  return [
    rowOf('host (R 16) vs the prepared army (16 men, level 7, rare kit)', worlds.map((s) => runHost(s)), '40-55% (R5)'),
    rowOf('host (R 20) vs 20 prepared men (reference)', worlds.slice(0, Math.max(4, Math.round(n / 2))).map((s) => runHost(s, 20, 20)), 'none (a full roster)'),
    { label: 'host size for a fit roster of 8 / 16 / 20', measured: `${hostSize(8)} / ${hostSize(16)} / ${hostSize(20)}`, target: 'min(32, ceil(1.25 R)) (F2)' },
  ];
}

// ------------------------------------------------------------------ AR-02: lair assaults (R2)

export interface AssaultOpts {
  /** Attacker power over the garrison's (the power plate). */
  mult: number;
  /** The palisade and rampart (an assault field); false = the lair's open ground. Default true. */
  walls?: boolean;
  /** The garrison's GARRISON_STAKES; false = none, a number = that many segments. Default true. */
  stakes?: boolean | number;
  /** Companions make up a third of the attacker (the stakes' head-on check). */
  horse?: boolean;
  /** Campaign day (garrison level and the lair tier). Default: a new world's first morning. */
  day?: number;
}

export interface AssaultFight extends OpeningFight {
  /** stakesBreak events: charges broken on the garrison's stakes. */
  breaks: number;
  /** Stakes segments the garrison laid. */
  stakes: number;
  /** The garrison retreated (it must never). */
  fled: boolean;
  /** Riders among the attackers. */
  riders: number;
}

/**
 * The attacking army: Greek line, as many and as seasoned as the garrison,
 * tuned to `target` power; with `horse` a third are Companions. buildArmy
 * stops anywhere within -6%..+8% of its target, so a second build aims off by
 * the first one's miss, which brings the plate close to the multiple asked.
 */
function assaultArmy(seed: number, men: number, level: number, tier: number, target: number, horse: boolean, ids: IdSource): Hero[] {
  const build = (aim: number) => {
    const rng = new Rng(seed ^ 0x2545f491);
    const riders: Hero[] = [];
    if (horse) for (let i = 0; i < Math.round(men / 3); i++) riders.push(makeHero(rng, ids, 'greek', 'companion', level, tier, 3, riders));
    const rest = aim - riders.reduce((a, h) => a + heroPower(h), 0);
    return [...buildArmy(rng, ids, { culture: 'greek', count: men - riders.length, level, tier, targetPower: rest, mix: 'line' }).heroes, ...riders];
  };
  const first = build(target);
  const got = first.reduce((a, h) => a + heroPower(h), 0);
  return build((target * target) / Math.max(1, got));
}

/** One assault: an army at `o.mult` of lair `lairId`'s garrison power (world `worldSeed`) attacks it, both bot-driven. */
export function runAssault(worldSeed: number, lairId: number, o: AssaultOpts): AssaultFight {
  const c = Campaign.fresh(worldSeed);
  if (o.day !== undefined) c.world.s.time = o.day * 24;
  const foe = c.garrisonEnemy(lairId)!;
  const seed = hashString(`assault:${worldSeed}:${lairId}`) || 1;
  const g = c.world.garrison(lairId)!;
  const mine = assaultArmy(seed, g.size, g.level, g.tier, foe.power * o.mult, !!o.horse, c.data);
  const site = { ...c.assaultSite(lairId), assault: o.walls !== false };
  const b = new Battle({
    seed,
    armies: [armySpec(mine, true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine, holdField: foe.holdField, works: o.stakes === false ? undefined : typeof o.stakes === 'number' ? { stakes: o.stakes, ditch: 0, laager: 0 } : foe.works }],
    terrain: generateBattlefield(seed, site),
  });
  b.startBattle();
  let breaks = 0;
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) {
    b.step();
    for (const e of b.drainEvents()) if (e.type === 'stakesBreak') breaks++;
  }
  const power = (hs: Hero[]) => hs.reduce((a, h) => a + heroPower(h), 0);
  return {
    won: b.winner === 0,
    ratio: power(foe.heroes) / power(mine),
    bandSize: foe.heroes.length,
    breaks,
    stakes: b.works().filter((w) => w.side === 1).length,
    fled: b.result().retreated === 1,
    riders: mine.filter((h) => h.cls === 'companion').length,
  };
}

/** Every lair of `worlds` new worlds: the assault sample. */
export function assaultCases(worlds: number): { world: number; lair: number }[] {
  const out: { world: number; lair: number }[] = [];
  for (let s = 1; s <= worlds; s++) {
    const w = new World(World.fresh(s));
    for (const st of w.map.settlements) if (st.kind === 'lair') out.push({ world: s, lair: st.id });
  }
  return out;
}

function assaultRow(label: string, r: AssaultFight[], target: string): BalanceRow {
  const row = rowOf(label, r, target);
  const n = Math.max(1, r.length);
  const extra = `stakes ${(r.reduce((a, x) => a + x.stakes, 0) / n).toFixed(1)}, breaks ${(r.reduce((a, x) => a + x.breaks, 0) / n).toFixed(1)}, fled ${r.filter((x) => x.fled).length}`;
  return { ...row, label: `${row.label.slice(0, -1)}; ${extra})` };
}

/**
 * The lair assault rows (R2.3, Balance targets): `n` fights a row, every lair
 * of about n/6 worlds. The 1.0x row takes 2n: it sits near the bottom of its
 * band, where one sample of 200 (about ±3.4 pts) can land either side of it.
 */
export function assaultRows(n: number): BalanceRow[] {
  const all = assaultCases(Math.max(1, Math.ceil((2 * n) / 6)));
  const run = (o: AssaultOpts, k = n) => all.slice(0, Math.max(2, k)).map((x) => runAssault(x.world, x.lair, o));
  return [
    assaultRow('lair assault at 1.0x (palisade, rampart, 2 stakes)', run({ mult: 1 }, 2 * n), '38-48% (R2)'),
    assaultRow('lair assault at 1.3x', run({ mult: 1.3 }), '>= 60% (R2)'),
    assaultRow('the same garrison at 1.0x on open ground (reference)', run({ mult: 1, walls: false, stakes: false }), 'none (the walls are worth +5..+12 pts to it)'),
    assaultRow('lair assault at 1.0x without its stakes', run({ mult: 1, stakes: false }), 'none (what GARRISON_STAKES is worth)'),
    assaultRow('lair assault at 1.0x, a third Companions', run({ mult: 1, horse: true }), 'none (stakes 2 paces out vs a head-on charge, FW-01)'),
    assaultRow('the same, without stakes', run({ mult: 1, horse: true, stakes: false }), 'none (reference)'),
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
