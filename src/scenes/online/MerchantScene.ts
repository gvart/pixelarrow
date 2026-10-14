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
import { MButton, MChip, SECTION_TITLE_H as SectionTitle_H, SectionTitle, mosaicImage, mtext, TAP, addSubShell } from '../../ui/mosaic';
import { MOSAIC, TEXT_MIN, lineHeight } from '../../ui/tokens';
import { uiLayout } from '../../ui/layout';
import { CONTENT_MAX } from '../../ui/sizeClass';
import { PANE_GUTTER, gridColumns, layoutVariant } from '../../ui/mosaic/layout/geometry';
import { ItemIcon, addScrollHint, confirmDialog, subjectName, toast } from '../../ui/widgets';
import { ellipsize, wrapText, LINE_H } from '../../ui/textfit';
import { SIZE } from '../../ui/theme';
import { ensureFonts, rarityFont } from '../../ui/fonts';
import { frameScrollTexts, openItemCard } from '../../ui/sheet';
import { addEconState, currencyIcon, ensureEconIcons, priceText } from '../../ui/econ/widgets';
import { econState, type EconState } from '../../game/economy';
import { isApiError, newRequestId, type Currency } from '../../platform/api';
import { errorText, onlineApi, type MerchantBuyResult, type MerchantOffer, type MerchantView } from '../../online/client';
import { demoShard } from '../../online/demoShard';
import { capKey } from '../../online/merchants';
import { CONSUMABLES, type ConsumableId } from '../../data/consumables';
import { ITEMS, type Item } from '../../data/items';
import { hapticNotify } from '../../platform/haptics';
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

/** Line pitch of 6.5 UI px text (TEXT_MIN, A11Y-09). */
const LH = Math.ceil(lineHeight(TEXT_MIN));

type Section = MerchantOffer['slot'];
const SECTIONS: Section[] = ['base', 'region', 'rare'];

/** The landscape info pane's width (§8.2: info and chips left, offers right). */
const INFO_W_COMPACT = 150;
const INFO_W_EXPANDED = 180;
/** An offer card is at least this wide in the grid (§3.7); up to 3 columns (§8.2). */
const OFFER_MIN = 140;
const OFFER_COLS = 3;

export class MerchantScene extends BaseScene {
  /** Migrated to the size classes (ADR-0013, V6-RSCR-03): two panes in landscape, an offers grid from medium up. */
  protected override readonly responsive = true;
  private loc = 0;
  private src!: Source;
  private view: MerchantView | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private head!: Phaser.GameObjects.Container;
  private page!: Phaser.GameObjects.Container;
  private area: ScrollArea | null = null;
  /** The info pane (landscape): its own scroll area beside the offers. */
  private infoArea: ScrollArea | null = null;
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
    this.infoArea = null;
    this.screen({ back: () => this.leave() });
    uiLayout(this, this.m.cls, this.m.land);
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
    this.infoArea?.destroy();
    this.infoArea = null;
    this.page.removeAll(true);
  }

  /** The frame (title on the plaque, back arrow), war gold and Drachmae chips, then the stock. */
  private render(): void {
    this.head.removeAll(true);
    this.clearPage();
    const v = this.view;
    const H = this.head;
    const { content: c } = addSubShell(this, { title: t(`merchant.title.${v?.kind ?? 'town'}` as TKey), back: () => this.leave(), id: 'merchant.header', parent: H, scroll: false });
    const variant = layoutVariant(this.m);
    const ready = this.st === 'ready' && !!v;
    // landscape with the stock in: the chips head the info pane (§8.2); else the row over the page, as v5
    const split = ready && (variant === 'compactLandscape' || variant === 'expanded');
    if (!split) this.addChips(H, c.x + 3, c.y + 3, c.w - 6);
    const top = c.y + 3 + TAP + 3;
    if (!ready) {
      const s = this.st === 'ready' ? 'error' : this.st;
      // the state card fills the content (centred in it, never a stretched column, §15)
      addEconState(this, this.page, c.x + 3, top + 2, c.w - 6, c.y + c.h - top - 6, s, () => ((this.st = 'loading'), this.render(), void this.fetch()));
      return;
    }
    if (split) this.buildSplit(v!, c);
    else this.buildStock(v!, top, c, variant === 'medium' ? 2 : 1);
  }

  /** Gold and Drachmae chips from (x, y): one row when both fit `w`, else one under the other. Returns the height. */
  private addChips(H: Phaser.GameObjects.Container, x: number, y: number, w: number): number {
    const v = this.view;
    const chips: { icon: string; value: string | number; id: string }[] = [
      { icon: 'wargold', value: v?.gold ?? '-', id: 'merchant.gold' },
      { icon: currencyIcon('drachmae'), value: v?.drachmae ?? '-', id: 'merchant.drachmae' },
    ];
    const ws = chips.map((o) => Math.max(40, MChip.width({ ...o, surface: 'stone' }) + 8));
    const row = ws[0] + 3 + ws[1] <= w;
    let cx = x;
    let cy = y;
    chips.forEach((o, i) => {
      const chip = new MChip(this, cx, cy, { ...o, surface: 'stone', w: ws[i] });
      H.add(chip);
      if (row) cx += chip.w + 3;
      else cy += TAP + 3;
    });
    return row ? TAP : cy - y - 3;
  }

  /**
   * Landscape (§8.2): two panes, each scrolling on its own: the chips and the info card on the left, the
   * offers grid on the right (up to 3 columns, §3.7). The panes span at most CONTENT_MAX, centred (§2.3).
   */
  private buildSplit(v: MerchantView, c: { x: number; y: number; w: number; h: number }): void {
    const { S } = this.m;
    const iw = Math.min(c.w - 6, CONTENT_MAX);
    const x0 = c.x + 3 + Math.floor((c.w - 6 - iw) / 2);
    const lw = this.m.cls === 'expanded' ? INFO_W_EXPANDED : INFO_W_COMPACT;
    const top = c.y + 3;
    const h = c.y + c.h - 3 - top;
    // ---- left: the chips, then who, where and on what terms
    const left = new ScrollArea(this, this.page, x0, top, lw, h, S);
    this.infoArea = left;
    addScrollHint(this, this.page, left, MOSAIC.parch);
    let y = this.addChips(left.content, 0, 0, lw - 4) + 4;
    y += this.infoCard(left.content, v, y, lw - 4);
    left.setContentHeight(y + 2);
    frameScrollTexts(left, lw);
    // ---- right: the offers
    const rx = x0 + lw + PANE_GUTTER;
    const rw = x0 + iw - rx;
    const area = new ScrollArea(this, this.page, rx, top, rw, h, S);
    this.area = area;
    addScrollHint(this, this.page, area, MOSAIC.parch);
    const end = this.offerSections(area.content, area, v, 0, rw - 4, gridColumns(rw - 4, { minCell: OFFER_MIN, maxCols: OFFER_COLS, gap: SIZE.gap }));
    area.setContentHeight(end);
    frameScrollTexts(area, rw);
  }

  /** v5's page (`cols` 1), or medium's offers grid in 2 columns under the info card (§8.2). */
  private buildStock(v: MerchantView, top: number, box: { x: number; y: number; w: number; h: number }, cols: number): void {
    const { VW, S } = this.m;
    const areaW = box.w - 6;
    const area = new ScrollArea(this, this.page, box.x + 3, top, areaW, box.y + box.h - top - 3, S);
    this.area = area;
    addScrollHint(this, this.page, area, MOSAIC.parch);
    const c = area.content;
    const w = areaW - 4;
    let y = this.infoCard(c, v, 0, w) + 6;
    y = this.offerSections(c, area, v, y, w, cols);
    area.setContentHeight(y);
    frameScrollTexts(area, VW - 8);
  }

  /** Who, where, and on what terms: one line each, with its sign. Returns the card's height. */
  private infoCard(c: Phaser.GameObjects.Container, v: MerchantView, y: number, w: number): number {
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
    return infoH;
  }

  /** The offers by section from `y`, `cols` cards a row (one card a row is v5's list). Returns the y below. */
  private offerSections(c: Phaser.GameObjects.Container, area: ScrollArea, v: MerchantView, y: number, w: number, cols: number): number {
    const cw = Math.floor((w - SIZE.gap * (cols - 1)) / cols);
    for (const sec of SECTIONS) {
      const list = v.offers.filter((o) => o.slot === sec);
      if (!list.length) continue;
      const title = sec === 'region' ? t(`merchant.region.${v.region}` as TKey) : t(`merchant.sec.${sec}` as TKey);
      c.add(new SectionTitle(this, 0, y, w, title, { size: 8 }));
      y += SectionTitle_H;
      // a row of cards is as tall as its tallest (the buy buttons line up)
      for (let i = 0; i < list.length; i += cols) {
        const line = list.slice(i, i + cols);
        const rowH = Math.max(...line.map((o) => this.offerH(o, cw)));
        line.forEach((o, j) => this.offerRow(c, area, v, o, y, cw, j * (cw + SIZE.gap), rowH));
        y += rowH + SIZE.gap;
      }
      y += 4;
    }
    return y;
  }

  private offerName(o: MerchantOffer): string {
    return o.kind === 'consumable' ? tOr(`consumable.${o.ref}.name`, CONSUMABLES[o.ref as ConsumableId]?.name ?? o.ref) : subjectName({ item: this.preview(o) });
  }

  private preview(o: MerchantOffer): Item {
    return { uid: `offer_${o.id}`, def: o.ref, rarity: o.rarity, cond: 100 };
  }

  /** An offer's description text. */
  private offerDesc(o: MerchantOffer): string {
    const def = o.kind === 'consumable' ? null : ITEMS[o.ref];
    return o.kind === 'consumable' ? tOr(`consumable.${o.ref}.desc`, CONSUMABLES[o.ref as ConsumableId]?.desc ?? '') : `${tOr(`rarity.${o.rarity}`, o.rarity)} · ${tOr(`slot.${def?.slot}`, def?.slot ?? '')} · ${tOr(`item.${o.ref}.desc`, def?.desc ?? '')}`;
  }

  /** The prices shown (gold, Drachmae where sold for them) and whether a list price is struck through. */
  private offerPrices(o: MerchantOffer): { shown: [Currency, number | null][]; struck: boolean } {
    const prices: [Currency, number | null][] = [
      ['gold', o.price.gold],
      ['drachmae', o.price.drachmae],
    ];
    const shown = prices.filter(([, p]) => p !== null);
    const listOf = (cur: Currency) => (cur === 'gold' ? o.gold : o.drachmae);
    return { shown, struck: shown.some(([cur, p]) => listOf(cur) !== null && listOf(cur) !== p) };
  }

  /** An offer card's natural height at width `w`. */
  private offerH(o: MerchantOffer, w: number): number {
    const desc = wrapText(this.offerDesc(o), w - 32 - 4, 2);
    return 30 + desc.lines.length * LINE_H + (this.offerPrices(o).struck ? LH : 0) + TAP + 4 + (o.bought >= o.dailyCap ? LH + 2 : 0);
  }

  /** One offer: icon, name, today's count, a line of description, the buy buttons; at `x0`, at least `minH` tall. Returns its height. */
  private offerRow(c0: Phaser.GameObjects.Container, area: ScrollArea, v: MerchantView, o: MerchantOffer, y: number, w: number, x0 = 0, minH = 0): number {
    // a card in a grid column draws in its own container at its column (v5: the one column at 0)
    const c = x0 ? this.add.container(x0, 0) : c0;
    if (c !== c0) c0.add(c);
    const consumable = o.kind === 'consumable';
    const descText = this.offerDesc(o);
    const tx = 32;
    const desc = wrapText(descText, w - tx - 4, 2);
    const capped = o.bought >= o.dailyCap;
    const listOf = (cur: Currency) => (cur === 'gold' ? o.gold : o.drachmae);
    // the discount is said once, in the info card; here the list price is struck through over its button (MER-1)
    const { shown } = this.offerPrices(o);
    // a capped row says why under its buttons (MER-2)
    const reasonH = capped ? LH + 2 : 0;
    const rowH = Math.max(minH, this.offerH(o, w));
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
    c.add(addText(this, tx, y + 15, ellipsize(t('merchant.today', { n: o.bought, cap: o.dailyCap }), w - tx - 4), capped ? 'pMuted' : 'pGood'));
    c.add(addText(this, tx, y + 27, desc.lines.join('\n'), 'pSec'));
    const by = y + rowH - TAP - 4 - reasonH;
    const bw = Math.floor((w - 8 - (shown.length - 1) * SIZE.gap) / Math.max(1, shown.length));
    shown.forEach(([cur, price], i) => {
      const p = price as number;
      const list = listOf(cur);
      const bx = 4 + i * (bw + SIZE.gap);
      if (list !== null && list !== p) {
        const lt = mtext(this, bx + bw / 2, by - LH, `${list}`, 'pMuted', { size: TEXT_MIN, align: 0.5 });
        const strike = this.add.graphics();
        strike.lineStyle(0.8, MOSAIC.inkMuted, 1);
        // through the middle of the digits (the text box also holds the line gap under them)
        const sy = by - LH + Math.round(TEXT_MIN * 0.5 * 10) / 10;
        strike.lineBetween(lt.x - lt.width / 2 - 1, sy, lt.x + lt.width / 2 + 1, sy);
        c.add([lt, strike]);
      }
      const b = new MButton(this, bx, by, bw, TAP, {
        variant: cur === 'gold' ? 'secondary' : 'purchase',
        label: `${p}`,
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
    if (capped) c.add(mtext(this, w / 2, by + TAP + 3, t('econ.dailyCap'), 'pSec', { size: TEXT_MIN, align: 0.5, maxW: w - 8 }));
    return rowH;
  }

  /** The item card of a piece of gear on offer (stats; gold only). */
  showOffer(o: MerchantOffer): void {
    const m = openItemCard(this, { item: this.preview(o), notes: [{ text: t('merchant.gearTip'), font: 'pMuted' }], actions: [{ label: t('common.close'), onClick: () => m.close(), id: 'merchant.cardClose' }] });
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
                  ? errorText(e)
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
