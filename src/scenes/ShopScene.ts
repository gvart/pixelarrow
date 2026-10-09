import { setCosmeticLoadout } from '../game/cosmetics';
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { scaleIcon, Button, ScrollArea, addIcon, addText, tappable, type FontKey } from '../ui/kit';
import { ItemIcon, addScrollHint, confirmDialog, openModal, showTooltip, subjectName, toast } from '../ui/widgets';
import { uiFrame, uiId } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { InfoChip, confirmPurchase, flyReward, addClaimGlow, openSheet } from '../ui/v3';
import { MODE_ICON, MOSAIC } from '../ui/tokens';
import { fadeIn } from '../ui/motion';
import { addModeBanner } from '../ui/modeArt';
import { walletOverdrawn } from '../game/economy';
import { ensureFonts } from '../ui/fonts';
import { frameScrollTexts } from '../ui/sheet';
import { econ, newRequestId, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { pickBattleConsumable } from '../ui/econ/consumablePicker';
import { fmtAgo } from '../util/format';
import { addCosmetic, addEconState, cosmeticName, currencyIcon, ensureEconIcons, priceText, rewardName } from '../ui/econ/widgets';
import { PASS_XP, claimableCount, econState, focusTier, passProgress, tierState, withClaim, type EconState, type Track } from '../game/economy';
import { isApiError, type CosmeticInfo, type Currency, type EconomyCatalog, type PassReward, type SeasonPassInfo, type WalletInfo } from '../platform/api';
import type { ProfileView } from '../online/client';
import { haptic, hapticNotify, openExternalLink } from '../platform/telegram';
import { legalUrl } from '../ui/legal';
import { uiCoin } from '../audio/hooks';
import { state } from '../state';
import { MButton, MBadge, MChip, OfferCard, FrescoBanner, ParchmentCard, SectionTitle, SECTION_TITLE_H, SegmentedSwitch, SWITCH_H, addTipLine, GAP, addHubShell, mosaicImage, mtext, mw, type Box, type OfferState } from '../ui/mosaic';
import { lang, t, tOr, type TKey } from '../i18n';

type Tab = 'shop' | 'pass' | 'wallet';
const TABS: Tab[] = ['shop', 'pass', 'wallet'];

interface ShopData {
  tab?: Tab;
  /** Use the in-memory demo economy (layout check, screenshots). */
  demo?: boolean;
  /** Where Back goes (default: the menu). */
  back?: { scene: string; data?: Record<string, unknown> };
}

interface Loaded {
  cat: EconomyCatalog;
  wallet: WalletInfo;
  pass: SeasonPassInfo | null;
  cons: ConsumableInfo | null;
  profile: ProfileView | null;
}

/**
 * The shop (docs/DESIGN_V2.md "Monetization and economy"): cosmetics with
 * previews and the loadout; the season pass (free and premium tracks); the
 * wallet (Drachmae packs for Telegram Stars, history). Consumables are sold
 * by the merchants on the war map (MerchantScene, docs/DUELS.md); the shop
 * only points there. All server-owned; outside Telegram or offline it
 * explains why and offers a retry.
 */
export class ShopScene extends BaseScene {
  private tab: Tab = 'shop';
  private loaded: Loaded | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private page!: Phaser.GameObjects.Container;
  private head!: Phaser.GameObjects.Container;
  private areas: { destroy(): void }[] = [];
  private backTo: ShopData['back'];
  private busy = false;
  private pendingIds = new Map<string, string>();
  private pageTop = 0;
  private fixedChip = true;
  /** The framed content area (inside the stone band, under the top bar). */
  private box!: Box;
  private gen = 0;
  /** The Drachmae chip (counts to the new balance after a purchase). */
  private drChip: InfoChip | null = null;

  constructor() {
    super('Shop');
  }

  create(data: ShopData): void {
    this.initUi();
    ensureFonts(this);
    ensureEconIcons(this);
    setEconSource(data?.demo ? new DemoEconSource({ heroes: state.campaign.data.heroes.slice(0, 5), stash: state.campaign.data.stash }) : null);
    this.tab = data?.tab && TABS.includes(data.tab) ? data.tab : 'shop';
    this.backTo = data?.back;
    this.loaded = null;
    this.st = 'loading';
    this.areas = [];
    this.busy = false;
    // a hub: root (Telegram shows Close); only a caller that sent us here asks for its way back
    this.screen({ back: this.backTo ? () => this.leave() : null });
    const shell = addHubShell(this, { title: t('tab.shop'), active: 'shop' });
    shell.area.destroy(); // the pages bring their own scroll areas under the fixed header
    this.box = shell.frame.content;
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    this.ui.add([this.head, this.page]);
    this.events.once('shutdown', () => this.clearPage());
    this.render();
    void this.fetchAll();
  }

  private leave(): void {
    const b = this.backTo;
    this.scene.start(b?.scene ?? 'Menu', b?.data ?? {});
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
    // the market stall: where you are, before any word (only where there is room)
    if (this.box.h >= 280) {
      H.add(new FrescoBanner(this, x0, y, w, 30, { label: t('shop.title'), id: 'shop.banner', art: (parent, ax, ay, aw, ah) => addModeBanner(this, parent, ax, ay, aw, ah, 'shop') }));
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
    const chip = new MChip(this, x, y, { icon: 'drachma', value: dr === undefined || dr === null ? '-' : `${dr} ${t('econ.drachmae')}`, onClick: () => this.switchTab('wallet'), tip: t('econ.purseTip'), id: 'shop.drachmae' });
    // flyReward lands on the chip; the head is rebuilt with the new balance right after
    this.drChip = Object.assign(chip, { setValue: () => undefined }) as unknown as InfoChip;
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
    const tipH = addTipLine(this, c, 0, y, w, { text: t('shop.sit.shop'), dismissId: 'shop.what', card: true });
    if (tipH) y += tipH + 5;
    // cosmetics by slot: cards with their art
    c.add(new SectionTitle(this, 0, y, w, t('shop.cosmetics')));
    y += SECTION_TITLE_H + 2;
    const ch = wrapText(t('shop.cosmeticsHint'), w, 2);
    c.add(addText(this, 1, y, ch.lines.join('\n'), 'pSec'));
    y += ch.lines.length * LINE_H + 5;
    const cols = Math.max(2, Math.floor((w + GAP) / (58 + GAP)));
    const tw = Math.floor((w - (cols - 1) * GAP) / cols);
    for (const slot of d.cat.slots) {
      const list = d.cat.cosmetics.filter((x) => x.slot === slot);
      if (!list.length) continue;
      const lab = this.add.container(0, y);
      c.add(lab);
      lab.add(mtext(this, 1, 1, tOr(`shop.slot.${slot}`, slot), 'pSec', { maxW: w - 4, box: { owner: lab, w, h: 11 } }));
      y += 12;
      // each row as tall as its longest name (one to three lines), never a fixed tall tile
      for (let r0 = 0; r0 < list.length; r0 += cols) {
        const rowItems = list.slice(r0, r0 + cols);
        const rh = OfferCard.height(rowItems.map(cosmeticName), tw);
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

  /** Where an earned-only look comes from: the pass tier that gives it, or the Duels seasons. */
  private earnedFrom(cm: CosmeticInfo, d: Loaded): { text: string; short: string; icon: string; go: () => void } | null {
    if (cm.drachmae !== null) return null;
    if (cm.source === 'season_pass') {
      const tier = d.pass?.tiers.find((x) => (x.premium.kind === 'cosmetic' && x.premium.id === cm.id) || (x.free.kind === 'cosmetic' && x.free.id === cm.id))?.tier;
      return { text: tier ? t('shop.earnPassTier', { n: tier }) : t('shop.earnPass'), short: t('shop.passOnly'), icon: 'pass', go: () => this.switchTab('pass') };
    }
    if (cm.source === 'duel_season') return { text: t('shop.earnDuels'), short: t('shop.duelSeasonShort'), icon: MODE_ICON.arena, go: () => this.scene.start('Duel', { tab: 'ranked' }) };
    return { text: t('shop.notForSale'), short: t('shop.notForSale'), icon: 'lock', go: () => undefined };
  }

  /**
   * A look: its preview, its whole name (up to three lines, never cut), then
   * one state: Equipped (a gold check on the preview), Owned (a tick), its
   * price (grey when you cannot afford it: a tap shows the way to the
   * wallet), or where to earn it (a lock on the preview, the pass seal or
   * the Duels arena; a tap opens it).
   */
  private cosmeticTile(x: number, y: number, w: number, h: number, cm: CosmeticInfo, d: Loaded): OfferCard {
    const owned = d.wallet.cosmetics.includes(cm.id);
    const equipped = d.wallet.loadout[cm.slot] === cm.id;
    const earn = owned ? null : this.earnedFrom(cm, d);
    const afford = cm.drachmae !== null && d.wallet.drachmae >= cm.drachmae;
    const state: OfferState = equipped ? { kind: 'equipped', text: t('shop.equipped') } : owned ? { kind: 'owned', text: t('econ.owned') } : earn ? { kind: 'locked', text: earn.short, icon: earn.icon } : { kind: 'price', text: `${cm.drachmae}`, icon: 'drachma', short: !afford };
    return new OfferCard(this, x, y, w, h, {
      name: cosmeticName(cm),
      state,
      art: (card, cx, cy, size) => card.add(addCosmetic(this, Math.round(cx - size / 2), Math.round(cy - size / 2), cm.id, cm.slot, size)),
      onClick: () => this.openCosmetic(cm),
      id: `cosmetic:${cm.id}`,
    });
  }

  openCosmetic(cm: CosmeticInfo): void {
    const d = this.loaded;
    if (!d) return;
    const { VW } = this.m;
    const owned = d.wallet.cosmetics.includes(cm.id);
    const equipped = d.wallet.loadout[cm.slot] === cm.id;
    const earn = owned ? null : this.earnedFrom(cm, d);
    const w = Math.min(VW - 16, 200);
    const why = earn ? wrapText(earn.text, w - 16, 2) : null;
    const m = openModal(this, { title: cosmeticName(cm), w, h: 26 + 64 + 22 + (why ? why.lines.length * LINE_H + 4 : 0) + SIZE.btnH + 14 });
    const { c, x, y } = m;
    const g = this.add.graphics();
    g.fillStyle(0x2a1d18, 1);
    g.fillRect(x + w / 2 - 31, y + 24, 62, 62);
    g.lineStyle(2, 0xb8863b, 1);
    g.strokeRect(x + w / 2 - 31, y + 24, 62, 62);
    c.add(g);
    c.add(addCosmetic(this, Math.round(x + w / 2 - 28), y + 27, cm.id, cm.slot, 56));
    const state = equipped ? t('shop.equipped') : owned ? t('econ.owned') : cm.drachmae !== null ? t('econ.dr', { n: cm.drachmae }) : '';
    const line = [tOr(`shop.slot.${cm.slot}`, cm.slot), state].filter(Boolean).join(' · ');
    c.add(addText(this, x + w / 2, y + 92, ellipsize(line, w - 16), 'sec', 0.5));
    if (why) c.add(addText(this, x + w / 2, y + 104, why.lines.join('\n'), 'ink', 0.5).setCenterAlign());
    const by = m.y + m.h - 9 - SIZE.btnH;
    const bw = Math.floor((w - 12 - 6 - GAP) / 2);
    c.add(new Button(this, x + 6, by, bw, SIZE.btnH, { label: t('common.close'), variant: 'ghost', onClick: () => m.close() }));
    let act: Button;
    if (owned)
      act = new Button(this, x + w - 6 - bw, by, bw, SIZE.btnH, {
        label: equipped ? t('shop.unequip') : t('shop.equip'),
        icon: equipped ? 'back' : 'check',
        variant: 'primary',
        id: 'shop.equip',
        onClick: () => (m.close(), void this.equipCosmetic(cm, !equipped)),
      });
    else if (earn) act = new Button(this, x + w - 6 - bw, by, bw, SIZE.btnH, { label: cm.source === 'duel_season' ? t('shop.openDuels') : t('shop.openPass'), icon: earn.icon, inline: true, variant: 'primary', id: 'shop.earnGo', onClick: () => (m.close(), earn.go()) });
    else {
      const price = cm.drachmae ?? 0;
      const short = d.wallet.drachmae < price;
      act = new Button(this, x + w - 6 - bw, by, bw, SIZE.btnH, { label: short ? t('pass.needDr', { n: price }) : `${price}`, icon: 'drachma', inline: true, variant: 'primary', id: 'shop.buyCosmetic', onClick: () => (m.close(), short ? this.needDrachmae(price, cosmeticName(cm)) : this.askBuy(cm.id, cosmeticName(cm), price, 'drachmae')) });
    }
    c.add(act);
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

  private buildPass(d: Loaded): void {
    const top = this.pageTop;
    const p = d.pass;
    if (!p) {
      addEconState(this, this.page, this.box.x + 4, top, this.box.w - 8, this.pageBottom() - top, 'error', () => void this.fetchAll());
      return;
    }
    const area = this.area(top, this.pageBottom() - top);
    const c = area.content;
    const w = this.box.w - 8 - 4;
    const prog = passProgress(p);
    const days = Math.max(0, Math.ceil((p.season.endsAt - Date.now()) / 86_400_000));
    const claimN = claimableCount(p);
    let y = this.pageHead(c, 1);
    // the season card: tier, XP to the next (tap: how XP is earned), the premium track, Claim all
    const hh = 62;
    const card = new ParchmentCard(this, 0, y, w, hh);
    c.add(card);
    const box = { owner: card as Phaser.GameObjects.Container, w, h: hh };
    const endsT = t('pass.endsIn', { d: days });
    c.add(mtext(this, w - 8, y + 6, endsT, 'pSec', { size: 6.5, align: 1, box }));
    const title = `${t('pass.season', { n: p.season.id })} · ${t('pass.tierOf', { n: p.tier, max: p.tiers.length })}`;
    c.add(mtext(this, 8, y + 5, title, 'rInk', { size: 7.5, maxW: w - 20 - mw(endsT, 'pSec', 6.5), box }));
    // the XP bar: what it measures at the left, where it stands at the right, the bar under
    const xpT = t('pass.xp', { into: prog.into, need: prog.need });
    c.add(mtext(this, 8, y + 18, prog.maxed ? t('pass.maxed') : t('pass.xpHow'), 'pSec', { size: 6, maxW: w - 16 - (prog.maxed ? 0 : mw(xpT, 'pInk', 6) + 6), box }));
    if (!prog.maxed) c.add(mtext(this, w - 8, y + 18, xpT, 'pInk', { size: 6, align: 1, box }));
    const g = this.add.graphics();
    const bw0 = w - 16;
    g.fillStyle(MOSAIC.stone1, 1);
    g.fillRect(8, y + 28, bw0, 5);
    g.fillStyle(MOSAIC.gold, 1);
    g.fillRect(9, y + 29, Math.round((bw0 - 2) * (prog.maxed ? 1 : prog.need ? prog.into / prog.need : 0)), 3);
    g.lineStyle(0.6, MOSAIC.parchEdge, 1);
    g.strokeRect(7.5, y + 27.5, bw0 + 1, 6);
    c.add(g);
    const xz = this.add.zone(4, y + 14, w - 8, 18).setOrigin(0, 0).setInteractive();
    uiId(xz, 'pass.xpInfo');
    tappable(xz, area, () => this.openPassXp());
    c.add(xz);
    const bh = 24;
    const by = y + hh - bh - 4;
    const bw = Math.floor((w - 16 - GAP) / 2);
    if (p.premium) c.add(new MChip(this, 8, by + 3, { icon: 'pass', value: t('pass.unlocked'), w: bw, id: 'pass.unlocked' }));
    else {
      // not enough Drachmae: the button says what is missing and goes to the wallet
      const short = d.wallet.drachmae < p.premiumDrachmae;
      c.add(new MButton(this, 8, by, bw, bh, { label: short ? t('pass.needDr', { n: p.premiumDrachmae }) : t('pass.unlock', { n: p.premiumDrachmae }), icon: 'drachma', variant: short ? 'secondary' : 'primary', id: 'pass.unlock', tip: short ? t('pass.needDrTip', { n: p.premiumDrachmae - d.wallet.drachmae }) : undefined, onClick: () => this.unlockPremium(p) }));
    }
    c.add(new MButton(this, 8 + bw + GAP, by, w - 16 - bw - GAP, bh, { label: claimN > 0 ? t('pass.claimAll', { n: claimN }) : t('pass.nothing'), icon: claimN > 0 ? 'check' : undefined, variant: claimN > 0 ? 'primary' : 'disabled', disabledReason: t('pass.xpHint'), id: 'pass.claimAll', onClick: () => void this.claimAll() }));
    y += hh + 4;
    // the two tracks, then the tiers (the player's place on the track is marked)
    const cellW = Math.floor((w - 30 - GAP) / 2);
    c.add(mtext(this, 30 + cellW / 2, y, t('pass.free'), 'pSec', { size: 6.5, align: 0.5, maxW: cellW - 2 }));
    const premW = mw(t('pass.premium'), 'pInk', 6.5);
    const showSeal = premW + 14 <= cellW - 2;
    const px = 30 + GAP + cellW + cellW / 2 + (showSeal ? 6 : 0);
    c.add(mtext(this, px, y, t('pass.premium'), 'pInk', { size: 6.5, align: 0.5, maxW: cellW - (showSeal ? 14 : 2) }));
    if (showSeal) c.add(addIcon(this, Math.round(px - premW / 2 - 13), y - 2, 'pass', p.premium ? '' : 'D'));
    y += 12;
    const rowH = 36;
    let focusY = y;
    p.tiers.forEach((_tier, i) => {
      const row = this.add.container(0, y);
      c.add(row);
      this.tierRow(d, p, i, row, w, rowH, area);
      if (i === focusTier(p) - 1) focusY = y;
      y += rowH + GAP;
    });
    area.setContentHeight(y);
    area.setScroll(Math.max(0, focusY - (area.viewHeight - rowH) / 2));
  }

  /** How pass XP is earned (a tap on the bar). */
  openPassXp(): void {
    const w = Math.min(this.m.VW - 8, 250);
    const lines: [string, string][] = [
      ['swords', t('pass.xp.attack', { n: PASS_XP.attack, w: PASS_XP.attackWin })],
      ['flag', t('pass.xp.capture', { n: PASS_XP.capture })],
      ['arena', t('pass.xp.duel', { n: PASS_XP.duel, w: PASS_XP.duelWin })],
    ];
    const wraps = lines.map(([, s]) => wrapText(s, w - 20 - 18, 2));
    const m = openSheet(this, { title: t('pass.xpTitle'), w, h: 26 + wraps.reduce((a, x) => a + x.lines.length * LINE_H + 6, 0) + 14 + 10 + 24 + 16 });
    const { c, body: b } = m;
    let y = b.y;
    lines.forEach(([icon], i) => {
      c.add(addIcon(this, b.x, y - 1, icon));
      c.add(addText(this, b.x + 18, y, wraps[i].lines.join('\n'), 'ink'));
      y += wraps[i].lines.length * LINE_H + 6;
    });
    c.add(addText(this, b.x, y + 2, ellipsize(t('pass.xp.tier', { n: PASS_XP.perTier }), b.w), 'sec'));
    c.add(new Button(this, b.x, m.y + m.h - 8 - 24, b.w, 24, { label: t('common.close'), variant: 'ghost', id: 'pass.xp.close', onClick: () => m.close() }));
  }

  private tierRow(d: Loaded, p: SeasonPassInfo, i: number, row: Phaser.GameObjects.Container, rw: number, rh: number, area: ScrollArea): void {
    const tier = p.tiers[i];
    const reached = tier.tier <= p.tier;
    const next = tier.tier === p.tier + 1;
    const here = tier.tier === p.tier;
    // the tier: lit when reached, the next one rimmed with its progress, "you are here" on the current one
    const bh = rh - 6;
    row.add(mosaicImage(this, 0, 3, 26, bh, reached ? 'tileBronze' : next ? 'parchmentSel' : 'parchmentWell'));
    row.add(mtext(this, 13, here || next ? 6 : rh / 2 - 5, `${tier.tier}`, reached ? 'rCream' : next ? 'pInk' : 'pOff', { size: 7.5, align: 0.5, box: { owner: row, w: 26, h: rh } }));
    if (next) {
      const prog = passProgress(p);
      const g = this.add.graphics();
      g.fillStyle(MOSAIC.stone1, 1);
      g.fillRect(4, rh - 10, 18, 3);
      g.fillStyle(MOSAIC.gold, 1);
      g.fillRect(4, rh - 10, Math.round(18 * (prog.need ? prog.into / prog.need : 0)), 3);
      row.add(g);
    }
    if (here) row.add(mtext(this, 13, rh - 14, t('pass.you'), 'rCream', { size: 5.5, align: 0.5, maxW: 24, box: { owner: row, w: 26, h: rh } }));
    const cellW = Math.floor((rw - 30 - GAP) / 2);
    (['free', 'premium'] as Track[]).forEach((track, k) => this.rewardCell(d, p, tier.tier, track, track === 'free' ? tier.free : tier.premium, row, 30 + k * (cellW + GAP), cellW, rh - 2, area));
  }

  /**
   * A reward, short: its icon and a big quantity with a short noun under it
   * (never a word broken in two). Four states: claimable (lit, a glow,
   * "Claim"), claimed (a tick, quiet), not reached (grey lock: reach the
   * tier), premium (violet seal: unlock the premium track). A tap explains.
   */
  private rewardCell(d: Loaded, p: SeasonPassInfo, tier: number, track: Track, r: PassReward, row: Phaser.GameObjects.Container, x: number, w: number, h: number, area: ScrollArea): void {
    const st = tierState(p, tier, track);
    if (st === 'claimable') addClaimGlow(this, row, x, 0, w, h);
    row.add(mosaicImage(this, x, 0, w, h, st === 'claimable' ? 'parchmentSel' : st === 'claimed' || st === 'locked' ? 'parchmentWell' : 'parchment'));
    if (st === 'premium') {
      // a violet edge: this one waits for the premium track, not for a tier
      const g = this.add.graphics();
      g.lineStyle(1, MOSAIC.bronze, 0.9);
      g.strokeRoundedRect(x + 0.5, 0.5, w - 1, h - 1, 4);
      row.add(g);
    }
    const bg = this.add.zone(x, 0, w, h).setOrigin(0, 0).setInteractive();
    uiId(bg, `pass:${tier}:${track}`);
    row.add(bg);
    const name = rewardName(r, d.cat);
    bg.on('pointerup', () => {
      if (area.moved) return;
      if (st === 'claimable') {
        const m = bg.getWorldTransformMatrix();
        void this.claim(tier, track, r, { x: m.tx / this.m.S + w / 2, y: m.ty / this.m.S + h / 2 });
      } else showTooltip(this, `${name}\n${st === 'claimed' ? t('pass.claimed') : st === 'premium' ? t('pass.premiumLocked') : t('pass.locked', { n: tier })}`, bg);
    });
    const dimmed = st === 'claimed' || st === 'locked';
    const iy = Math.round((h - 22) / 2);
    if (r.kind === 'cosmetic') {
      const cm = d.cat.cosmetics.find((c) => c.id === r.id);
      row.add(addCosmetic(this, x + 3, iy - 1, r.id, cm?.slot ?? 'emblem', 24));
    } else {
      const sub = r.kind === 'consumable' ? { consumable: r.id } : { resource: r.kind === 'gold' ? 'gold' : 'drachmae' };
      row.add(new ItemIcon(this, x + 3, iy, sub, { size: 22, tip: false, glow: false, rarity: track === 'premium' ? 'epic' : 'common' }));
    }
    const tx = x + 29;
    const tw = w - 29 - 3;
    // the quantity big, the noun small (a look: its name on up to two lines)
    const qty = r.kind === 'gold' ? r.amount : r.kind === 'drachmae' ? r.amount : r.kind === 'consumable' ? r.qty : 0;
    const noun = r.kind === 'gold' ? t('res.wargold') : r.kind === 'drachmae' ? t('res.drachmae') : r.kind === 'consumable' ? subjectName({ consumable: r.id }) : '';
    const qFont: FontKey = dimmed ? 'pOff' : 'pInk';
    const qText = r.kind === 'consumable' ? `${qty}×` : `${qty}`;
    // "Claim" sits beside the number where both fit; on narrow cells it takes the noun's line
    const box = { owner: row, w: x + w, h };
    const claimTop = st === 'claimable' && (r.kind === 'cosmetic' || mw(qText, qFont, 8.5) + 6 + mw(t('pass.claim'), 'pGood', 6) <= tw);
    if (r.kind === 'cosmetic') {
      const nl = wrapText(name, tw, 2, false, 6);
      row.add(uiFrame(addText(this, tx, Math.round(h / 2 - (nl.lines.length * 8) / 2), nl.lines.join('\n'), dimmed ? 'pOff' : 'pInk').setFontSize(6).setLineSpacing(-1), row, x + w, h));
    } else {
      row.add(mtext(this, tx, 2, qText, qFont, { size: 8.5, maxW: tw, box }));
      if (st === 'claimable' && !claimTop) row.add(mtext(this, tx, 16, t('pass.claim'), 'pGood', { size: 6, maxW: tw, box }));
      else {
        const nn = wrapText(noun, tw, 2, false, 6);
        row.add(uiFrame(addText(this, tx, 14, nn.lines.join('\n'), dimmed ? 'pOff' : 'pSec').setFontSize(6).setLineSpacing(-1.5), row, x + w, h));
      }
    }
    // the state, as a badge on the icon's corner: a tick, a grey lock, the violet seal; "Claim" beside the number
    const bx = x + 17;
    const by = iy + 13;
    if (st === 'claimable' && claimTop) row.add(mtext(this, x + w - 4, 3, t('pass.claim'), 'pGood', { size: 6, align: 1, box }));
    else if (st === 'claimed') row.add(scaleIcon(addIcon(this, bx, by, 'check'), 0.75));
    else if (st === 'locked') row.add(scaleIcon(addIcon(this, bx, by, 'lock', 'D'), 0.75));
    else if (st === 'premium') row.add(scaleIcon(addIcon(this, bx, by, 'pass'), 0.75));
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
    const w = Math.min(this.m.VW - 8, 240);
    const body = wrapText(t('econ.needDrBody', { what, n: price, have, miss: price - have }), w - 20, 4);
    const m = openSheet(this, { title: t('econ.needDrTitle'), w, h: 26 + body.lines.length * LINE_H + 12 + 26 + 6 + 24 + 16 });
    const { c, body: b } = m;
    c.add(addText(this, b.x, b.y, body.lines.join('\n'), 'ink'));
    const by = m.y + m.h - 8 - 24 - 6 - 26;
    c.add(new Button(this, b.x, by, b.w, 26, { label: t('econ.getDr'), icon: 'drachma', inline: true, variant: 'primary', id: 'econ.toWallet', onClick: () => (m.close(), this.switchTab('wallet')) }));
    c.add(new Button(this, b.x, by + 26 + 6, b.w, 24, { label: t('common.cancel'), variant: 'ghost', id: 'econ.needDr.cancel', onClick: () => m.close() }));
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
    const num = mtext(this, 38, y + 7, `${d.wallet.drachmae}`, over ? 'pBad' : 'pInk', { size: bs, box: { owner: bal, w, h: 44 } });
    c.add(num);
    c.add(mtext(this, 38 + mw(`${d.wallet.drachmae}`, 'pInk', bs) + 6, y + 8 + Math.round(bs / 4), t('econ.drachmae'), 'rInk', { size: 7, maxW: w - 46 - mw(`${d.wallet.drachmae}`, 'pInk', bs), box: { owner: bal, w, h: 44 } }));
    c.add(mtext(this, 38, y + 28, t('wallet.balance'), 'pSec', { size: 6, maxW: w - 44, box: { owner: bal, w, h: 44 } }));
    y += 48;
    // a real problem only: below zero after a refunded pack (0 is a normal empty wallet)
    if (over) {
      y += addTipLine(this, c, 0, y, w, { text: t('wallet.cannotSpend'), tone: 'warn', card: true }) + 4;
    }
    const note = wrapText(t('wallet.note'), w - 6, 4);
    c.add(addText(this, 1, y, note.lines.join('\n'), 'pSec'));
    y += note.lines.length * LINE_H + 6;
    // packs: real money, so the Telegram blue button with "Stars", and a confirmation
    c.add(new SectionTitle(this, 0, y, w, t('wallet.packs')));
    y += SECTION_TITLE_H + 6;
    const cols = 2;
    const pw = Math.floor((w - GAP) / cols);
    const ph = 64;
    // the best value: the most Drachmae per Star (a tag on that pack only)
    const best = d.cat.packs.reduce((a, pk) => (!a || pk.drachmae / pk.stars > a.drachmae / a.stars ? pk : a), null as (typeof d.cat.packs)[number] | null);
    d.cat.packs.forEach((pk, i) => {
      const px = (i % cols) * (pw + GAP);
      const py = y + Math.floor(i / cols) * (ph + GAP);
      const isBest = pk === best && d.cat.packs.length > 1;
      if (isBest) addClaimGlow(this, c, px, py, pw, ph).setAlpha(0.5);
      const card = new ParchmentCard(this, px, py, pw, ph, { selected: isBest });
      c.add(card);
      if (isBest) {
        const tag = t('wallet.best');
        const tw = mw(tag, 'ink') + 12;
        c.add(new MChip(this, Math.round(px + pw / 2 - tw / 2), py - 7, { value: tag, surface: 'stone', w: tw, id: 'wallet.best' }));
      }
      c.add(addIcon(this, px + 7, py + 8, 'drachma'));
      const amt = mtext(this, px + 22, py + 9, `${pk.drachmae}`, 'pInk', { size: 8.5, box: { owner: card, w: pw, h: ph } });
      c.add(amt);
      const bonus = Math.round((pk.drachmae / pk.stars - 1) * 100);
      if (bonus > 0) {
        const room = pw - 28 - amt.width - 4;
        let bt = t('wallet.bonus', { n: bonus });
        if (MChip.width({ value: bt, surface: 'parchment' }) > room) bt = `+${bonus}%`;
        const cw = Math.min(room, MChip.width({ value: bt, surface: 'parchment' }));
        if (cw >= 24) c.add(new MChip(this, px + pw - 5 - cw, py + 6, { value: bt, surface: 'parchment', w: cw, id: `wallet.bonus.${pk.id}` }));
      }
      c.add(mtext(this, px + 22, py + 22, t('econ.drachmae'), 'pSec', { size: 6, maxW: pw - 28, box: { owner: card, w: pw, h: ph } }));
      c.add(new MButton(this, px + 6, py + ph - 26 - 6, pw - 12, 26, { label: t('res.starsPrice', { n: pk.stars }), icon: 'tgstar', variant: 'purchase', tip: t('res.tip.stars'), id: `wallet.pack.${pk.id}`, onClick: () => this.askPack(pk) }));
    });
    y += Math.ceil(d.cat.packs.length / cols) * (ph + GAP) + 4;
    // what Stars buy, and the legal pages (Telegram's payment rules)
    const legal = wrapText(t('wallet.legal'), w - 6, 4);
    c.add(addText(this, 1, y, legal.lines.join('\n'), 'pMuted'));
    y += legal.lines.length * LINE_H + 4;
    const lw = Math.floor((w - GAP) / 2);
    c.add(new MButton(this, 0, y, lw, 24, { label: t('wallet.terms'), variant: 'secondary', id: 'wallet.terms', onClick: () => openExternalLink(legalUrl('terms', lang())) }));
    c.add(new MButton(this, lw + GAP, y, w - lw - GAP, 24, { label: t('wallet.refunds'), variant: 'secondary', id: 'wallet.refunds', onClick: () => openExternalLink(legalUrl('refunds', lang())) }));
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

