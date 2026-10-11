/**
 * SHP-01: the Shop hub is rebuilt on the v5 kit with no product, price or purchase change (PROPOSALS.md:
 * real-money items are proposals only). `shop-parity.before.json` was captured from the running game
 * BEFORE the rebuild (v5 @ 5a17ad9, demo economy, en): every look's card, each look sheet's one action,
 * the four Drachmae packs and the pass buttons, plus the source of every purchase, claim and payment
 * method. This test holds the rebuilt Shop to it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import before from './shop-parity.before.json';
import shopSrc from '../src/scenes/ShopScene.ts?raw';
import { DemoEconSource } from '../src/ui/econ/demo';
import { cosmeticAction, cosmeticOffer, cosmeticsBySlot, packOffers, premiumOffer } from '../src/ui/econ/shopModel';
import { claimableCount } from '../src/game/economy';
import { setLang, t, tOr } from '../src/i18n';
import type { CosmeticInfo, EconomyCatalog, SeasonPassInfo, WalletInfo } from '../src/platform/api';

let cat: EconomyCatalog;
let wallet: WalletInfo;
let pass: SeasonPassInfo;

beforeAll(async () => {
  setLang('en');
  const src = new DemoEconSource();
  [cat, wallet, pass] = await Promise.all([src.catalog(), src.wallet(), src.pass()]);
});

const name = (cm: CosmeticInfo) => tOr(`cosmetic.${cm.id}`, cm.name);

/** A look's card as the Shop draws it: its name, then its state or price. */
function card(cm: CosmeticInfo): string[] {
  const o = cosmeticOffer(cm, wallet, pass);
  const state =
    o.kind === 'equipped'
      ? t('shop.equipped')
      : o.kind === 'owned'
        ? t('econ.owned')
        : o.kind === 'price'
          ? `${o.price}`
          : o.source === 'season_pass'
            ? t('shop.passOnly')
            : o.source === 'duel_season'
              ? t('shop.duelSeasonShort')
              : t('shop.notForSale');
  return [name(cm), state];
}

describe('SHP-01 Shop parity (before vs after)', () => {
  it('shows the same looks, in the same order, with the same states and prices', () => {
    const after = cosmeticsBySlot(cat).flatMap((g) => g.list.map((cm) => ({ id: `cosmetic:${cm.id}`, texts: card(cm) })));
    expect(after).toEqual(before.cards);
  });

  it("offers the same action, at the same price, on every look's sheet", () => {
    const changed: string[] = [];
    for (const d of before.dialogs) {
      const cm = cat.cosmetics.find((x) => x.id === d.cosmetic)!;
      expect(cm.drachmae).toBe(d.price);
      const a = cosmeticAction(cosmeticOffer(cm, wallet, pass));
      const got =
        a === null
          ? []
          : a.id === 'shop.equip'
            ? [{ id: a.id, label: a.equip ? t('shop.equip') : t('shop.unequip') }]
            : a.id === 'shop.buyCosmetic'
              ? [{ id: a.id, label: a.short ? t('pass.needDr', { n: a.price }) : `${a.price}` }]
              : [{ id: a.id, label: a.to === 'duels' ? t('shop.openDuels') : t('shop.openPass') }];
      if (JSON.stringify(got) !== JSON.stringify(d.actions)) changed.push(d.cosmetic);
      else expect(got).toEqual(d.actions);
    }
    // the one intended difference: a legacy look that is not for sale and earned nowhere had an
    // "Open Pass" button that did nothing; its sheet now has only the X. No purchase action changed.
    expect(changed).toEqual(['supporter_banner']);
    const legacy = cat.cosmetics.find((x) => x.id === 'supporter_banner')!;
    expect(legacy.drachmae).toBeNull();
    expect(cosmeticAction(cosmeticOffer(legacy, wallet, pass))).toBeNull();
  });

  it('sells the same four Drachmae packs for the same Stars', () => {
    const after = packOffers(cat).map((p) => ({ id: `wallet.pack.${p.id}`, label: t('res.starsPrice', { n: p.stars }) }));
    expect(after).toEqual(before.packs);
    expect(packOffers(cat).map((p) => [p.id, p.stars, p.drachmae])).toEqual(cat.packs.map((p) => [p.id, p.stars, p.drachmae]));
    // one best value, the most Drachmae per Star
    expect(packOffers(cat).filter((p) => p.best).map((p) => p.id)).toEqual(['drachmae_1300']);
  });

  it('prices the premium track the same and counts the same claims', () => {
    const prem = premiumOffer(pass, wallet);
    const after = [
      { id: 'pass.unlock', label: prem.short ? t('pass.needDr', { n: prem.price }) : t('pass.unlock', { n: prem.price }) },
      { id: 'pass.claimAll', label: t('pass.claimAll', { n: claimableCount(pass) }) },
    ];
    expect(after).toEqual(before.pass);
    expect(prem.price).toBe(cat.pass.premiumDrachmae);
  });

  it('keeps every purchase, claim and payment method byte for byte', () => {
    for (const [method, body] of Object.entries(before.payment)) expect(shopSrc.includes(body), method).toBe(true);
  });

  it('draws the cards, sheets, packs and the pass from the same model', () => {
    for (const fn of ['cosmeticOffer(', 'cosmeticAction(', 'cosmeticsBySlot(', 'packOffers(', 'premiumOffer(']) expect(shopSrc.includes(fn), fn).toBe(true);
    // the real-money confirmation and Telegram's payment are the ones the Shop always used
    expect(shopSrc).toContain('confirmPurchase(this, { what: t(\'pass.reward.drachmae\', { n: pk.drachmae }), stars: pk.stars, onOk: () => void this.buyPack(pk.id, pk.drachmae) });');
  });
});
