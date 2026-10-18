import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { addIcon, ICON_PX, ScrollArea, scaleIcon, tappable, type FontKey } from '../ui/kit';
import { Grid, ItemIcon, ScrollList, addScrollHint, confirmDialog, showTooltip, subjectName, toast, type IconSubject } from '../ui/widgets';
import { uiCollapsed, uiId, uiLayout } from '../ui/layout';
import { columns, layoutVariant, DETAIL_MIN, PANE_GUTTER, THREE_PANES_W, type LayoutVariant, type PaneSpec } from '../ui/mosaic/layout/geometry';
import { BUTTON_MAX, CONTENT_MAX, DIALOG_MAX, ROW_MAX } from '../ui/sizeClass';
import { focusPane } from '../ui/focusRing';
import { wrapText, LINE_H } from '../ui/textfit';
import { MOSAIC, TEXT_MIN } from '../ui/tokens';
import { makePressable } from '../ui/mosaic/base';
import { ensureFonts } from '../ui/fonts';
import {
  GAP, addParchmentEmpty, addParchmentPane, fit, MButton, oneFace, MChip, MIconButton, SHEET_ACTION_H, SHEET_TITLE_H, SWITCH_H, SegmentedSwitch, TAP, ScreenFrame, TopBar, mosaicImage, mtext, mw, openParchmentSheet, rarityInk, sheetActionsH, wrapWords,
  type Box, type MButtonOpts,
} from '../ui/mosaic';
import { addItemCardPane, bigItemIcon, itemName, openItemCard, type ItemCardOpts } from '../ui/sheet';
import { econ, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { addEconState, currencyIcon, ensureEconIcons, priceText } from '../ui/econ/widgets';
import {
  clampPrice, canAfford, econState, listingAction, marketFee, priceBounds, priceStep, sellerGets, suggestPrice, timeLeft, type EconState, type ListingAction,
} from '../game/economy';
import { isApiError, type Currency, type EconomyCatalog, type MarketListing, type MarketQuery, type WalletInfo } from '../platform/api';
import type { ProfileView } from '../online/client';
import { ITEM_LIST, isBound, itemDef, itemValue, normalizeItem, type Item } from '../data/items';
import { CONSUMABLES, CONSUMABLE_IDS, type ConsumableId } from '../data/consumables';
import { hapticNotify } from '../platform/haptics';
import { resolveBack } from '../platform/nav';
import { fmtDuration } from '../util/format';
import { uiCoin } from '../audio/hooks';
import { state } from '../state';
import { t, tOr, type TKey } from '../i18n';
import { placeName } from '../i18n/places';

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
type Filter = 'kind' | 'cur' | 'sort';
const SORTS: SortF[] = ['newest', 'price_asc', 'price_desc', 'ending'];
const RESOURCES = ['food', 'wood', 'bronze'] as const;
const RES_VALUE: Record<string, number> = { food: 1, wood: 1, bronze: 3 };

/** Left edge of a row's text (after the 24 px icon). */
const ROW_TX = 33;
/** Line steps of a row's name (7) and sub-lines (6.5). */
const NAME_LH = 9;
/** A table row's name lines: a full line apart (at S = 3 a 7-size line is 10 UI px tall). */
const TABLE_LH = 10;
const SUB_LH = 8.5;

/**
 * A list row's text. Compact: the name on one line beside the right-hand control, the facts under it.
 * Stacked (a name that does not fit there): the name across the row's full width in as many lines as it
 * takes, then the facts beside the control. A name is never cut (only a single word wider than the row).
 */
type RowText = { stacked: boolean; name: string[]; sub: string[]; h: number };

/** Height of the right-hand control (price button, Cancel listing). */
const SIDE_H = 24;
/** A row this wide (tablets, laptops) is a table: name, then one column per fact (landscape-v6 §11.2). */
const TABLE_MIN = 300;
/** The price button's column in a table row (the widest, "Expired"). */
const TABLE_BTN = 64;
/** The id an item icon registers (widgets.ts ItemIcon), for a virtualised list's element-parity ids. */
const s0 = (s: IconSubject): string => ('item' in s ? s.item.def : 'consumable' in s ? s.consumable : s.resource);
/** The status column of a wide My listings row (the status is at most 60 wide in every row). */
const MINE_STATUS_W = 60;
/** The filter sidebar's width, UI px (compact landscape, expanded); beside a detail pane at most SIDEBAR_THREE (§11.2: 150). */
const SIDEBAR_MIN = 110;
const SIDEBAR_MAX = 170;
const SIDEBAR_THREE = 150;
/** The detail pane (§3.3): at least DETAIL_MIN, at most a side panel's least width (§3.4). */
const DETAIL: PaneSpec = { min: DETAIL_MIN, max: 240 };
/** The chevron's room at the end of the chosen row. */
const CHEV_W = 9;

/**
 * Lay out a row's text: `beside` is the text width next to the right-hand control, `full` the width across
 * the row. The facts share a line when they fit, else take one line each (G14).
 */
function rowText(name: string, font: FontKey, facts: string[], beside: number, full: number, stackedSubW = beside, compactSubW = beside): RowText {
  const joined = facts.join(' · ');
  const subOf = (w: number) => (mw(joined, 'pSec', TEXT_MIN) <= w ? [joined] : facts.map((f) => fit(f, 'pSec', TEXT_MIN, w)));
  if (mw(name, font) <= beside && mw(joined, 'pSec', TEXT_MIN) <= compactSubW) return { stacked: false, name: [name], sub: [joined], h: Math.max(32, Math.ceil(NAME_LH + SUB_LH + 8)) };
  const nm = wrapWords(name, full, (x) => mw(x, font)).map((l) => fit(l, font, 7, full));
  const sub = subOf(stackedSubW);
  return { stacked: true, name: nm, sub, h: Math.ceil(4 + nm.length * NAME_LH + 2 + Math.max(SIDE_H, sub.length * SUB_LH) + 4) };
}

/** Where a row's lower block (the facts and the right-hand control) starts and how tall it is, in a row `rh` tall. */
function lowBlock(rt: RowText, rh: number): { top: number; h: number } {
  if (!rt.stacked) return { top: 0, h: rh };
  const off = Math.floor((rh - rt.h) / 2);
  const top = off + 4 + rt.name.length * NAME_LH + 2;
  return { top, h: Math.max(SIDE_H, rt.sub.length * SUB_LH) };
}

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

/** A line under a listing card (the item card's note fonts). */
type Note = { text: string; font?: 'red' | 'dim' };

/** One choice on an option sheet (P8). */
type Option<T> = { id: T; label: string; icon?: string };

/** What can be listed: a stash item, a resource or a consumable. */
type Sellable = { kind: 'item'; item: Item } | { kind: 'resource'; id: string; have: number } | { kind: 'consumable'; id: ConsumableId; have: number };

/**
 * The town marketplace of the shard (server/README.md "Town marketplace"):
 * browse listings (filter by kind, currency, one item; sort; pages), your
 * listings (cancel), and selling from the stash, resources and supplies in
 * gold or Drachmae with the 10% fee shown before listing.
 *
 * v5 (MKT-01, screens-modes.md M-12): every overlay is a kit parchment sheet:
 * filters open option sheets (P8), an ended listing shows a disabled "Expired"
 * instead of a price button (MKT-1), the sell form is laid out from its sheet's
 * width (MKT-5) with a numeric price entry, the currency as a segmented switch
 * and a town list sheet (MKT-3). Back returns to the screen that opened it, else
 * the Shop hub.
 */
export class MarketScene extends BaseScene {
  /** Migrated to the size classes (ADR-0013, V6-RSCR-06). */
  protected override readonly responsive = true;
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
  /** Expanded laptops (§11.2: three panes): the listing the detail pane shows, per tab (the first until one is chosen). */
  private sel: { browse?: string; mine?: string } = {};
  /** The detail pane's box on this page (null: the listing opens as a sheet). */
  private detailBox: Box | null = null;

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
    this.sel = {};
    this.detailBox = null;
    this.screen({ back: () => this.leave() });
    uiLayout(this, this.m.cls, this.m.land);
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

  /** Back: the screen that opened the Market (Shop hub, War army, a stash item), else the Shop hub (N4). */
  private leave(): void {
    const to = resolveBack('Market', this.backTo) ?? { scene: 'Shop', data: {} };
    this.scene.start(to.scene, to.data ?? {});
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
    // beside a sidebar (compact landscape, expanded) the tabs share the purse's row (landscape-v6 §11.2)
    const row = this.sidebar;
    const tx = row ? cx + GAP : x0;
    const tw = row ? x0 + w - tx : w;
    if (row) y += Math.round((TAP - SWITCH_H) / 2);
    else y += TAP + 3;
    const sw = new SegmentedSwitch(this, tx, y, tw, {
      options: TABS.map((k) => ({ id: k, label: t(`market.tab.${k}` as TKey), icon: tw >= 156 ? (k === 'browse' ? 'eye' : k === 'mine' ? 'flag' : 'amphora') : undefined })),
      selected: this.tab,
      id: 'market.tab',
      onChange: (id) => {
        this.tab = id as Tab;
        this.render();
        if (this.st === 'ready') void this.refreshTab();
      },
    });
    H.add(sw);
    this.pageTop = row ? by + 4 + Math.max(TAP, SWITCH_H) + 4 : y + SWITCH_H + 4;
    this.buildPage();
  }

  /** The layout variant (ADR-0013): compact portrait keeps the v5 page. */
  private get variant(): LayoutVariant {
    return layoutVariant(this.m);
  }

  /** Compact landscape and expanded: the filters in a sidebar left of the listings, the purse and tabs on one row. */
  private get sidebar(): boolean {
    const v = this.variant;
    return v === 'compactLandscape' || v === 'expanded';
  }

  /** Bottom edge of the page. */
  private pageBottom(): number {
    return this.box.y + this.box.h - 3;
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.page.removeAll(true);
    this.detailBox = null;
  }

  /**
   * The panes of a page `w` wide at `x0` with a detail pane last (landscape-v6 §11.2, §3.2): expanded and at
   * least THREE_PANES_W wide (a laptop), the region at most CONTENT_MAX, centred; else null (a sheet).
   */
  private detailPanes(x0: number, w: number, specs: PaneSpec[]): Box[] | null {
    if (this.variant !== 'expanded') return null;
    const iw = Math.min(w, CONTENT_MAX);
    if (iw < THREE_PANES_W) return null;
    const c = columns({ x: x0 + Math.floor((w - iw) / 2), y: 0, w: iw, h: 0 }, [...specs, DETAIL]);
    return c.shown.length === specs.length + 1 ? (c.panes as Box[]) : null;
  }

  /** The listing the detail pane shows on this tab: the chosen one, else the first. */
  private chosen(list: readonly MarketListing[]): MarketListing | undefined {
    const id = this.tab === 'mine' ? this.sel.mine : this.sel.browse;
    return list.find((l) => l.id === id) ?? list[0];
  }

  /** The detail pane: the chosen listing's card, as the sheet shows it (Buy, Cancel listing), in place. */
  private buildDetail(b: Base, l: MarketListing | undefined): void {
    const box = this.detailBox;
    if (!box || !l) return;
    const card = this.listingCard(b, l, box.w);
    const pane = card.kind === 'item' ? addItemCardPane(this, this.page, box, { ...card.opts, id: 'market.detailPane' }) : this.goodsPane(box, card);
    // the card's X has nothing to close in a pane: the listing's row is what replaces it (element-parity)
    uiCollapsed(this, card.kind === 'item' ? 'sheet.close' : 'market.goods.close', `item:${s0(this.subject(l))}`);
    // Tab reads the filters, the listings, then the detail pane (landscape-v6 §4)
    focusPane(pane, 2);
    inPane(pane, 2);
  }

  /** Show `l` in the detail pane (its row takes the selected rim). */
  private choose(l: MarketListing): void {
    if (this.tab === 'mine') this.sel.mine = l.id;
    else this.sel.browse = l.id;
    const keep = (this.areas.find((a) => a instanceof ScrollList) as ScrollList | undefined)?.area.scrollY ?? 0;
    this.buildPage();
    (this.areas.find((a) => a instanceof ScrollList) as ScrollList | undefined)?.area.setScroll(keep);
  }

  /** The chosen row's chevron (§3.3: the selected rim and a chevron), at the row's right end. */
  private chevron(row: Phaser.GameObjects.Container, rw: number, rh: number): void {
    row.add(scaleIcon(addIcon(this, rw - CHEV_W + 1, Math.round((rh - 9) / 2), 'chevR'), 0.75));
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
    let w = this.box.w - 8;
    let x0 = this.box.x + 4;
    let y = this.pageTop;
    const n = 3;
    const bw = Math.floor((w - (n - 1) * GAP) / n);
    // each filter names its value and opens a sheet with every option (P8, MKT-2)
    const filters: { id: Filter; label: string; icon: string; tip: string }[] = [
      { id: 'kind', label: t(`market.kind.${this.q.kind}` as TKey), icon: 'amphora', tip: t('market.kindTip') },
      { id: 'cur', label: t(`market.cur.${this.q.cur}` as TKey), icon: this.q.cur === 'all' ? 'coin' : currencyIcon(this.q.cur), tip: t('market.curTip') },
      { id: 'sort', label: t(`market.sort.${this.q.sort}` as TKey), icon: 'log', tip: t('market.sortTip') },
    ];
    const refName = this.q.ref ? this.refLabel(this.q.ref) : t('market.anyItem');
    const find = (fx: number, fy: number, fw: number) => {
      const findW = this.q.ref ? fw - FILTER_H - GAP : fw;
      this.page.add(new MButton(this, fx, fy, findW, FILTER_H, { variant: 'secondary', label: this.q.ref ? refName : t('market.find'), icon: 'eye', id: 'market.find', tip: t('market.findTip'), onClick: () => this.openFind((ref) => this.setQuery({ ref })) }));
      if (this.q.ref) this.page.add(this.clearButton(fx + findW + GAP, fy, () => this.setQuery({ ref: null }), 'market.clearRef'));
    };
    // a laptop: the sidebar, the listings' table and the chosen listing's detail pane (§11.2: three panes)
    const three = this.sidebar && this.listLoaded && this.listings.length ? this.detailPanes(x0, w, [{ min: SIDEBAR_MIN, max: SIDEBAR_THREE }, { min: TABLE_MIN + 3, max: ROW_MAX }]) : null;
    if (three) x0 = three[0].x;
    if (this.sidebar) {
      // the filter sidebar (landscape-v6 §11.2): each filter under its name when the height allows, then the listings beside it
      const sw = three ? three[0].w : Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(w * 0.3)));
      const titles = [t('market.kindTitle'), t('market.curTitle'), t('market.sortTitle'), t('market.findTitle')];
      const room = this.pageBottom() - y;
      const named = room >= titles.length * (LINE_H + FILTER_H + GAP * 2);
      const step = (named ? LINE_H : 0) + FILTER_H + GAP * (named ? 2 : 1);
      const need = titles.length * step - GAP;
      // too short for all four (Telegram's landscape): the sidebar scrolls on its own (§3.2)
      const side = need > room ? new ScrollArea(this, this.page, x0, y, sw, room, this.m.S) : null;
      if (side) {
        side.setContentHeight(need);
        addScrollHint(this, this.page, side, MOSAIC.parch);
        this.areas.push(side);
      }
      const into = side?.content ?? this.page;
      const [sx, sy] = side ? [0, 0] : [x0, y];
      const prev = this.page;
      this.page = into;
      titles.forEach((title, i) => {
        const fy = sy + i * step;
        if (named) this.page.add(mtext(this, sx + 1, fy, title, 'pSec', { size: TEXT_MIN, maxW: sw - 2 }));
        const by = fy + (named ? LINE_H : 0);
        if (i < filters.length) {
          const f = filters[i];
          this.page.add(new MButton(this, sx, by, sw, FILTER_H, { variant: 'secondary', label: f.label, icon: f.icon, id: `market.${f.id}`, tip: f.tip, onClick: () => this.openFilter(f.id) }));
        } else find(sx, by, sw);
      });
      this.page = prev;
      x0 += sw + PANE_GUTTER;
      w -= sw + PANE_GUTTER;
      if (three) {
        w = three[1].w;
        this.detailBox = { x: three[2].x, y, w: three[2].w, h: this.pageBottom() - y };
      }
    } else if (this.variant === 'medium') {
      // a tablet: the three filters and Find on one row (§11.2: filters as a chip row)
      const fw = Math.floor((w - 3 * GAP) / 4);
      filters.forEach((f, i) => this.page.add(new MButton(this, x0 + i * (fw + GAP), y, fw, FILTER_H, { variant: 'secondary', label: f.label, icon: f.icon, id: `market.${f.id}`, tip: f.tip, onClick: () => this.openFilter(f.id) })));
      find(x0 + 3 * (fw + GAP), y, w - 3 * (fw + GAP));
      y += FILTER_H + GAP;
    } else {
    const row = filters.map((f, i) => {
      const fx = x0 + i * (bw + GAP);
      return new MButton(this, fx, y, i === n - 1 ? x0 + w - fx : bw, FILTER_H, { variant: 'secondary', label: f.label, icon: f.icon, id: `market.${f.id}`, tip: f.tip, onClick: () => this.openFilter(f.id) });
    });
    oneFace(row);
    this.page.add(row);
    y += FILTER_H + GAP;
    find(x0, y, w);
    y += FILTER_H + GAP;
    }
    const h = this.pageBottom() - y;
    if (!this.listLoaded) {
      addEconState(this, this.page, x0, y, w, h, 'loading', () => {});
      return;
    }
    if (!this.listings.length) {
      this.page.add(mosaicImage(this, x0, y, w, h, 'parchment'));
      this.page.add(addParchmentEmpty(this, x0 + 2, y + 2, w - 4, h - 4, { icon: 'coin', title: t('market.empty'), hint: t('market.emptyHint'), action: { label: t('market.tab.sell'), icon: 'coin', onClick: () => ((this.tab = 'sell'), this.render(), void this.refreshTab()) } }));
      return;
    }
    const rows = this.listings.length + (this.next !== null ? 1 : 0);
    const now = Date.now();
    // beside the detail pane the chosen row ends in a chevron: the rows' content leaves it room
    const chev = this.detailBox ? CHEV_W : 0;
    const chosen = this.detailBox ? this.chosen(this.listings) : undefined;
    const table = this.variant !== 'compactPortrait' && w - 3 - chev >= TABLE_MIN;
    const list = new ScrollList(this, this.page, x0, y, w, h, {
      count: rows,
      // element-parity counts every row's ids, built or not (V6-066)
      ids: (i) => (i < this.listings.length ? [`item:${s0(this.subject(this.listings[i]))}`, 'market.price'] : ['market.more']),
      // ScrollList renders rows `w - 3` wide
      rowH: Math.max(...this.listings.map((l) => (table ? this.browseTable(b, l, w - 3 - chev, now).h : this.browseRow(b, l, w - 3 - chev, now).text.h))),
      fade: MOSAIC.parch,
      render: (i, row, rw0, rh, area) => {
        const rw = rw0 - chev;
        if (i === this.listings.length) {
          // (a button's width at most, centred: §2.3)
          const mw0 = Math.min(rw, BUTTON_MAX);
          row.add(new MButton(this, Math.floor((rw - mw0) / 2), 4, mw0, FILTER_H, { variant: 'secondary', label: t('market.more'), icon: 'plus', id: 'market.more', onClick: () => void this.more() }));
          if (this.sidebar) inPane(row, 1);
          return;
        }
        if (table) this.tableRow(b, this.listings[i], row, rw, rh, area, now);
        else this.listingRow(b, this.listings[i], row, rw, rh, area, now);
        if (chev) {
          // the row's face across its whole width (the chevron's room included), the chosen one's with the selected rim
          const l = this.listings[i];
          row.list[0].destroy();
          row.addAt(mosaicImage(this, 0, 0, rw0, rh, l === chosen ? 'parchmentSel' : l.mine ? 'parchmentWell' : 'parchment'), 0);
          if (l === chosen) this.chevron(row, rw0, rh);
        }
        // Tab reads the sidebar's filters before the listings beside them
        if (this.sidebar) inPane(row, 1);
      },
    });
    this.areas.push(list);
    this.buildDetail(b, chosen);
  }

  /** Change the Browse filters and search again from the first page. */
  private setQuery(patch: Partial<MarketScene['q']>): void {
    Object.assign(this.q, patch);
    this.listLoaded = false;
    this.listings = [];
    this.render();
    void this.refreshTab();
  }

  /** The option sheet of one Browse filter: every value, the one in force lit with a ✓ (P8). */
  openFilter(which: Filter): void {
    if (which === 'kind') {
      const icon: Record<KindF, string> = { all: 'eye', item: 'sword', resource: 'wood', consumable: 'amphora' };
      this.openOptions(t('market.kindTitle'), KINDS.map((k) => ({ id: k, label: t(`market.kind.${k}` as TKey), icon: icon[k] })), this.q.kind, (kind) => this.setQuery({ kind }), 'market.kindSheet');
    } else if (which === 'cur') {
      this.openOptions(t('market.curTitle'), CURS.map((c) => ({ id: c, label: t(`market.cur.${c}` as TKey), icon: c === 'all' ? 'coin' : currencyIcon(c) })), this.q.cur, (cur) => this.setQuery({ cur }), 'market.curSheet');
    } else {
      this.openOptions(t('market.sortTitle'), SORTS.map((o) => ({ id: o, label: t(`market.sort.${o}` as TKey) })), this.q.sort, (sort) => this.setQuery({ sort }), 'market.sortSheet');
    }
  }

  /**
   * A sheet docked at the bottom listing every option as a bronze button, the selected one lit with a ✓
   * (G13: not by fill alone). Picking closes it; the X, a tap outside and Back close it unchanged (P11).
   */
  private openOptions<T extends string | number>(title: string, options: Option<T>[], selected: T, onPick: (id: T) => void, id: string): void {
    const w = Math.min(this.m.VW - 8, 260);
    // two columns while every label keeps its icon or ✓ at full size there, else one
    const half = Math.floor((w - 16 - GAP) / 2);
    const cols = options.every((op) => mw(op.label.toUpperCase(), 'rCream', 7) + ICON_PX + 3 + 10 <= half) ? 2 : 1;
    const rows = Math.ceil(options.length / cols);
    const h = SHEET_TITLE_H + rows * (TAP + GAP) - GAP + 14;
    const m = openParchmentSheet(this, { title, w, h, dock: 'bottom', id });
    const bw = Math.floor((m.body.w - GAP * (cols - 1)) / cols);
    options.forEach((op, i) => {
      const on = op.id === selected;
      const bx = m.body.x + (i % cols) * (bw + GAP);
      m.c.add(
        new MButton(this, bx, m.body.y + Math.floor(i / cols) * (TAP + GAP), i % cols === cols - 1 ? m.body.x + m.body.w - bx : bw, TAP, {
          label: op.label,
          icon: on ? 'check' : op.icon,
          variant: on ? 'lit' : 'secondary',
          id: `${id}.${op.id}`,
          onClick: () => {
            m.close();
            if (!on) onPick(op.id);
          },
        }),
      );
    });
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

  /** What a Browse row shows: the price button (or "Expired") and its text lines at row width `rw`. */
  private browseRow(b: Base, l: MarketListing, rw: number, now: number): { act: ListingAction; can: boolean; label: string; bw: number; font: FontKey; text: RowText } {
    const can = canAfford(l, { gold: b.profile?.resources.gold ?? null, drachmae: b.wallet.drachmae });
    const act = listingAction(l, now);
    // an ended listing never shows an active price button (MKT-1): a disabled "Expired" that says why, the price moves to the sub-line
    const ended = act === 'none';
    const label = ended ? t('market.expired') : `${l.price}`;
    const bw = Math.min(ended ? 64 : 56, Math.max(40, mw(label, 'rCream', 7) + ICON_W + 14));
    const font = l.kind === 'item' ? rarityInk(this, l.rarity) : 'pInk';
    const left = timeLeft(l.expiresAt, now);
    const text = rowText(`${l.qty > 1 ? `${l.qty}x ` : ''}${this.listingName(l)}`, font, [l.seller.name ?? '?', ended ? priceText(l.price, l.currency) : fmtDuration(left.ms)], rw - ROW_TX - bw - 8, rw - ROW_TX - 4);
    return { act, can, label, bw, font, text };
  }

  private listingRow(b: Base, l: MarketListing, row: Phaser.GameObjects.Container, rw: number, rh: number, area: import('../ui/kit').ScrollArea, now: number): void {
    row.add(mosaicImage(this, 0, 0, rw, rh, l.mine ? 'parchmentWell' : 'parchment'));
    row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), this.subject(l), { size: 24, area, qty: l.qty, rarity: l.kind === 'item' ? undefined : 'common', onTap: () => this.openListing(b, l) }));
    const { act, can, label, bw, font, text } = this.browseRow(b, l, rw, now);
    const low = lowBlock(text, rh);
    const pb = new MButton(this, rw - bw - 3, Math.round(low.top + (low.h - SIDE_H) / 2), bw, SIDE_H, act === 'none'
      ? { label, variant: 'disabled', disabledReason: t('market.expiredHint'), id: 'market.price' }
      : { label, icon: currencyIcon(l.currency), variant: 'secondary', id: 'market.price', onClick: () => this.openListing(b, l) });
    if (act === 'buy' && !can) pb.setEnabled(false, t('econ.noFunds'));
    row.add(pb);
    if (this.variant !== 'compactPortrait' && !text.stacked) {
      // beside the filter sidebar: the seller at the left, the time (or price) right by the button, so the row reads across
      const box = { owner: row, w: rw, h: rh };
      const [seller, when] = [l.seller.name ?? '?', act === 'none' ? priceText(l.price, l.currency) : fmtDuration(timeLeft(l.expiresAt, now).ms)];
      const y0 = Math.round((rh - NAME_LH - SUB_LH) / 2);
      row.add(mtext(this, ROW_TX, y0, text.name[0], font, { box }));
      const right = rw - bw - 8;
      const ww = mw(when, 'pSec', TEXT_MIN);
      row.add(mtext(this, right, y0 + NAME_LH + 1, when, 'pSec', { size: TEXT_MIN, align: 1, box }));
      row.add(mtext(this, ROW_TX, y0 + NAME_LH + 1, fit(seller, 'pSec', TEXT_MIN, right - ROW_TX - ww - 6), 'pSec', { size: TEXT_MIN, box }));
      return;
    }
    this.drawRowText(row, rw, rh, text, font);
  }

  /**
   * A wide row (tablets, laptops; landscape-v6 §11.2 "a table"): the name, the seller and the time left
   * (or the price, once ended) in three columns of equal width, the price button at the right. The name
   * wraps in its column, never cut.
   */
  private browseTable(b: Base, l: MarketListing, rw: number, now: number): { cols: number[]; cw: number; name: string[]; facts: string[]; h: number } {
    const { font } = this.browseRow(b, l, rw, now);
    const cw = Math.floor((rw - ROW_TX - TABLE_BTN - 8) / 3);
    // beside the detail pane (a narrower table) the facts' columns are as wide as their longest, the name takes the rest
    const fw = this.detailBox ? this.factCols(rw, now) : null;
    const nw = fw ? rw - ROW_TX - TABLE_BTN - 8 - fw[0] - fw[1] : cw;
    const name = wrapWords(`${l.qty > 1 ? `${l.qty}x ` : ''}${this.listingName(l)}`, nw - 6, (x) => mw(x, font)).map((x) => fit(x, font, 7, nw - 6));
    const facts = this.tableFacts(l, now).map((f, i) => fit(f, 'pSec', TEXT_MIN, (fw ? fw[i] : cw) - 6));
    return { cols: fw ? [ROW_TX, ROW_TX + nw, ROW_TX + nw + fw[0]] : [ROW_TX, ROW_TX + cw, ROW_TX + 2 * cw], cw, name, facts, h: Math.max(32, 8 + name.length * TABLE_LH) };
  }

  /** A table row's facts: the seller, and the time left (the price, once ended). */
  private tableFacts(l: MarketListing, now: number): string[] {
    const ended = listingAction(l, now) === 'none';
    return [l.seller.name ?? '?', ended ? priceText(l.price, l.currency) : fmtDuration(timeLeft(l.expiresAt, now).ms)];
  }

  /** The facts' column widths for the listings in a table `rw` wide: each its longest, the name keeping at least a third. */
  private factCols(rw: number, now: number): [number, number] {
    const room = rw - ROW_TX - TABLE_BTN - 8;
    const need = [0, 1].map((i) => Math.max(...this.listings.map((l) => mw(this.tableFacts(l, now)[i], 'pSec', TEXT_MIN))) + 8);
    const cap = Math.floor((room * 2) / 3);
    const total = need[0] + need[1];
    if (total <= cap) return [need[0], need[1]];
    return [Math.floor((need[0] * cap) / total), Math.floor((need[1] * cap) / total)];
  }

  private tableRow(b: Base, l: MarketListing, row: Phaser.GameObjects.Container, rw: number, rh: number, area: import('../ui/kit').ScrollArea, now: number): void {
    row.add(mosaicImage(this, 0, 0, rw, rh, l.mine ? 'parchmentWell' : 'parchment'));
    row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), this.subject(l), { size: 24, area, qty: l.qty, rarity: l.kind === 'item' ? undefined : 'common', onTap: () => this.openListing(b, l) }));
    const { act, can, label, bw, font } = this.browseRow(b, l, rw, now);
    const pb = new MButton(this, rw - bw - 3, Math.round((rh - SIDE_H) / 2), bw, SIDE_H, act === 'none'
      ? { label, variant: 'disabled', disabledReason: t('market.expiredHint'), id: 'market.price' }
      : { label, icon: currencyIcon(l.currency), variant: 'secondary', id: 'market.price', onClick: () => this.openListing(b, l) });
    if (act === 'buy' && !can) pb.setEnabled(false, t('econ.noFunds'));
    row.add(pb);
    const tb = this.browseTable(b, l, rw, now);
    this.drawColumns(row, rw, rh, tb.cols, tb.name, font, tb.facts);
  }

  /** A table row's text: the name lines in the first column, one fact per further column, all centred in the row's height. */
  private drawColumns(row: Phaser.GameObjects.Container, rw: number, rh: number, cols: number[], name: string[], font: FontKey, facts: string[]): void {
    const box = { owner: row, w: rw, h: rh };
    let y = Math.round((rh - name.length * TABLE_LH) / 2);
    for (const line of name) {
      row.add(mtext(this, cols[0], y, line, font, { box }));
      y += TABLE_LH;
    }
    facts.forEach((f, i) => row.add(mtext(this, cols[i + 1], Math.round((rh - SUB_LH) / 2) + 1, f, 'pSec', { size: TEXT_MIN, box })));
  }

  /** The name lines and fact lines of a row: centred (compact), or the name on top and the facts centred in the lower block. */
  private drawRowText(row: Phaser.GameObjects.Container, rw: number, rh: number, rt: RowText, font: FontKey): void {
    const box = { owner: row, w: rw, h: rh };
    const subH = rt.sub.length * SUB_LH;
    let y = rt.stacked ? Math.floor((rh - rt.h) / 2) + 4 : Math.round((rh - rt.name.length * NAME_LH - subH) / 2);
    for (const line of rt.name) {
      row.add(mtext(this, ROW_TX, y, line, font, { box }));
      y += NAME_LH;
    }
    if (rt.stacked) {
      const low = lowBlock(rt, rh);
      y = Math.round(low.top + (low.h - subH) / 2) - 1;
    }
    for (const line of rt.sub) {
      row.add(mtext(this, ROW_TX, y + 1, line, 'pSec', { size: TEXT_MIN, box }));
      y += SUB_LH;
    }
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

  /** A listing's card: in the detail pane on a laptop (three panes), else a sheet. */
  openListing(b: Base, l: MarketListing): void {
    if (this.detailBox && (this.tab === 'browse' || this.tab === 'mine')) {
      this.choose(l);
      return;
    }
    const card = this.listingCard(b, l, Math.min(this.m.VW - 12, 210));
    if (card.kind === 'item') openItemCard(this, card.opts);
    else this.goodsCard(card.s, card.qty, card.name, card.notes, card.actions);
  }

  /** What a listing's card shows, for a card `cardW` wide: the item card's options, or the goods card's parts. */
  private listingCard(b: Base, l: MarketListing, cardW: number): { kind: 'item'; opts: ItemCardOpts } | { kind: 'goods'; s: IconSubject; qty: number; name: string; notes: Note[]; actions: MButtonOpts[] } {
    const now = Date.now();
    const act = listingAction(l, now);
    const s = this.subject(l);
    const left = timeLeft(l.expiresAt, now);
    // one fact per line, wrapped rather than cut (G14): price and seller, town, time left, what the seller gets
    const notes: Note[] = [
      { text: `${priceText(l.price, l.currency)} · ${t('market.by', { name: l.seller.name ?? '?' })}`, font: 'red' },
      { text: t('market.town', { name: placeName(l.town.name) }) },
      { text: left.ms ? t('market.left', { t: fmtDuration(left.ms) }) : t('market.expired') },
      { text: t('market.feeLine', { gets: sellerGets(l.price, b.cat.market.feeRate), fee: marketFee(l.price, b.cat.market.feeRate) }) },
    ];
    const can = canAfford(l, { gold: b.profile?.resources.gold ?? null, drachmae: b.wallet.drachmae });
    const noBuy = can ? undefined : l.currency === 'gold' && !b.profile ? t('econ.noProfile') : t('econ.noFunds');
    if ('item' in s) {
      const actions =
        act === 'buy'
          ? [{ label: `${l.price}`, icon: currencyIcon(l.currency), variant: 'primary' as const, id: 'market.buy', disabled: noBuy, onClick: () => this.askBuy(b, l) }]
          : act === 'cancel'
            ? [{ label: t('market.cancelListing'), icon: 'close', variant: 'destructive' as const, id: 'market.cancel', onClick: () => this.askCancel(l) }]
            : [];
      // the item card's text column (sheet.ts openItemCard: the card's width less its padding)
      const noteW = cardW - 16 - 3;
      return { kind: 'item', opts: { item: s.item, hero: b.profile?.heroes[0]?.hero, title: this.listingName(l), notes: notes.flatMap((n) => wrapText(n.text, noteW, 3).lines.map((text) => ({ text, font: n.font === 'red' ? ('pBad' as const) : undefined }))), actions } };
    }
    const actions: MButtonOpts[] =
      act === 'buy'
        ? [noBuy ? { label: `${l.price}`, variant: 'disabled', disabledReason: noBuy, id: 'market.buy' } : { label: `${l.price}`, icon: currencyIcon(l.currency), variant: 'primary', id: 'market.buy', onClick: () => this.askBuy(b, l) }]
        : act === 'cancel'
          ? [{ label: t('market.cancelListing'), icon: 'close', variant: 'secondary', id: 'market.cancel', onClick: () => this.askCancel(l) }]
          : [];
    return { kind: 'goods', s, qty: l.qty, name: this.listingName(l), notes, actions };
  }

  /**
   * The listing card for goods (resources, consumables) on a kit sheet: icon, name, description, the notes,
   * and the action (Buy, Cancel listing) or none. The X, a tap outside and Back close it (P11, G5).
   */
  private goodsCard(s: IconSubject, qty: number, name: string, notes: Note[], actions: MButtonOpts[]): void {
    const w = Math.min(this.m.VW - 16, 200);
    const inner = w - 16;
    const { desc, noteLines } = this.goodsLines(s, notes, inner);
    let m: ReturnType<typeof openParchmentSheet> | null = null;
    const acts = actions.map((a) => ({ ...a, onClick: a.onClick && (() => (m?.close(), a.onClick!())) }));
    const want = SHEET_TITLE_H + 32 + desc.length * LINE_H + (desc.length ? 4 : 0) + noteLines.length * LINE_H + 6 + sheetActionsH(acts, w);
    m = openParchmentSheet(this, { title: name, w, h: want, actions: acts, id: 'market.goods' });
    this.fillGoods(m.c, m.body, s, qty, name, inner, desc, noteLines);
  }

  /** The goods card in place, as the detail pane (a laptop, §11.2): as tall as its words, centred in the pane's height. */
  private goodsPane(box: Box, card: { s: IconSubject; qty: number; name: string; notes: Note[]; actions: MButtonOpts[] }): Phaser.GameObjects.Container {
    const inner = box.w - 16;
    const { desc, noteLines } = this.goodsLines(card.s, card.notes, inner);
    const want = SHEET_TITLE_H + 32 + desc.length * LINE_H + (desc.length ? 4 : 0) + noteLines.length * LINE_H + 6 + sheetActionsH(card.actions, box.w);
    const h = Math.min(box.h, want);
    const pane = addParchmentPane(this, this.page, { ...box, y: box.y + Math.floor((box.h - h) / 2), h }, { title: card.name, actions: card.actions, id: 'market.goodsPane' });
    this.fillGoods(pane.c, pane.body, card.s, card.qty, card.name, inner, desc, noteLines);
    return pane.c;
  }

  /** The goods card's description and note lines wrapped to `inner`. */
  private goodsLines(s: IconSubject, notes: Note[], inner: number): { desc: string[]; noteLines: { text: string; font: FontKey }[] } {
    const lines = (text: string, font: FontKey, max = 0) => {
      const out = wrapWords(text, inner, (x) => mw(x, font));
      return max ? out.slice(0, max) : out;
    };
    const desc = 'consumable' in s ? lines(tOr(`consumable.${s.consumable}.desc`, CONSUMABLES[s.consumable as ConsumableId]?.desc ?? ''), 'pInk', 3) : [];
    const ink = (n: Note): FontKey => (n.font === 'red' ? 'pBad' : 'pSec');
    const noteLines = notes.flatMap((n) => lines(n.text, ink(n)).map((text) => ({ text, font: ink(n) })));
    return { desc, noteLines };
  }

  /** The goods card's content at `body`: the icon and the count, the description, the notes. */
  private fillGoods(c: Phaser.GameObjects.Container, body: Box, s: IconSubject, qty: number, name: string, inner: number, desc: string[], noteLines: { text: string; font: FontKey }[]): void {
    c.add(new ItemIcon(this, body.x, body.y, s, { size: 26, qty, tip: false }));
    c.add(mtext(this, body.x + 32, body.y + 9, `${qty}x ${name}`, 'pInk', { maxW: inner - 32 }));
    let cy = body.y + 32;
    if (desc.length) {
      c.add(mtext(this, body.x, cy, desc.join('\n'), 'pInk'));
      cy += desc.length * LINE_H + 4;
    }
    for (const n of noteLines) {
      c.add(mtext(this, body.x, cy, n.text, n.font, { maxW: inner }));
      cy += LINE_H;
    }
  }

  askBuy(b: Base, l: MarketListing): void {
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

  /** Pick one item, resource or consumable to look for (the server's `ref` filter): a kit sheet, the X closes it (G5). */
  private openFind(onPick: (ref: string) => void): void {
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 210);
    const m = openParchmentSheet(this, { title: t('market.findTitle'), w, h: VH - 24, id: 'market.findSheet' });
    const subjects: { s: IconSubject; ref: string }[] = [
      ...RESOURCES.map((r) => ({ s: { resource: r } as IconSubject, ref: r })),
      ...CONSUMABLE_IDS.map((id) => ({ s: { consumable: id } as IconSubject, ref: id })),
      ...ITEM_LIST.filter((d) => !d.bound).map((d) => ({ s: { item: { uid: `f_${d.id}`, def: d.id, rarity: 'common' as const, cond: 100 } } as IconSubject, ref: d.id })),
    ];
    const grid = new Grid(this, m.c, m.body.x, m.body.y, m.body.w, m.body.h, {
      count: subjects.length,
      cell: 26,
      render: (i, cc, size, area) => {
        const sj = subjects[i];
        cc.add(new ItemIcon(this, 0, 0, sj.s, { size, area, glow: false, tip: this.refLabel(sj.ref), onTap: () => (m.close(), onPick(sj.ref)) }));
      },
    });
    m.c.once('destroy', () => grid.destroy());
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
      this.page.add(addParchmentEmpty(this, x0 + 2, y + 2, w - 4, h - 4, { icon: 'flag', title: t('market.mineEmpty'), hint: t('market.mineEmptyHint'), action: { label: t('market.tab.sell'), icon: 'coin', onClick: () => ((this.tab = 'sell'), this.render(), void this.refreshTab()) } }));
      return;
    }
    const now = Date.now();
    const statusFont: Record<string, FontKey> = { open: 'pGood', sold: 'pInk', cancelled: 'pOff', expired: 'pBad' };
    // a row's status, its Cancel listing button and text lines at row width `rw`
    const lay = (l: MarketListing, rw: number) => {
      const status = l.status === 'open' && l.expiresAt <= now ? 'expired' : l.status;
      const act = listingAction(l, now);
      const bw = act === 'cancel' ? FILTER_H : 0;
      const right = rw - bw - (bw ? 7 : 4);
      const stT = t(`market.status.${status}` as TKey);
      const stF = statusFont[status] ?? 'pOff';
      const stW = Math.min(60, mw(stT, stF, TEXT_MIN));
      const font = l.kind === 'item' ? rarityInk(this, l.rarity) : 'pInk';
      const facts = [priceText(l.price, l.currency), t('market.youGet', { n: sellerGets(l.price, b.cat.market.feeRate) })];
      const name = `${l.qty > 1 ? `${l.qty}x ` : ''}${this.listingName(l)}`;
      // the status sits at the end of the name's first line; the facts take the width left of the Cancel listing button
      const text = rowText(name, font, facts, right - stW - 4 - ROW_TX, rw - ROW_TX - 8 - stW, right - ROW_TX, right - ROW_TX);
      return { status, act, bw, right, stT, stF, font, text };
    };
    // a wide row is a table (§11.2): the name, the price and what you get in columns, the status before Cancel listing;
    // outside compact portrait the list is at most a row wide (§2.3), centred, and shows every free slot after the
    // listings (a tap: Sell), so the page says how much more can be listed
    const wide = this.variant !== 'compactPortrait';
    // a laptop: the list and the chosen listing's detail pane (§11.2)
    const two = this.detailPanes(x0, w, [{ min: TABLE_MIN + 3 + CHEV_W, max: ROW_MAX }]);
    const lw = two ? two[0].w : w;
    const lx = two ? two[0].x : x0;
    if (two) this.detailBox = { x: two[1].x, y, w: two[1].w, h };
    const chev = two ? CHEV_W : 0;
    const chosen = two ? this.chosen(mine.listings) : undefined;
    const free = wide ? Math.max(0, mine.maxOpen - mine.open) : 0;
    const table = wide && lw - 3 - chev >= TABLE_MIN;
    const cols = (l: MarketListing, rw: number) => {
      const { font, stT, stF } = lay(l, rw);
      const cw = Math.floor((rw - ROW_TX - FILTER_H - 7 - MINE_STATUS_W - 6) / 3);
      const name = wrapWords(`${l.qty > 1 ? `${l.qty}x ` : ''}${this.listingName(l)}`, cw - 6, (x) => mw(x, font)).map((x) => fit(x, font, 7, cw - 6));
      const facts = [priceText(l.price, l.currency), t('market.youGet', { n: sellerGets(l.price, b.cat.market.feeRate) })].map((f) => fit(f, 'pSec', TEXT_MIN, cw - 6));
      return { cols: [ROW_TX, ROW_TX + cw, ROW_TX + 2 * cw], name, facts, font, stT, stF, h: Math.max(32, 8 + name.length * TABLE_LH) };
    };
    const toSell = () => ((this.tab = 'sell'), this.render(), void this.refreshTab());
    const list = new ScrollList(this, this.page, lx, y, lw, h, {
      count: mine.listings.length + free,
      rowH: Math.max(...mine.listings.map((l) => (table ? cols(l, lw - 3 - chev).h : lay(l, lw - 3 - chev).text.h))),
      fade: MOSAIC.parch,
      ids: (i) => (i >= mine.listings.length ? ['market.slot'] : []),
      render: (i, row, rw0, rh, area) => {
        const rw = i >= mine.listings.length ? rw0 : rw0 - chev;
        if (i >= mine.listings.length) {
          // a free slot: the whole row goes to Sell
          row.add(mosaicImage(this, 0, 0, rw, rh, 'parchmentWell'));
          // (its tap area at most a row wide, §2.3, centred under the words)
          const zw = Math.min(rw, ROW_MAX);
          const z = this.add.zone(Math.floor((rw - zw) / 2), 0, zw, rh).setOrigin(0, 0).setInteractive();
          tappable(z, area, toSell, t('market.mineEmptyHint'));
          row.add(uiId(z, 'market.slot'));
          // "Free slot" at the left, where to fill it at the right
          const fy = Math.round((rh - SUB_LH) / 2);
          const hint = mtext(this, rw - 6, fy, t('market.freeSlotHint'), 'pMuted', { size: TEXT_MIN, align: 1, maxW: rw / 2 - 8, box: { owner: row, w: rw, h: rh } });
          row.add(hint);
          row.add(mtext(this, ROW_TX, fy, t('market.freeSlot'), 'pSec', { size: TEXT_MIN, maxW: rw - ROW_TX - hint.width - 12, box: { owner: row, w: rw, h: rh } }));
          return;
        }
        const l = mine.listings[i];
        if (table) {
          const { status, act } = lay(l, rw);
          const c = cols(l, rw);
          row.add(mosaicImage(this, 0, 0, rw0, rh, l === chosen ? 'parchmentSel' : status === 'open' ? 'parchment' : 'parchmentWell'));
          if (l === chosen) this.chevron(row, rw0, rh);
          row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), this.subject(l), { size: 24, area, qty: l.qty, onTap: () => this.openListing(b, l) }));
          if (act === 'cancel') row.add(this.clearButton(rw - FILTER_H - 3, Math.round((rh - FILTER_H) / 2), () => this.askCancel(l), 'market.cancelRow', t('market.cancelListing')));
          row.add(mtext(this, rw - FILTER_H - 7, Math.round((rh - SUB_LH) / 2) + 1, c.stT, c.stF, { size: TEXT_MIN, align: 1, maxW: MINE_STATUS_W, box: { owner: row, w: rw, h: rh } }));
          this.drawColumns(row, rw, rh, c.cols, c.name, c.font, c.facts);
          if (two) inPane(row, 1);
          return;
        }
        const { status, act, bw, right, stT, stF, font, text } = lay(l, rw);
        row.add(mosaicImage(this, 0, 0, rw, rh, status === 'open' ? 'parchment' : 'parchmentWell'));
        row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), this.subject(l), { size: 24, area, qty: l.qty, onTap: () => this.openListing(b, l) }));
        const low = lowBlock(text, rh);
        if (act === 'cancel') row.add(this.clearButton(rw - bw - 3, Math.round(low.top + (low.h - FILTER_H) / 2), () => this.askCancel(l), 'market.cancelRow', t('market.cancelListing')));
        const stY = text.stacked ? Math.floor((rh - text.h) / 2) + 4 : Math.round((rh - NAME_LH - SUB_LH) / 2);
        row.add(mtext(this, text.stacked ? rw - 4 : right, stY, stT, stF, { size: TEXT_MIN, align: 1, maxW: 60, box: { owner: row, w: rw, h: rh } }));
        this.drawRowText(row, rw, rh, text, font);
      },
    });
    this.areas.push(list);
    this.buildDetail(b, chosen);
  }

  askCancel(l: MarketListing): void {
    confirmDialog(this, {
      title: t('market.cancelListingTitle'),
      body: t('market.cancelBody'),
      ok: t('market.cancelListing'),
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
      toast(this, t('market.listingCancelled'), 'good');
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
      this.page.add(addParchmentEmpty(this, x0 + 2, top + 2, w - 4, bottom - top - 4, { icon: 'coin', title: t('market.sellEmpty'), hint: t('market.sellEmptyHint') }));
      return;
    }
    this.page.add(mtext(this, x0 + w / 2, top + 1, t('market.sellHint'), 'pSec', { size: TEXT_MIN, align: 0.5, maxW: w }));
    const y = top + 12;
    if (this.variant !== 'compactPortrait') return this.sellRows(b, list, x0, y, w, bottom - y);
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

  /**
   * Outside compact portrait, what can be sold as rows at most a row wide (§2.3), centred: the icon, the name and
   * what it is worth (or how many you have), and List, which opens the listing form as the icon does.
   */
  private sellRows(b: Base, list: Sellable[], x0: number, y: number, w: number, h: number): void {
    const lw = w;
    const table = lw - 3 >= TABLE_MIN;
    const subj = (s: Sellable): IconSubject => (s.kind === 'item' ? { item: s.item } : s.kind === 'resource' ? { resource: s.id } : { consumable: s.id });
    const rows = new ScrollList(this, this.page, x0, y, lw, h, {
      count: list.length,
      rowH: 32,
      fade: MOSAIC.parch,
      ids: (i) => [`item:${s0(subj(list[i]))}`, 'market.sellRow'],
      render: (i, row, rw, rh, area) => {
        const s = list[i];
        const box = { owner: row, w: rw, h: rh };
        row.add(mosaicImage(this, 0, 0, rw, rh, 'parchment'));
        row.add(new ItemIcon(this, 4, Math.round((rh - 24) / 2), subj(s), { size: 24, area, qty: s.kind === 'item' ? undefined : s.have, tip: false, onTap: () => this.openSellForm(b, s) }));
        const bw = Math.min(TABLE_BTN + 16, Math.max(TABLE_BTN, mw(t('market.list').toUpperCase(), 'rCream', 7) + ICON_W + 14));
        row.add(new MButton(this, rw - bw - 3, Math.round((rh - SIDE_H) / 2), bw, SIDE_H, { label: t('market.list'), icon: 'coin', variant: 'secondary', id: 'market.sellRow', onClick: () => this.openSellForm(b, s) }));
        const tw = rw - ROW_TX - bw - 8;
        const name = s.kind === 'item' ? itemName(s.item) : subjectName(subj(s));
        const font = s.kind === 'item' ? rarityInk(this, s.item.rarity) : 'pInk';
        const sub = s.kind === 'item' ? t('stash.worth', { n: itemValue(s.item) }) : `${s.have}×`;
        if (table) {
          // a table (§11.2): the name, the rarity (or the kind of goods), the slot (or how many you have), what one is worth
          const cw = Math.floor((rw - ROW_TX - bw - 8) / 4);
          const facts =
            s.kind === 'item'
              ? [t(`rarity.${s.item.rarity}` as TKey), t(`slot.${itemDef(s.item.def).slot}` as TKey), sub]
              : [t(s.kind === 'resource' ? 'market.kind.resource' : 'market.kind.consumable'), `${s.have}×`, t('stash.worth', { n: s.kind === 'resource' ? RES_VALUE[s.id] ?? 1 : CONSUMABLES[s.id].gold ?? 50 })];
          this.drawColumns(row, rw, rh, [0, 1, 2, 3].map((k) => ROW_TX + k * cw), [fit(name, font, 7, cw - 6)], font, facts.map((f) => fit(f, 'pSec', TEXT_MIN, cw - 6)));
          return;
        }
        row.add(mtext(this, ROW_TX, Math.round((rh - NAME_LH - SUB_LH) / 2), fit(name, font, 7, tw), font, { box }));
        row.add(mtext(this, ROW_TX, Math.round((rh - NAME_LH - SUB_LH) / 2) + NAME_LH + 1, fit(sub, 'pSec', TEXT_MIN, tw), 'pSec', { size: TEXT_MIN, box }));
      },
    });
    this.areas.push(rows);
  }

  /**
   * The listing form on a kit sheet, laid out from the sheet's own width (MKT-5): quantity (goods), the
   * currency (a segmented switch: rim and lit block, P7), the price as a stepper whose value opens a numeric entry with
   * presets (P23, MKT-3), the fee and what you get, the town (a list sheet when there is a choice), and
   * Cancel / List. A form: an outside tap does not close it (the price set so far is kept).
   */
  openSellForm(b: Base, s: Sellable): void {
    const towns = this.towns ?? [];
    const rarity = s.kind === 'item' ? s.item.rarity : 'common';
    const have = s.kind === 'item' ? 1 : s.have;
    const maxQty = s.kind === 'consumable' ? Math.min(have, 20) : have;
    let qty = s.kind === 'item' ? 1 : Math.min(maxQty, s.kind === 'resource' ? 50 : 1);
    let currency: Currency = 'gold';
    const unitValue = s.kind === 'item' ? itemValue(s.item) : s.kind === 'resource' ? RES_VALUE[s.id] ?? 1 : CONSUMABLES[s.id].gold ?? 50;
    let bounds = priceBounds(b.cat, currency, rarity);
    let price = suggestPrice(unitValue * qty, currency, bounds);
    let town = 0;
    const name = s.kind === 'item' ? itemName(s.item) : subjectName(s.kind === 'resource' ? { resource: s.id } : { consumable: s.id });
    const hasQty = s.kind !== 'item';
    const w = Math.min(this.m.VW - 16, 210);
    const ROW = LINE_H + TAP + GAP + 2;
    const bodyH = 32 + (hasQty ? ROW : 0) + ROW * 2 + LINE_H + 3 + TAP + 2;
    // Cancel and List always share one row (the labels shrink before the row wraps); on a short screen the
    // fields scroll between the title and the actions (P11) rather than run under them
    const viewH = Math.min(bodyH, this.m.VH - 12 - SHEET_TITLE_H - SHEET_ACTION_H - 10);
    const sheet = openParchmentSheet(this, { title: t('market.listTitle', { name }), w, h: SHEET_TITLE_H + viewH + SHEET_ACTION_H + 10, shadeCloses: false, id: 'market.sellForm' });
    const { w: iw } = sheet.body;
    const x0 = sheet.body.x;
    const ay = sheet.y + sheet.h - 6 - SHEET_ACTION_H;
    const aw = Math.floor((iw - GAP) / 2);
    sheet.c.add(new MButton(this, x0, ay, aw, SHEET_ACTION_H, { label: t('common.cancel'), variant: 'secondary', id: 'market.sellCancel', onClick: () => sheet.close() }));
    const listBtn = new MButton(this, x0 + aw + GAP, ay, iw - aw - GAP, SHEET_ACTION_H, {
      label: t('market.list'),
      icon: currencyIcon(currency),
      variant: 'primary',
      id: 'market.list',
      onClick: () => {
        sheet.close();
        void this.list(s, qty, currency, price, towns[town]);
      },
    });
    sheet.c.add(listBtn);
    // (the sheet can be shorter than asked: a centred dialog on a short landscape screen; the fields keep a gap above the actions)
    const fitH = Math.min(viewH, ay - GAP - sheet.body.y);
    const area = fitH < bodyH ? new ScrollArea(this, sheet.c, x0, sheet.body.y, iw, fitH, this.m.S) : null;
    if (area) {
      area.setContentHeight(bodyH);
      sheet.c.once('destroy', () => area.destroy());
    }
    const body = area?.content ?? this.add.container(x0, sheet.body.y);
    if (!area) sheet.c.add(body);
    // the fields are drawn in the body's own coordinates
    const x = 0;
    const label = (y: number, text: string) => body.add(mtext(this, x, y, text, 'pSec', { maxW: iw }));
    /** − value + : the value is a button that opens the numeric entry. */
    const stepper = (y: number, value: string, icon: string | undefined, id: string, minus: () => void, plus: () => void, type: () => void) => {
      body.add(new MButton(this, x, y, TAP + 4, TAP, { label: '-', variant: 'secondary', tip: t('market.less'), id: `${id}.minus`, onClick: minus }));
      body.add(new MButton(this, x + TAP + 4 + GAP, y, iw - 2 * (TAP + 4 + GAP), TAP, { label: value, icon, variant: 'neutral', tip: t('market.typeTip'), id: `${id}.type`, onClick: type }));
      body.add(new MButton(this, x + iw - TAP - 4, y, TAP + 4, TAP, { label: '+', variant: 'secondary', tip: t('market.moreBtn'), id: `${id}.plus`, onClick: plus }));
    };
    const draw = () => {
      body.removeAll(true);
      let cy = 0;
      const subj: IconSubject = s.kind === 'item' ? { item: s.item } : s.kind === 'resource' ? { resource: s.id } : { consumable: s.id };
      body.add(s.kind === 'item' ? bigItemIcon(this, x, cy, s.item, 26) : new ItemIcon(this, x, cy, subj, { size: 26, qty: have, tip: false }));
      body.add(mtext(this, x + 32, cy + 3, name, s.kind === 'item' ? rarityInk(this, rarity) : 'pInk', { maxW: iw - 32 }));
      body.add(mtext(this, x + 32, cy + 15, t('stash.worth', { n: unitValue * qty }), 'pSec', { maxW: iw - 32 }));
      cy += 32;
      if (hasQty) {
        const qs = s.kind === 'resource' ? 10 : 1;
        label(cy, t('market.qty'));
        stepper(cy + LINE_H, `${qty}`, undefined, 'market.qty', () => ((qty = Math.max(1, qty - qs)), draw()), () => ((qty = Math.min(maxQty, qty + qs)), draw()), () =>
          this.openNumberSheet({ title: t('market.qtyTitle'), value: qty, min: 1, max: maxQty, id: 'market.qtySheet', onDone: (v) => ((qty = v), draw()) }),
        );
        cy += ROW;
      }
      // the currency: a segmented switch, the chosen one a lit block with a bronze rim (P7: not by fill alone)
      label(cy, t('market.currency'));
      body.add(
        new SegmentedSwitch(this, x, cy + LINE_H, iw, {
          options: (['gold', 'drachmae'] as Currency[]).map((cur) => ({ id: cur, label: t(`market.cur.${cur}` as TKey), icon: currencyIcon(cur) })),
          selected: currency,
          id: 'market.cur',
          onChange: (cur) => {
            currency = cur as Currency;
            bounds = priceBounds(b.cat, currency, rarity);
            price = suggestPrice(unitValue * qty, currency, bounds);
            draw();
          },
        }),
      );
      cy += ROW;
      label(cy, `${t('market.price')} · ${t('market.bounds', { min: bounds[0], max: bounds[1] })}`);
      const base = suggestPrice(unitValue * qty, currency, bounds);
      stepper(cy + LINE_H, `${price}`, currencyIcon(currency), 'market.price', () => ((price = clampPrice(price - priceStep(price - 1), bounds)), draw()), () => ((price = clampPrice(price + priceStep(price), bounds)), draw()), () =>
        this.openNumberSheet({
          title: t('market.priceTitle'),
          value: price,
          min: bounds[0],
          max: bounds[1],
          icon: currencyIcon(currency),
          presets: [1, 2, 5].map((n) => ({ label: t('market.preset', { n }), tip: t('market.presetTip', { n }), value: clampPrice(base * n, bounds) })),
          info: (v) => t('market.gets', { n: sellerGets(v, b.cat.market.feeRate) }),
          id: 'market.priceSheet',
          onDone: (v) => ((price = v), draw()),
        }),
      );
      cy += ROW;
      // fee and what the seller gets
      const gets = mtext(this, x + iw, cy, t('market.gets', { n: sellerGets(price, b.cat.market.feeRate) }), 'pGood', { align: 1, maxW: iw / 2 });
      body.add(gets);
      body.add(mtext(this, x, cy, t('market.fee', { fee: marketFee(price, b.cat.market.feeRate) }), 'pSec', { maxW: iw - gets.width - 6 }));
      cy += LINE_H + 3;
      // the town: a list sheet when there is a choice
      const tn = towns[town];
      body.add(
        new MButton(this, x, cy, iw, TAP, {
          label: tn ? t('market.town', { name: placeName(tn.name) }) : t('market.noTown'),
          icon: 'flag',
          variant: 'secondary',
          id: 'market.town',
          tip: t('market.noTownHint'),
          onClick: () => {
            if (towns.length > 1) this.openOptions(t('market.townTitle'), towns.map((tw, i) => ({ id: i, label: placeName(tw.name), icon: 'flag' })), town, (i) => ((town = i), draw()), 'market.townSheet');
            else showTooltip(this, t('market.noTownHint'), body);
          },
        }),
      );
      listBtn.setIcon(currencyIcon(currency));
      listBtn.setEnabled(!!tn, t('market.noTownHint'));
    };
    draw();
  }

  /**
   * Numeric entry (P23): the value with its bounds and what it gives, presets, a keypad, Cancel / OK. OK is
   * disabled with the bounds as its reason while the value is outside them. It hides the sheet under it until
   * it closes (one sheet at a time, V5-029).
   */
  openNumberSheet(o: { title: string; value: number; min: number; max: number; icon?: string; presets?: { label: string; tip: string; value: number }[]; info?: (v: number) => string; id: string; onDone: (v: number) => void }): void {
    // a short landscape screen (the phone on its side, Telegram) has no room for the four-row pad: a wider
    // dialog with the digits in two rows and the presets, Cancel and OK in a third (every key stays)
    const tall = (cw: number) => SHEET_TITLE_H + 18 + LINE_H + 4 + 4 * (TAP + GAP) + sheetActionsH([{ label: t('common.cancel') }, { label: t('common.ok') }], cw) + 2;
    const short = this.variant !== 'compactPortrait' && tall(Math.min(this.m.VW - 16, 200)) > this.m.VH - 16;
    if (short) return this.openNumberPad(o);
    const w = Math.min(this.m.VW - 16, 200);
    const cols = o.presets?.length ? 4 : 3;
    const digits = String(o.max).length;
    let typed = String(o.value);
    let fresh = true;
    let m: ReturnType<typeof openParchmentSheet> | null = null;
    const value = () => Number(typed || '0');
    const inside = (v: number) => v >= o.min && v <= o.max;
    const actions: MButtonOpts[] = [
      { label: t('common.cancel'), variant: 'secondary', id: `${o.id}.cancel`, onClick: () => m?.close() },
      {
        label: t('common.ok'),
        icon: 'check',
        variant: 'primary',
        id: `${o.id}.ok`,
        onClick: () => {
          if (!inside(value())) return;
          m?.close();
          o.onDone(value());
        },
      },
    ];
    const headH = 18 + LINE_H + 4;
    const h = SHEET_TITLE_H + headH + 4 * (TAP + GAP) + sheetActionsH(actions, w) + 2;
    m = openParchmentSheet(this, { title: o.title, w, h, actions, shadeCloses: false, id: o.id });
    const sheet = m;
    const ok = sheet.buttons[sheet.buttons.length - 1];
    const { x, y, w: iw } = sheet.body;
    const head = this.add.container(0, 0);
    sheet.c.add(head);
    const show = () => {
      head.removeAll(true);
      const v = value();
      head.add(mosaicImage(this, x, y, iw, 18, 'parchmentWell'));
      const txt = mtext(this, x + iw / 2, y + 4, typed || '0', inside(v) ? 'pInk' : 'pBad', { size: 9, align: 0.5, maxW: iw - 30 });
      head.add(txt);
      if (o.icon) head.add(addIcon(this, Math.round(txt.x - txt.width / 2 - 14), y + 3, o.icon, ''));
      const line = `${t('market.bounds', { min: o.min, max: o.max })}${o.info && inside(v) ? ` · ${o.info(v)}` : ''}`;
      head.add(mtext(this, x + iw / 2, y + 20, line, inside(v) ? 'pSec' : 'pBad', { size: TEXT_MIN, align: 0.5, maxW: iw }));
      ok.setEnabled(inside(v), t('market.bounds', { min: o.min, max: o.max }));
    };
    const press = (k: string) => {
      if (k === 'del') typed = fresh ? '' : typed.slice(0, -1);
      else if (k === 'clr') typed = '';
      else typed = (fresh ? '' : typed.replace(/^0+/, '')) + k;
      typed = typed.slice(0, digits);
      fresh = false;
      show();
    };
    const kw = Math.floor((iw - GAP * (cols - 1)) / cols);
    const ky = y + headH;
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'].forEach((k, i) => {
      const kx = x + (i % 3) * (kw + GAP);
      const kyy = ky + Math.floor(i / 3) * (TAP + GAP);
      if (k === 'del') sheet.c.add(new MIconButton(this, kx, kyy, kw, TAP, { icon: 'back', label: t('market.keyDel'), variant: 'secondary', id: `${o.id}.del`, onClick: () => press('del') }));
      else sheet.c.add(new MButton(this, kx, kyy, kw, TAP, { label: k === 'clr' ? 'C' : k, variant: 'secondary', tip: k === 'clr' ? t('market.keyClear') : undefined, id: `${o.id}.key${k}`, onClick: () => press(k) }));
    });
    (o.presets ?? []).forEach((p, i) => {
      const px = x + 3 * (kw + GAP);
      sheet.c.add(
        new MButton(this, px, ky + i * (TAP + GAP), x + iw - px, TAP, {
          label: p.label,
          variant: 'neutral',
          tip: p.tip,
          id: `${o.id}.preset${i}`,
          onClick: () => {
            typed = String(p.value);
            fresh = true;
            show();
          },
        }),
      );
    });
    show();
  }

  /** The numeric entry of a short landscape screen (see openNumberSheet): the same keys, value and rules in three rows. */
  private openNumberPad(o: Parameters<MarketScene['openNumberSheet']>[0]): void {
    const w = Math.min(this.m.VW - 16, DIALOG_MAX);
    const digits = String(o.max).length;
    let typed = String(o.value);
    let fresh = true;
    const value = () => Number(typed || '0');
    const inside = (v: number) => v >= o.min && v <= o.max;
    const headH = 18 + LINE_H + 4;
    const h = SHEET_TITLE_H + headH + 3 * (TAP + GAP) + 6;
    const sheet = openParchmentSheet(this, { title: o.title, w, h, shadeCloses: false, closeButton: false, id: o.id });
    const { x, y, w: iw } = sheet.body;
    const head = this.add.container(0, 0);
    sheet.c.add(head);
    const ky = y + headH;
    const kw = Math.floor((iw - GAP * 5) / 6);
    const key = (i: number, r: number) => ({ kx: x + i * (kw + GAP), kyy: ky + r * (TAP + GAP) });
    let ok: MButton | null = null;
    const show = () => {
      head.removeAll(true);
      const v = value();
      head.add(mosaicImage(this, x, y, iw, 18, 'parchmentWell'));
      const txt = mtext(this, x + iw / 2, y + 4, typed || '0', inside(v) ? 'pInk' : 'pBad', { size: 9, align: 0.5, maxW: iw - 30 });
      head.add(txt);
      if (o.icon) head.add(addIcon(this, Math.round(txt.x - txt.width / 2 - 14), y + 3, o.icon, ''));
      const line = `${t('market.bounds', { min: o.min, max: o.max })}${o.info && inside(v) ? ` · ${o.info(v)}` : ''}`;
      head.add(mtext(this, x + iw / 2, y + 20, line, inside(v) ? 'pSec' : 'pBad', { size: TEXT_MIN, align: 0.5, maxW: iw }));
      ok?.setEnabled(inside(v), t('market.bounds', { min: o.min, max: o.max }));
    };
    const press = (k: string) => {
      if (k === 'del') typed = fresh ? '' : typed.slice(0, -1);
      else if (k === 'clr') typed = '';
      else typed = (fresh ? '' : typed.replace(/^0+/, '')) + k;
      typed = typed.slice(0, digits);
      fresh = false;
      show();
    };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'clr', 'del'].forEach((k, i) => {
      const { kx, kyy } = key(i % 6, Math.floor(i / 6));
      if (k === 'del') sheet.c.add(new MIconButton(this, kx, kyy, kw, TAP, { icon: 'back', label: t('market.keyDel'), variant: 'secondary', id: `${o.id}.del`, onClick: () => press('del') }));
      else sheet.c.add(new MButton(this, kx, kyy, kw, TAP, { label: k === 'clr' ? 'C' : k, variant: 'secondary', tip: k === 'clr' ? t('market.keyClear') : undefined, id: `${o.id}.key${k}`, onClick: () => press(k) }));
    });
    // the third row: the presets (when the entry has them), then Cancel and OK
    const presets = o.presets ?? [];
    const n = presets.length + 2;
    const bw = Math.floor((iw - GAP * (n - 1)) / n);
    const r3 = ky + 2 * (TAP + GAP);
    presets.forEach((p, i) =>
      sheet.c.add(
        new MButton(this, x + i * (bw + GAP), r3, bw, TAP, {
          label: p.label,
          variant: 'neutral',
          tip: p.tip,
          id: `${o.id}.preset${i}`,
          onClick: () => {
            typed = String(p.value);
            fresh = true;
            show();
          },
        }),
      ),
    );
    const cx = x + presets.length * (bw + GAP);
    sheet.c.add(new MButton(this, cx, r3, bw, TAP, { label: t('common.cancel'), variant: 'secondary', id: `${o.id}.cancel`, onClick: () => sheet.close() }));
    ok = new MButton(this, cx + bw + GAP, r3, x + iw - (cx + bw + GAP), TAP, {
      label: t('common.ok'),
      icon: 'check',
      variant: 'primary',
      id: `${o.id}.ok`,
      onClick: () => {
        if (!inside(value())) return;
        sheet.close();
        o.onDone(value());
      },
    });
    sheet.c.add(ok);
    show();
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

/** Every object under `c` (a container tree) reads in pane `n` (focus order, landscape-v6 §4). */
function inPane(c: Phaser.GameObjects.Container, n: number): void {
  for (const o of c.list) {
    focusPane(o, n);
    if (o instanceof Phaser.GameObjects.Container) inPane(o, n);
  }
}
