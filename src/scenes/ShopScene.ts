import { setCosmeticLoadout } from '../game/cosmetics';
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { scaleIcon, Button, ScrollArea, addIcon, addPanel, addText, tappable, type FontKey } from '../ui/kit';
import { ItemIcon, ScrollList, Tabs, addScrollHint, confirmDialog, openModal, showTooltip, subjectName, toast } from '../ui/widgets';
import { uiFrame, uiId } from '../ui/layout';
import { ellipsize, measureText, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { CommandStrip } from '../ui/strategos';
import { InfoChip, ScreenHeader, addSection, addTipLine, confirmPurchase, flyReward, layChips, purchaseButton, resourceChipOpts, ProgressBar, addClaimGlow, openSheet } from '../ui/v3';
import { ACCENT, MODE_ICON, RESOURCES, ROLE, SURFACE } from '../ui/tokens';
import { fadeIn } from '../ui/motion';
import { addModeBanner } from '../ui/modeArt';
import { walletOverdrawn } from '../game/economy';
import { ensureFonts } from '../ui/fonts';
import { addChip, frameScrollTexts } from '../ui/sheet';
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
  private strip: CommandStrip | null = null;
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
    this.screen({ back: () => this.leave() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, SURFACE.bg).setOrigin(0, 0));
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    this.ui.add([this.head, this.page]);
    this.strip = new CommandStrip(this, this.m.VW, this.m.VH, {});
    this.ui.add(this.strip);
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
   * The header (title; the back arrow only outside Telegram), the Drachmae
   * balance (the one currency this shop spends; the war's gold belongs to the
   * war map, the campaign's to the campaign), then Shop | Pass | Wallet. No
   * strip: the tabs are the navigation.
   */
  private render(): void {
    this.head.removeAll(true);
    const { VW } = this.m;
    const H = this.head;
    const d = this.loaded;
    ensureEconIcons(this);
    const dr = d?.wallet.drachmae;
    const drOpts = resourceChipOpts('drachmae', dr === undefined || dr === null ? '-' : dr, { word: true, id: 'shop.drachmae', onTap: () => this.switchTab('wallet') });
    const hdr = new ScreenHeader(this, VW, { title: t('menu.shop'), back: () => this.leave(), chips: [drOpts], id: 'shop.header' });
    H.add(hdr);
    let y = hdr.bottom + 4;
    const x0 = 6;
    const w = VW - 12;
    this.drChip = hdr.chips[0] ?? null;
    if (hdr.overflow.length) {
      this.drChip = layChips(H, [new InfoChip(this, 0, 0, drOpts)], x0, y, w)[0] ?? null;
      y += 22 + 4;
    }
    this.strip?.set({});
    // the market stall: where you are, before any word
    if (this.m.VH >= 330) {
      addModeBanner(this, H, x0, y - 2, w, 26, 'shop');
      y += 26 + 2;
    }
    const claim = d?.pass ? claimableCount(d.pass) : 0;
    const tabs = new Tabs(this, x0, y, w, TABS.map((k) => t(`shop.tab.${k}` as TKey)), {
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `shop.tab.${k}`),
      icons: ['shop', 'pass', 'drachma'],
      onChange: (i) => {
        this.tab = TABS[i];
        fadeIn(this, this.page);
        this.buildPage();
      },
    });
    H.add(tabs);
    if (claim) tabs.badge(1, claim);
    this.pageTop = y + SIZE.tabH + 5;
    this.buildPage();
  }

  /** Switch the page (the tabs follow on the next render). */
  private switchTab(tab: Tab): void {
    this.tab = tab;
    this.render();
  }

  /** Bottom edge of the page. */
  private pageBottom(): number {
    return (this.strip?.top ?? this.m.VH) - 2;
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.page.removeAll(true);
  }

  private buildPage(): void {
    this.clearPage();
    const { VW } = this.m;
    const top = this.pageTop;
    if (this.st !== 'ready' || !this.loaded) {
      addEconState(this, this.page, 6, top, VW - 12, this.pageBottom() - top, this.st as EconState | 'loading', () => void this.fetchAll());
      return;
    }
    if (this.tab === 'shop') this.buildShop(this.loaded);
    else if (this.tab === 'pass') this.buildPass(this.loaded);
    else this.buildWallet(this.loaded);
  }

  private area(y: number, h: number): ScrollArea {
    const { VW, S } = this.m;
    const a = new ScrollArea(this, this.page, 6, y, VW - 12, h, S);
    this.areas.push(a);
    addScrollHint(this, this.page, a, SURFACE.bg);
    return a;
  }

  // ------------------------------------------------------------------ shop: cosmetics (consumables point to the map)

  private buildShop(d: Loaded): void {
    const { VW } = this.m;
    const top = this.pageTop;
    const area = this.area(top, this.pageBottom() - top);
    const c = area.content;
    const w = VW - 12 - 4;
    let y = 0;
    // what this shop is (and is not): a tip the player can hide
    const tip = addTipLine(this, c, 0, y, w, { text: t('shop.sit.shop'), dismissId: 'shop.what', maxLines: 3 });
    if (tip) y += tip + 6;
    // cosmetics by slot: preview tiles
    y = addSection(this, c, 0, y, w, t('shop.cosmetics'));
    const ch = wrapText(t('shop.cosmeticsHint'), w, 2);
    c.add(addText(this, 0, y, ch.lines.join('\n'), 'muted'));
    y += ch.lines.length * LINE_H + 4;
    const cols = Math.max(2, Math.floor((w + SIZE.gap) / (58 + SIZE.gap)));
    const tw = Math.floor((w - (cols - 1) * SIZE.gap) / cols);
    const th = 74;
    for (const slot of d.cat.slots) {
      const list = d.cat.cosmetics.filter((x) => x.slot === slot);
      if (!list.length) continue;
      c.add(addText(this, 0, y + 1, ellipsize(tOr(`shop.slot.${slot}`, slot), w), 'sec'));
      y += 12;
      // each row as tall as its longest name (one to three lines), never a fixed tall tile
      for (let r0 = 0; r0 < list.length; r0 += cols) {
        const rowItems = list.slice(r0, r0 + cols);
        const lines = Math.max(...rowItems.map((cm) => wrapText(cosmeticName(cm), tw - 6, 3, false, 6).lines.length));
        const rh = th + (lines - 3) * 7;
        rowItems.forEach((cm, k) => this.cosmeticTile(c, area, k * (tw + SIZE.gap), y, tw, rh, cm, d));
        y += rh + SIZE.gap;
      }
      y += 4;
    }
    // supplies moved onto the war map: the merchants of towns and trading posts (docs/DUELS.md)
    y += 2;
    y = addSection(this, c, 0, y, w, t('shop.consumables'));
    const mm = wrapText(t('shop.mapMerchants'), w - 40, 6);
    const mh = Math.max(34, mm.lines.length * LINE_H + 10);
    c.add(addPanel(this, 0, y, w, mh, 'well'));
    c.add(new ItemIcon(this, 5, y + Math.round((mh - 24) / 2), { consumable: 'morale_wine' }, { rarity: 'rare', tip: false }));
    c.add(addText(this, 34, y + 5, mm.lines.join('\n'), 'sec'));
    y += mh + 4;
    area.setContentHeight(y);
    frameScrollTexts(area, VW - 12);
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
  private cosmeticTile(c: Phaser.GameObjects.Container, area: ScrollArea, x: number, y: number, w: number, h: number, cm: CosmeticInfo, d: Loaded): void {
    const owned = d.wallet.cosmetics.includes(cm.id);
    const equipped = d.wallet.loadout[cm.slot] === cm.id;
    const earn = owned ? null : this.earnedFrom(cm, d);
    const afford = cm.drachmae !== null && d.wallet.drachmae >= cm.drachmae;
    c.add(addPanel(this, x, y, w, h, equipped ? 'cardSel' : owned ? 'cardRaised' : earn ? 'cardLocked' : 'card'));
    const bg = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiId(bg, `cosmetic:${cm.id}`);
    bg.on('pointerup', () => !area.moved && this.openCosmetic(cm));
    c.add(bg);
    const px = x + Math.round((w - 32) / 2);
    c.add(addPanel(this, px, y + 4, 32, 32, 'well'));
    const art = addCosmetic(this, x + Math.round((w - 28) / 2), y + 6, cm.id, cm.slot);
    if (earn) art.setAlpha(0.55);
    c.add(art);
    if (equipped || owned) {
      const g = this.add.graphics();
      g.fillStyle(0x1a0f08, 1);
      g.fillCircle(px + 30, y + 6, 5);
      g.fillStyle(equipped ? ACCENT.goldHi : ACCENT.success, 1);
      g.fillCircle(px + 30, y + 6, 4.2);
      g.lineStyle(1.2, 0x1a0f08, 1);
      g.beginPath();
      g.moveTo(px + 28, y + 6);
      g.lineTo(px + 29.5, y + 7.6);
      g.lineTo(px + 32.2, y + 4.4);
      g.strokePath();
      c.add(g);
    } else if (earn) c.add(scaleIcon(addIcon(this, px + 22, y + 1, 'lock', 'D'), 0.75));
    const name = wrapText(cosmeticName(cm), w - 6, 3, false, 6);
    const nt = addText(this, x + w / 2, y + 39, name.lines.join('\n'), owned || !earn ? 'ink' : 'sec', 0.5).setFontSize(6).setLineSpacing(-1);
    nt.setCenterAlign();
    c.add(nt);
    const sy = y + h - 12;
    const centred = (icon: string | null, text: string, font: FontKey, look: '' | 'D' = '') => {
      const tt = addText(this, 0, sy, ellipsize(text, w - 8 - (icon ? 12 : 0), false, 6), font).setFontSize(6);
      const both = (icon ? 12 : 0) + tt.width;
      const sx = Math.round(x + w / 2 - both / 2);
      if (icon) c.add(scaleIcon(addIcon(this, sx, sy - 1, icon, look), 10 / 12));
      c.add(tt.setX(sx + (icon ? 12 : 0)));
    };
    if (equipped) centred(null, t('shop.equipped'), 'reward');
    else if (owned) centred(null, t('econ.owned'), 'good');
    else if (earn) centred(earn.icon, earn.short, 'sec', 'D');
    else centred('drachma', `${cm.drachmae}`, afford ? 'premium' : 'muted', afford ? '' : 'D');
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
    const bw = Math.floor((w - 12 - 6 - SIZE.gap) / 2);
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
    const { VW } = this.m;
    const top = this.pageTop;
    const p = d.pass;
    if (!p) {
      addEconState(this, this.page, 6, top, VW - 12, this.pageBottom() - top, 'error', () => void this.fetchAll());
      return;
    }
    const x0 = 6;
    const w = VW - 12;
    const prog = passProgress(p);
    const days = Math.max(0, Math.ceil((p.season.endsAt - Date.now()) / 86_400_000));
    const claimN = claimableCount(p);
    // the season card: tier, XP to the next (tap: how XP is earned), the premium track, Claim all
    const hh = 72;
    this.page.add(addPanel(this, x0, top, w, hh, 'cardRaised'));
    const ends = addText(this, x0 + w - 8, top + 7, t('pass.endsIn', { d: days }), 'sec', 1);
    this.page.add(ends);
    this.page.add(addText(this, x0 + 8, top + 6, ellipsize(`${t('pass.season', { n: p.season.id })} · ${t('pass.tierOf', { n: p.tier, max: p.tiers.length })}`, w - 20 - ends.width, false, 7, 'head'), 'head'));
    const bar = new ProgressBar(this, x0 + 8, top + 18, w - 16, { value: prog.maxed ? 1 : prog.into, max: prog.maxed ? 1 : prog.need, label: prog.maxed ? t('pass.maxed') : t('pass.xpHow'), right: prog.maxed ? '' : t('pass.xp', { into: prog.into, need: prog.need }), h: 4, color: ACCENT.gold, labelFont: 'sec' });
    this.page.add(bar);
    const xz = this.add.zone(x0 + 4, top + 14, w - 8, 22).setOrigin(0, 0).setInteractive();
    uiId(xz, 'pass.xpInfo');
    tappable(xz, null, () => this.openPassXp());
    this.page.add(xz);
    const by = top + hh - 26 - 6;
    const bw = Math.floor((w - 16 - SIZE.gap) / 2);
    if (p.premium) addChip(this, this.page, x0 + 8, by + 7, t('pass.unlocked'), ROLE.elite, bw);
    else {
      // not enough Drachmae: the button says what is missing and goes to the wallet
      const short = d.wallet.drachmae < p.premiumDrachmae;
      this.page.add(new Button(this, x0 + 8, by, bw, 26, { label: short ? t('pass.needDr', { n: p.premiumDrachmae }) : t('pass.unlock', { n: p.premiumDrachmae }), icon: 'drachma', inline: true, id: 'pass.unlock', tip: short ? t('pass.needDrTip', { n: p.premiumDrachmae - d.wallet.drachmae }) : undefined, onClick: () => this.unlockPremium(p) }));
    }
    const ca = new Button(this, x0 + 8 + bw + SIZE.gap, by, w - 16 - bw - SIZE.gap, 26, { label: claimN > 0 ? t('pass.claimAll', { n: claimN }) : t('pass.nothing'), icon: claimN > 0 ? 'check' : undefined, inline: true, variant: claimN > 0 ? 'primary' : 'secondary', id: 'pass.claimAll', onClick: () => void this.claimAll() });
    ca.setEnabled(claimN > 0, t('pass.xpHint'));
    this.page.add(ca);
    // the two tracks, then the tiers (the player's place on the track is marked)
    const ly = top + hh + 5;
    const cellW = Math.floor((w - 30 - 2 * SIZE.gap) / 2);
    this.page.add(addText(this, x0 + 30 + cellW / 2, ly, t('pass.free'), 'sec', 0.5));
    const pt = addText(this, x0 + 30 + SIZE.gap + cellW + cellW / 2 + 6, ly, t('pass.premium'), 'premium', 0.5);
    this.page.add(pt);
    this.page.add(scaleIcon(addIcon(this, Math.round(pt.x - pt.width / 2 - 13), ly - 2, 'pass', p.premium ? '' : 'D'), 0.9));
    const list = new ScrollList(this, this.page, x0, ly + 12, w, this.pageBottom() - ly - 12, {
      count: p.tiers.length,
      rowH: 36,
      fade: SURFACE.bg,
      render: (i, row, rw, rh, area) => this.tierRow(d, p, i, row, rw, rh, area),
    });
    this.areas.push(list);
    list.scrollToIndex(focusTier(p) - 1);
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
    row.add(addPanel(this, 0, 3, 26, bh, reached ? 'thumb' : next ? 'cardSel' : 'well'));
    row.add(uiFrame(addText(this, 13, here || next ? 6 : rh / 2 - 5, `${tier.tier}`, reached ? 'onAccent' : next ? 'ink' : 'muted', 0.5), row, 26, rh));
    if (next) {
      const prog = passProgress(p);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.6);
      g.fillRect(4, rh - 10, 18, 3);
      g.fillStyle(ACCENT.gold, 1);
      g.fillRect(4, rh - 10, Math.round(18 * (prog.need ? prog.into / prog.need : 0)), 3);
      row.add(g);
    }
    if (here) row.add(addText(this, 13, rh - 14, t('pass.you'), 'onAccent', 0.5).setFontSize(5.5));
    const cellW = Math.floor((rw - 30 - SIZE.gap) / 2);
    (['free', 'premium'] as Track[]).forEach((track, k) => this.rewardCell(d, p, tier.tier, track, track === 'free' ? tier.free : tier.premium, row, 30 + k * (cellW + SIZE.gap), cellW, rh - 2, area));
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
    row.add(addPanel(this, x, 0, w, h, st === 'claimable' ? 'cardSel' : st === 'claimed' ? 'well' : st === 'premium' || st === 'locked' ? 'cardLocked' : 'card'));
    if (st === 'premium') {
      // a violet edge: this one waits for the premium track, not for a tier
      const g = this.add.graphics();
      g.lineStyle(1, RESOURCES.drachmae.color, 0.55);
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
    const qFont: FontKey = dimmed ? 'muted' : r.kind === 'gold' ? 'wargold' : r.kind === 'drachmae' ? 'premium' : 'ink';
    if (r.kind === 'cosmetic') {
      const nl = wrapText(name, tw, 2, false, 6);
      row.add(addText(this, tx, Math.round(h / 2 - (nl.lines.length * 8) / 2), nl.lines.join('\n'), dimmed ? 'muted' : 'ink').setFontSize(6).setLineSpacing(-1));
    } else {
      const q = addText(this, tx, 2, r.kind === 'consumable' ? `${qty}×` : `${qty}`, qFont).setScale(1.2);
      row.add(q);
      const nn = wrapText(noun, tw, 2, false, 6);
      row.add(addText(this, tx, 14, nn.lines.join('\n'), dimmed ? 'muted' : 'sec').setFontSize(6).setLineSpacing(-1.5));
    }
    // the state, as a badge on the icon's corner: a tick, a grey lock, the violet seal; "Claim" beside the number
    const bx = x + 17;
    const by = iy + 13;
    if (st === 'claimable') row.add(addText(this, x + w - 4, 3, t('pass.claim'), 'reward', 1).setFontSize(6));
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
      const s = (this.areas[0] as ScrollList | undefined)?.area?.scrollY ?? 0;
      this.render();
      (this.areas[0] as ScrollList | undefined)?.area?.setScroll(s);
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
    const { VW } = this.m;
    const top = this.pageTop;
    const area = this.area(top, this.pageBottom() - top);
    const c = area.content;
    const w = VW - 12 - 4;
    let y = 0;
    // the balance, big
    c.add(addPanel(this, 0, y, w, 42, 'cardRaised'));
    c.add(scaleIcon(addIcon(this, 9, y + 9, 'drachma'), 2));
    const bal = addText(this, 40, y + 7, `${d.wallet.drachmae}`, walletOverdrawn(d.wallet) ? 'bad' : 'premium').setScale(1.7);
    c.add(bal);
    c.add(addText(this, 40 + bal.width + 6, y + 13, ellipsize(t('econ.drachmae'), w - 52 - bal.width), 'sec'));
    c.add(addText(this, 40, y + 29, ellipsize(t('wallet.balance'), w - 44), 'muted').setFontSize(6));
    y += 46;
    // a real problem only: below zero after a refunded pack (0 is a normal empty wallet)
    if (walletOverdrawn(d.wallet)) {
      const h = addTipLine(this, c, 0, y, w, { text: t('wallet.cannotSpend'), tone: 'warn' });
      y += h + 4;
    }
    const note = wrapText(t('wallet.note'), w, 4);
    c.add(addText(this, 0, y, note.lines.join('\n'), 'sec'));
    y += note.lines.length * LINE_H + 6;
    // packs: real money, so the Telegram blue button with "Stars", and a confirmation
    y = addSection(this, c, 0, y, w, t('wallet.packs'));
    const cols = 2;
    const pw = Math.floor((w - SIZE.gap) / cols);
    const ph = 62;
    // the best value: the most Drachmae per Star (a tag on that pack only)
    const best = d.cat.packs.reduce((a, pk) => (!a || pk.drachmae / pk.stars > a.drachmae / a.stars ? pk : a), null as (typeof d.cat.packs)[number] | null);
    d.cat.packs.forEach((pk, i) => {
      const px = (i % cols) * (pw + SIZE.gap);
      const py = y + Math.floor(i / cols) * (ph + SIZE.gap);
      const isBest = pk === best && d.cat.packs.length > 1;
      if (isBest) addClaimGlow(this, c, px, py, pw, ph).setAlpha(0.5);
      c.add(addPanel(this, px, py, pw, ph, isBest ? 'cardSel' : 'card'));
      if (isBest) {
        const tag = t('wallet.best');
        const tw = measureText(tag, false, 6) + 10;
        const g = this.add.graphics();
        g.fillStyle(ACCENT.goldHi, 1);
        g.fillRoundedRect(px + pw / 2 - tw / 2, py - 5, tw, 10, 3);
        c.add(g);
        const tt = addText(this, px + pw / 2, py - 4, tag, 'onAccent', 0.5).setFontSize(6);
        uiFrame(tt, g as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, tw, 10, px + pw / 2 - tw / 2, py - 5);
        c.add(tt);
      }
      c.add(addIcon(this, px + 7, py + 7, 'drachma'));
      const amt = addText(this, px + 22, py + 8, `${pk.drachmae}`, 'premium');
      c.add(amt);
      const bonus = Math.round((pk.drachmae / pk.stars - 1) * 100);
      if (bonus > 0) addChip(this, c, px + pw - 6, py + 6, t('wallet.bonus', { n: bonus }), 0x3d6b22, pw - 36 - amt.width, true);
      c.add(addText(this, px + 22, py + 18, ellipsize(t('econ.drachmae'), pw - 28), 'sec'));
      c.add(purchaseButton(this, px + 6, py + ph - 26 - 6, pw - 12, 26, { stars: pk.stars, id: `wallet.pack.${pk.id}`, onClick: () => this.askPack(pk) }));
    });
    y += Math.ceil(d.cat.packs.length / cols) * (ph + SIZE.gap) + 4;
    // what Stars buy, and the legal pages (Telegram's payment rules)
    const legal = wrapText(t('wallet.legal'), w, 3);
    c.add(addText(this, 0, y, legal.lines.join('\n'), 'muted'));
    y += legal.lines.length * LINE_H + 4;
    const lw = Math.floor((w - SIZE.gap) / 2);
    c.add(new Button(this, 0, y, lw, SIZE.btnH, { label: t('wallet.terms'), variant: 'ghost', id: 'wallet.terms', onClick: () => openExternalLink(legalUrl('terms', lang())) }));
    c.add(new Button(this, lw + SIZE.gap, y, lw, SIZE.btnH, { label: t('wallet.refunds'), variant: 'ghost', id: 'wallet.refunds', onClick: () => openExternalLink(legalUrl('refunds', lang())) }));
    y += SIZE.btnH + 8;
    // history
    y = addSection(this, c, 0, y, w, t('wallet.history'));
    if (!d.wallet.ledger.length) {
      c.add(addText(this, 0, y, t('wallet.noHistory'), 'muted'));
      y += 11;
    }
    const now = Date.now();
    for (const l of d.wallet.ledger.slice(0, 30)) {
      c.add(addPanel(this, 0, y, w, 22, 'card'));
      const delta = addText(this, w - 6, y + 7, `${l.delta > 0 ? '+' : ''}${l.delta}`, l.delta >= 0 ? 'good' : 'bad', 1);
      c.add(delta);
      const when = addText(this, w - 12 - delta.width, y + 7, fmtAgo(l.at, now), 'muted', 1);
      c.add(when);
      c.add(addText(this, 6, y + 7, ellipsize(tOr(`wallet.kind.${l.kind}`, l.kind), w - 22 - delta.width - when.width), 'ink'));
      y += 22 + 2;
    }
    area.setContentHeight(y + 4);
    frameScrollTexts(area, VW - 12);
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

