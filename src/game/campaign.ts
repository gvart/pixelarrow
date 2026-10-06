/**
 * Campaign state: roster, stash, gold, the overland world, and every operation
 * the screens perform on them (equip, hire, buy, heal, level up, encounters).
 */
import { itemDef, itemValue, type Item, type Slot } from '../data/items';
import { MAX_ARMY, RECRUIT_COST, type Hero } from '../data/units';
import { ATTR_MAX, PERKS, perkBlocker, type AttrId, type PerkId } from '../data/perks';
import { Rng } from '../sim/rng';
import { makeHero, makeItem, starterParty } from './heroes';
import { dedupeNames } from '../data/names';
import { DEFAULT_SETTINGS, SAVE_VERSION, type SaveData } from './save';
import { armyPower, type EnemyArmy } from './enemy';
import type { Outcome } from './loot';
import { World, WORLD_RULES, partyArmy, type PartyState, type PlayerInfo } from '../world/world';

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

  /** Heroes fit to fight (wounded men sit out); if everyone is wounded, all of them. */
  fitHeroes(): Hero[] {
    const fit = this.data.heroes.filter((h) => (h.wound ?? 0) <= 0);
    return fit.length > 0 ? fit : this.data.heroes;
  }

  wounded(): Hero[] {
    return this.data.heroes.filter((h) => (h.wound ?? 0) > 0);
  }

  playerInfo(): PlayerInfo {
    const fit = this.fitHeroes();
    return { power: armyPower(fit), size: fit.length };
  }

  // ------------------------------------------------------------- time & healing

  /** Heal wounds for `hours` at `rate` wound-hours per hour. */
  heal(hours: number, rate: number): void {
    for (const h of this.data.heroes) if (h.wound > 0) h.wound = Math.max(0, h.wound - hours * rate);
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
    if (!h || idx < 0) return false;
    const item = this.data.stash[idx];
    const def = itemDef(item.def);
    this.data.stash.splice(idx, 1);
    const slot = def.slot;
    const prev = h.equip[slot];
    if (prev) this.data.stash.push(prev);
    h.equip[slot] = item;
    // Two-handed weapons and shields are exclusive.
    if (slot === 'weapon' && def.twoHanded && h.equip.shield) {
      this.data.stash.push(h.equip.shield);
      delete h.equip.shield;
    }
    if (slot === 'shield' && h.equip.weapon && itemDef(h.equip.weapon.def).twoHanded) {
      this.data.stash.push(h.equip.weapon);
      delete h.equip.weapon;
    }
    return true;
  }

  unequip(heroId: string, slot: Slot): boolean {
    const h = this.hero(heroId);
    if (!h || !h.equip[slot]) return false;
    this.data.stash.push(h.equip[slot]!);
    delete h.equip[slot];
    return true;
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
