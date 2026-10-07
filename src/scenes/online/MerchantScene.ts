/**
 * A map merchant (docs/DUELS.md "War-map shops on the map"): the stock of a
 * town or a trading post, opened from the hex panel. Shows whether the hex is
 * in reach, the holder discount and cut, today's daily caps, and buy buttons
 * for gold (and Drachmae for supplies) that say why they are disabled (out of
 * reach, daily limit, not enough gold). Everything is decided by the server
 * (server/src/online/merchant.ts); with `demo` it shows the demo shard's
 * merchant (src/online/demoShard.ts: layout check, screenshots).
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, ScrollArea, addPanel, addText } from '../../ui/kit';
import { ItemIcon, addScrollHint, confirmDialog, showTooltip, subjectName, toast } from '../../ui/widgets';
import { uiId } from '../../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../../ui/textfit';
import { SIZE } from '../../ui/theme';
import { ensureFonts, rarityFont } from '../../ui/fonts';
import { frameScrollTexts, openItemCard } from '../../ui/sheet';
import { addEconState, addPurse, currencyIcon, ensureEconIcons, priceText } from '../../ui/econ/widgets';
import { econState, type EconState } from '../../game/economy';
import { isApiError, newRequestId, type Currency } from '../../platform/api';
import { onlineApi, type MerchantBuyResult, type MerchantOffer, type MerchantView } from '../../online/client';
import { demoShard } from '../../online/demoShard';
import { capKey } from '../../online/merchants';
import type { Axial } from '../../online/hex';
import { CONSUMABLES, type ConsumableId } from '../../data/consumables';
import { ITEMS, type Item } from '../../data/items';
import { P } from '../../art/palette';
import { hapticNotify } from '../../platform/telegram';
import { uiCoin } from '../../audio/hooks';
import { t, tOr, type TKey } from '../../i18n';
import { fmtTime } from './OnlineScene';

export interface MerchantData {
  hex: Axial;
  /** The demo shard's merchant; 'held' / 'far' stage it in reach with the discount, or out of reach. */
  demo?: boolean | 'held' | 'far';
  /** With demo: take the hex from the demo shard's spots (the town or the trading post in sight). */
  spot?: 'market' | 'post';
  back?: { scene: string; data?: Record<string, unknown> };
}

interface Source {
  load(): Promise<MerchantView>;
  buy(offer: string, currency: Currency, requestId: string): Promise<MerchantBuyResult>;
}

function liveSource(h: Axial): Source {
  return { load: () => onlineApi.merchant(h), buy: (offer, currency, requestId) => onlineApi.merchantBuy(h, offer, currency, requestId) };
}

/** The demo merchant: purchases change only the local copy. */
function demoSource(h: Axial, stage?: 'held' | 'far'): Source {
  const v = demoShard().merchant(h, stage);
  return {
    load: async () => {
      if (!v) throw new Error('no merchant');
      return JSON.parse(JSON.stringify(v)) as MerchantView;
    },
    buy: async (offer, currency, requestId) => {
      const o = v?.offers.find((x) => x.id === offer);
      const price = o?.price[currency];
      if (!v || !o || price === null || price === undefined) throw new Error('not for sale');
      if (currency === 'gold') v.gold -= price;
      else v.drachmae -= price;
      for (const x of v.offers) if (capKey(x) === capKey(o)) x.bought++;
      return { order: { requestId, offer, currency, price, discount: v.discount, holderCut: 0, itemUid: null }, replayed: false, gold: v.gold, drachmae: v.drachmae };
    },
  };
}

type Section = MerchantOffer['slot'];
const SECTIONS: Section[] = ['base', 'region', 'rare'];

export class MerchantScene extends BaseScene {
  private hex: Axial = { q: 0, r: 0 };
  private src!: Source;
  private view: MerchantView | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private head!: Phaser.GameObjects.Container;
  private page!: Phaser.GameObjects.Container;
  private area: ScrollArea | null = null;
  private backTo: MerchantData['back'];
  private busy = false;
  private pendingIds = new Map<string, string>();
  private gen = 0;

  constructor() {
    super('Merchant');
  }

  create(data: MerchantData): void {
    this.initUi();
    ensureFonts(this);
    ensureEconIcons(this);
    this.hex = (data?.demo && data.spot ? demoShard().spots[data.spot] : null) ?? data?.hex ?? { q: 0, r: 0 };
    this.src = data?.demo ? demoSource(this.hex, data.demo === true ? undefined : data.demo) : liveSource(this.hex);
    this.backTo = data?.back;
    this.view = null;
    this.st = 'loading';
    this.busy = false;
    this.area = null;
    this.screen({ back: () => this.leave() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    this.ui.add([this.head, this.page]);
    this.events.once('shutdown', () => this.clearPage());
    this.render();
    void this.fetch();
  }

  private leave(): void {
    const b = this.backTo;
    this.scene.start(b?.scene ?? 'Online', b?.data ?? {});
  }

  async fetch(): Promise<void> {
    const gen = ++this.gen;
    try {
      const v = await this.src.load();
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.view = v;
      this.st = 'ready';
    } catch (e) {
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.st = econState(e);
    }
    this.render();
  }

  // ------------------------------------------------------------------ layout

  private clearPage(): void {
    this.area?.destroy();
    this.area = null;
    this.page.removeAll(true);
  }

  private render(): void {
    this.head.removeAll(true);
    this.clearPage();
    const { VW, VH } = this.m;
    const v = this.view;
    const H = this.head;
    H.add(addPanel(this, 0, 0, VW, 26, 'parch'));
    let left = 6;
    if (this.inGameBack) {
      H.add(new Button(this, 3, 2, 26, 22, { icon: 'back', onClick: () => this.leave() }));
      left = 33;
    }
    const purseW = addPurse(this, H, VW - 6, 7, { drachmae: v?.drachmae ?? null, gold: v?.gold ?? null }, VW - left - 50);
    const pz = this.add.zone(VW - 4 - Math.max(24, purseW), 2, Math.max(24, purseW), 22).setOrigin(0, 0).setInteractive();
    uiId(pz, 'merchant.purse');
    pz.on('pointerup', () => showTooltip(this, t('econ.purseTip'), pz));
    H.add(pz);
    H.add(addText(this, left, 9, ellipsize(t(`merchant.title.${v?.kind ?? 'town'}` as TKey), VW - left - purseW - 12), 'red'));
    const top = 29;
    this.page.add(addPanel(this, 0, top - 2, VW, VH - top + 2, 'parch'));
    if (this.st !== 'ready' || !v) {
      const s = this.st === 'ready' ? 'error' : this.st;
      addEconState(this, this.page, 4, top + 2, VW - 8, VH - top - 6, s, () => ((this.st = 'loading'), this.render(), void this.fetch()));
      return;
    }
    this.buildStock(v, top + 2);
  }

  private buildStock(v: MerchantView, top: number): void {
    const { VW, VH, S } = this.m;
    const area = new ScrollArea(this, this.page, 4, top, VW - 8, VH - top - 4, S);
    this.area = area;
    addScrollHint(this, this.page, area);
    const c = area.content;
    const w = VW - 8 - 4;
    let y = 0;
    // ---- who, where, and on what terms
    const pct = Math.round(v.discountRate * 100);
    const cut = Math.round(v.holderCutRate * 100);
    const info: { text: string; font: 'ink' | 'dim' | 'good' | 'red' }[] = [
      { text: `${t(`merchant.kind.${v.kind}` as TKey)} · ${t(`merchant.region.${v.region}` as TKey)}`, font: 'ink' },
      { text: v.reach ? t('merchant.reach') : t('merchant.far'), font: v.reach ? 'good' : 'red' },
      v.holder?.you
        ? { text: t('merchant.yours', { pct, cut, n: v.earned }), font: 'good' }
        : v.discount
          ? { text: t('merchant.discount', { pct }), font: 'good' }
          : v.holder
            ? { text: t('merchant.held', { name: v.holder.name ?? '?', cut }), font: 'dim' }
            : { text: t('merchant.free', { pct, cut }), font: 'dim' },
      { text: t('merchant.reset', { t: fmtTime(v.resetsAt - v.now) }), font: 'dim' },
    ];
    const lines = info.map((x) => ({ ...x, lines: wrapText(x.text, w - 8, 3).lines }));
    const infoH = 6 + lines.reduce((a, x) => a + x.lines.length * LINE_H + 2, 0) + 2;
    c.add(addPanel(this, 0, y, w, infoH, 'inset'));
    let iy = y + 5;
    for (const x of lines) {
      c.add(addText(this, 5, iy, x.lines.join('\n'), x.font));
      iy += x.lines.length * LINE_H + 2;
    }
    y += infoH + 6;
    // ---- the offers by section
    for (const sec of SECTIONS) {
      const list = v.offers.filter((o) => o.slot === sec);
      if (!list.length) continue;
      const title = sec === 'region' ? t(`merchant.region.${v.region}` as TKey) : t(`merchant.sec.${sec}` as TKey);
      c.add(addText(this, 0, y, ellipsize(title, w), 'red'));
      y += 11;
      for (const o of list) y += this.offerRow(c, area, v, o, y, w) + SIZE.gap;
      y += 4;
    }
    area.setContentHeight(y);
    frameScrollTexts(area, VW - 8);
  }

  private offerName(o: MerchantOffer): string {
    return o.kind === 'consumable' ? tOr(`consumable.${o.ref}.name`, CONSUMABLES[o.ref as ConsumableId]?.name ?? o.ref) : subjectName({ item: this.preview(o) });
  }

  private preview(o: MerchantOffer): Item {
    return { uid: `offer_${o.id}`, def: o.ref, rarity: o.rarity, cond: 100 };
  }

  /** One offer: icon, name, today's count, a line of description, the buy buttons. Returns its height. */
  private offerRow(c: Phaser.GameObjects.Container, area: ScrollArea, v: MerchantView, o: MerchantOffer, y: number, w: number): number {
    const consumable = o.kind === 'consumable';
    const def = consumable ? null : ITEMS[o.ref];
    const descText = consumable ? tOr(`consumable.${o.ref}.desc`, CONSUMABLES[o.ref as ConsumableId]?.desc ?? '') : `${tOr(`rarity.${o.rarity}`, o.rarity)} · ${tOr(`slot.${def?.slot}`, def?.slot ?? '')} · ${tOr(`item.${o.ref}.desc`, def?.desc ?? '')}`;
    const tx = 32;
    const desc = wrapText(descText, w - tx - 4, 2);
    const rowH = 30 + desc.lines.length * LINE_H + SIZE.btnH + 4;
    c.add(addPanel(this, 0, y, w, rowH, 'button'));
    const name = this.offerName(o);
    const subject = consumable ? { consumable: o.ref } : { item: this.preview(o) };
    c.add(
      new ItemIcon(this, 4, y + 4, subject, {
        rarity: o.rarity,
        onTap: consumable ? undefined : () => !area.moved && this.showOffer(o),
      }),
    );
    c.add(addText(this, tx, y + 4, ellipsize(name, w - tx - 4), consumable ? 'red' : rarityFont(o.rarity)));
    const capped = o.bought >= o.dailyCap;
    c.add(addText(this, tx, y + 15, ellipsize(t('merchant.today', { n: o.bought, cap: o.dailyCap }), w - tx - 4), capped ? 'red' : 'gold'));
    c.add(addText(this, tx, y + 27, desc.lines.join('\n'), 'dim'));
    const by = y + rowH - SIZE.btnH - 4;
    const prices: [Currency, number | null][] = [
      ['gold', o.price.gold],
      ['drachmae', o.price.drachmae],
    ];
    const shown = prices.filter(([, p]) => p !== null);
    const bw = Math.floor((w - 8 - (shown.length - 1) * SIZE.gap) / Math.max(1, shown.length));
    shown.forEach(([cur, price], i) => {
      const p = price as number;
      const list = cur === 'gold' ? o.gold : o.drachmae;
      const b = new Button(this, 4 + i * (bw + SIZE.gap), by, bw, SIZE.btnH, {
        label: list !== null && list !== p ? `${p} (-${Math.round(v.discountRate * 100)}%)` : `${p}`,
        icon: currencyIcon(cur),
        id: `merchant.buy.${o.id}.${cur}`,
        tip: `${name}: ${priceText(p, cur)}. ${cur === 'gold' ? t('shop.goldTip') : t('shop.drTip')}`,
        onClick: () => this.askBuy(o, name, p, cur),
      });
      const have = cur === 'gold' ? v.gold : v.drachmae;
      const why = !v.reach ? t('merchant.why.reach') : capped ? t('econ.dailyCap') : have < p ? t(cur === 'gold' ? 'merchant.why.gold' : 'merchant.why.dr') : undefined;
      if (why) b.setEnabled(false, why);
      c.add(b);
    });
    return rowH;
  }

  /** The item card of a piece of gear on offer (stats; gold only). */
  showOffer(o: MerchantOffer): void {
    const m = openItemCard(this, { item: this.preview(o), notes: [{ text: t('merchant.gearTip'), font: 'dim' }], actions: [{ label: t('common.close'), onClick: () => m.close(), id: 'merchant.cardClose' }] });
  }

  // ------------------------------------------------------------------ buying

  askBuy(o: MerchantOffer, name: string, price: number, currency: Currency): void {
    confirmDialog(this, {
      title: t('shop.buyTitle', { name }),
      body: t('shop.buyBody', { price: priceText(price, currency) }),
      ok: t('shop.buy'),
      okIcon: currencyIcon(currency),
      cancel: t('common.cancel'),
      onOk: () => void this.buy(o, name, currency),
    });
  }

  /** Buy now (no dialog). Keeps the request id until the server answers, so a retry never pays twice. */
  async buy(o: MerchantOffer, name: string, currency: Currency): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const key = `${o.id}:${currency}`;
    const rid = this.pendingIds.get(key) ?? newRequestId();
    this.pendingIds.set(key, rid);
    toast(this, t('econ.busy'));
    try {
      await this.src.buy(o.id, currency, rid);
      this.pendingIds.delete(key);
      if (!this.sys.isActive()) return true;
      hapticNotify('success');
      uiCoin();
      const scroll = this.area?.scrollY ?? 0;
      await this.fetch();
      this.area?.setScroll(scroll);
      toast(this, o.kind === 'item' ? t('merchant.toStash', { name }) : t('econ.bought', { name }), 'good');
      return true;
    } catch (e) {
      if (!(isApiError(e) && e.offline)) this.pendingIds.delete(key);
      if (!this.sys.isActive()) return false;
      hapticNotify('error');
      const code = isApiError(e) ? e.code : '';
      const msg =
        code === 'insufficient_funds'
          ? t(currency === 'gold' ? 'merchant.why.gold' : 'merchant.why.dr')
          : code === 'daily_cap'
            ? t('econ.dailyCap')
            : code === 'out_of_reach'
              ? t('merchant.why.reach')
              : isApiError(e) && e.offline
                ? t('econ.offline')
                : isApiError(e)
                  ? e.message
                  : t('econ.error');
      toast(this, msg, 'bad');
      return false;
    } finally {
      this.busy = false;
    }
  }
}
