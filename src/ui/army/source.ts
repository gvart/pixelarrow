/**
 * The Army template's data source (screens-campaign.md C-7, NAV D6): whose
 * company the one Army screen shows. The campaign is the first source (S07,
 * ArmyScene); the duel team (S13, DUE-01) and the war army (S19, WAR-01) adopt
 * the same template with their own source. The template only reads through it
 * and asks it to change things; a source owns its data and its saving.
 */
import type { Hero } from '../../data/units';
import { MAX_ARMY } from '../../data/units';
import type { Item, Slot } from '../../data/items';
import { perkSlots } from '../../data/perks';
import { state } from '../../state';
import { t } from '../../i18n';

/** A hero's state instead of his rank stars on a row (wounded, garrisoned, away), or null when he is fit. */
export interface HeroStatus {
  text: string;
  /** A loss (wounded): error ink. Otherwise secondary ink. */
  bad: boolean;
}

export interface ArmySource {
  readonly kind: 'campaign' | 'duel' | 'war';
  heroes(): Hero[];
  stash(): Item[];
  /** The cap on the Roster tab ("Roster n/max"). */
  maxArmy(): number;
  /** Gold for the chip and repairs, or null when this army has no purse. */
  gold(): number | null;
  repairCost(it: Item): number;
  equip(heroId: string, itemUid: string): boolean;
  unequip(heroId: string, slot: Slot): boolean;
  repair(it: Item): boolean;
  /** Move a hero to battle group g (0..3); false when this army has no groups to change. */
  setGroup(heroId: string, g: number): boolean;
  /** Points to spend (attribute points and free perk picks): the row's count badge. */
  pending(h: Hero): number;
  status(h: Hero): HeroStatus | null;
  /** Dismiss: `blocked` says why not (or null); the template confirms before `run`. */
  dismiss?: { blocked(heroId: string): string | null; run(heroId: string): boolean };
}

/** Unspent attribute points plus free perk picks. */
export function pendingPoints(h: Pick<Hero, 'points' | 'perks' | 'level'>): number {
  return Math.max(0, h.points) + Math.max(0, perkSlots(h.level) - h.perks.length);
}

const saved = (ok: boolean): boolean => {
  if (ok) void state.save();
  return ok;
};

/** The offline campaign's company (S07): saved after every change. */
export const campaignArmy: ArmySource = {
  kind: 'campaign',
  heroes: () => state.campaign.data.heroes,
  stash: () => state.campaign.data.stash,
  maxArmy: () => MAX_ARMY,
  gold: () => state.campaign.data.gold,
  repairCost: (it) => state.campaign.repairCost(it),
  equip: (heroId, uid) => saved(state.campaign.equip(heroId, uid)),
  unequip(heroId, slot) {
    state.campaign.unequip(heroId, slot);
    return saved(true);
  },
  repair: (it) => saved(state.campaign.repair(it)),
  setGroup(heroId, g) {
    const h = state.campaign.hero(heroId);
    if (!h || h.group === g) return false;
    h.group = g;
    return saved(true);
  },
  pending: pendingPoints,
  status: (h) => (h.wound > 0 ? { text: t('hero.wounded', { h: Math.ceil(h.wound) }), bad: true } : null),
  dismiss: {
    blocked: () => (state.campaign.data.heroes.length > 1 ? null : t('army.dismissLast')),
    run(heroId) {
      state.campaign.dismiss(heroId);
      return saved(true);
    },
  },
};
