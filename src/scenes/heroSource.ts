/**
 * Whose heroes the hero sheet (HeroScene) shows and changes: the offline
 * campaign's (default) or another army's, e.g. the duel army
 * (src/duel/heroSource.ts). Every change returns at once (the sheet redraws
 * from the local copy); a server-backed source confirms in the background and
 * calls `onChange` / `onError` when the answer arrives.
 */
import type { Hero } from '../data/units';
import type { Item, Slot } from '../data/items';
import type { AttrId, PerkId } from '../data/perks';
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
  back(scene, heroId, from) {
    scene.scene.start('Army', { ...from, heroId });
  },
};

function saved(ok: boolean): boolean {
  if (ok) void state.save();
  return ok;
}
