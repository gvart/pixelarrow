/**
 * Campaign state: roster, stash, gold, the overland world, and every operation
 * the screens perform on them (equip, hire, buy, heal, level up, encounters).
 */
import { RARITIES, isBound, itemDef, itemValue, normalizeRarity, salvageValue, type Item, type Slot } from '../data/items';
import { encounterOf } from '../data/beasts';
import { ARC_LAIRS, GARRISON } from '../data/arc';
import { BEAST_NAMED, arcSet, arcSetPiece, armyClasses, lairHoard, legendaryHoard, pityChest } from './sources';
import { equipBlocker, equipFromStash, unequipInto } from './gear';
import { MAX_ARMY, RECRUIT_COST, type Hero } from '../data/units';
import { ATTR_MAX, PERKS, perkBlocker, type AttrId, type PerkId } from '../data/perks';
import { Rng } from '../sim/rng';
import { grantXp, makeHero, makeItem, openingParty } from './heroes';
import { dedupeNames } from '../data/names';
import { campaignIdFor, DEFAULT_SETTINGS, SAVE_VERSION, type SaveData } from './save';
import { armyPower, garrisonWorks, type EnemyArmy } from './enemy';
import { siteAt, type BattleSite } from '../world/battlefield';
import { applyBattleBonus, type BattleBonus, type Outcome } from './loot';
import { CAPTAIN_RULES, VOLUNTEER_RULES, World, WORLD_RULES, bountyMultOf, partyArmy, type PartyState, type PlayerInfo } from '../world/world';
import { BASE_ITEMS } from '../data/items';
import { armyPick } from './sources';
import { hashString } from '../sim/rng';
import { EV_KEY, eventById, type Effect, type EventChoice, type EventDef, type EventTarget, type NextBattleBonus, type PlaceRef } from '../data/events';
import { isCaptain } from '../sim/stats';
import { WORK_TYPES, type BattleResult, type Side, type WorkType, type WorksAllowance } from '../sim/types';
import { WORKS } from '../data/terrain';
import { CAMP_RULES, FOOD_RULES, campEffects } from '../world/camp';
import { MUSTER, fieldHeroes } from './muster';

/** Supplies a scrapped item yields (timber, hides, bronze scrap): a share of its worth, at least one. */
export function scrapValue(it: Item): number {
  return Math.max(1, Math.round(itemValue(it) / 6));
}

export const START_GOLD = 60;

/** A captain's bounty (ai-doctrines.md F3): BOUNTY_BASE + BOUNTY_PER_LV x his level. */
export const BOUNTY = { base: 15, perLevel: 5 };
/** The victory bonus src/game/loot.ts resolveBattle pays; a band that retreats does not pay it (R8). */
export const WIN_GOLD = 60;

/** Gold for a captain of `level` killed or captured; `mult` is a band's bountyMult (campaign-events.md, 1..3). */
export function captainBounty(level: number, mult = 1): number {
  return Math.round((BOUNTY.base + BOUNTY.perLevel * level) * mult);
}

/**
 * Field works in the campaign (field-works.md R4). The allowance a battle's
 * ArmySpec.works carries: of each type, as many segments as the supplies
 * would buy on their own, up to WORKS_MAX (WORKS_CAUGHT when a band caught
 * the player). The sim also caps a side at WORKS_MAX segments in all.
 */
export function worksAllowance(supplies: number, caught = false): WorksAllowance {
  const cap = caught ? WORKS.caught : WORKS.max;
  const s = Number.isFinite(supplies) ? Math.max(0, supplies) : 0;
  const out = { stakes: 0, ditch: 0, laager: 0 };
  for (const t of WORK_TYPES) out[t] = Math.min(cap, Math.floor(s / WORKS.cost[t]));
  return out;
}

/** Supplies the given segments cost (R4.1). */
export function worksCost(placed: readonly { type: WorkType }[]): number {
  return placed.reduce((a, w) => a + (WORKS.cost[w.type] ?? 0), 0);
}

/**
 * Whether one more segment of `type` can go down, the segments `placed` so
 * far already counted against the supplies (R4.1, R4.3) and the cap (R4.2).
 * The tray asks this before it issues a `work` order: the sim knows the
 * allowance per type, not the purse.
 */
export function canAffordWork(supplies: number, placed: readonly { type: WorkType }[], type: WorkType, caught = false): boolean {
  if (placed.length >= (caught ? WORKS.caught : WORKS.max)) return false;
  return worksCost(placed) + WORKS.cost[type] <= supplies;
}

/** What became of the band's captain in a battle. */
export type CaptainFate = 'none' | 'alive' | 'killed' | 'captured';

/** What a battle against a band paid and did beyond the plain outcome (ai-doctrines.md R6, R8). */
export interface PartySpoils {
  /** The band quit the field: a victory without the win bonus, and the band gets away weakened. */
  enemyRetreated: boolean;
  captain: CaptainFate;
  /** Gold for the captain (already in the outcome's gold); 0 = none. */
  bounty: number;
}

/** What an assault on a lair did (campaign-arc.md R2.4, R2.5): the band's spoils, whether it fell, and its hoard (already first in the loot). */
export interface LairSpoils extends PartySpoils {
  fallen: boolean;
  hoard: Item[];
}

export class Campaign {
  data: SaveData;
  private rng: Rng;
  private _world: World | null = null;

  constructor(data: SaveData) {
    this.data = data;
    this.rng = new Rng(data.rng);
    // Older saves could hold two heroes with the same name.
    dedupeNames(this.data.heroes);
  }

  static fresh(seed: number): Campaign {
    const ids = { nextId: 1 };
    const rng = new Rng(seed);
    const heroes = openingParty(rng, ids);
    const stash: Item[] = [makeItem(rng, ids, 'pilos', 'common', 70), makeItem(rng, ids, 'owl_amulet', 'common', 100)];
    const data: SaveData = {
      v: SAVE_VERSION,
      gold: START_GOLD,
      heroes,
      stash,
      nextId: ids.nextId,
      rng: rng.state,
      won: 0,
      fought: 0,
      settings: { ...DEFAULT_SETTINGS },
      world: World.fresh((seed ^ 0x7f4a7c15) >>> 0 || 1, true),
    };
    data.world.food = FOOD_RULES.openingFood;
    data.campaignId = campaignIdFor(data.world.seed);
    return new Campaign(data);
  }

  /** The overland world (map regenerated from the seed on first use). */
  get world(): World {
    if (!this._world) {
      this._world = new World(this.data.world);
      this.checkArc();
    }
    return this._world;
  }

  // ------------------------------------------------------------- the arc's end (campaign-arc.md R5)

  /** Heroes who aren't wounded: the fit roster R the host is sized from (F2). */
  fitRoster(): number {
    return this.data.heroes.filter((h) => (h.wound ?? 0) <= 0).length;
  }

  /**
   * Keep the arc moving (R5.1): once ARC_LAIRS lairs have fallen the host
   * musters, sized from the fit roster now. A save whose arc is at 'host'
   * with no host on the map (an older or damaged save) musters it again, so
   * no campaign is stuck short of its end. Runs when the world is first
   * loaded and whenever a lair falls.
   */
  checkArc(): void {
    const w = this.world;
    const stage = w.s.arc.stage;
    if ((stage === 'lairs' && w.lairsFallen >= ARC_LAIRS) || (stage === 'host' && !w.host)) w.musterHost(this.fitRoster());
  }

  /** The victory screen was seen (R5.4): the post-game goes on ('won' becomes 'post'). */
  continueArc(): void {
    this.world.continueArc();
  }

  /**
   * A piece of the campaign's legendary set the army doesn't own yet (R6), as
   * a legendary item, keyed by `key` (where it dropped); null once all five
   * are owned. It is not counted on the pity counter.
   */
  arcPiece(key: string): Item | null {
    const w = this.world;
    const owned = new Set<string>(this.data.stash.map((it) => it.def));
    for (const h of this.data.heroes) for (const it of Object.values(h.equip)) if (it) owned.add(it.def);
    const set = arcSet(w.s.seed);
    const def = arcSetPiece(set, owned, `${w.s.seed >>> 0}:${key}`);
    if (!def) return null;
    const rng = new Rng(hashString(`${w.s.seed >>> 0}:${key}:arcitem`) || 1);
    return makeItem(rng, this.data, def, 'legendary', 100, set === 'achilles' ? 'greek' : 'phoenician');
  }

  /** Rng for campaign-level randomness; state is written back into the save. */
  random(): Rng {
    return this.rng;
  }

  sync(): SaveData {
    this.data.rng = this.rng.state;
    if (this._world) this.data.world = this._world.sync();
    return this.data;
  }

  hero(id: string): Hero | undefined {
    return this.data.heroes.find((h) => h.id === id);
  }

  /**
   * Heroes who march into battle: the formation chosen in camp (fit men not
   * in the reserve, up to the caps of src/game/muster.ts). If nobody is fit,
   * everyone fights.
   */
  fitHeroes(): Hero[] {
    const field = fieldHeroes(this.data.heroes);
    if (field.length > 0) return field;
    const fit = this.data.heroes.filter((h) => (h.wound ?? 0) <= 0);
    return fit.length > 0 ? fit.slice(0, MUSTER.fieldCap) : this.data.heroes;
  }

  /** Keep a hero in camp (out of the formation) or send him back to it. */
  setReserve(heroId: string, reserve: boolean): boolean {
    const h = this.hero(heroId);
    if (!h) return false;
    if (reserve) h.reserve = true;
    else delete h.reserve;
    return true;
  }

  /** Reserve men and the wounded: those who stay in camp while the formation marches. */
  reserves(): Hero[] {
    const field = new Set(this.fitHeroes().map((h) => h.id));
    return this.data.heroes.filter((h) => !field.has(h.id));
  }

  /** Break a stash item up for camp supplies (no market in the field). Returns the supplies gained or -1. */
  scrap(itemUid: string): number {
    const idx = this.data.stash.findIndex((i) => i.uid === itemUid);
    if (idx < 0) return -1;
    const [it] = this.data.stash.splice(idx, 1);
    const got = scrapValue(it);
    this.world.addSupplies(got);
    return got;
  }

  wounded(): Hero[] {
    return this.data.heroes.filter((h) => (h.wound ?? 0) > 0);
  }

  playerInfo(): PlayerInfo {
    const fit = this.fitHeroes();
    return { power: armyPower(fit), size: fit.length, mouths: this.data.heroes.length, gold: this.data.gold };
  }

  // ------------------------------------------------------------- time & healing

  /** Heal wounds for `hours` at `rate` wound-hours per hour. */
  heal(hours: number, rate: number): void {
    for (const h of this.data.heroes) if (h.wound > 0) h.wound = Math.max(0, h.wound - hours * rate);
  }

  /**
   * After `hours` passed on the map (marching, or resting in camp): wounds heal
   * at the world's current rate, and a camp's forge and drill yard do their work.
   */
  tickWorld(hours: number): void {
    const w = this.world;
    this.heal(hours, w.healRate());
    const c = w.camp;
    if (!c || hours <= 0) return;
    const fx = campEffects(w.map, c);
    if (fx.forge && w.supplies > 0) {
      let work = false;
      for (const h of this.data.heroes) {
        for (const it of Object.values(h.equip)) {
          if (!it || it.cond >= 100) continue;
          it.cond = Math.min(100, it.cond + CAMP_RULES.repairPerHour * hours);
          work = true;
        }
      }
      if (work) w.addSupplies(-CAMP_RULES.repairSupplies * hours);
    }
    if (fx.drill && !w.starving) {
      for (const h of this.data.heroes) {
        if ((h.wound ?? 0) > 0 || h.level >= CAMP_RULES.drillMaxLevel) continue;
        // fractional XP accumulates on the hero (grantXp rounds), so keep the remainder here
        const acc = (this.drill.get(h.id) ?? 0) + CAMP_RULES.drillXp * hours;
        const whole = Math.floor(acc);
        this.drill.set(h.id, acc - whole);
        if (whole > 0) grantXp(h, whole, this.rng);
      }
    }
  }

  private drill = new Map<string, number>();

  /** Forge: supplies and gold to temper an item one rarity step finer (up to rare). */
  temperCost(item: Item): { supplies: number; gold: number } | null {
    const r = RARITIES.indexOf(normalizeRarity(item.rarity));
    if (r < 0 || r >= 2) return null;
    return { supplies: 6 + r * 6, gold: Math.ceil(itemDef(item.def).value * (0.4 + r * 0.4)) };
  }

  /** Temper an item at the camp forge. */
  temper(item: Item): boolean {
    const w = this.world;
    const cost = this.temperCost(item);
    if (!cost || !w.camp || !campEffects(w.map, w.camp).forge) return false;
    if (w.supplies < cost.supplies || this.data.gold < cost.gold) return false;
    w.addSupplies(-cost.supplies);
    this.data.gold -= cost.gold;
    item.rarity = RARITIES[RARITIES.indexOf(normalizeRarity(item.rarity)) + 1];
    item.cond = 100;
    return true;
  }

  /** Buy 10 rations or 10 supplies in a village or town. */
  provisionPrice(kind: 'food' | 'supplies', settlement: number): number {
    const def = this.world.settlement(settlement);
    const town = def?.kind === 'town';
    return kind === 'food' ? FOOD_RULES.foodPrice[town ? 'town' : 'village'] : FOOD_RULES.supplyPrice[town ? 'town' : 'village'];
  }

  buyProvisions(kind: 'food' | 'supplies', settlement: number): boolean {
    const w = this.world;
    const price = this.provisionPrice(kind, settlement);
    const room = kind === 'food' ? FOOD_RULES.cap - w.food : FOOD_RULES.supplyCap - w.supplies;
    if (this.data.gold < price || room < 10) return false;
    this.data.gold -= price;
    if (kind === 'food') w.addFood(10);
    else w.addSupplies(10);
    return true;
  }

  /** Let time pass inside a settlement (resting); bands move meanwhile. */
  rest(hours: number): void {
    const w = this.world;
    const def = w.settlement(w.s.inside);
    const rate = def?.kind === 'town' ? WORLD_RULES.healTown : def?.kind === 'village' ? WORLD_RULES.healVillage : WORLD_RULES.healCamp;
    w.advance(hours, this.playerInfo(), true);
    this.heal(hours, rate);
  }

  healCost(): number {
    return Math.ceil(this.wounded().reduce((a, h) => a + h.wound, 0) * WORLD_RULES.healGoldPerHour);
  }

  /** Pay a town physician to treat every wounded hero at once. */
  healAll(): boolean {
    const c = this.healCost();
    if (c <= 0 || this.data.gold < c) return false;
    this.data.gold -= c;
    for (const h of this.data.heroes) h.wound = 0;
    return true;
  }

  // ------------------------------------------------------------- recruiting

  canRecruit(): boolean {
    return this.data.heroes.length < MAX_ARMY && this.data.gold >= RECRUIT_COST;
  }

  /** A raw volunteer for RECRUIT_COST (settlement pools use `hire`). */
  recruit(): Hero | null {
    if (!this.canRecruit()) return null;
    this.data.gold -= RECRUIT_COST;
    const culture = this.rng.pick(['greek', 'greek', 'phoenician', 'celtic'] as const);
    const h = makeHero(this.rng, this.data, culture, 'raw', 1, 1, 0, this.data.heroes);
    this.data.heroes.push(h);
    this.sync();
    return h;
  }

  /** Hire volunteer `index` from a settlement's pool. */
  hire(settlement: number, index: number): Hero | null {
    if (this.data.heroes.length >= MAX_ARMY) return null;
    const offer = this.world.recruits(settlement, this.data.heroes).find((r) => r.index === index);
    if (!offer || this.data.gold < offer.price) return null;
    const got = this.world.hire(settlement, index, this.data, this.data.heroes);
    if (!got) return null;
    this.data.gold -= got.price;
    this.data.heroes.push(got.hero);
    return got.hero;
  }

  buy(settlement: number, index: number): Item | null {
    const classes = this.armyClasses();
    const ware = this.world.wares(settlement, classes).find((w) => w.index === index);
    if (!ware || this.data.gold < ware.price) return null;
    const got = this.world.buy(settlement, index, this.data, classes);
    if (!got) return null;
    this.data.gold -= got.price;
    this.data.stash.push(got.item);
    return got.item;
  }

  // ------------------------------------------------------------- army management

  dismiss(heroId: string): void {
    const h = this.hero(heroId);
    if (!h || this.data.heroes.length <= 1) return;
    for (const it of Object.values(h.equip)) if (it) this.data.stash.push(it);
    this.data.heroes = this.data.heroes.filter((x) => x.id !== heroId);
  }

  /** Equip a stash item; whatever it displaces goes back to the stash. */
  equip(heroId: string, itemUid: string): boolean {
    const h = this.hero(heroId);
    const idx = this.data.stash.findIndex((i) => i.uid === itemUid);
    if (!h || idx < 0 || equipBlocker(h, this.data.stash[idx])) return false;
    equipFromStash(h.equip, this.data.stash, idx);
    return true;
  }

  unequip(heroId: string, slot: Slot): boolean {
    const h = this.hero(heroId);
    return !!h && !!unequipInto(h.equip, slot, this.data.stash);
  }

  /** Repair an item to 100 condition for gold. Returns cost or -1. */
  repairCost(item: Item): number {
    return Math.ceil(((100 - item.cond) / 100) * itemDef(item.def).value * 0.5);
  }

  repair(item: Item): boolean {
    const c = this.repairCost(item);
    if (c <= 0 || this.data.gold < c) return false;
    this.data.gold -= c;
    item.cond = 100;
    return true;
  }

  /** Sell a stash item (town markets pay its value; a bound item is only salvaged, for a quarter of it). */
  sell(itemUid: string, value?: number): void {
    const idx = this.data.stash.findIndex((i) => i.uid === itemUid);
    if (idx < 0) return;
    const [it] = this.data.stash.splice(idx, 1);
    this.data.gold += value ?? (isBound(it) ? salvageValue(it) : itemValue(it));
  }

  // ------------------------------------------------------------- progression

  spendPoint(heroId: string, attr: AttrId): boolean {
    const h = this.hero(heroId);
    if (!h || h.points <= 0 || h.attrs[attr] >= ATTR_MAX) return false;
    h.attrs[attr]++;
    h.points--;
    return true;
  }

  takePerk(heroId: string, perk: PerkId): boolean {
    const h = this.hero(heroId);
    if (!h || !(perk in PERKS) || perkBlocker(h, perk) !== null) return false;
    h.perks.push(perk);
    return true;
  }

  // ------------------------------------------------------------- encounters

  /** Chance to slip away from a band: easier from big, slow bands and with a small, quick party. */
  fleeChance(partyId: number): number {
    const p = this.world.party(partyId);
    if (!p) return 1;
    const mine = this.fitHeroes().length;
    const c = 0.5 + (p.size - mine) * 0.035 + (p.kind === 'raiders' ? -0.1 : 0);
    return Math.max(0.15, Math.min(0.9, c));
  }

  /** Try to escape. On success the band loses track of the party for a while. */
  tryFlee(partyId: number): boolean {
    const p = this.world.party(partyId);
    if (!p) return true;
    const ok = this.rng.chance(this.fleeChance(partyId));
    if (ok) {
      p.idle = 1.5;
      this.world.s.safeUntil = this.world.s.time + 2;
    }
    return ok;
  }

  canSurrender(partyId: number): boolean {
    const p = this.world.party(partyId);
    // the host never lays down its arms: the arc is won only in battle (R4)
    return !!p && p.kind !== 'host' && p.power / Math.max(1, this.playerInfo().power) < WORLD_RULES.surrenderRatio;
  }

  /** A hopelessly outmatched band lays down its arms: ransom and a little XP, no battle. */
  acceptSurrender(partyId: number): number {
    const p = this.world.party(partyId);
    if (!p || !this.canSurrender(partyId)) return 0;
    const gold = 6 * p.size + 4 * p.level;
    this.data.gold += gold;
    this.world.removeParty(partyId);
    this.world.s.safeUntil = this.world.s.time + 0.5;
    return gold;
  }

  /** The enemy army for a battle against a world band. */
  partyEnemy(partyId: number): EnemyArmy | null {
    const p = this.world.party(partyId);
    return p ? partyArmy(p, this.data, this.armyClasses()) : null;
  }

  /** The classes of the army, which loot and town wares follow (src/game/sources.ts armyPick). */
  armyClasses(): string[] {
    return armyClasses(this.data.heroes);
  }

  /**
   * Bad-luck protection for a won beast battle (docs/ITEMS.md "Where items
   * come from"): its hoard is a chest; one without a legendary counts up
   * `data.pity`, and when the counter is due the best piece turns legendary.
   * Mutates the outcome's loot.
   */
  beastPity(outcome: Outcome, enemies: Hero[]): void {
    const enc = encounterOf(enemies);
    if (!enc || !outcome.victory || !outcome.loot.length) return;
    const r = pityChest(outcome.loot, this.data.pity ?? 0, (it) => legendaryHoard(it, BEAST_NAMED[enc], `${this.data.seq ?? 0}:${it.uid}`));
    outcome.loot = r.items;
    this.data.pity = r.count;
  }

  /**
   * The hoard of the fallen lair `lairId` (campaign-arc.md R6, src/game/sources.ts
   * lairHoard): seeded by the world and the lair, following the army. The chest
   * counts on the campaign's bad-luck counter `data.pity` like a beast's, so a
   * due counter turns its best piece legendary. The caller (the assault's
   * victory) puts the items where the player takes them.
   */
  lairHoard(lairId: number): Item[] {
    const lair = this.world.map.settlements[lairId];
    const seed = `${this.world.s.seed >>> 0}:${lairId}`;
    const r = pityChest(lairHoard(seed, lair.culture, this.data, this.armyClasses()), this.data.pity ?? 0, (it) => legendaryHoard(it, [], `${seed}:${it.uid}`));
    this.data.pity = r.count;
    return r.items;
  }

  // ------------------------------------------------------------- lair assaults (campaign-arc.md R2)

  /**
   * The army defending lair `lairId` against an assault (R2.1, R4): its
   * garrison (World.garrison) with its captain and doctrine, the lair's free
   * stakes (garrisonWorks, GARRISON_STAKES, keyed to the lair whatever the
   * doctrine) and holdField, since a garrison never retreats. Its gear
   * follows the army's classes like a band's. Null when the lair has fallen,
   * isn't a lair, or has no men left (then razeLair, without a battle).
   */
  garrisonEnemy(lairId: number): EnemyArmy | null {
    const p = this.world.garrison(lairId);
    if (!p) return null;
    const army = partyArmy(p, this.data, this.armyClasses());
    // the garrison's plate (EC-05): its men's power x GARRISON.plate, as world.garrison shows it
    return { ...army, power: army.power * GARRISON.plate, works: garrisonWorks(), holdField: true };
  }

  /** Where an assault on lair `lairId` is fought (R2.3): the lair's own ground, behind its palisade. */
  assaultSite(lairId: number): BattleSite {
    const st = this.world.map.settlements[lairId];
    return { ...siteAt(this.world.map, st.x, st.y), assault: true };
  }

  /**
   * Lair `lairId` falls (R2.4): it sends out no more bands, and its hoard
   * (lairHoard, on the pity counter) is returned for the player to take. A
   * standing lair only; otherwise nothing happens and nothing drops.
   */
  razeLair(lairId: number): Item[] {
    const w = this.world;
    if (w.map.settlements[lairId]?.kind !== 'lair' || w.lairFallen(lairId)) return [];
    w.razeLair(lairId);
    // a reborn lair of the post-game (R6): only a missing piece of the legendary set, no hoard, no pity
    if (w.isReborn(lairId)) {
      const piece = this.arcPiece(`reborn:${lairId}:${Math.floor(w.s.time)}`);
      return piece ? [piece] : [];
    }
    const hoard = this.lairHoard(lairId);
    this.checkArc();
    return hoard;
  }

  /**
   * After an assault on lair `lairId` (R2.4, R2.5), with the sim's `result`
   * and the garrison's heroes. The captain, his bounty and weapon, a pending
   * event bonus and the aftermath settle as for a band (afterPartyBattle).
   * Then a victory razes the lair and puts its hoard first in the loot, every
   * piece an extra pick; a defeat or a retreat leaves it standing, its dead
   * lost until they regrow. Mutates the outcome's gold and loot.
   */
  afterLairAssault(lairId: number, outcome: Outcome, result?: BattleResult, enemies: readonly Hero[] = []): LairSpoils {
    const spoils = this.afterPartyBattle(-1, outcome, result, enemies);
    if (!outcome.victory) {
      const dead = result ? result.units.filter((u) => u.side === 1 && u.state === 'dead').length : outcome.enemyKilled;
      this.world.loseGarrison(lairId, dead);
      return { ...spoils, fallen: false, hoard: [] };
    }
    const hoard = this.razeLair(lairId);
    outcome.loot.unshift(...hoard);
    outcome.picks = Math.min(outcome.picks + hoard.length, outcome.loot.length);
    return { ...spoils, fallen: true, hoard };
  }

  /**
   * After a battle against a band: a victory destroys it; otherwise it keeps
   * what is left and both sides break off for a few hours. `result` and
   * `enemies` (the sim's result and the band's heroes) settle its captain and
   * a retreat (ai-doctrines.md R6, R8):
   * - a captain killed, or knocked out on a field the player holds, is gone
   *   for good (`captainDead`); on a win he pays his bounty and his weapon is
   *   an extra loot pick, offered first. So the bounty is paid once.
   * - a band that retreats is beaten but not destroyed: no win bonus, it
   *   loses its fallen and gets away (`escaped`), its captain with it if he lives.
   * Mutates the outcome's gold and loot (the gold is already in the purse).
   * A `partyId` with no band on the map (a lair's garrison, afterLairAssault)
   * settles all of this but the band itself.
   */
  afterPartyBattle(partyId: number, outcome: Outcome, result?: BattleResult, enemies: readonly Hero[] = []): PartySpoils {
    const w = this.world;
    const p: PartyState | undefined = w.party(partyId);
    const host = p?.kind === 'host';
    // the host holds the field (R4); should it break all the same, the field is won outright
    const enemyRetreated = outcome.victory && result?.retreated === 1 && !host;
    const captain = enemies.find((h) => isCaptain(h));
    const unit = captain && result?.units.find((u) => u.side === 1 && u.heroId === captain.id);
    const fate: CaptainFate = !captain ? 'none' : unit?.state !== 'dead' ? 'alive' : !unit.ko ? 'killed' : outcome.victory ? 'captured' : 'alive';
    let bounty = 0;
    if (enemyRetreated) {
      // the win bonus goes, kill gold stays (scaled by the gilded-gear bonus like the rest)
      const base = 20 + outcome.enemyKilled * 12;
      const cut = outcome.gold - Math.round((outcome.gold * base) / (base + WIN_GOLD));
      outcome.gold -= cut;
      this.data.gold -= cut;
    }
    // an event's nextBattle bonus (campaign-events.md R2): on the battle's gold, before the bounty
    const bonus = this.takeBattleBonus();
    if (bonus) this.data.gold += applyBattleBonus(outcome, this.data.heroes, bonus, this.rng);
    if (captain && outcome.victory && (fate === 'killed' || fate === 'captured')) {
      bounty = captainBounty(captain.level, p ? bountyMultOf(p) : 1);
      outcome.gold += bounty;
      this.data.gold += bounty;
      const weapon = captain.equip.weapon;
      if (weapon) {
        const at = outcome.loot.findIndex((it) => it.uid === weapon.uid);
        const item = at >= 0 ? outcome.loot.splice(at, 1)[0] : (JSON.parse(JSON.stringify(weapon)) as typeof weapon);
        outcome.loot.unshift(item);
        outcome.picks = Math.min(outcome.picks + 1, outcome.loot.length);
      }
    }
    if (p) {
      if (fate === 'killed' || fate === 'captured') p.captainDead = true;
      if (host && outcome.victory) this.winArc(outcome);
      // a host that beat the army keeps marching, weakened by its dead (R5.5); it is beaten only in battle
      else if (host) w.weakenParty(partyId, Math.min(outcome.enemyKilled, p.size - 1), 3);
      else if (outcome.victory && !enemyRetreated) w.removeParty(partyId);
      else if (enemyRetreated) {
        const fallen = result!.units.filter((u) => u.side === 1 && u.state === 'dead').length;
        w.weakenParty(partyId, fallen, CAPTAIN_RULES.escapeIdleH);
        const left = w.party(partyId);
        if (left) left.escaped = Math.min(CAPTAIN_RULES.escapeCap, (left.escaped ?? 0) + 1);
      } else w.weakenParty(partyId, outcome.enemyKilled, 3);
    }
    w.s.safeUntil = w.s.time + (outcome.victory ? 0.5 : 3);
    // A destroyed army: five volunteers find the commander at the starting town (R1.4): three spearmen in I, two skirmishers in II.
    if (this.data.heroes.length === 0) {
      for (let i = 0; i < VOLUNTEER_RULES.destroyed; i++) this.data.heroes.push(makeHero(this.rng, this.data, 'greek', 'raw', 1, 1, i < 3 ? 0 : 1, this.data.heroes));
      const st = w.settlement(w.map.start)!;
      w.stop();
      w.s.x = st.x + 0.5;
      w.s.y = st.y + 0.5;
      w.s.safeUntil = w.s.time + 4;
    }
    // the after-battle trigger (campaign-events.md R3): a won campaign battle
    if (outcome.victory) w.tryEvent('after_battle', `b${this.data.fought}:${partyId}`, this.playerInfo());
    return { enemyRetreated, captain: fate, bounty };
  }

  /**
   * The host has fallen (R5.4): the arc is 'won', and one piece of the
   * campaign's legendary set (arcPiece) goes first in the loot as an extra
   * pick, ahead of the Tyrant's weapon. Mutates the outcome's loot.
   */
  private winArc(outcome: Outcome): void {
    this.world.winArc();
    const piece = this.arcPiece('host');
    if (!piece) return;
    outcome.loot.unshift(piece);
    outcome.picks = Math.min(outcome.picks + 1, outcome.loot.length);
  }

  // ------------------------------------------------------------- field works (field-works.md R4)

  /**
   * R4.2 "time to dig": a band caught the player when it chased him down on
   * the march. When he attacked (`byPlayer`), or sat in a camp, he had time.
   */
  wasCaught(partyId: number, byPlayer: boolean): boolean {
    if (byPlayer || this.world.camp) return false;
    return this.world.party(partyId)?.mode === 'chase';
  }

  /** The player's works allowance for the next battle, from the supplies on hand (R4.1, R4.2). */
  worksAllowance(caught = false): WorksAllowance {
    return worksAllowance(this.world.supplies, caught);
  }

  /** Supplies left once the segments placed so far are paid for: the tray's header. An undone segment is simply no longer counted (R4.3). */
  worksLeft(placed: readonly { side: Side; type: WorkType }[]): number {
    return Math.max(0, this.world.supplies - worksCost(placed.filter((w) => w.side === 0)));
  }

  /**
   * Pay for the player's works when the battle starts (R4.3): only the
   * segments actually on the field (Battle.works(), side 0), so an undone one
   * costs nothing. Never takes more than the supplies hold. Returns the
   * supplies spent; the caller saves.
   */
  payWorks(placed: readonly { side: Side; type: WorkType }[]): number {
    const w = this.world;
    const cost = Math.min(w.supplies, worksCost(placed.filter((x) => x.side === 0)));
    if (cost > 0) w.addSupplies(-cost);
    return cost;
  }

  // ------------------------------------------------------------- events (campaign-events.md R2, R4)

  /**
   * The event waiting for the player's choice, with each choice's blocker
   * (R4.4), or null. An id the deck no longer has (content changed in an
   * update) is dropped, so the map never stays paused on it.
   */
  pendingEvent(): { def: EventDef; seed: number; choices: { key: string; blocked: ChoiceBlock | null }[] } | null {
    const w = this.world;
    const pe = w.s.pendingEvent;
    if (!pe) return null;
    const def = eventById(w.deck, pe.id);
    if (!def) {
      w.clearPendingEvent();
      return null;
    }
    return { def, seed: pe.seed, choices: def.choices.map((c) => ({ key: c.key, blocked: this.choiceBlocker(c) })) };
  }

  /** Why a choice can't be taken (R4.4): a cost the purse or the stores can't pay, or no room for recruits. */
  choiceBlocker(c: EventChoice): ChoiceBlock | null {
    const w = this.world;
    for (const e of c.cost ?? []) {
      if (e.k === 'gold' && e.n < 0 && this.data.gold < -e.n) return { why: 'gold', need: -e.n, have: this.data.gold };
      if (e.k === 'food' && e.n < 0 && w.food < -e.n) return { why: 'food', need: -e.n, have: Math.floor(w.food) };
      if (e.k === 'supplies' && e.n < 0 && w.supplies < -e.n) return { why: 'supplies', need: -e.n, have: Math.floor(w.supplies) };
    }
    const recruits = [...(c.cost ?? []), ...c.effects].some((e) => e.k === 'recruit');
    if (recruits && this.data.heroes.length >= MAX_ARMY) return { why: 'room', need: MAX_ARMY, have: this.data.heroes.length };
    return null;
  }

  /**
   * Resolve the pending event with choice `key` (R4.3): the cost is paid, the
   * chance rolled from the event's seed, the effects (or the failure) applied,
   * the event cleared and the journal written. Everything random comes from the
   * seed and the choice, so a reload with the event open gives the same
   * outcome. Returns null if there is no such event or choice, or it's blocked.
   * The caller saves.
   */
  chooseEvent(key: string): EventResolution | null {
    const pe = this.pendingEvent();
    const choice = pe?.def.choices.find((c) => c.key === key);
    if (!pe || !choice || this.choiceBlocker(choice)) return null;
    const rng = new Rng(hashString(`${pe.seed}:${key}`));
    const notes: string[] = [];
    for (const e of choice.cost ?? []) this.applyEffect(e, rng, notes);
    const ok = !choice.chance || rng.chance(choice.chance.p);
    for (const e of ok ? choice.effects : choice.chance!.fail) this.applyEffect(e, rng, notes);
    const w = this.world;
    w.clearPendingEvent();
    w.logJournal(ok ? `${pe.def.id}:${key}` : `${pe.def.id}:${key}:fail`);
    return { id: pe.def.id, key, ok, notes };
  }

  /** One effect of the closed vocabulary (R2). A refusal (no room, nothing to target) goes into `notes`. */
  private applyEffect(e: Effect, rng: Rng, notes: string[]): void {
    const w = this.world;
    const d = this.data;
    switch (e.k) {
      case 'gold':
        d.gold = Math.max(0, d.gold + e.n);
        return;
      case 'food':
        w.addFood(e.n);
        return;
      case 'supplies':
        w.addSupplies(e.n);
        return;
      case 'recruit': {
        const n = Math.min(e.n, MAX_ARMY - d.heroes.length);
        if (n < e.n) notes.push('room');
        const culture = this.nearestPlace().culture;
        for (let i = 0; i < n; i++) d.heroes.push(makeHero(rng, d, culture, e.cls, e.level, 1, undefined, d.heroes));
        return;
      }
      case 'xp':
        for (const h of this.targets(e.target, rng, false)) grantXp(h, e.n, rng);
        return;
      case 'wound': {
        const hit = this.targets(e.target, rng, true);
        if (hit.length === 0) notes.push('no_target');
        for (const h of hit) h.wound = Math.max(h.wound ?? 0, e.hours);
        return;
      }
      case 'heal':
        for (const h of d.heroes) h.wound = 0;
        return;
      case 'item': {
        const pool = BASE_ITEMS.filter((x) => x.tier <= 2 && (!e.slot || x.slot === e.slot));
        if (pool.length === 0) return;
        const def = armyPick(rng, pool, this.armyClasses());
        d.stash.push(makeItem(rng, d, def.id, e.rarity, 100, this.nearestPlace().culture));
        return;
      }
      case 'spawnBand':
        if (!w.spawnEventBand(e.kind, e.mods, rng)) notes.push('no_spawn');
        return;
      case 'weakenGarrison': {
        const id = e.lair === 'nearest' ? w.nearestLair({ standing: true })?.id : e.lair;
        if (id !== undefined) w.weakenGarrison(id, e.n);
        return;
      }
      case 'reveal':
        if (typeof e.at === 'object') w.reveal(w.s.x, w.s.y, e.at.radius);
        else {
          const id = e.at === 'nearest' ? w.nearestLair({ unknown: true })?.id : e.at;
          if (id !== undefined) w.revealSettlement(id);
        }
        return;
      case 'retrain':
        w.setFlag(EV_KEY.retrain, this.freeRetrains() + 1);
        return;
      case 'priceMod':
        w.setPriceMod(this.placeOf(e.place), e.pct, e.days);
        return;
      case 'closeSettlement':
        w.closeSettlement(this.placeOf(e.place), e.days);
        return;
      case 'nextBattle':
        w.setFlag(EV_KEY.next(e.bonus), 1);
        return;
      case 'setFlag':
        if (!w.setFlag(e.name, e.value)) notes.push('flags_full');
        return;
      case 'clearFlag':
        w.clearFlag(e.name);
        return;
    }
  }

  /** The heroes an effect lands on: everyone, one at random, or the lowest level. `fitOnly` skips the wounded (a wound falls on a fit man). */
  private targets(t: EventTarget, rng: Rng, fitOnly: boolean): Hero[] {
    const pool = fitOnly ? this.data.heroes.filter((h) => (h.wound ?? 0) <= 0) : this.data.heroes;
    if (pool.length === 0) return [];
    if (t === 'all') return pool;
    if (t === 'one_random') return [rng.pick(pool)];
    return [pool.reduce((a, h) => (h.level < a.level ? h : a), pool[0])];
  }

  /** The settlement the party is in, else the nearest one. */
  private nearestPlace() {
    const w = this.world;
    const inside = w.settlement(w.s.inside);
    if (inside) return inside;
    const all = w.map.settlements;
    const dist = (s: (typeof all)[number]) => Math.hypot(s.x + 0.5 - w.s.x, s.y + 0.5 - w.s.y);
    return all.reduce((b, s) => (dist(s) < dist(b) ? s : b), all[0]);
  }

  private placeOf(p: PlaceRef): number {
    return p === 'here' ? this.nearestPlace().id : p;
  }

  /** Free perk retrains events have granted (abilities.md R7); the drillmaster spends them with useFreeRetrain. */
  freeRetrains(): number {
    return this.world.s.flags[EV_KEY.retrain] ?? 0;
  }

  useFreeRetrain(): boolean {
    const n = this.freeRetrains();
    if (n <= 0) return false;
    if (n === 1) this.world.clearFlag(EV_KEY.retrain);
    else this.world.setFlag(EV_KEY.retrain, n - 1);
    return true;
  }

  /** The nextBattle bonuses waiting (R2), cleared as the battle takes them; null when none. */
  private takeBattleBonus(): BattleBonus | null {
    const w = this.world;
    const bonus: BattleBonus = {};
    let any = false;
    for (const b of ['pick', 'xp', 'gold'] as NextBattleBonus[]) {
      if (!w.hasFlag(EV_KEY.next(b))) continue;
      bonus[b] = true;
      any = true;
      w.clearFlag(EV_KEY.next(b));
    }
    return any ? bonus : null;
  }
}

/** Why an event choice is disabled (R4.4): the UI shows the reason, e.g. "No room (20/20)". */
export interface ChoiceBlock {
  why: 'gold' | 'food' | 'supplies' | 'room';
  need: number;
  have: number;
}

/** What resolving an event did: `ok` false when its chance failed; `notes` are refusals (`room`, `no_target`, `no_spawn`, `flags_full`). */
export interface EventResolution {
  id: string;
  key: string;
  ok: boolean;
  notes: string[];
}
