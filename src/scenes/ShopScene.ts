import { setCosmeticLoadout } from '../game/cosmetics';
import { addSignInGate, showsSignInGate } from '../ui/account/gate';
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { scaleIcon, ScrollArea, addIcon, addText, tappable } from '../ui/kit';
import { ItemIcon, addScrollHint, confirmDialog, showTooltip, subjectName, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { wrapText, LINE_H } from '../ui/textfit';
import { confirmPurchase, flyReward, addClaimGlow, type FlyTarget } from '../ui/mosaic';
import { MODE_ICON, MOSAIC, TEXT_MIN, lineHeight } from '../ui/tokens';
import { fadeIn } from '../ui/motion';
import { walletOverdrawn } from '../game/economy';
import { ensureFonts } from '../ui/fonts';
import { frameScrollTexts } from '../ui/sheet';
import { econ, newRequestId, packLegalKey, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { pickBattleConsumable } from '../ui/econ/consumablePicker';
import { fmtAgo } from '../util/format';
import { addComingSoon, addCosmetic, addEconState, cosmeticName, currencyIcon, ensureEconIcons, priceText, rewardName } from '../ui/econ/widgets';
import { cosmeticAction, cosmeticOffer, cosmeticsBySlot, packButton, packOffers, premiumOffer, type CosmeticOffer } from '../ui/econ/shopModel';
import { LookCard, MarketCard, addPackCard, addShopSkeleton, packLayout, type LookState } from '../ui/econ/shopParts';
import { PASS_XP, claimableCount, econState, focusTier, passProgress, tierState, withClaim, type EconState, type Track } from '../game/economy';
import { isApiError, type CosmeticInfo, type Currency, type EconomyCatalog, type PassReward, type SeasonPassInfo, type WalletInfo } from '../platform/api';
import type { ProfileView } from '../online/client';
import { platform } from '../platform';
import { haptic, hapticNotify } from '../platform/haptics';
import { legalUrl } from '../ui/legal';
import { uiCoin } from '../audio/hooks';
import { state } from '../state';
import { MButton, MBadge, MChip, FrescoBanner, ParchmentCard, SectionTitle, SECTION_TITLE_H, SegmentedSwitch, SWITCH_H, addTipLine, GAP, addHubShell, addParchmentEmpty, mosaicImage, mtext, mw, openParchmentSheet, sheetActionsH, SHEET_TITLE_H, type Box, type MButtonOpts } from '../ui/mosaic';
import { wrapWords } from '../ui/mosaic/base';
import { lang, t, tOr, type TKey } from '../i18n';

type Tab = 'shop' | 'pass' | 'wallet';
const TABS: Tab[] = ['shop', 'pass', 'wallet'];

/** The painted shop fresco (ART-004, AS-04): an agora stall, loaded here (the Shop is its only slot). */
const FRESCO_KEY = 'ui_fresco_shop';
const FRESCO_FILE = 'ui/fresco_shop.jpg';
/** The pass track: the tier column, a row (a reward cell holds its icon line and a 22 UI px Claim button), a button. */
const TIER_W = 24;
const ROW_H = 46;
const TAP_H = 22;

interface ShopData {
  tab?: Tab;
  /** Use the in-memory demo economy (layout check, screenshots). */
  demo?: boolean;
}

interface Loaded {
  cat: EconomyCatalog;
  wallet: WalletInfo;
  pass: SeasonPassInfo | null;
  cons: ConsumableInfo | null;
  profile: ProfileView | null;
}

/**
 * The Shop hub (docs/DESIGN_V2.md "Monetization and economy"; v5 spec
 * design/ux/screens-modes.md M-13): cosmetics with previews and the loadout,
 * and the Market door; the season pass (free and premium tracks) with its
 * season card pinned over the track; the wallet (Drachmae packs for Telegram
 * Stars, history). Consumables are sold by the merchants on the war map
 * (MerchantScene, docs/DUELS.md); the shop only points there. All
 * server-owned; outside Telegram or offline it explains why and offers a
 * retry. A tab hub: always a root (HUB-01), whatever door opened it.
 */
export class ShopScene extends BaseScene {
  private tab: Tab = 'shop';
  private loaded: Loaded | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private page!: Phaser.GameObjects.Container;
  private head!: Phaser.GameObjects.Container;
  private areas: { destroy(): void }[] = [];
  private busy = false;
  private pendingIds = new Map<string, string>();
  private pageTop = 0;
  private fixedChip = true;
  /** The framed content area (inside the stone band, under the top bar). */
  private box!: Box;
  private gen = 0;
  /** The Drachmae chip (counts to the new balance after a purchase). */
  private drChip: FlyTarget | null = null;

  constructor() {
    super('Shop');
  }

  preload(): void {
    if (!this.textures.exists(FRESCO_KEY)) this.load.image(FRESCO_KEY, FRESCO_FILE);
  }

  create(data: ShopData): void {
    this.initUi();
    ensureFonts(this);
    ensureEconIcons(this);
    setEconSource(data?.demo ? new DemoEconSource({ heroes: state.campaign.data.heroes.slice(0, 5), stash: state.campaign.data.stash }) : null);
    this.tab = data?.tab && TABS.includes(data.tab) ? data.tab : 'shop';
    this.loaded = null;
    this.st = 'loading';
    this.areas = [];
    this.busy = false;
    // a hub: always a root (Telegram shows Close); a door that brought us here switched tabs (ia.md §1.2)
    this.screen({ back: null });
    const shell = addHubShell(this, { title: t('tab.shop'), active: 'shop' });
    shell.area.destroy(); // the pages bring their own scroll areas under the fixed header
    this.box = shell.frame.content;
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    this.ui.add([this.head, this.page]);
    this.events.once('shutdown', () => this.clearPage());
    // signed out: decided here, since fetchAll's catch can't report it from inside create(), where
    // sys.isActive() is still false (GATE02-B1)
    if (!econ().available()) this.st = 'outside';
    this.render();
    if (this.st === 'loading') void this.fetchAll();
  }

  async fetchAll(): Promise<void> {
    const gen = ++this.gen;
    this.st = 'loading';
    this.render();
    const src = econ();
    try {
      if (!src.available()) throw Object.assign(new Error('outside'), { status: 0, code: 'outside' });
      // the public catalogue first: a 503 there means the realm is closed
      const cat = await src.catalog();
      const [wallet, pass, cons, profile] = await Promise.all([
        src.wallet(),
        src.pass().catch((e) => (isApiError(e) && !e.offline ? null : Promise.reject(e))),
        src.consumables().catch((e) => (isApiError(e) && !e.offline ? null : Promise.reject(e))),
        src.profile().catch(() => null),
      ]);
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.loaded = { cat, wallet, pass, cons, profile };
      setCosmeticLoadout(wallet.loadout);
      this.st = 'ready';
    } catch (e) {
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.st = (e as { code?: string })?.code === 'outside' ? 'outside' : econState(e, src.available());
    }
    this.render();
  }

  // ------------------------------------------------------------------ frame

  /**
   * The fixed header: the Drachmae balance (the one currency this shop spends;
   * the war's gold belongs to the war map, the campaign's to the campaign), the
   * market stall in a fresco frame, then Shop | Pass | Wallet. The tab bar is
   * the navigation.
   */
  private render(): void {
    this.head.removeAll(true);
    const H = this.head;
    const d = this.loaded;
    ensureEconIcons(this);
    const { x, y: by, w: bw } = this.box;
    const x0 = x + 4;
    const w = bw - 8;
    let y = by + 4;
    this.fixedChip = this.box.h >= 170;
    this.drChip = null;
    if (this.fixedChip) {
      const chip = this.makeChip(x0, y);
      H.add(chip);
      y += chip.h + 3;
    }
    // the painted agora stall: where you are, before any word (only where there is room)
    if (this.box.h >= 280) {
      H.add(new FrescoBanner(this, x0, y, w, 30, { label: t('shop.title'), id: 'shop.banner', image: FRESCO_KEY }));
      y += 30 + 3;
    }
    const claim = d?.pass ? claimableCount(d.pass) : 0;
    const sw = new SegmentedSwitch(this, x0, y, w, {
      options: TABS.map((k) => ({ id: k, label: t(`shop.tab.${k}` as TKey), icon: w >= 156 ? (k === 'shop' ? 'shop' : k === 'pass' ? 'pass' : 'drachma') : undefined })),
      selected: this.tab,
      id: 'shop.tab',
      onChange: (id) => {
        this.tab = id as Tab;
        fadeIn(this, this.page);
        this.buildPage();
      },
    });
    H.add(sw);
    if (claim) H.add(new MBadge(this, x0 + 1 + 2 * Math.floor((w - 2) / 3) - 6, y + 3, claim));
    this.pageTop = y + SWITCH_H + 4;
    this.buildPage();
  }

  /** The Drachmae balance chip (a tap: the wallet). */
  private makeChip(x: number, y: number): MChip {
    const dr = this.loaded?.wallet.drachmae;
    const chip = new MChip(this, x, y, { icon: 'drachma', value: dr === undefined || dr === null ? '…' : `${dr} ${t('econ.drachmae')}`, onClick: () => this.switchTab('wallet'), tip: t('econ.purseTip'), id: 'shop.drachmae' });
    // flyReward lands on the chip; the head is rebuilt with the new balance right after
    this.drChip = Object.assign(chip, { setValue: () => undefined }) as unknown as FlyTarget;
    return chip;
  }

  /** On a small screen the balance scrolls with the page: its chip tops the content. Returns the y under it. */
  private pageHead(c: Phaser.GameObjects.Container, y: number): number {
    if (this.fixedChip) return y;
    const chip = this.makeChip(1, y);
    c.add(chip);
    return y + chip.h + 3;
  }

  /** Switch the page (the switch follows on the next render). */
  private switchTab(tab: Tab): void {
    this.tab = tab;
    this.render();
  }

  /** Bottom edge of the page. */
  private pageBottom(): number {
    return this.box.y + this.box.h - 2;
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.page.removeAll(true);
  }

  private buildPage(): void {
    this.clearPage();
    const top = this.pageTop;
    if (this.st === 'loading') {
      // a skeleton of the cards to come (SHP-4)
      addShopSkeleton(this, this.page, this.box.x + 4, top, this.box.w - 8, this.pageBottom() - top, t('shop.v5.loading'));
      return;
    }
    if (this.st === 'outside') {
      // AU-01 Sign in to play online (design/ux/accounts-v6.md §4.4)
      const [x, w, h] = [this.box.x + 4, this.box.w - 8, this.pageBottom() - top];
      this.page.add(mosaicImage(this, x, top, w, h, 'parchmentWell'));
      // with Create account and Log in where the platform signs in with forms (V6-ACCT-07)
      if (showsSignInGate()) addSignInGate(this, this.page, x, top, w, h, 'shop', () => this.scene.restart(this.sys.settings.data));
      else this.page.add(addParchmentEmpty(this, x + 2, top + 2, w - 4, h - 4, { icon: 'flag', title: t('auth.gate.title'), hint: t('auth.gate.shop') }));
      return;
    }
    if (this.st !== 'ready' || !this.loaded) {
      addEconState(this, this.page, this.box.x + 4, top, this.box.w - 8, this.pageBottom() - top, this.st as EconState | 'loading', () => void this.fetchAll());
      return;
    }
    if (this.tab === 'shop') this.buildShop(this.loaded);
    else if (this.tab === 'pass') this.buildPass(this.loaded);
    else this.buildWallet(this.loaded);
  }

  private area(y: number, h: number): ScrollArea {
    const { S } = this.m;
    const a = new ScrollArea(this, this.page, this.box.x + 4, y, this.box.w - 8, h, S);
    this.areas.push(a);
    addScrollHint(this, this.page, a, MOSAIC.parch);
    return a;
  }

  // ------------------------------------------------------------------ shop: cosmetics (consumables point to the map)

  private buildShop(d: Loaded): void {
    const top = this.pageTop;
    const area = this.area(top, this.pageBottom() - top);
    const c = area.content;
    const w = this.box.w - 8 - 4;
    let y = this.pageHead(c, 1);
    // what this shop is (and is not): a tip the player can hide
    const tipH = addTipLine(this, c, 0, y, w, { text: t('shop.v5.tip'), dismissId: 'shop.what', card: true });
    if (tipH) y += tipH + 5;
    // the player market: a door of its own (D5); Back from it returns here
    const market = new MarketCard(this, 0, y, w, t('shop.v5.market'), t('shop.v5.marketSub'), () => this.scene.start('Market', { back: { scene: 'Shop', data: { tab: 'shop' } } }));
    c.add(market);
    y += market.h + 6;
    // cosmetics by slot: cards with their art
    c.add(new SectionTitle(this, 0, y, w, t('shop.cosmetics')));
    y += SECTION_TITLE_H + 2;
    const ch = wrapText(t('shop.cosmeticsHint'), w, 2);
    c.add(addText(this, 1, y, ch.lines.join('\n'), 'pSec'));
    y += ch.lines.length * LINE_H + 5;
    const cols = Math.max(2, Math.floor((w + GAP) / (58 + GAP)));
    const tw = Math.floor((w - (cols - 1) * GAP) / cols);
    for (const { slot, list } of cosmeticsBySlot(d.cat)) {
      const lab = this.add.container(0, y);
      c.add(lab);
      lab.add(mtext(this, 1, 1, tOr(`shop.slot.${slot}`, slot), 'pSec', { maxW: w - 4, box: { owner: lab, w, h: 11 } }));
      y += 12;
      // each row as tall as its longest name (one to three lines), never a fixed tall tile
      for (let r0 = 0; r0 < list.length; r0 += cols) {
        const rowItems = list.slice(r0, r0 + cols);
        const locks = rowItems.map((cm) => cosmeticOffer(cm, d.wallet, d.pass)).flatMap((o) => (o.kind === 'earn' ? [this.earnInfo(o).short] : []));
        const rh = LookCard.height(rowItems.map(cosmeticName), tw, locks);
        rowItems.forEach((cm, k) => c.add(this.cosmeticTile(k * (tw + GAP), y, tw, rh, cm, d)));
        y += rh + GAP;
      }
      y += 4;
    }
    // supplies moved onto the war map: the merchants of towns and trading posts (docs/DUELS.md)
    y += 2;
    c.add(new SectionTitle(this, 0, y, w, t('shop.consumables')));
    y += SECTION_TITLE_H + 2;
    const mm = wrapText(t('shop.mapMerchants'), w - 44, 6);
    const mh = Math.max(34, mm.lines.length * LINE_H + 10);
    c.add(mosaicImage(this, 0, y, w, mh, 'parchment'));
    const ix = 6;
    c.add(mosaicImage(this, ix, y + Math.round((mh - 26) / 2), 26, 26, 'parchmentWell'));
    c.add(new ItemIcon(this, ix + 1, y + Math.round((mh - 24) / 2), { consumable: 'morale_wine' }, { rarity: 'rare', tip: false }));
    c.add(addText(this, 38, y + Math.round((mh - mm.lines.length * LINE_H) / 2) + 1, mm.lines.join('\n'), 'pInk'));
    y += mh + 4;
    area.setContentHeight(y);
    frameScrollTexts(area, this.box.w - 8);
  }

  /** Where an earned-only look comes from: the pass tier that gives it, the Duels seasons, or nowhere (not for sale). */
  private earnInfo(o: Extract<CosmeticOffer, { kind: 'earn' }>): { text: string; short: string; icon: string } {
    if (o.source === 'season_pass') return { text: o.tier ? t('shop.earnPassTier', { n: o.tier }) : t('shop.earnPass'), short: t('shop.passOnly'), icon: 'pass' };
    if (o.source === 'duel_season') return { text: t('shop.earnDuels'), short: t('shop.duelSeasonShort'), icon: MODE_ICON.arena };
    return { text: t('shop.notForSale'), short: t('shop.notForSale'), icon: 'lock' };
  }

  /**
   * A look: its preview, its whole name (up to three lines, never cut), then
   * one state: Equipped (a gold check on the preview), Owned (a tick), its
   * price (grey when you cannot afford it: a tap shows the way to the
   * wallet), or where to earn it (in ink with a lock chip, SHP-5; a tap
   * opens its sheet).
   */
  private cosmeticTile(x: number, y: number, w: number, h: number, cm: CosmeticInfo, d: Loaded): LookCard {
    const o = cosmeticOffer(cm, d.wallet, d.pass);
    const state: LookState =
      o.kind === 'equipped'
        ? { kind: 'equipped', text: t('shop.equipped') }
        : o.kind === 'owned'
          ? { kind: 'owned', text: t('econ.owned') }
          : o.kind === 'earn'
            ? { kind: 'locked', text: this.earnInfo(o).short }
            : { kind: 'price', text: `${o.price}`, short: !o.afford };
    return new LookCard(this, x, y, w, h, {
      name: cosmeticName(cm),
      state,
      art: (card, cx, cy, size) => card.add(addCosmetic(this, Math.round(cx - size / 2), Math.round(cy - size / 2), cm.id, cm.slot, size)),
      onClick: () => this.openCosmetic(cm),
      id: `cosmetic:${cm.id}`,
    });
  }

  /** A look's sheet: the preview, its slot and state (the price once: on the button), where it is earned, one action; X only (SHP-2). */
  openCosmetic(cm: CosmeticInfo): void {
    const d = this.loaded;
    if (!d) return;
    const o = cosmeticOffer(cm, d.wallet, d.pass);
    const act = cosmeticAction(o);
    const earn = o.kind === 'earn' ? this.earnInfo(o) : null;
    const name = cosmeticName(cm);
    let close = (): void => undefined;
    let action: MButtonOpts | null = null;
    if (act?.id === 'shop.equip') action = { label: act.equip ? t('shop.equip') : t('shop.unequip'), icon: act.equip ? 'check' : 'back', variant: 'primary', id: 'shop.equip', onClick: () => (close(), void this.equipCosmetic(cm, act.equip)) };
    else if (act?.id === 'shop.buyCosmetic')
      action = {
        label: act.short ? t('pass.needDr', { n: act.price }) : `${act.price}`,
        icon: 'drachma',
        variant: act.short ? 'secondary' : 'primary',
        id: 'shop.buyCosmetic',
        onClick: () => (close(), act.short ? this.needDrachmae(act.price, name) : this.askBuy(cm.id, name, act.price, 'drachmae')),
      };
    else if (act?.id === 'shop.earnGo')
      action = { label: act.to === 'duels' ? t('shop.openDuels') : t('shop.openPass'), icon: earn?.icon, variant: 'secondary', id: 'shop.earnGo', onClick: () => (close(), act.to === 'duels' ? this.scene.start('Duel', { tab: 'ranked' }) : this.switchTab('pass')) };
    const actions = action ? [action] : undefined;
    const w = Math.min(this.m.VW - 16, 220);
    const bw = w - 16;
    const lh = Math.ceil(lineHeight(TEXT_MIN));
    const why = earn ? wrapWords(earn.text, bw, (s) => mw(s, 'pInk', TEXT_MIN)).slice(0, 3) : [];
    const h = SHEET_TITLE_H + 2 + 62 + 6 + 11 + (why.length ? why.length * lh + 4 : 0) + 4 + sheetActionsH(actions, w) + 8;
    const m = openParchmentSheet(this, { title: name, w, h, actions, id: 'shop.cosmetic' });
    close = m.close;
    const { c, body: b } = m;
    let y = b.y + 2;
    const cx = b.x + b.w / 2;
    c.add(mosaicImage(this, Math.round(cx - 31), y, 62, 62, 'parchmentWell'));
    c.add(addCosmetic(this, Math.round(cx - 28), y + 3, cm.id, cm.slot, 56));
    y += 62 + 6;
    const st = o.kind === 'equipped' ? t('shop.equipped') : o.kind === 'owned' ? t('econ.owned') : '';
    const line = [tOr(`shop.slot.${cm.slot}`, cm.slot), st].filter(Boolean).join(' · ');
    c.add(mtext(this, cx, y, line, 'pSec', { align: 0.5, maxW: bw }));
    y += 11;
    for (const l of why) {
      c.add(mtext(this, cx, y, l, 'pInk', { size: TEXT_MIN, align: 0.5, maxW: bw }));
      y += lh;
    }
  }

  private async equipCosmetic(cm: CosmeticInfo, on: boolean): Promise<void> {
    try {
      const r = await econ().equipCosmetic(cm.slot, on ? cm.id : null);
      if (!this.loaded || !this.sys.isActive()) return;
      this.loaded.wallet.loadout = r.loadout;
      setCosmeticLoadout(r.loadout);
      hapticNotify('success');
      toast(this, on ? t('shop.equipped') : t('shop.unequip'), 'good');
      this.render();
    } catch (e) {
      this.fail(e);
    }
  }

  /** Confirm, then buy (consumable, cosmetic or the pass). */
  askBuy(item: string, name: string, price: number, currency: Currency): void {
    const d = this.loaded;
    if (!d) return;
    if (currency === 'drachmae' && d.wallet.drachmae < price) return this.needDrachmae(price, name);
    confirmDialog(this, {
      title: t('shop.buyTitle', { name }),
      body: t('shop.buyBody', { price: priceText(price, currency) }),
      ok: t('shop.buy'),
      okIcon: currencyIcon(currency),
      cancel: t('common.cancel'),
      onOk: () => void this.buy(item, name, currency),
    });
  }

  /** Buy now (no dialog). Keeps the request id until the server answers, so a retry never pays twice. */
  async buy(item: string, name: string, currency: Currency): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const key = `${item}:${currency}`;
    const rid = this.pendingIds.get(key) ?? newRequestId();
    this.pendingIds.set(key, rid);
    toast(this, t('econ.busy'));
    try {
      await econ().buy(item, { currency, requestId: rid });
      this.pendingIds.delete(key);
      if (!this.sys.isActive()) return true;
      hapticNotify('success');
      uiCoin();
      await this.fetchAll();
      toast(this, t('econ.bought', { name }), 'good');
      return true;
    } catch (e) {
      if (!(isApiError(e) && e.offline)) this.pendingIds.delete(key);
      this.fail(e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  private fail(e: unknown): void {
    if (!this.sys.isActive()) return;
    hapticNotify('error');
    const code = isApiError(e) ? e.code : '';
    const msg =
      code === 'insufficient_funds'
        ? t('econ.noFunds')
        : code === 'daily_cap'
          ? t('econ.dailyCap')
          : code === 'already_owned'
            ? t('econ.owned')
            : code === 'no_profile'
              ? t('econ.noProfile')
              : isApiError(e) && e.offline
                ? t('econ.offline')
                : t('econ.error');
    toast(this, msg, 'bad');
  }

  // ------------------------------------------------------------------ season pass

  /**
   * The pass: the season card and the Free / Premium headers are pinned (SHP-1: Unlock premium and
   * Claim all are seen on entry); only the track under them scrolls, opened at the player's tier.
   */
  private buildPass(d: Loaded): void {
    let top = this.pageTop;
    const p = d.pass;
    if (!p) {
      addEconState(this, this.page, this.box.x + 4, top, this.box.w - 8, this.pageBottom() - top, 'error', () => void this.fetchAll());
      return;
    }
    const w = this.box.w - 8 - 4;
    const prog = passProgress(p);
    const days = Math.max(0, Math.ceil((p.season.endsAt - Date.now()) / 86_400_000));
    const claimN = claimableCount(p);
    const prem = premiumOffer(p, d.wallet);
    // the season card's shape: the title beside "Ends in" when both fit (else "Ends in" under it); the two
    // buttons side by side when both labels fit at their first size (else one a row): nothing is cut
    const endsT = t('pass.endsIn', { d: days });
    const title = `${t('pass.season', { n: p.season.id })} · ${t('pass.tierOf', { n: p.tier, max: p.tiers.length })}`;
    const oneLine = mw(title, 'rInk', 7.5) + 8 + mw(endsT, 'pSec', TEXT_MIN) <= w - 16;
    const bh = 24;
    const bw = Math.floor((w - 16 - GAP) / 2);
    const unlockL = prem.short ? t('pass.needDr', { n: prem.price }) : t('pass.unlock', { n: prem.price });
    const claimL = claimN > 0 ? t('pass.claimAll', { n: claimN }) : t('pass.nothing');
    // a label fits in Cinzel capitals at the 6.5 floor (MButton drops an icon that would cost it that)
    const fits = (label: string, bwid: number) => mw(label.toUpperCase(), 'rCream', TEXT_MIN) <= bwid - 14;
    const sideBySide = (prem.owned || fits(unlockL, bw)) && fits(claimL, w - 16 - bw - GAP);
    const yx = oneLine ? 17 : 27;
    const hh = yx + 19 + bh + (sideBySide ? 0 : bh + GAP) + 4;
    const head = (this.fixedChip ? 0 : 17) + hh + 4 + 12;
    // pinned when the track keeps two rows under the card; on the shortest screens everything scrolls
    // together, opened at the top (the card and Claim all still show on entry)
    const pinned = this.pageBottom() - top - head >= ROW_H * 2 + GAP;
    const whole = pinned ? null : this.area(top, this.pageBottom() - top);
    const c = whole ? whole.content : this.page;
    const x0 = whole ? 0 : this.box.x + 4;
    if (whole) top = 1;
    // the season card: tier, ends in, XP to the next (tap: how XP is earned), the premium track, Claim all
    let y = top;
    const card = new ParchmentCard(this, x0, y, w, hh);
    c.add(card);
    const box = { owner: card as Phaser.GameObjects.Container, w, h: hh };
    c.add(mtext(this, x0 + 8, y + 5, title, 'rInk', { size: 7.5, maxW: w - 16 - (oneLine ? mw(endsT, 'pSec', TEXT_MIN) + 8 : 0), box }));
    if (oneLine) c.add(mtext(this, x0 + w - 8, y + 6, endsT, 'pSec', { size: TEXT_MIN, align: 1, box }));
    else c.add(mtext(this, x0 + 8, y + 16, endsT, 'pSec', { size: TEXT_MIN, maxW: w - 16, box }));
    // the XP bar: how it is earned at the left (a tap opens it), where it stands at the right, the bar under
    const xpT = t('pass.xp', { into: prog.into, need: prog.need });
    const xpW = prog.maxed ? 0 : mw(xpT, 'pInk', TEXT_MIN) + 6;
    const how = prog.maxed ? t('pass.maxed') : t('shop.v5.xpHow');
    c.add(mtext(this, x0 + 8, y + yx, how, 'pSec', { size: TEXT_MIN, maxW: w - 16 - xpW, box }));
    if (!prog.maxed) c.add(mtext(this, x0 + w - 8, y + yx, xpT, 'pInk', { size: TEXT_MIN, align: 1, box }));
    const g = this.add.graphics();
    const bw0 = w - 16;
    const gy = y + yx + 11;
    g.fillStyle(MOSAIC.stone1, 1);
    g.fillRect(x0 + 8, gy, bw0, 5);
    g.fillStyle(MOSAIC.gold, 1);
    g.fillRect(x0 + 9, gy + 1, Math.round((bw0 - 2) * (prog.maxed ? 1 : prog.need ? prog.into / prog.need : 0)), 3);
    g.lineStyle(0.6, MOSAIC.parchEdge, 1);
    g.strokeRect(x0 + 7.5, gy - 0.5, bw0 + 1, 6);
    c.add(g);
    const xz = this.add.zone(x0 + 4, y + yx - 5, w - 8, 22).setOrigin(0, 0).setInteractive();
    uiId(xz, 'pass.xpInfo');
    tappable(xz, whole, () => this.openPassXp());
    c.add(xz);
    // side by side: Unlock at the left, Claim all under the thumb; one a row: Claim all first (the primary
    // action while there is something to claim, so a short screen shows it without scrolling)
    const by = y + yx + 19;
    const claimFirst = !sideBySide && claimN > 0;
    const unlockY = claimFirst ? by + bh + GAP : by;
    const claimY = sideBySide || claimFirst ? by : by + bh + GAP;
    const unlockW = sideBySide ? bw : w - 16;
    if (prem.owned) c.add(new MChip(this, x0 + 8, unlockY + 3, { icon: 'pass', value: t('pass.unlocked'), w: unlockW, id: 'pass.unlocked' }));
    else {
      // not enough Drachmae: the button says what is missing and goes to the wallet
      c.add(new MButton(this, x0 + 8, unlockY, unlockW, bh, { label: unlockL, icon: 'drachma', variant: prem.short ? 'secondary' : 'primary', id: 'pass.unlock', tip: prem.short ? t('pass.needDrTip', { n: prem.price - d.wallet.drachmae }) : undefined, onClick: () => this.unlockPremium(p) }));
    }
    const cx = sideBySide ? x0 + 8 + bw + GAP : x0 + 8;
    c.add(new MButton(this, cx, claimY, sideBySide ? w - 16 - bw - GAP : w - 16, bh, { label: claimL, icon: claimN > 0 ? 'check' : undefined, variant: claimN > 0 ? 'primary' : 'disabled', disabledReason: t('pass.xpHint'), id: 'pass.claimAll', onClick: () => void this.claimAll() }));
    y += hh + 4;
    // on a short screen the balance chip sits under the card here (the card and Claim all come first: SHP-1)
    if (!this.fixedChip) {
      const chip = this.makeChip(x0 + 1, y);
      c.add(chip);
      y += chip.h + 4;
    }
    // the two tracks' headers (pinned with the card)
    const cellW = this.cellW(w);
    const lx = x0 + TIER_W + GAP;
    c.add(mtext(this, lx + cellW / 2, y, t('pass.free'), 'pSec', { size: 7, align: 0.5, maxW: cellW - 2 }));
    const premW = mw(t('pass.premium'), 'pInk', 7);
    const showSeal = premW + 14 <= cellW - 2;
    const px = lx + GAP + cellW + cellW / 2 + (showSeal ? 6 : 0);
    c.add(mtext(this, px, y, t('pass.premium'), 'pInk', { size: 7, align: 0.5, maxW: cellW - (showSeal ? 14 : 2) }));
    if (showSeal) c.add(addIcon(this, Math.round(px - premW / 2 - 13), y - 2, 'pass', p.premium ? '' : 'D'));
    y += 12;
    // the track: the only part that scrolls (opened at the player's tier)
    const area = whole ?? this.area(y, this.pageBottom() - y);
    let ty = whole ? y : 0;
    let focusY = 0;
    p.tiers.forEach((_tier, i) => {
      const row = this.add.container(0, ty);
      area.content.add(row);
      this.tierRow(d, p, i, row, w, ROW_H, area);
      if (i === focusTier(p) - 1) focusY = ty;
      ty += ROW_H + GAP;
    });
    area.setContentHeight(ty);
    if (!whole) area.setScroll(Math.max(0, focusY - (area.viewHeight - ROW_H) / 2));
    else frameScrollTexts(area, this.box.w - 8);
  }

  /** Width of a reward cell in a track `w` wide. */
  private cellW(w: number): number {
    return Math.floor((w - TIER_W - GAP - GAP) / 2);
  }

  /** How pass XP is earned (a tap on the bar). */
  openPassXp(): void {
    const w = Math.min(this.m.VW - 16, 250);
    const lines: [string, string][] = [
      ['swords', t('pass.xp.attack', { n: PASS_XP.attack, w: PASS_XP.attackWin })],
      ['flag', t('pass.xp.capture', { n: PASS_XP.capture })],
      ['arena', t('pass.xp.duel', { n: PASS_XP.duel, w: PASS_XP.duelWin })],
    ];
    const lh = Math.ceil(lineHeight(7));
    const wraps = lines.map(([, s]) => wrapWords(s, w - 16 - 18, (x) => mw(x, 'pInk', 7)));
    const tierT = t('pass.xp.tier', { n: PASS_XP.perTier });
    const tierL = wrapWords(tierT, w - 16, (x) => mw(x, 'pSec', 7));
    // X only (G5): the sheet explains, it asks nothing
    const m = openParchmentSheet(this, { title: t('pass.xpTitle'), w, h: SHEET_TITLE_H + wraps.reduce((a, x) => a + x.length * lh + 6, 0) + 2 + tierL.length * lh + 10, id: 'pass.xp' });
    const { c, body: b } = m;
    let y = b.y;
    lines.forEach(([icon], i) => {
      c.add(addIcon(this, b.x, y - 1, icon));
      wraps[i].forEach((l, k) => c.add(mtext(this, b.x + 18, y + k * lh, l, 'pInk', { maxW: b.w - 18 })));
      y += wraps[i].length * lh + 6;
    });
    tierL.forEach((l, k) => c.add(mtext(this, b.x, y + 2 + k * lh, l, 'pSec', { maxW: b.w })));
  }

  private tierRow(d: Loaded, p: SeasonPassInfo, i: number, row: Phaser.GameObjects.Container, rw: number, rh: number, area: ScrollArea): void {
    const tier = p.tiers[i];
    const reached = tier.tier <= p.tier;
    const next = tier.tier === p.tier + 1;
    const here = tier.tier === p.tier;
    // the tier: lit when reached, the next one rimmed with its progress, "you are here" on the current one
    const bh = rh - 4;
    const frame = { owner: row, w: TIER_W, h: rh };
    row.add(mosaicImage(this, 0, 2, TIER_W, bh, reached ? 'tileBronze' : next ? 'parchmentSel' : 'parchmentWell'));
    row.add(mtext(this, TIER_W / 2, here || next ? 7 : rh / 2 - 5, `${tier.tier}`, reached ? 'rCream' : next ? 'pInk' : 'pSec', { size: 8, align: 0.5, box: frame }));
    if (next) {
      const prog = passProgress(p);
      const g = this.add.graphics();
      g.fillStyle(MOSAIC.stone1, 1);
      g.fillRect(4, rh - 12, TIER_W - 8, 3);
      g.fillStyle(MOSAIC.gold, 1);
      g.fillRect(4, rh - 12, Math.round((TIER_W - 8) * (prog.need ? prog.into / prog.need : 0)), 3);
      row.add(g);
    }
    if (here) row.add(mtext(this, TIER_W / 2, rh - 15, t('pass.you'), 'rCream', { size: TEXT_MIN, align: 0.5, maxW: TIER_W - 2, box: frame }));
    const cellW = this.cellW(rw);
    (['free', 'premium'] as Track[]).forEach((track, k) => this.rewardCell(d, p, tier.tier, track, track === 'free' ? tier.free : tier.premium, row, TIER_W + GAP + k * (cellW + GAP), cellW, rh - 2, area));
  }

  /**
   * A reward: its icon with the quantity beside it and a short noun under them (never a word broken in
   * two; a look: its name on up to two lines). Four states: claimable (lit, a glow and a real Claim
   * button: SHP-1), claimed (a tick, quiet), not reached (a lock: reach the tier), premium (the pass
   * seal: unlock the premium track). A tap on any other cell explains it.
   */
  private rewardCell(d: Loaded, p: SeasonPassInfo, tier: number, track: Track, r: PassReward, row: Phaser.GameObjects.Container, x: number, w: number, h: number, area: ScrollArea): void {
    const st = tierState(p, tier, track);
    const claimable = st === 'claimable';
    if (claimable) addClaimGlow(this, row, x, 0, w, h);
    row.add(mosaicImage(this, x, 0, w, h, claimable ? 'parchmentSel' : st === 'claimed' || st === 'locked' ? 'parchmentWell' : 'parchment'));
    if (st === 'premium') {
      // a bronze edge: this one waits for the premium track, not for a tier
      const g = this.add.graphics();
      g.lineStyle(1, MOSAIC.bronze, 0.9);
      g.strokeRoundedRect(x + 0.5, 0.5, w - 1, h - 1, 4);
      row.add(g);
    }
    const name = rewardName(r, d.cat);
    if (!claimable) {
      const bg = this.add.zone(x, 0, w, h).setOrigin(0, 0).setInteractive();
      uiId(bg, `pass:${tier}:${track}`);
      row.add(bg);
      tappable(bg, area, () => showTooltip(this, `${name}\n${st === 'claimed' ? t('pass.claimed') : st === 'premium' ? t('pass.premiumLocked') : t('pass.locked', { n: tier })}`, bg));
    }
    const dimmed = st === 'claimed' || st === 'locked';
    const ic = 20;
    if (r.kind === 'cosmetic') {
      const cm = d.cat.cosmetics.find((c) => c.id === r.id);
      row.add(addCosmetic(this, x + 3, 2, r.id, cm?.slot ?? 'emblem', ic));
    } else {
      const sub = r.kind === 'consumable' ? { consumable: r.id } : { resource: r.kind === 'gold' ? 'gold' : 'drachmae' };
      row.add(new ItemIcon(this, x + 3, 2, sub, { size: ic, tip: false, glow: false, rarity: track === 'premium' ? 'epic' : 'common' }));
    }
    // the state, as a badge on the icon's corner: a tick, a lock, the pass seal
    const bx = x + 15;
    const by = 12;
    if (st === 'claimed') row.add(scaleIcon(addIcon(this, bx, by, 'check'), 0.75));
    else if (st === 'locked') row.add(scaleIcon(addIcon(this, bx, by, 'lock', 'D'), 0.75));
    else if (st === 'premium') row.add(scaleIcon(addIcon(this, bx, by, 'pass'), 0.75));
    const box = { owner: row, w: x + w, h };
    const tx = x + ic + 6;
    const tw = w - ic - 6 - 3;
    const lh = Math.ceil(lineHeight(TEXT_MIN));
    const ink = dimmed ? 'pSec' : 'pInk';
    if (r.kind !== 'cosmetic') {
      // the quantity big beside the icon, the noun under
      const qty = r.kind === 'consumable' ? `${r.qty}×` : `${r.amount}`;
      row.add(mtext(this, tx, 4, qty, ink, { size: 8.5, maxW: tw, box }));
    }
    if (claimable) {
      // a real Claim button across the cell's lower half (the toast and the fly-in name the reward)
      const b = new MButton(this, x + 2, h - TAP_H - 1, w - 4, TAP_H, {
        label: t('pass.claim'),
        variant: 'primary',
        id: `pass:${tier}:${track}`,
        onClick: () => {
          const m = b.getWorldTransformMatrix();
          void this.claim(tier, track, r, { x: m.tx / this.m.S + (w - 4) / 2, y: m.ty / this.m.S });
        },
      });
      row.add(b);
      return;
    }
    const raw = r.kind === 'gold' ? t('res.wargold') : r.kind === 'drachmae' ? t('res.drachmae') : r.kind === 'consumable' ? subjectName({ consumable: r.id }) : name;
    // a label starts with a capital, as "War gold" beside it does (an item's name is lower case for use in a sentence)
    const noun = raw.charAt(0).toUpperCase() + raw.slice(1);
    // the noun (or a look's name) under the icon line, on up to two lines (a third is folded into the second)
    let lines = wrapWords(noun, w - 6, (s) => mw(s, ink, TEXT_MIN));
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];
    const ny = Math.min(24, h - lines.length * lh - 1);
    lines.forEach((l, k) => row.add(mtext(this, x + 3, ny + k * lh, l, ink, { size: TEXT_MIN, maxW: w - 6, box })));
  }

  async claim(tier: number, track: Track, r: PassReward, from?: { x: number; y: number }): Promise<void> {
    if (this.busy || !this.loaded?.pass) return;
    this.busy = true;
    try {
      await econ().claimPass(tier, track);
      if (!this.loaded?.pass || !this.sys.isActive()) return;
      this.loaded.pass = withClaim(this.loaded.pass, tier, track);
      hapticNotify('success');
      uiCoin();
      toast(this, t('pass.got', { reward: rewardName(r, this.loaded.cat) }), 'good');
      if (r.kind === 'drachmae') {
        this.loaded.wallet.drachmae += r.amount;
        if (this.drChip && from) flyReward(this, 'drachma', from.x, from.y, this.drChip, this.loaded.wallet.drachmae);
      }
      if (r.kind === 'gold' && this.loaded.profile) this.loaded.profile.resources.gold += r.amount;
      const s = (this.areas[0] as ScrollArea | undefined)?.scrollY ?? 0;
      this.render();
      (this.areas[0] as ScrollArea | undefined)?.setScroll(s);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }

  private async claimAll(): Promise<void> {
    const p = this.loaded?.pass;
    if (!p) return;
    for (const tier of p.tiers)
      for (const track of ['free', 'premium'] as Track[]) {
        if (!this.loaded?.pass || tierState(this.loaded.pass, tier.tier, track) !== 'claimable') continue;
        await this.claim(tier.tier, track, track === 'free' ? tier.free : tier.premium);
      }
  }

  private unlockPremium(p: SeasonPassInfo): void {
    const d = this.loaded;
    if (!d) return;
    if (d.wallet.drachmae < p.premiumDrachmae) return this.needDrachmae(p.premiumDrachmae, t('pass.premium'));
    confirmDialog(this, {
      title: t('pass.unlockTitle'),
      body: t('pass.unlockBody', { n: p.premiumDrachmae }),
      ok: t('pass.unlock', { n: p.premiumDrachmae }),
      okIcon: 'drachma',
      cancel: t('common.cancel'),
      onOk: () => void this.buy('season_pass', t('pass.premium'), 'drachmae'),
    });
  }

  /** Not enough Drachmae: what it costs, what you have, and the way to the wallet (never just a red toast). */
  needDrachmae(price: number, what: string): void {
    const d = this.loaded;
    if (!d) return;
    const have = d.wallet.drachmae;
    const w = Math.min(this.m.VW - 16, 240);
    const lh = Math.ceil(lineHeight(7));
    const lines = wrapWords(t('econ.needDrBody', { what, n: price, have, miss: price - have }), w - 16, (s) => mw(s, 'pInk', 7));
    let close = (): void => undefined;
    // the way to the wallet (terracotta); the X is the sheet's one close (G5)
    const actions: MButtonOpts[] = [{ label: t('econ.getDr'), icon: 'drachma', variant: 'primary', id: 'econ.toWallet', onClick: () => (close(), this.switchTab('wallet')) }];
    const m = openParchmentSheet(this, { title: t('econ.needDrTitle'), w, h: SHEET_TITLE_H + lines.length * lh + 8 + sheetActionsH(actions, w) + 8, actions, id: 'econ.needDr' });
    close = m.close;
    lines.forEach((l, i) => m.c.add(mtext(this, m.body.x, m.body.y + i * lh, l, 'pInk', { maxW: m.body.w })));
  }

  // ------------------------------------------------------------------ wallet

  private buildWallet(d: Loaded): void {
    const top = this.pageTop;
    const area = this.area(top, this.pageBottom() - top);
    const c = area.content;
    const w = this.box.w - 8 - 4;
    let y = this.pageHead(c, 1);
    // the balance, big
    const over = walletOverdrawn(d.wallet);
    const bal = new ParchmentCard(this, 0, y, w, 44);
    c.add(bal);
    c.add(scaleIcon(addIcon(this, 9, y + 11, 'drachma'), 1.8));
    const bs = [14, 12, 10].find((z) => mw(`${d.wallet.drachmae}`, 'pInk', z) <= w - 90) ?? 10;
    const num = mtext(this, 38, y + 6, `${d.wallet.drachmae}`, over ? 'pBad' : 'pInk', { size: bs, box: { owner: bal, w, h: 44 } });
    c.add(num);
    c.add(mtext(this, 38 + mw(`${d.wallet.drachmae}`, 'pInk', bs) + 6, y + 7 + Math.round(bs / 4), t('econ.drachmae').toUpperCase(), 'rInk', { size: 7, maxW: w - 46 - mw(`${d.wallet.drachmae}`, 'pInk', bs), box: { owner: bal, w, h: 44 } }));
    c.add(mtext(this, 38, y + 27, t('wallet.balance'), 'pSec', { size: TEXT_MIN, maxW: w - 44, box: { owner: bal, w, h: 44 } }));
    y += 48;
    // a real problem only: below zero after a refunded pack (0 is a normal empty wallet)
    if (over) {
      y += addTipLine(this, c, 0, y, w, { text: t('wallet.cannotSpend'), tone: 'warn', card: true }) + 4;
    }
    const note = wrapText(t('wallet.note'), w - 6, 4);
    c.add(addText(this, 1, y, note.lines.join('\n'), 'pSec'));
    y += note.lines.length * LINE_H + 6;
    // no payment provider here yet (the web): say why above the packs, which keep their amounts (AU-20)
    const pay = platform.payments.status();
    if (!pay.available && pay.reason === 'coming_soon') y += addComingSoon(this, c, 0, y, w, { title: t('shop.web.soonTitle'), body: t('shop.web.soonBody') }) + 6;
    // packs: real money, so the Telegram blue button with "Stars", and a confirmation. Pixel-perfect (SHP-3):
    // two lines a card, the one label size of every button, the "Best value" tag inside its card
    c.add(new SectionTitle(this, 0, y, w, t('wallet.packs')));
    y += SECTION_TITLE_H + 4;
    const packs = packOffers(d.cat);
    const L = packLayout(packs, w, { label: (n) => packButton(pay, n).label, noun: t('econ.drachmae'), bonusLong: (n) => t('shop.v5.bonus', { n }) });
    packs.forEach((pk, i) => {
      const px = (i % L.cols) * (L.pw + GAP);
      if (pk.best) addClaimGlow(this, c, px, y, L.pw, L.cardH(true)).setAlpha(0.5);
      const btn = packButton(pay, pk.stars);
      const ph = addPackCard(this, c, px, y, L, pk, {
        noun: t('econ.drachmae'),
        bestTag: t('wallet.best'),
        bonusText: L.longBonus ? t('shop.v5.bonus', { n: pk.bonus }) : t('wallet.bonus', { n: pk.bonus }),
        label: btn.label,
        tip: t('res.tip.stars'),
        onClick: () => this.askPack(pk),
        offReason: btn.offReason,
      });
      // the next row starts under the tallest card of this one
      if (i % L.cols === L.cols - 1 || i === packs.length - 1) y += Math.max(ph, L.cols === 2 ? L.cardH(false) : 0) + GAP;
    });
    y += 4;
    // what the provider's payments buy (Stars copy only for Telegram Stars), and the legal pages
    const legal = wrapText(t(packLegalKey(pay)), w - 6, 4);
    c.add(addText(this, 1, y, legal.lines.join('\n'), 'pMuted'));
    y += legal.lines.length * LINE_H + 4;
    const lw = Math.floor((w - GAP) / 2);
    c.add(new MButton(this, 0, y, lw, 24, { label: t('wallet.terms'), variant: 'secondary', id: 'wallet.terms', onClick: () => platform.share.openExternal(legalUrl('terms', lang())) }));
    c.add(new MButton(this, lw + GAP, y, w - lw - GAP, 24, { label: t('wallet.refunds'), variant: 'secondary', id: 'wallet.refunds', onClick: () => platform.share.openExternal(legalUrl('refunds', lang())) }));
    y += 24 + 8;
    // history
    c.add(new SectionTitle(this, 0, y, w, t('wallet.history')));
    y += SECTION_TITLE_H + 3;
    if (!d.wallet.ledger.length) {
      c.add(addText(this, 1, y, t('wallet.noHistory'), 'pSec'));
      y += 11;
    }
    const now = Date.now();
    for (const l of d.wallet.ledger.slice(0, 30)) {
      const row = new ParchmentCard(this, 0, y, w, 22);
      c.add(row);
      const delta = mtext(this, w - 6, y + 7, `${l.delta > 0 ? '+' : ''}${l.delta}`, l.delta >= 0 ? 'pGood' : 'pBad', { align: 1, box: { owner: row, w, h: 22 } });
      c.add(delta);
      const when = mtext(this, w - 12 - delta.width, y + 7, fmtAgo(l.at, now), 'pSec', { align: 1, box: { owner: row, w, h: 22 } });
      c.add(when);
      c.add(mtext(this, 6, y + 7, tOr(`wallet.kind.${l.kind}`, l.kind), 'pInk', { maxW: w - 22 - delta.width - when.width, box: { owner: row, w, h: 22 } }));
      y += 22 + 2;
    }
    area.setContentHeight(y + 4);
    frameScrollTexts(area, this.box.w - 8);
  }

  /** Real money: the confirmation sheet says so, then Telegram's own payment. */
  private askPack(pk: { id: string; stars: number; drachmae: number }): void {
    confirmPurchase(this, { what: t('pass.reward.drachmae', { n: pk.drachmae }), stars: pk.stars, onOk: () => void this.buyPack(pk.id, pk.drachmae) });
  }

  /** The battle consumable picker of attacks and duels (layout check and gallery). */
  previewPicker(): Promise<unknown> {
    return pickBattleConsumable(this, { inventory: this.loaded?.cons?.inventory });
  }

  async buyPack(id: string, n: number): Promise<string> {
    if (this.busy) return 'busy';
    this.busy = true;
    try {
      const r = await econ().buyPack(id, (s) => this.sys.isActive() && toast(this, s === 'invoice' ? t('wallet.invoice') : s === 'paying' ? t('wallet.paying') : t('wallet.confirming')));
      if (!this.sys.isActive()) return r;
      const msg: Record<string, [string, 'good' | 'bad' | 'info']> = {
        credited: [t('wallet.credited', { n }), 'good'],
        pending: [t('wallet.pending'), 'info'],
        cancelled: [t('wallet.cancelled'), 'info'],
        failed: [t('wallet.failed'), 'bad'],
        offline: [t('econ.offline'), 'bad'],
        unavailable: [t('econ.outside'), 'bad'],
      };
      if (r === 'credited') {
        hapticNotify('success');
        await this.fetchAll();
      } else if (r !== 'cancelled') hapticNotify('error');
      const [text, kind] = msg[r];
      toast(this, text, kind);
      return r;
    } finally {
      this.busy = false;
      haptic('light');
    }
  }
}

