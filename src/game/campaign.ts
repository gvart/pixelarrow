/**
 * Campaign state: roster, stash, gold, the overland world, and every operation
 * the screens perform on them (equip, hire, buy, heal, level up, encounters).
 */
import { RARITIES, itemDef, itemValue, normalizeRarity, type Item, type Slot } from '../data/items';
import { equipBlocker, equipFromStash, unequipInto } from './gear';
import { MAX_ARMY, RECRUIT_COST, type Hero } from '../data/units';
import { ATTR_MAX, PERKS, perkBlocker, type AttrId, type PerkId } from '../data/perks';
import { Rng } from '../sim/rng';
import { grantXp, makeHero, makeItem, starterParty } from './heroes';
import { dedupeNames } from '../data/names';
import { DEFAULT_SETTINGS, SAVE_VERSION, type SaveData } from './save';
import { armyPower, type EnemyArmy } from './enemy';
import type { Outcome } from './loot';
import { World, WORLD_RULES, partyArmy, type PartyState, type PlayerInfo } from '../world/world';
import { CAMP_RULES, FOOD_RULES, campEffects } from '../world/camp';
import { MUSTER, fieldHeroes } from './muster';

/** Supplies a scrapped item yields (timber, hides, bronze scrap): a share of its worth, at least one. */
export function scrapValue(it: Item): number {
  return Math.max(1, Math.round(itemValue(it) / 6));
}

export const START_GOLD = 60;

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
    const heroes = starterParty(rng, ids);
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
      world: World.fresh((seed ^ 0x7f4a7c15) >>> 0 || 1),
    };
    return new Campaign(data);
  }

  /** The overland world (map regenerated from the seed on first use). */
  get world(): World {
    if (!this._world) this._world = new World(this.data.world);
    return this._world;
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
    return { power: armyPower(fit), size: fit.length, mouths: this.data.heroes.length };
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
    const ware = this.world.wares(settlement).find((w) => w.index === index);
    if (!ware || this.data.gold < ware.price) return null;
    const got = this.world.buy(settlement, index, this.data);
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

  /** Sell a stash item (town markets pay its value). */
  sell(itemUid: string, value?: number): void {
    const idx = this.data.stash.findIndex((i) => i.uid === itemUid);
    if (idx < 0) return;
    const [it] = this.data.stash.splice(idx, 1);
    this.data.gold += value ?? itemValue(it);
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
    return !!p && p.power / Math.max(1, this.playerInfo().power) < WORLD_RULES.surrenderRatio;
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
    return p ? partyArmy(p, this.data) : null;
  }

  /**
   * After a battle against a band: a victory destroys it; otherwise it keeps
   * what is left and both sides break off for a few hours.
   */
  afterPartyBattle(partyId: number, outcome: Outcome): void {
    const w = this.world;
    const p: PartyState | undefined = w.party(partyId);
    if (p) {
      if (outcome.victory) w.removeParty(partyId);
      else w.weakenParty(partyId, outcome.enemyKilled, 3);
    }
    w.s.safeUntil = w.s.time + (outcome.victory ? 0.5 : 3);
    // A destroyed army: three volunteers find the commander at the starting town.
    if (this.data.heroes.length === 0) {
      for (let i = 0; i < 3; i++) this.data.heroes.push(makeHero(this.rng, this.data, 'greek', 'raw', 1, 1, i < 2 ? 0 : 1, this.data.heroes));
      const st = w.settlement(w.map.start)!;
      w.stop();
      w.s.x = st.x + 0.5;
      w.s.y = st.y + 0.5;
      w.s.safeUntil = w.s.time + 4;
    }
  }
}
