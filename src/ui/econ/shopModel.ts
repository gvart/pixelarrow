/**
 * What the Shop hub offers, as data (SHP-01): each look's state and the one
 * action its sheet offers, the Drachmae packs with their bonus and the best
 * value, and the premium pass price. No prices are set here: every number
 * comes from the server's catalogue, wallet and pass (src/platform/api.ts).
 * ShopScene draws from these, and tests/shopParity.test.ts holds them to what
 * the Shop showed before the v5 rebuild.
 */
import type { CosmeticInfo, EconomyCatalog, SeasonPassInfo, WalletInfo } from '../../platform/api';
import type { PaymentStatus } from '../../platform/core';
import { t } from '../../i18n';

/** A look's state on its card: Equipped, Owned, earned elsewhere (pass, Duels, not for sale) or a price. */
export type CosmeticOffer =
  | { kind: 'equipped' }
  | { kind: 'owned' }
  | { kind: 'earn'; source: 'season_pass' | 'duel_season' | 'none'; tier: number | null }
  | { kind: 'price'; price: number; afford: boolean };

export function cosmeticOffer(cm: CosmeticInfo, wallet: Pick<WalletInfo, 'cosmetics' | 'loadout' | 'drachmae'>, pass: SeasonPassInfo | null): CosmeticOffer {
  if (wallet.loadout[cm.slot] === cm.id) return { kind: 'equipped' };
  if (wallet.cosmetics.includes(cm.id)) return { kind: 'owned' };
  if (cm.drachmae === null) {
    if (cm.source === 'season_pass') {
      const tier = pass?.tiers.find((x) => (x.premium.kind === 'cosmetic' && x.premium.id === cm.id) || (x.free.kind === 'cosmetic' && x.free.id === cm.id))?.tier ?? null;
      return { kind: 'earn', source: 'season_pass', tier };
    }
    return { kind: 'earn', source: cm.source === 'duel_season' ? 'duel_season' : 'none', tier: null };
  }
  return { kind: 'price', price: cm.drachmae, afford: wallet.drachmae >= cm.drachmae };
}

/** The one action of a look's sheet: equip / take off, buy (or "Need n Dr" when short), or go where it is earned. */
type CosmeticAction =
  | { id: 'shop.equip'; equip: boolean }
  | { id: 'shop.buyCosmetic'; price: number; short: boolean }
  | { id: 'shop.earnGo'; to: 'pass' | 'duels' }
  | null;

export function cosmeticAction(o: CosmeticOffer): CosmeticAction {
  if (o.kind === 'equipped') return { id: 'shop.equip', equip: false };
  if (o.kind === 'owned') return { id: 'shop.equip', equip: true };
  if (o.kind === 'price') return { id: 'shop.buyCosmetic', price: o.price, short: !o.afford };
  if (o.source === 'duel_season') return { id: 'shop.earnGo', to: 'duels' };
  if (o.source === 'season_pass') return { id: 'shop.earnGo', to: 'pass' };
  // not for sale and not earned anywhere (a legacy Stars look): nothing to do but close
  return null;
}

/** The looks of each slot, in the catalogue's slot order (empty slots left out). */
export function cosmeticsBySlot(cat: Pick<EconomyCatalog, 'slots' | 'cosmetics'>): { slot: string; list: CosmeticInfo[] }[] {
  return cat.slots.map((slot) => ({ slot, list: cat.cosmetics.filter((x) => x.slot === slot) })).filter((g) => g.list.length > 0);
}

interface PackOffer {
  id: string;
  stars: number;
  drachmae: number;
  /** Extra Drachmae over one per Star, in percent (0: none). */
  bonus: number;
  /** The most Drachmae per Star (only when there is more than one pack). */
  best: boolean;
}

/** The Drachmae packs for Telegram Stars, in the catalogue's order. */
export function packOffers(cat: Pick<EconomyCatalog, 'packs'>): PackOffer[] {
  const best = cat.packs.reduce((a, pk) => (!a || pk.drachmae / pk.stars > a.drachmae / a.stars ? pk : a), null as (typeof cat.packs)[number] | null);
  return cat.packs.map((pk) => ({ id: pk.id, stars: pk.stars, drachmae: pk.drachmae, bonus: Math.round((pk.drachmae / pk.stars - 1) * 100), best: pk === best && cat.packs.length > 1 }));
}

/**
 * A pack's button: the Stars price (Telegram's blue button) while Telegram Stars is this platform's
 * provider, even when its sheet can't open right now; where no provider exists yet (the web), "Coming
 * soon" with no price, off, with the reason a tap shows (AU-20, UXA-12). Prices never change here.
 */
export function packButton(s: PaymentStatus, stars: number): { label: string; stars: boolean; offReason?: string } {
  if (!s.available && s.reason === 'coming_soon') return { label: t('shop.web.soon'), stars: false, offReason: t('shop.web.soonTip') };
  return { label: t('res.starsPrice', { n: stars }), stars: true };
}

/** The premium track: its price and whether the wallet is short of it (then the button leads to the wallet). */
export function premiumOffer(pass: SeasonPassInfo, wallet: Pick<WalletInfo, 'drachmae'>): { price: number; short: boolean; owned: boolean } {
  return { price: pass.premiumDrachmae, short: wallet.drachmae < pass.premiumDrachmae, owned: pass.premium };
}
