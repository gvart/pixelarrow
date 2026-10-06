/** Campaign state: roster, stash, gold, and the operations the Army screen performs. */
import { itemDef, type Item, type Slot } from '../data/items';
import { MAX_ARMY, RECRUIT_COST, type Hero } from '../data/units';
import { Rng } from '../sim/rng';
import { makeHero, makeItem, starterArmy } from './heroes';
import { DEFAULT_SETTINGS, SAVE_VERSION, type SaveData } from './save';

export class Campaign {
  data: SaveData;
  private rng: Rng;

  constructor(data: SaveData) {
    this.data = data;
    this.rng = new Rng(data.rng);
  }

  static fresh(seed: number): Campaign {
    const ids = { nextId: 1 };
    const rng = new Rng(seed);
    const heroes = starterArmy(rng, ids);
    const stash: Item[] = [
      makeItem(rng, ids, 'xiphos', 'common', 80),
      makeItem(rng, ids, 'pilos', 'common', 70),
      makeItem(rng, ids, 'owl_amulet', 'common', 100),
      makeItem(rng, ids, 'buckler', 'common', 75),
    ];
    const data: SaveData = {
      v: SAVE_VERSION,
      gold: 120,
      heroes,
      stash,
      nextId: ids.nextId,
      rng: rng.state,
      won: 0,
      fought: 0,
      settings: { ...DEFAULT_SETTINGS },
    };
    return new Campaign(data);
  }

  /** Rng for campaign-level randomness; state is written back into the save. */
  random(): Rng {
    return this.rng;
  }

  sync(): SaveData {
    this.data.rng = this.rng.state;
    return this.data;
  }

  hero(id: string): Hero | undefined {
    return this.data.heroes.find((h) => h.id === id);
  }

  canRecruit(): boolean {
    return this.data.heroes.length < MAX_ARMY && this.data.gold >= RECRUIT_COST;
  }

  recruit(): Hero | null {
    if (!this.canRecruit()) return null;
    this.data.gold -= RECRUIT_COST;
    const culture = this.rng.pick(['greek', 'greek', 'phoenician', 'celtic'] as const);
    const h = makeHero(this.rng, this.data, culture, 'raw', 1, 1, 2);
    this.data.heroes.push(h);
    this.sync();
    return h;
  }

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

  sell(itemUid: string, value: number): void {
    const idx = this.data.stash.findIndex((i) => i.uid === itemUid);
    if (idx < 0) return;
    this.data.stash.splice(idx, 1);
    this.data.gold += value;
  }
}
