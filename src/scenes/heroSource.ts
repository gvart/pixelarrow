/**
 * Whose heroes the hero sheet (HeroScene) shows and changes: the offline
 * campaign's (default) or another army's, e.g. the duel army
 * (src/duel/heroSource.ts). Every change returns at once (the sheet redraws
 * from the local copy); a server-backed source confirms in the background and
 * calls `onChange` / `onError` when the answer arrives.
 */
import type { Hero } from '../data/units';
import type { Item, Slot } from '../data/items';
import { PERK_LEVELS, heroPaths, retrainCost, retrainPerks, type AttrId, type PerkId } from '../data/perks';
import { state } from '../state';

export interface HeroSource {
  heroes(): Hero[];
  stash(): Item[];
  /** Gold to repair with, or null when gear never wears (repairs are not offered). */
  gold(): number | null;
  repairCost(it: Item): number;
  equip(heroId: string, itemUid: string): boolean;
  unequip(heroId: string, slot: Slot): boolean;
  repair(it: Item): boolean;
  spendPoints(heroId: string, add: Record<AttrId, number>): boolean;
  takePerk(heroId: string, id: PerkId): boolean;
  /** Optional respec (price shown on the Stats tab). */
  respec?: { price(h: Hero): number; currency: string; run(heroId: string): boolean };
  /**
   * Optional perk retrain (abilities.md R7, F3): a town drillmaster (paid, `retrainCost`) or a free
   * retrain an event granted. `run` switches tier `tier` (0..4) to its other option, paying first.
   */
  retrain?: {
    /** Free retrains owed. */
    free(): number;
    /** Gold to pay with. */
    gold(): number;
    /** Gold a paid retrain of tier `tier` (0..4) costs. */
    cost(tier: number): number;
    run(heroId: string, tier: number, paid: boolean): boolean;
  };
  /** Optional dismiss from the sheet (destructive: the sheet confirms first). `blocked` says why not, or null. */
  dismiss?: { blocked(heroId: string): string | null; run(heroId: string): Promise<boolean> };
  /** Leave the sheet. */
  back(scene: Phaser.Scene, heroId: string, from: Record<string, unknown>): void;
  /** Server-backed sources redraw the sheet when the answer arrives or a change fails. */
  onChange?: () => void;
  onError?: (message: string) => void;
}

/** The offline campaign's heroes (saved after every change). */
export const campaignHeroes: HeroSource = {
  heroes: () => state.campaign.data.heroes,
  stash: () => state.campaign.data.stash,
  gold: () => state.campaign.data.gold,
  repairCost: (it) => state.campaign.repairCost(it),
  equip(heroId, uid) {
    return saved(state.campaign.equip(heroId, uid));
  },
  unequip(heroId, slot) {
    return saved(state.campaign.unequip(heroId, slot));
  },
  repair(it) {
    return saved(state.campaign.repair(it));
  },
  spendPoints(heroId, add) {
    let ok = true;
    for (const [k, n] of Object.entries(add) as [AttrId, number][]) for (let i = 0; i < n; i++) ok = state.campaign.spendPoint(heroId, k) && ok;
    return saved(ok);
  },
  takePerk(heroId, id) {
    return saved(state.campaign.takePerk(heroId, id));
  },
  retrain: {
    free: () => state.campaign.freeRetrains(),
    gold: () => state.campaign.data.gold,
    cost: (tier) => retrainCost(tier + 1),
    run(heroId, tier, paid) {
      const c = state.campaign;
      const h = c.data.heroes.find((x) => x.id === heroId);
      const next = h ? retrainPerks(h, tier) : null;
      if (!h || !next) return false;
      if (paid) {
        const cost = retrainCost(tier + 1);
        if (c.data.gold < cost) return false;
        c.data.gold -= cost;
      } else if (!c.useFreeRetrain()) return false;
      h.perks = next;
      return saved(true);
    },
  },
  back(scene, heroId, from) {
    scene.scene.start('Army', { ...from, heroId });
  },
};

/** One perk tier as the hero sheet shows it: both options (path A, B), what he took, the level it opens at. */
export interface PerkTier {
  tier: number;
  level: number;
  opts: readonly PerkId[];
  /** The option he took, or null. */
  taken: PerkId | null;
}

/** The hero's perk tiers (abilities.md R1): his class's [A, B] pairs, or one perk per tier for a classless (old) hero. */
export function heroTiers(h: { cls?: string; perks: readonly PerkId[] }): PerkTier[] {
  return heroPaths(h, h.perks[0]).map((opts, tier) => ({ tier, level: PERK_LEVELS[tier], opts, taken: opts.find((p) => h.perks.includes(p)) ?? null }));
}

function saved(ok: boolean): boolean {
  if (ok) void state.save();
  return ok;
}
