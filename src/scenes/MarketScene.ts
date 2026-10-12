import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { addIcon, ICON_PX, ScrollArea, type FontKey } from '../ui/kit';
import { Grid, ItemIcon, ScrollList, confirmDialog, showTooltip, subjectName, toast, type IconSubject } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { wrapText, LINE_H } from '../ui/textfit';
import { MOSAIC, TEXT_MIN } from '../ui/tokens';
import { makePressable } from '../ui/mosaic/base';
import { ensureFonts } from '../ui/fonts';
import {
  GAP, addParchmentEmpty, fit, MButton, MChip, MIconButton, SHEET_ACTION_H, SHEET_TITLE_H, SWITCH_H, SegmentedSwitch, TAP, ScreenFrame, TopBar, mosaicImage, mtext, mw, openParchmentSheet, rarityInk, sheetActionsH, wrapWords,
  type Box, type MButtonOpts,
} from '../ui/mosaic';
import { bigItemIcon, itemName, openItemCard } from '../ui/sheet';
import { econ, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { addEconState, currencyIcon, ensureEconIcons, priceText } from '../ui/econ/widgets';
import {
  clampPrice, canAfford, econState, listingAction, marketFee, priceBounds, priceStep, sellerGets, suggestPrice, timeLeft, type EconState, type ListingAction,
} from '../game/economy';
import { isApiError, type Currency, type EconomyCatalog, type MarketListing, type MarketQuery, type WalletInfo } from '../platform/api';
import type { ProfileView } from '../online/client';
import { ITEM_LIST, isBound, itemValue, normalizeItem, type Item } from '../data/items';
import { CONSUMABLES, CONSUMABLE_IDS, type ConsumableId } from '../data/consumables';
import { hapticNotify } from '../platform/telegram';
import { resolveBack } from '../platform/nav';
import { fmtDuration } from '../util/format';
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
type Filter = 'kind' | 'cur' | 'sort';
const SORTS: SortF[] = ['newest', 'price_asc', 'price_desc', 'ending'];
const RESOURCES = ['food', 'wood', 'bronze'] as const;
const RES_VALUE: Record<string, number> = { food: 1, wood: 1, bronze: 3 };

/** Left edge of a row's text (after the 24 px icon). */
const ROW_TX = 33;
/** Line steps of a row's name (7) and sub-lines (6.5). */
const NAME_LH = 9;
const SUB_LH = 8.5;

/**
 * A list row's text. Compact: the name on one line beside the right-hand control, the facts under it.
 * Stacked (a name that does not fit there): the name across the row's full width in as many lines as it
 * takes, then the facts beside the control. A name is never cut (only a single word wider than the row).
 */
type RowText = { stacked: boolean; name: string[]; sub: string[]; h: number };

/** Height of the right-hand control (price button, Cancel listing). */
const SIDE_H = 24;

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
    const bw = Math.floor((w - (n - 1) * GAP) / n);
    // each filter names its value and opens a sheet with every option (P8, MKT-2)
    const filters: { id: Filter; label: string; icon: string; tip: string }[] = [
      { id: 'kind', label: t(`market.kind.${this.q.kind}` as TKey), icon: 'amphora', tip: t('market.kindTip') },
      { id: 'cur', label: t(`market.cur.${this.q.cur}` as TKey), icon: this.q.cur === 'all' ? 'coin' : currencyIcon(this.q.cur), tip: t('market.curTip') },
      { id: 'sort', label: t(`market.sort.${this.q.sort}` as TKey), icon: 'log', tip: t('market.sortTip') },
    ];
    filters.forEach((f, i) => {
      const fx = x0 + i * (bw + GAP);
      this.page.add(new MButton(this, fx, y, i === n - 1 ? x0 + w - fx : bw, FILTER_H, { variant: 'secondary', label: f.label, icon: f.icon, id: `market.${f.id}`, tip: f.tip, onClick: () => this.openFilter(f.id) }));
    });
    y += FILTER_H + GAP;
    const refName = this.q.ref ? this.refLabel(this.q.ref) : t('market.anyItem');
    const findW = this.q.ref ? w - FILTER_H - GAP : w;
    this.page.add(new MButton(this, x0, y, findW, FILTER_H, { variant: 'secondary', label: this.q.ref ? refName : t('market.find'), icon: 'eye', id: 'market.find', tip: t('market.findTip'), onClick: () => this.openFind((ref) => this.setQuery({ ref })) }));
    if (this.q.ref) this.page.add(this.clearButton(x0 + findW + GAP, y, () => this.setQuery({ ref: null }), 'market.clearRef'));
    y += FILTER_H + GAP;
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
    const list = new ScrollList(this, this.page, x0, y, w, h, {
      count: rows,
      // ScrollList renders rows `w - 3` wide
      rowH: Math.max(...this.listings.map((l) => this.browseRow(b, l, w - 3, now).text.h)),
      fade: MOSAIC.parch,
      render: (i, row, rw, rh, area) => {
        if (i === this.listings.length) {
          row.add(new MButton(this, 0, 4, rw, FILTER_H, { variant: 'secondary', label: t('market.more'), icon: 'plus', id: 'market.more', onClick: () => void this.more() }));
          return;
        }
        this.listingRow(b, this.listings[i], row, rw, rh, area, now);
      },
    });
    this.areas.push(list);
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
    this.drawRowText(row, rw, rh, text, font);
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

  openListing(b: Base, l: MarketListing): void {
    const now = Date.now();
    const act = listingAction(l, now);
    const s = this.subject(l);
    const left = timeLeft(l.expiresAt, now);
    // one fact per line, wrapped rather than cut (G14): price and seller, town, time left, what the seller gets
    const notes: Note[] = [
      { text: `${priceText(l.price, l.currency)} · ${t('market.by', { name: l.seller.name ?? '?' })}`, font: 'red' },
      { text: t('market.town', { name: l.town.name }) },
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
      // the item card's text column (sheet.ts openItemCard: min(VW - 12, 210) less its padding)
      const noteW = Math.min(this.m.VW - 12, 210) - 16 - 3;
      openItemCard(this, { item: s.item, hero: b.profile?.heroes[0]?.hero, title: this.listingName(l), notes: notes.flatMap((n) => wrapText(n.text, noteW, 3).lines.map((text) => ({ text, font: n.font === 'red' ? ('pBad' as const) : undefined }))), actions });
      return;
    }
    const actions: MButtonOpts[] =
      act === 'buy'
        ? [noBuy ? { label: `${l.price}`, variant: 'disabled', disabledReason: noBuy, id: 'market.buy' } : { label: `${l.price}`, icon: currencyIcon(l.currency), variant: 'primary', id: 'market.buy', onClick: () => this.askBuy(b, l) }]
        : act === 'cancel'
          ? [{ label: t('market.cancelListing'), icon: 'close', variant: 'secondary', id: 'market.cancel', onClick: () => this.askCancel(l) }]
          : [];
    this.goodsCard(s, l.qty, this.listingName(l), notes, actions);
  }

  /**
   * The listing card for goods (resources, consumables) on a kit sheet: icon, name, description, the notes,
   * and the action (Buy, Cancel listing) or none. The X, a tap outside and Back close it (P11, G5).
   */
  private goodsCard(s: IconSubject, qty: number, name: string, notes: Note[], actions: MButtonOpts[]): void {
    const w = Math.min(this.m.VW - 16, 200);
    const inner = w - 16;
    const lines = (text: string, font: FontKey, max = 0) => {
      const out = wrapWords(text, inner, (x) => mw(x, font));
      return max ? out.slice(0, max) : out;
    };
    const desc = 'consumable' in s ? lines(tOr(`consumable.${s.consumable}.desc`, CONSUMABLES[s.consumable as ConsumableId]?.desc ?? ''), 'pInk', 3) : [];
    const ink = (n: Note): FontKey => (n.font === 'red' ? 'pBad' : 'pSec');
    const noteLines = notes.flatMap((n) => lines(n.text, ink(n)).map((text) => ({ text, font: ink(n) })));
    let m: ReturnType<typeof openParchmentSheet> | null = null;
    const acts = actions.map((a) => ({ ...a, onClick: a.onClick && (() => (m?.close(), a.onClick!())) }));
    const want = SHEET_TITLE_H + 32 + desc.length * LINE_H + (desc.length ? 4 : 0) + noteLines.length * LINE_H + 6 + sheetActionsH(acts, w);
    m = openParchmentSheet(this, { title: name, w, h: want, actions: acts, id: 'market.goods' });
    const { c, body } = m;
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
    const list = new ScrollList(this, this.page, x0, y, w, h, {
      count: mine.listings.length,
      rowH: Math.max(...mine.listings.map((l) => lay(l, w - 3).text.h)),
      fade: MOSAIC.parch,
      render: (i, row, rw, rh, area) => {
        const l = mine.listings[i];
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
    const area = viewH < bodyH ? new ScrollArea(this, sheet.c, x0, sheet.body.y, iw, viewH, this.m.S) : null;
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
          label: tn ? t('market.town', { name: tn.name }) : t('market.noTown'),
          icon: 'flag',
          variant: 'secondary',
          id: 'market.town',
          tip: t('market.noTownHint'),
          onClick: () => {
            if (towns.length > 1) this.openOptions(t('market.townTitle'), towns.map((tw, i) => ({ id: i, label: tw.name, icon: 'flag' })), town, (i) => ((town = i), draw()), 'market.townSheet');
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

