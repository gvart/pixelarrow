import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addIcon, addPanel, addText, type FontKey } from '../ui/kit';
import { Grid, ItemIcon, ScrollList, addEmptyState, confirmDialog, openModal, showTooltip, subjectName, toast, type IconSubject } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { MOSAIC } from '../ui/tokens';
import { makePressable } from '../ui/mosaic/base';
import { SIZE } from '../ui/theme';
import { ensureFonts, rarityFont } from '../ui/fonts';
import { GAP, MButton, MChip, SWITCH_H, SegmentedSwitch, TAP, ScreenFrame, TopBar, mosaicImage, mtext, mw, parchRarityFont, type Box } from '../ui/mosaic';
import { bigItemIcon, itemName, openItemCard } from '../ui/sheet';
import { econ, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { addEconState, currencyIcon, ensureEconIcons, priceText } from '../ui/econ/widgets';
import {
  clampPrice, canAfford, econState, listingAction, marketFee, priceBounds, priceStep, sellerGets, suggestPrice, timeLeft, type EconState,
} from '../game/economy';
import { cycle } from '../game/gear';
import { isApiError, type Currency, type EconomyCatalog, type MarketListing, type MarketQuery, type WalletInfo } from '../platform/api';
import type { ProfileView } from '../online/client';
import { ITEM_LIST, isBound, itemValue, normalizeItem, type Item } from '../data/items';
import { CONSUMABLES, CONSUMABLE_IDS, type ConsumableId } from '../data/consumables';
import { hapticNotify } from '../platform/telegram';
import { uiCoin } from '../audio/hooks';
import { state } from '../state';
import { t, tOr, type TKey } from '../i18n';

const FILTER_H = 24;
/** Width of an icon and its gap in a button. */
const ICON_W = 15;
type Tab = 'browse' | 'mine' | 'sell';
const TABS: Tab[] = ['browse', 'mine', 'sell'];
type KindF = 'all' | MarketListing['kind'];
const KINDS: KindF[] = ['all', 'item', 'resource', 'consumable'];
type CurF = 'all' | Currency;
const CURS: CurF[] = ['all', 'gold', 'drachmae'];
type SortF = NonNullable<MarketQuery['sort']>;
const SORTS: SortF[] = ['newest', 'price_asc', 'price_desc', 'ending'];
const RESOURCES = ['food', 'wood', 'bronze'] as const;
const RES_VALUE: Record<string, number> = { food: 1, wood: 1, bronze: 3 };

interface MarketData {
  tab?: Tab;
  demo?: boolean;
  back?: { scene: string; data?: Record<string, unknown> };
}

interface Base {
  cat: EconomyCatalog;
  wallet: WalletInfo;
  profile: ProfileView | null;
  cons: ConsumableInfo | null;
}

/** What can be listed: a stash item, a resource or a consumable. */
type Sellable = { kind: 'item'; item: Item } | { kind: 'resource'; id: string; have: number } | { kind: 'consumable'; id: ConsumableId; have: number };

/**
 * The town marketplace of the shard (server/README.md "Town marketplace"):
 * browse listings (filter by kind, currency, one item; sort; pages), your
 * listings (withdraw), and selling from the stash, resources and supplies in
 * gold or Drachmae with the 10% fee shown before listing.
 */
export class MarketScene extends BaseScene {
  private tab: Tab = 'browse';
  private base: Base | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private head!: Phaser.GameObjects.Container;
  private page!: Phaser.GameObjects.Container;
  private areas: { destroy(): void }[] = [];
  private backTo: MarketData['back'];
  private q: { kind: KindF; cur: CurF; sort: SortF; ref: string | null } = { kind: 'all', cur: 'all', sort: 'newest', ref: null };
  private listings: MarketListing[] = [];
  private next: number | null = null;
  private listLoaded = false;
  private mine: { listings: MarketListing[]; open: number; maxOpen: number } | null = null;
  private towns: { loc: number; name: string }[] | null = null;
  private busy = false;
  private pageTop = 0;
  /** The framed content area (inside the stone band, under the top bar). */
  private box!: Box;
  private gen = 0;

  constructor() {
    super('Market');
  }

  create(data: MarketData): void {
    this.initUi();
    ensureFonts(this);
    ensureEconIcons(this);
    setEconSource(data?.demo ? new DemoEconSource({ heroes: state.campaign.data.heroes.slice(0, 5), stash: state.campaign.data.stash }) : null);
    this.tab = data?.tab && TABS.includes(data.tab) ? data.tab : 'browse';
    this.backTo = data?.back;
    this.base = null;
    this.st = 'loading';
    this.listings = [];
    this.next = null;
    this.listLoaded = false;
    this.mine = null;
    this.towns = null;
    this.areas = [];
    this.busy = false;
    this.screen({ back: () => this.leave() });
    const { VW, VH } = this.m;
    // a sub-screen of the Shop: the framed page, a back arrow, no tab bar
    const frame = new ScreenFrame(this, VW, VH);
    this.ui.add(frame);
    this.ui.add(new TopBar(this, frame.topBar, { title: t('market.title'), id: 'market.topbar', back: this.inGameBack ? () => this.leave() : undefined }));
    this.box = frame.content;
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    this.ui.add([this.head, this.page]);
    this.events.once('shutdown', () => this.clearPage());
    this.render();
    void this.fetchAll();
  }

  private leave(): void {
    const b = this.backTo;
    this.scene.start(b?.scene ?? 'Online', b?.data ?? {});
  }

  async fetchAll(): Promise<void> {
    const gen = ++this.gen;
    this.st = 'loading';
    this.render();
    const src = econ();
    try {
      if (!src.available()) throw Object.assign(new Error('outside'), { code: 'outside' });
      const cat = await src.catalog();
      const [wallet, profile, cons] = await Promise.all([
        src.wallet(),
        src.profile().catch(() => null),
        src.consumables().catch((e) => (isApiError(e) && !e.offline ? null : Promise.reject(e))),
      ]);
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.base = { cat, wallet, profile, cons };
      this.st = 'ready';
      await this.loadTab();
    } catch (e) {
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.st = (e as { code?: string })?.code === 'outside' ? 'outside' : econState(e, src.available());
    }
    this.render();
  }

  private async loadTab(): Promise<void> {
    const src = econ();
    if (this.tab === 'browse' && !this.listLoaded) await this.search(false);
    if (this.tab === 'mine' && !this.mine) this.mine = await src.marketMine();
    if (this.tab === 'sell' && !this.towns) this.towns = (await src.marketTowns().catch(() => ({ towns: [] }))).towns;
  }

  private query(cursor?: number): MarketQuery {
    return {
      kind: this.q.kind === 'all' ? undefined : this.q.kind,
      currency: this.q.cur === 'all' ? undefined : this.q.cur,
      ref: this.q.ref ?? undefined,
      sort: this.q.sort,
      cursor,
      limit: 20,
    };
  }

  private async search(more: boolean): Promise<void> {
    const r = await econ().marketSearch(this.query(more ? this.next ?? undefined : undefined));
    this.listings = more ? [...this.listings, ...r.listings] : r.listings;
    this.next = r.next;
    this.listLoaded = true;
  }

  private async refreshTab(): Promise<void> {
    try {
      await this.loadTab();
    } catch (e) {
      this.fail(e);
    }
    if (this.sys.isActive()) this.render();
  }

  // ------------------------------------------------------------------ frame

  private render(): void {
    this.head.removeAll(true);
    const H = this.head;
    const { x, y: by, w: bw } = this.box;
    const x0 = x + 4;
    const w = bw - 8;
    let y = by + 4;
    // the purse: war gold (when known) and Drachmae; a tap says what each is for
    const b = this.base;
    const purse: { icon: string; value: string }[] = [];
    if (b?.profile) purse.push({ icon: 'wargold', value: `${b.profile.resources.gold}` });
    purse.push({ icon: 'drachma', value: b ? `${b.wallet.drachmae}` : '-' });
    let cx = x0;
    purse.forEach((p, i) => {
      const chip: MChip = new MChip(this, cx, y, { icon: p.icon, value: p.value, onClick: () => showTooltip(this, t('econ.purseTip'), chip), tip: t('econ.purseTip'), id: i === 0 && purse.length > 1 ? 'market.purse.gold' : 'market.purse' });
      H.add(chip);
      cx += chip.w + GAP;
    });
    y += TAP + 3;
    const sw = new SegmentedSwitch(this, x0, y, w, {
      options: TABS.map((k) => ({ id: k, label: t(`market.tab.${k}` as TKey), icon: w >= 156 ? (k === 'browse' ? 'eye' : k === 'mine' ? 'flag' : 'amphora') : undefined })),
      selected: this.tab,
      id: 'market.tab',
      onChange: (id) => {
        this.tab = id as Tab;
        this.render();
        if (this.st === 'ready') void this.refreshTab();
      },
    });
    H.add(sw);
    this.pageTop = y + SWITCH_H + 4;
    this.buildPage();
  }

  /** Bottom edge of the page. */
  private pageBottom(): number {
    return this.box.y + this.box.h - 3;
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.page.removeAll(true);
  }

  private buildPage(): void {
    this.clearPage();
    const top = this.pageTop;
    if (this.st !== 'ready' || !this.base) {
      addEconState(this, this.page, this.box.x + 4, top, this.box.w - 8, this.pageBottom() - top, this.st as EconState | 'loading', () => void this.fetchAll());
      return;
    }
    if (this.tab === 'browse') this.buildBrowse(this.base);
    else if (this.tab === 'mine') this.buildMine(this.base);
    else this.buildSell(this.base);
  }

  // ------------------------------------------------------------------ browse

  private buildBrowse(b: Base): void {
    const w = this.box.w - 8;
    const x0 = this.box.x + 4;
    let y = this.pageTop;
    const n = 3;
    const bw = Math.floor((w - (n - 1) * SIZE.gap) / n);
    const set = (patch: Partial<typeof this.q>) => {
      Object.assign(this.q, patch);
      this.listLoaded = false;
      this.listings = [];
      this.render();
      void this.refreshTab();
    };
    this.page.add(new MButton(this, x0, y, bw, FILTER_H, { variant: 'secondary', label: t(`market.kind.${this.q.kind}` as TKey), id: 'market.kind', tip: t('market.kindTip'), onClick: () => set({ kind: cycle(KINDS, this.q.kind) }) }));
    this.page.add(new MButton(this, x0 + bw + GAP, y, bw, FILTER_H, { variant: 'secondary', label: this.q.cur === 'all' ? t('market.cur.all') : t(`market.cur.${this.q.cur}` as TKey), icon: this.q.cur === 'all' ? undefined : currencyIcon(this.q.cur), id: 'market.cur', tip: t('market.curTip'), onClick: () => set({ cur: cycle(CURS, this.q.cur) }) }));
    this.page.add(new MButton(this, x0 + 2 * (bw + GAP), y, w - 2 * (bw + GAP), FILTER_H, { variant: 'secondary', label: t(`market.sort.${this.q.sort}` as TKey), id: 'market.sort', tip: t('market.sortTip'), onClick: () => set({ sort: cycle(SORTS, this.q.sort) }) }));
    y += FILTER_H + GAP;
    const refName = this.q.ref ? this.refLabel(this.q.ref) : t('market.anyItem');
    const findW = this.q.ref ? w - FILTER_H - GAP : w;
    this.page.add(new MButton(this, x0, y, findW, FILTER_H, { variant: 'secondary', label: this.q.ref ? refName : t('market.find'), icon: 'eye', id: 'market.find', tip: t('market.findTip'), onClick: () => this.openFind((ref) => set({ ref })) }));
    if (this.q.ref) this.page.add(this.clearButton(x0 + findW + GAP, y, () => set({ ref: null }), 'market.clearRef'));
    y += FILTER_H + GAP;
    const h = this.pageBottom() - y;
    if (!this.listLoaded) {
      addEconState(this, this.page, x0, y, w, h, 'loading', () => {});
      return;
    }
    if (!this.listings.length) {
      this.page.add(mosaicImage(this, x0, y, w, h, 'parchment'));
      this.page.add(addEmptyState(this, x0 + 2, y + 2, w - 4, h - 4, { icon: 'coin', title: t('market.empty'), hint: t('market.emptyHint'), action: { label: t('market.tab.sell'), icon: 'coin', onClick: () => ((this.tab = 'sell'), this.render(), void this.refreshTab()) } }));
      return;
    }
    const rows = this.listings.length + (this.next !== null ? 1 : 0);
    const list = new ScrollList(this, this.page, x0, y, w, h, {
      count: rows,
      rowH: 32,
      fade: MOSAIC.parch,
      render: (i, row, rw, rh, area) => {
        if (i === this.listings.length) {
          row.add(new MButton(this, 0, 4, rw, FILTER_H, { variant: 'secondary', label: t('market.more'), icon: 'plus', id: 'market.more', onClick: () => void this.more() }));
          return;
        }
        this.listingRow(b, this.listings[i], row, rw, rh, area);
      },
    });
    this.areas.push(list);
  }

  private async more(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const s = (this.areas[0] as ScrollList | undefined)?.area.scrollY ?? 0;
      await this.search(true);
      if (!this.sys.isActive()) return;
      this.render();
      (this.areas[0] as ScrollList | undefined)?.area.setScroll(s);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }

  private subject(l: MarketListing): IconSubject {
    if (l.kind === 'item' && l.item) return { item: normalizeItem(l.item as unknown as Item) };
    if (l.kind === 'consumable') return { consumable: l.ref };
    return { resource: l.ref };
  }

  private listingName(l: MarketListing): string {
    const s = this.subject(l);
    return 'item' in s ? itemName(s.item) : subjectName(s);
  }

  private listingRow(b: Base, l: MarketListing, row: Phaser.GameObjects.Container, rw: number, rh: number, area: import('../ui/kit').ScrollArea): void {
    const now = Date.now();
    row.add(mosaicImage(this, 0, 0, rw, rh, l.mine ? 'parchmentWell' : 'parchment'));
    row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), this.subject(l), { size: 24, area, qty: l.qty, rarity: l.kind === 'item' ? undefined : 'common', onTap: () => this.openListing(b, l) }));
    const can = canAfford(l, { gold: b.profile?.resources.gold ?? null, drachmae: b.wallet.drachmae });
    const act = listingAction(l, now);
    const bw = Math.min(56, Math.max(40, mw(`${l.price}`, 'rCream', 7) + ICON_W + 14));
    const pb = new MButton(this, rw - bw - 3, Math.round((rh - 24) / 2), bw, 24, { label: `${l.price}`, icon: currencyIcon(l.currency), variant: 'secondary', id: 'market.price', onClick: () => this.openListing(b, l) });
    if (act === 'buy' && !can) pb.setEnabled(false, t('econ.noFunds'));
    row.add(pb);
    const tx = 33;
    const tw = rw - tx - bw - 8;
    const font = l.kind === 'item' ? parchRarityFont(this, l.rarity) : 'pInk';
    const box = { owner: row, w: rw, h: rh };
    row.add(mtext(this, tx, 5, `${l.qty > 1 ? `${l.qty}x ` : ''}${this.listingName(l)}`, font, { maxW: tw, box }));
    const left = timeLeft(l.expiresAt, now);
    const sub = `${l.seller.name ?? '?'} · ${left.ms ? left.text : t('market.expired')}`;
    row.add(mtext(this, tx, 17, sub, 'pSec', { size: 6, maxW: tw, box }));
  }

  /** A small square "x" button (clears the item filter, withdraws a listing). */
  private clearButton(x: number, y: number, onClick: () => void, id: string, label = t('market.anyItem')): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const face = this.add.container(FILTER_H / 2, FILTER_H / 2);
    c.add(face);
    face.add(mosaicImage(this, 0, 0, FILTER_H, FILTER_H, 'btnBronze').setPosition(-FILTER_H / 2, -FILTER_H / 2));
    face.add(addIcon(this, -6, -7, 'close', 'L'));
    makePressable(c, { face, w: FILTER_H, h: FILTER_H, onTap: onClick, tip: label });
    uiId(c, id);
    return c;
  }

  openListing(b: Base, l: MarketListing): void {
    const now = Date.now();
    const act = listingAction(l, now);
    const s = this.subject(l);
    const left = timeLeft(l.expiresAt, now);
    const notes = [
      { text: `${priceText(l.price, l.currency)} · ${t('market.by', { name: l.seller.name ?? '?' })}`, font: 'red' as const },
      { text: `${t('market.town', { name: l.town.name })} · ${left.ms ? t('market.left', { t: left.text }) : t('market.expired')}` },
      { text: t('market.feeNote', { gets: sellerGets(l.price, b.cat.market.feeRate), fee: marketFee(l.price, b.cat.market.feeRate) }) },
    ];
    const can = canAfford(l, { gold: b.profile?.resources.gold ?? null, drachmae: b.wallet.drachmae });
    const actions =
      act === 'buy'
        ? [{ label: `${l.price}`, icon: currencyIcon(l.currency), variant: 'primary' as const, id: 'market.buy', disabled: can ? undefined : l.currency === 'gold' && !b.profile ? t('econ.noProfile') : t('econ.noFunds'), onClick: () => this.askBuy(b, l) }]
        : act === 'cancel'
          ? [{ label: t('market.cancel'), icon: 'close', variant: 'destructive' as const, id: 'market.cancel', onClick: () => this.askCancel(l) }]
          : [];
    if ('item' in s) {
      openItemCard(this, { item: s.item, hero: b.profile?.heroes[0]?.hero, title: this.listingName(l), notes, actions });
      return;
    }
    this.goodsCard(s, l.qty, this.listingName(l), notes, actions);
  }

  /** A card for goods (resources, consumables): icon, name, description, notes, actions. */
  private goodsCard(s: IconSubject, qty: number, name: string, notes: { text: string; font?: 'red' | 'dim' }[], actions: { label: string; icon?: string; variant?: 'primary' | 'secondary' | 'destructive'; id?: string; disabled?: string; onClick: () => void }[]): void {
    const { VW } = this.m;
    const w = Math.min(VW - 12, 200);
    const inner = w - 16;
    // the description gets the lines the screen has left (openModal caps the card at VH - 16)
    // the button row is always there (Close, and the action beside it when there is one)
    const base = 26 + 30 + notes.length * LINE_H + 8 + SIZE.btnH + 8 + 6;
    const descMax = Math.max(0, Math.min(3, Math.floor((this.m.VH - 16 - base - 2) / LINE_H)));
    const desc = 'consumable' in s && descMax > 0 ? wrapText(tOr(`consumable.${s.consumable}.desc`, CONSUMABLES[s.consumable as ConsumableId]?.desc ?? ''), inner - 4, descMax) : { lines: [] as string[] };
    const h = base + desc.lines.length * LINE_H + (desc.lines.length ? 2 : 0);
    const m = openModal(this, { title: name, w, h });
    const { c, x, y } = m;
    c.add(new ItemIcon(this, x + 8, y + 24, s, { size: 26, qty, tip: false }));
    c.add(addText(this, x + 40, y + 31, ellipsize(`${qty}x ${name}`, inner - 34), 'ink'));
    let cy = y + 56;
    if (desc.lines.length) {
      c.add(addText(this, x + 8, cy, desc.lines.join('\n'), 'ink'));
      cy += desc.lines.length * LINE_H + 2;
    }
    for (const n of notes) {
      c.add(addText(this, x + 8, cy, ellipsize(n.text, inner), n.font ?? 'dim'));
      cy += LINE_H;
    }
    const by = m.y + m.h - 8 - SIZE.btnH;
    const bw = Math.floor((inner - SIZE.gap) / 2);
    c.add(new Button(this, x + 8, by, actions.length ? bw : inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
    for (const a of actions.slice(0, 1)) {
      const btn = new Button(this, x + 8 + bw + SIZE.gap, by, inner - bw - SIZE.gap, SIZE.btnH, { label: a.label, icon: a.icon, variant: a.variant ?? 'primary', id: a.id, onClick: () => (m.close(), a.onClick()) });
      if (a.disabled) btn.setEnabled(false, a.disabled);
      c.add(btn);
    }
  }

  private askBuy(b: Base, l: MarketListing): void {
    const name = this.listingName(l);
    confirmDialog(this, {
      title: t('market.buyTitle', { name }),
      body: t('market.buyBody', { price: priceText(l.price, l.currency), gets: sellerGets(l.price, b.cat.market.feeRate) }),
      ok: `${l.price}`,
      okIcon: currencyIcon(l.currency),
      cancel: t('common.cancel'),
      onOk: () => void this.buy(l),
    });
  }

  async buy(l: MarketListing): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      await econ().marketBuy(l.id);
      if (!this.sys.isActive()) return true;
      hapticNotify('success');
      uiCoin();
      toast(this, t('market.boughtToast', { name: this.listingName(l) }), 'good');
      this.listLoaded = false;
      await this.fetchAll();
      return true;
    } catch (e) {
      this.fail(e);
      if (isApiError(e) && (e.code === 'sold' || e.code === 'gone' || e.status === 410)) {
        this.listLoaded = false;
        void this.refreshTab();
      }
      return false;
    } finally {
      this.busy = false;
    }
  }

  private fail(e: unknown): void {
    if (!this.sys.isActive()) return;
    hapticNotify('error');
    const code = isApiError(e) ? e.code : '';
    const msg: Record<string, string> = {
      insufficient_funds: t('econ.noFunds'),
      cannot_afford: t('econ.noFunds'),
      sold: t('market.sold'),
      gone: t('market.gone'),
      expired: t('market.expired'),
      self_buy: t('market.selfBuy'),
      listing_cap: t('market.cap', { n: this.base?.cat.market.maxOpenListings ?? 20 }),
      town_unreachable: t('market.noTown'),
      no_profile: t('econ.noProfile'),
    };
    toast(this, msg[code] ?? (isApiError(e) && e.offline ? t('econ.offline') : t('econ.error')), 'bad');
  }

  // ------------------------------------------------------------------ the item finder

  private refLabel(ref: string): string {
    const def = ITEM_LIST.find((d) => d.id === ref);
    if (def) return tOr(`item.${def.id}.name`, def.name);
    if ((CONSUMABLE_IDS as string[]).includes(ref)) return subjectName({ consumable: ref });
    return subjectName({ resource: ref });
  }

  /** Pick one item, resource or consumable to look for (the server's `ref` filter). */
  private openFind(onPick: (ref: string) => void): void {
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 210);
    const m = openModal(this, { title: t('market.findTitle'), w, h: VH - 24 });
    const subjects: { s: IconSubject; ref: string }[] = [
      ...RESOURCES.map((r) => ({ s: { resource: r } as IconSubject, ref: r })),
      ...CONSUMABLE_IDS.map((id) => ({ s: { consumable: id } as IconSubject, ref: id })),
      ...ITEM_LIST.filter((d) => !d.bound).map((d) => ({ s: { item: { uid: `f_${d.id}`, def: d.id, rarity: 'common' as const, cond: 100 } } as IconSubject, ref: d.id })),
    ];
    const by = m.y + m.h - 8 - SIZE.btnH;
    const grid = new Grid(this, m.c, m.body.x, m.body.y, m.body.w, by - 4 - m.body.y, {
      count: subjects.length,
      cell: 26,
      render: (i, cc, size, area) => {
        const sj = subjects[i];
        cc.add(new ItemIcon(this, 0, 0, sj.s, { size, area, glow: false, tip: this.refLabel(sj.ref), onTap: () => (m.close(), onPick(sj.ref)) }));
      },
    });
    m.c.once('destroy', () => grid.destroy());
    m.c.add(new Button(this, m.body.x, by, m.body.w, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ my listings

  private buildMine(b: Base): void {
    const w = this.box.w - 8;
    const x0 = this.box.x + 4;
    const top = this.pageTop;
    const mine = this.mine;
    if (!mine) {
      addEconState(this, this.page, x0, top, w, this.pageBottom() - top, 'loading', () => {});
      return;
    }
    this.page.add(mtext(this, x0 + w / 2, top + 1, t('market.mineHead', { n: mine.open, max: mine.maxOpen }), 'rInk', { size: 7, align: 0.5, maxW: w }));
    const y = top + 14;
    const h = this.pageBottom() - y;
    if (!mine.listings.length) {
      this.page.add(mosaicImage(this, x0, y, w, h, 'parchment'));
      this.page.add(addEmptyState(this, x0 + 2, y + 2, w - 4, h - 4, { icon: 'flag', title: t('market.mineEmpty'), hint: t('market.mineEmptyHint'), action: { label: t('market.tab.sell'), icon: 'coin', onClick: () => ((this.tab = 'sell'), this.render(), void this.refreshTab()) } }));
      return;
    }
    const now = Date.now();
    const list = new ScrollList(this, this.page, x0, y, w, h, {
      count: mine.listings.length,
      rowH: 32,
      fade: MOSAIC.parch,
      render: (i, row, rw, rh, area) => {
        const l = mine.listings[i];
        const status = l.status === 'open' && l.expiresAt <= now ? 'expired' : l.status;
        row.add(mosaicImage(this, 0, 0, rw, rh, status === 'open' ? 'parchment' : 'parchmentWell'));
        row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), this.subject(l), { size: 24, area, qty: l.qty, onTap: () => this.openListing(b, l) }));
        const statusFont: Record<string, FontKey> = { open: 'pGood', sold: 'pInk', cancelled: 'pOff', expired: 'pBad' };
        const tx = 33;
        const act = listingAction(l, now);
        const box = { owner: row, w: rw, h: rh };
        const bw = act === 'cancel' ? FILTER_H : 0;
        if (act === 'cancel') row.add(this.clearButton(rw - bw - 3, Math.round((rh - FILTER_H) / 2), () => this.askCancel(l), 'market.cancelRow', t('market.cancel')));
        const right = rw - bw - (bw ? 7 : 4);
        const stT = t(`market.status.${status}` as TKey);
        const stW = Math.min(60, mw(stT, statusFont[status] ?? 'pOff', 6));
        row.add(mtext(this, right, 6, stT, statusFont[status] ?? 'pOff', { size: 6, align: 1, maxW: 60, box }));
        row.add(mtext(this, tx, 5, `${l.qty > 1 ? `${l.qty}x ` : ''}${this.listingName(l)}`, l.kind === 'item' ? parchRarityFont(this, l.rarity) : 'pInk', { maxW: right - stW - 4 - tx, box }));
        const sub = `${priceText(l.price, l.currency)} · ${t('market.youGet', { n: sellerGets(l.price, b.cat.market.feeRate) })}`;
        row.add(mtext(this, tx, 18, sub, 'pSec', { size: 6, maxW: right - tx, box }));
      },
    });
    this.areas.push(list);
  }

  private askCancel(l: MarketListing): void {
    confirmDialog(this, {
      title: t('market.cancelTitle'),
      body: t('market.cancelBody'),
      ok: t('market.cancel'),
      cancel: t('common.cancel'),
      destructive: true,
      onOk: () => void this.cancelListing(l),
    });
  }

  private async cancelListing(l: MarketListing): Promise<void> {
    try {
      await econ().marketCancel(l.id);
      if (!this.sys.isActive()) return;
      hapticNotify('success');
      toast(this, t('market.cancelled'), 'good');
      this.mine = null;
      this.listLoaded = false;
      await this.fetchAll();
    } catch (e) {
      this.fail(e);
    }
  }

  // ------------------------------------------------------------------ sell

  private sellables(b: Base): Sellable[] {
    const out: Sellable[] = [];
    // bound gear is never traded (it is salvaged from the army screen instead)
    for (const it of b.profile?.stash ?? []) if (!isBound(it)) out.push({ kind: 'item', item: normalizeItem(it) });
    for (const r of RESOURCES) {
      const have = Math.floor(b.profile?.resources[r] ?? 0);
      if (have > 0) out.push({ kind: 'resource', id: r, have });
    }
    for (const id of CONSUMABLE_IDS) {
      const have = b.cons?.inventory[id] ?? 0;
      if (have > 0) out.push({ kind: 'consumable', id, have });
    }
    return out;
  }

  private buildSell(b: Base): void {
    const w = this.box.w - 8;
    const x0 = this.box.x + 4;
    const bottom = this.pageBottom();
    const top = this.pageTop;
    const list = this.sellables(b);
    if (!list.length) {
      this.page.add(mosaicImage(this, x0, top, w, bottom - top, 'parchment'));
      this.page.add(addEmptyState(this, x0 + 2, top + 2, w - 4, bottom - top - 4, { icon: 'coin', title: t('market.sellEmpty'), hint: t('market.sellEmptyHint') }));
      return;
    }
    this.page.add(mtext(this, x0 + w / 2, top + 1, t('market.sellHint'), 'pSec', { size: 6.5, align: 0.5, maxW: w }));
    const y = top + 12;
    this.page.add(mosaicImage(this, x0, y, w, bottom - y, 'parchmentWell'));
    const grid = new Grid(this, this.page, x0 + 3, y + 3, w - 6, bottom - y - 6, {
      count: list.length,
      cell: 28,
      render: (i, cc, size, area) => {
        const s = list[i];
        const subj: IconSubject = s.kind === 'item' ? { item: s.item } : s.kind === 'resource' ? { resource: s.id } : { consumable: s.id };
        cc.add(new ItemIcon(this, 0, 0, subj, { size, area, qty: s.kind === 'item' ? undefined : s.have, tip: false, onTap: () => this.openSellForm(b, s) }));
      },
    });
    this.areas.push(grid);
  }

  /** The listing form: quantity, currency, price with the fee and what you get, the town. */
  openSellForm(b: Base, s: Sellable, init?: { qty: number; currency: Currency; price: number; town: number }): void {
    const { VW, VH } = this.m;
    const towns = this.towns ?? [];
    const rarity = s.kind === 'item' ? s.item.rarity : 'common';
    const have = s.kind === 'item' ? 1 : s.have;
    const maxQty = s.kind === 'consumable' ? Math.min(have, 20) : have;
    let qty = init?.qty ?? (s.kind === 'item' ? 1 : Math.min(maxQty, s.kind === 'resource' ? 50 : 1));
    let currency: Currency = init?.currency ?? 'gold';
    const unitValue = s.kind === 'item' ? itemValue(s.item) : s.kind === 'resource' ? RES_VALUE[s.id] ?? 1 : CONSUMABLES[s.id].gold ?? 50;
    let bounds = priceBounds(b.cat, currency, rarity);
    let price = init?.price ?? suggestPrice(unitValue * qty, currency, bounds);
    let town = init?.town ?? 0;
    const name = s.kind === 'item' ? itemName(s.item) : subjectName(s.kind === 'resource' ? { resource: s.id } : { consumable: s.id });
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowsH = (s.kind === 'item' ? 0 : 1) * (SIZE.btnH + 12) + 3 * (SIZE.btnH + 12) + 34;
    // a form: an outside tap (easy next to the edge steppers) must not drop the price set so far
    const m = openModal(this, { title: t('market.listTitle', { name }), w, h: Math.min(VH - 12, 26 + 30 + rowsH + SIZE.btnH + 14), shadeCloses: false });
    const { c, x } = m;
    let cy = m.y + 24;
    const subj: IconSubject = s.kind === 'item' ? { item: s.item } : s.kind === 'resource' ? { resource: s.id } : { consumable: s.id };
    c.add(s.kind === 'item' ? bigItemIcon(this, x + 8, cy, s.item, 26) : new ItemIcon(this, x + 8, cy, subj, { size: 26, qty: have, tip: false }));
    c.add(addText(this, x + 40, cy + 3, ellipsize(name, inner - 34), s.kind === 'item' ? rarityFont(rarity) : 'ink'));
    c.add(addText(this, x + 40, cy + 14, ellipsize(t('stash.worth', { n: unitValue * qty }), inner - 34), 'dim'));
    cy += 32;
    const reopen = () => {
      m.close();
      this.openSellForm(b, s, { qty, currency, price, town });
    };
    const stepper = (label: string, value: string, onMinus: () => void, onPlus: () => void, id: string) => {
      c.add(addText(this, x + 8, cy, ellipsize(label, inner), 'dim'));
      cy += 10;
      c.add(new Button(this, x + 8, cy, 26, SIZE.btnH, { label: '-', tip: t('market.less'), id: `${id}.minus`, onClick: onMinus }));
      c.add(new Button(this, x + 8 + inner - 26, cy, 26, SIZE.btnH, { label: '+', tip: t('market.moreBtn'), id: `${id}.plus`, onClick: onPlus }));
      c.add(addPanel(this, x + 8 + 26 + SIZE.gap, cy, inner - 52 - 2 * SIZE.gap, SIZE.btnH, 'inset'));
      c.add(addText(this, x + 8 + inner / 2, cy + 8, ellipsize(value, inner - 60), 'ink', 0.5));
      cy += SIZE.btnH + 2;
    };
    if (s.kind !== 'item') {
      const qs = s.kind === 'resource' ? 10 : 1;
      stepper(t('market.qty'), `${qty}`, () => ((qty = Math.max(1, qty - qs)), reopen()), () => ((qty = Math.min(maxQty, qty + qs)), reopen()), 'market.qty');
    }
    // currency toggle
    c.add(addText(this, x + 8, cy, t('market.currency'), 'dim'));
    cy += 10;
    const hw = Math.floor((inner - SIZE.gap) / 2);
    (['gold', 'drachmae'] as Currency[]).forEach((cur, i) =>
      c.add(
        new Button(this, x + 8 + i * (hw + SIZE.gap), cy, i ? inner - hw - SIZE.gap : hw, SIZE.btnH, {
          label: t(`market.cur.${cur}` as TKey),
          icon: currencyIcon(cur),
          style: currency === cur ? 'buttonSel' : 'button',
          id: `market.cur.${cur}`,
          onClick: () => {
            if (currency === cur) return;
            currency = cur;
            bounds = priceBounds(b.cat, currency, rarity);
            price = suggestPrice(unitValue * qty, currency, bounds);
            reopen();
          },
        }),
      ),
    );
    cy += SIZE.btnH + 2;
    stepper(`${t('market.price')} · ${t('market.bounds', { min: bounds[0], max: bounds[1] })}`, priceText(price, currency), () => ((price = clampPrice(price - priceStep(price - 1), bounds)), reopen()), () => ((price = clampPrice(price + priceStep(price), bounds)), reopen()), 'market.price');
    // fee and what the seller gets
    const fee = marketFee(price, b.cat.market.feeRate);
    c.add(addText(this, x + 8, cy, ellipsize(t('market.fee', { fee }), inner), 'dim'));
    c.add(addText(this, x + 8 + inner, cy, ellipsize(t('market.gets', { n: sellerGets(price, b.cat.market.feeRate) }), inner / 2), 'good', 1));
    cy += 12;
    // town
    const tn = towns[town];
    c.add(new Button(this, x + 8, cy, inner, SIZE.btnH, {
      label: tn ? t('market.town', { name: tn.name }) : t('market.noTown'),
      icon: 'flag',
      id: 'market.town',
      tip: t('market.noTownHint'),
      onClick: () => {
        if (towns.length > 1) {
          town = (town + 1) % towns.length;
          reopen();
        } else showTooltip(this, t('market.noTownHint'), c);
      },
    }));
    cy += SIZE.btnH + 2;
    const by = m.y + m.h - 8 - SIZE.btnH;
    const bw = Math.floor((inner - SIZE.gap) / 2);
    c.add(new Button(this, x + 8, by, bw, SIZE.btnH, { label: t('common.cancel'), onClick: () => m.close() }));
    const list = new Button(this, x + 8 + bw + SIZE.gap, by, inner - bw - SIZE.gap, SIZE.btnH, {
      label: t('market.list'),
      icon: currencyIcon(currency),
      variant: 'primary',
      id: 'market.list',
      onClick: () => {
        m.close();
        void this.list(s, qty, currency, price, towns[town]);
      },
    });
    if (!tn) list.setEnabled(false, t('market.noTownHint'));
    c.add(list);
  }

  async list(s: Sellable, qty: number, currency: Currency, price: number, town: { loc: number; name: string }): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      await econ().marketList({ town: town.loc, kind: s.kind, ref: s.kind === 'item' ? s.item.uid : s.id, qty: s.kind === 'item' ? 1 : qty, currency, price });
      if (!this.sys.isActive()) return true;
      hapticNotify('success');
      uiCoin();
      toast(this, t('market.listed', { price: priceText(price, currency) }), 'good');
      this.mine = null;
      await this.fetchAll();
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    } finally {
      this.busy = false;
    }
  }
}

