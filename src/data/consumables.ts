/**
 * Consumables (docs/DESIGN_V2.md "Monetization and economy"). Self-contained
 * data shared by the client, the sim adapters and the Worker: prices, daily
 * caps and effects. The server is the authority on inventories and prices.
 *
 * - `battle` consumables are chosen when an attack ticket or a duel starts (at
 *   most ONE per battle). Their effect is baked into the server-built
 *   BattleSetup (`applyBattleConsumable`), so every client and the server's
 *   replay simulate the same thing. The id is also recorded in
 *   `setup.consumables` ([side0, side1]) for display and audit.
 * - `heal` and `march` consumables are used outside battle
 *   (POST /api/online/consumables/use).
 */

export type ConsumableId = 'healing_salve' | 'morale_wine' | 'war_horn' | 'sharpening_stone' | 'march_rations';
export type ConsumableUse = 'battle' | 'heal' | 'march';

export interface ConsumableEffect {
  /** Multiplier on melee and ranged damage of every unit on the side (battle). */
  dmgMult?: number;
  /** Added to every unit's morale stat (battle). */
  morale?: number;
  /** Grants the Rally Cry ability to the side's highest-level hero (battle). */
  rally?: boolean;
  /** Wounds of every hero are shortened by this many ms (heal). */
  healMs?: number;
  /** Remaining march time is multiplied by this (march). */
  marchMult?: number;
}

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  desc: string;
  use: ConsumableUse;
  /** Shop price in season gold (null: not sold for gold). */
  gold: number | null;
  /** Shop price in Drachmae (the shortcut). */
  drachmae: number | null;
  /** Most a player may buy from the shop per UTC day (gold and Drachmae together). */
  dailyCap: number;
  effect: ConsumableEffect;
}

export const CONSUMABLES: Record<ConsumableId, ConsumableDef> = {
  healing_salve: {
    id: 'healing_salve',
    name: 'Healing salve',
    desc: 'Shortens the rest of every wounded hero by an hour.',
    use: 'heal',
    gold: 60,
    drachmae: 10,
    dailyCap: 3,
    effect: { healMs: 60 * 60_000 },
  },
  morale_wine: {
    id: 'morale_wine',
    name: 'Morale wine',
    desc: 'An amphora shared before battle: +10 morale for every soldier.',
    use: 'battle',
    gold: 80,
    drachmae: 15,
    dailyCap: 3,
    effect: { morale: 10 },
  },
  war_horn: {
    id: 'war_horn',
    name: 'War horn',
    desc: 'Your best hero can sound a rally once the lines waver.',
    use: 'battle',
    gold: 120,
    drachmae: 20,
    dailyCap: 2,
    effect: { rally: true },
  },
  sharpening_stone: {
    id: 'sharpening_stone',
    name: 'Sharpening stone',
    desc: '+10% damage for one battle.',
    use: 'battle',
    gold: 100,
    drachmae: 15,
    dailyCap: 3,
    effect: { dmgMult: 1.1 },
  },
  march_rations: {
    id: 'march_rations',
    name: 'March rations',
    desc: 'The rest of the current march takes a quarter less time.',
    use: 'march',
    gold: 50,
    drachmae: 10,
    dailyCap: 3,
    effect: { marchMult: 0.75 },
  },
};

export const CONSUMABLE_IDS = Object.keys(CONSUMABLES) as ConsumableId[];
export const BATTLE_CONSUMABLES = CONSUMABLE_IDS.filter((id) => CONSUMABLES[id].use === 'battle');

export function isConsumableId(v: unknown): v is ConsumableId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CONSUMABLES, v);
}

/** Structural view of a sim ArmySpec (kept import-free so this file stays self-contained). */
export interface ConsumableArmy {
  units: { level: number; stats: { dmg: number; rangedDmg: number; morale: number; abilities: string[] } }[];
}

/**
 * Bakes a battle consumable into one side of a BattleSetup (mutates `army`).
 * Deterministic and pure; the server calls it while building the setup.
 *
 * TODO(sim): the war horn reuses the Rally Cry ability (45 s cooldown) of the
 * side's best hero; a true one-shot, army-wide horn rally needs a sim feature.
 */
export function applyBattleConsumable(army: ConsumableArmy, id: ConsumableId): void {
  const def = CONSUMABLES[id];
  if (def.use !== 'battle') return;
  const e = def.effect;
  for (const u of army.units) {
    if (e.dmgMult) {
      u.stats.dmg = Math.round(u.stats.dmg * e.dmgMult * 100) / 100;
      u.stats.rangedDmg = Math.round(u.stats.rangedDmg * e.dmgMult * 100) / 100;
    }
    if (e.morale) u.stats.morale += e.morale;
  }
  if (e.rally) {
    const best = army.units.filter((u) => !u.stats.abilities.includes('rally')).sort((a, b) => b.level - a.level)[0];
    if (best) best.stats.abilities = [...best.stats.abilities, 'rally'];
  }
}
