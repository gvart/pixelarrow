/**
 * A map merchant (docs/DUELS.md "War-map shops on the map"): the stock of a
 * town or a trading post, opened from the region panel. Shows whether the region is
 * in reach, the holder discount and cut, today's daily caps, and buy buttons
 * for gold (and Drachmae for supplies) that say why they are disabled (out of
 * reach, daily limit, not enough gold). Everything is decided by the server
 * (server/src/online/merchant.ts); with `demo` it shows the demo shard's
 * merchant (src/online/demoShard.ts: layout check, screenshots).
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { ScrollArea, addIcon, addText, scaleIcon, type FontKey } from '../../ui/kit';
import { MButton, MChip, SECTION_TITLE_H as SectionTitle_H, SectionTitle, mosaicImage, TAP } from '../../ui/mosaic';
import { MOSAIC } from '../../ui/tokens';
import { addSubShell } from './common';
import { ItemIcon, addScrollHint, confirmDialog, subjectName, toast } from '../../ui/widgets';
import { ellipsize, wrapText, LINE_H } from '../../ui/textfit';
import { SIZE } from '../../ui/theme';
import { ensureFonts, rarityFont } from '../../ui/fonts';
import { frameScrollTexts, openItemCard } from '../../ui/sheet';
import { addEconState, currencyIcon, ensureEconIcons, priceText } from '../../ui/econ/widgets';
import { econState, type EconState } from '../../game/economy';
import { isApiError, newRequestId, type Currency } from '../../platform/api';
import { onlineApi, type MerchantBuyResult, type MerchantOffer, type MerchantView } from '../../online/client';
import { demoShard } from '../../online/demoShard';
import { capKey } from '../../online/merchants';
import { CONSUMABLES, type ConsumableId } from '../../data/consumables';
import { ITEMS, type Item } from '../../data/items';
import { hapticNotify } from '../../platform/telegram';
import { uiCoin } from '../../audio/hooks';
import { t, tOr, type TKey } from '../../i18n';
import { fmtDuration } from '../../util/format';

export interface MerchantData {
  /** The merchant's region. */
  loc: number;
  /** The demo shard's merchant; 'held' / 'far' stage it in reach with the discount, or out of reach. */
  demo?: boolean | 'held' | 'far';
  /** With demo: take the region from the demo shard's spots (the town or the trading post in sight). */
  spot?: 'market' | 'post';
  back?: { scene: string; data?: Record<string, unknown> };
}

interface Source {
  load(): Promise<MerchantView>;
  buy(offer: string, currency: Currency, requestId: string): Promise<MerchantBuyResult>;
}

function liveSource(h: number): Source {
  return { load: () => onlineApi.merchant(h), buy: (offer, currency, requestId) => onlineApi.merchantBuy(h, offer, currency, requestId) };
}

/** The demo merchant: purchases change only the local copy. */
function demoSource(h: number, stage?: 'held' | 'far'): Source {
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
  private loc = 0;
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
    this.loc = (data?.demo && data.spot ? demoShard().spots[data.spot] : null) ?? data?.loc ?? 0;
    this.src = data?.demo ? demoSource(this.loc, data.demo === true ? undefined : data.demo) : liveSource(this.loc);
    this.backTo = data?.back;
    this.view = null;
    this.st = 'loading';
    this.busy = false;
    this.area = null;
    this.screen({ back: () => this.leave() });
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

  /** The frame (title on the plaque, back arrow), war gold and Drachmae chips, then the stock. */
  private render(): void {
    this.head.removeAll(true);
    this.clearPage();
    const { VW } = this.m;
    const v = this.view;
    const H = this.head;
    const { content: c } = addSubShell(this, t(`merchant.title.${v?.kind ?? 'town'}` as TKey), () => this.leave(), 'merchant.header', H);
    const chips: { icon: string; value: string | number; id: string }[] = [
      { icon: 'wargold', value: v?.gold ?? '-', id: 'merchant.gold' },
      { icon: currencyIcon('drachmae'), value: v?.drachmae ?? '-', id: 'merchant.drachmae' },
    ];
    let cx = c.x + 3;
    for (const o of chips) {
      const chip = new MChip(this, cx, c.y + 3, { ...o, surface: 'stone', w: Math.max(40, MChip.width({ ...o, surface: 'stone' }) + 8) });
      H.add(chip);
      cx += chip.w + 3;
    }
    const top = c.y + 3 + TAP + 3;
    if (this.st !== 'ready' || !v) {
      const s = this.st === 'ready' ? 'error' : this.st;
      addEconState(this, this.page, c.x + 3, top + 2, VW - c.x * 2 - 6, c.y + c.h - top - 6, s, () => ((this.st = 'loading'), this.render(), void this.fetch()));
      return;
    }
    this.buildStock(v, top, c);
  }

  private buildStock(v: MerchantView, top: number, box: { x: number; y: number; w: number; h: number }): void {
    const { VW, S } = this.m;
    const areaW = box.w - 6;
    const area = new ScrollArea(this, this.page, box.x + 3, top, areaW, box.y + box.h - top - 3, S);
    this.area = area;
    addScrollHint(this, this.page, area, MOSAIC.parch);
    const c = area.content;
    const w = areaW - 4;
    let y = 0;
    // ---- who, where, and on what terms: one line each, with its sign
    const pct = Math.round(v.discountRate * 100);
    const cut = Math.round(v.holderCutRate * 100);
    const info: { icon: string; look: '' | 'D'; text: string; font: FontKey }[] = [
      { icon: 'shop', look: '', text: `${t(`merchant.kind.${v.kind}` as TKey)} · ${t(`merchant.region.${v.region}` as TKey)}`, font: 'pInk' },
      { icon: v.reach ? 'check' : 'xmark', look: '', text: v.reach ? t('merchant.reach') : t('merchant.far'), font: v.reach ? 'pGood' : 'pBad' },
      v.holder?.you
        ? { icon: 'flag', look: '', text: t('merchant.yours', { pct, cut, n: v.earned }), font: 'pGood' }
        : v.discount
          ? { icon: 'flag', look: '', text: t('merchant.discount', { pct }), font: 'pGood' }
          : v.holder
            ? { icon: 'flag', look: '', text: t('merchant.held', { name: v.holder.name ?? '?', cut }), font: 'pSec' }
            : { icon: 'flag', look: '', text: t('merchant.free', { pct, cut }), font: 'pSec' },
      { icon: 'clock', look: '', text: t('merchant.reset', { t: fmtDuration(v.resetsAt - v.now) }), font: 'pSec' },
    ];
    const lines = info.map((x) => ({ ...x, lines: wrapText(x.text, w - 24, 3).lines }));
    const infoH = 6 + lines.reduce((a, x) => a + Math.max(12, x.lines.length * LINE_H) + 2, 0) + 2;
    c.add(mosaicImage(this, 0, y, w, infoH, 'parchment'));
    let iy = y + 5;
    for (const x of lines) {
      c.add(scaleIcon(addIcon(this, 5, iy - 1, x.icon, x.look), 0.85));
      c.add(addText(this, 20, iy, x.lines.join('\n'), x.font));
      iy += Math.max(12, x.lines.length * LINE_H) + 2;
    }
    y += infoH + 6;
    // ---- the offers by section
    for (const sec of SECTIONS) {
      const list = v.offers.filter((o) => o.slot === sec);
      if (!list.length) continue;
      const title = sec === 'region' ? t(`merchant.region.${v.region}` as TKey) : t(`merchant.sec.${sec}` as TKey);
      c.add(new SectionTitle(this, 0, y, w, title, { size: 8 }));
      y += SectionTitle_H;
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
    const rowH = 30 + desc.lines.length * LINE_H + TAP + 4;
    c.add(mosaicImage(this, 0, y, w, rowH, capped0(o) ? 'parchmentWell' : 'parchment'));
    const name = this.offerName(o);
    const subject = consumable ? { consumable: o.ref } : { item: this.preview(o) };
    c.add(
      new ItemIcon(this, 4, y + 4, subject, {
        rarity: o.rarity,
        onTap: consumable ? undefined : () => !area.moved && this.showOffer(o),
      }),
    );
    c.add(addText(this, tx, y + 4, ellipsize(name, w - tx - 4), consumable ? 'pInk' : rarityFont(o.rarity)));
    const capped = o.bought >= o.dailyCap;
    c.add(addText(this, tx, y + 15, ellipsize(t('merchant.today', { n: o.bought, cap: o.dailyCap }), w - tx - 4), capped ? 'pMuted' : 'pGood'));
    c.add(addText(this, tx, y + 27, desc.lines.join('\n'), 'pSec'));
    const by = y + rowH - TAP - 4;
    const prices: [Currency, number | null][] = [
      ['gold', o.price.gold],
      ['drachmae', o.price.drachmae],
    ];
    const shown = prices.filter(([, p]) => p !== null);
    const bw = Math.floor((w - 8 - (shown.length - 1) * SIZE.gap) / Math.max(1, shown.length));
    shown.forEach(([cur, price], i) => {
      const p = price as number;
      const list = cur === 'gold' ? o.gold : o.drachmae;
      const b = new MButton(this, 4 + i * (bw + SIZE.gap), by, bw, TAP, {
        variant: cur === 'gold' ? 'secondary' : 'purchase',
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

/** Sold out for today (its daily cap reached). */
function capped0(o: MerchantOffer): boolean {
  return o.bought >= o.dailyCap;
}
