import { setCosmeticLoadout } from '../game/cosmetics';
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { scaleIcon, Button, ScrollArea, addIcon, addPanel, addText } from '../ui/kit';
import { ItemIcon, ScrollList, Tabs, addScrollHint, confirmDialog, openModal, showTooltip, toast } from '../ui/widgets';
import { uiFrame, uiId } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { CommandStrip } from '../ui/strategos';
import { InfoChip, ScreenHeader, addSection, addTipLine, confirmPurchase, flyReward, layChips, purchaseButton, resourceChip, ProgressBar, addClaimGlow } from '../ui/v3';
import { ACCENT, ROLE, SURFACE } from '../ui/tokens';
import { walletOverdrawn } from '../game/economy';
import { ensureFonts } from '../ui/fonts';
import { addChip, frameScrollTexts } from '../ui/sheet';
import { econ, newRequestId, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { pickBattleConsumable } from '../ui/econ/consumablePicker';
import { addCosmetic, addEconState, ago, cosmeticName, currencyIcon, ensureEconIcons, priceText, rewardName } from '../ui/econ/widgets';
import { claimableCount, econState, focusTier, passProgress, tierState, withClaim, type EconState, type Track } from '../game/economy';
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
    const hdr = new ScreenHeader(this, VW, { title: t('menu.shop'), back: () => this.leave(), id: 'shop.header' });
    H.add(hdr);
    let y = hdr.bottom + 3;
    const x0 = 6;
    const w = VW - 12;
    const dr = d?.wallet.drachmae;
    const chip = resourceChip(this, 0, 0, 'drachmae', dr === undefined || dr === null ? '-' : dr, { word: true, id: 'shop.drachmae', onTap: () => this.switchTab('wallet') });
    layChips(H, [chip], x0, y, w);
    this.drChip = chip;
    y += 22 + 4;
    this.strip?.set({});
    const claim = d?.pass ? claimableCount(d.pass) : 0;
    const tabs = new Tabs(this, x0, y, w, TABS.map((k) => t(`shop.tab.${k}` as TKey)), {
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `shop.tab.${k}`),
      icons: ['shop', 'pass', 'drachma'],
      onChange: (i) => {
        this.tab = TABS[i];
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
    const th = 70;
    for (const slot of d.cat.slots) {
      const list = d.cat.cosmetics.filter((x) => x.slot === slot);
      if (!list.length) continue;
      c.add(addText(this, 0, y + 1, ellipsize(tOr(`shop.slot.${slot}`, slot), w), 'sec'));
      y += 12;
      list.forEach((cm, i) => {
        const tx = (i % cols) * (tw + SIZE.gap);
        const ty = y + Math.floor(i / cols) * (th + SIZE.gap);
        this.cosmeticTile(c, area, tx, ty, tw, th, cm, d);
      });
      y += Math.ceil(list.length / cols) * (th + SIZE.gap) + 4;
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

  /** A look: its preview, its name (two lines, never cut), owned / equipped / its price in Drachmae. */
  private cosmeticTile(c: Phaser.GameObjects.Container, area: ScrollArea, x: number, y: number, w: number, h: number, cm: CosmeticInfo, d: Loaded): void {
    const owned = d.wallet.cosmetics.includes(cm.id);
    const equipped = d.wallet.loadout[cm.slot] === cm.id;
    const forSale = cm.drachmae !== null;
    c.add(addPanel(this, x, y, w, h, equipped ? 'cardSel' : owned ? 'cardRaised' : forSale ? 'card' : 'cardLocked'));
    const bg = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiId(bg, `cosmetic:${cm.id}`);
    bg.on('pointerup', () => !area.moved && this.openCosmetic(cm));
    c.add(bg);
    c.add(addPanel(this, x + Math.round((w - 32) / 2), y + 4, 32, 32, 'well'));
    c.add(addCosmetic(this, x + Math.round((w - 28) / 2), y + 6, cm.id, cm.slot));
    const name = wrapText(cosmeticName(cm), w - 8, 2);
    const nt = addText(this, x + w / 2, y + 39, name.lines.join('\n'), 'ink', 0.5).setFontSize(6);
    nt.setCenterAlign();
    c.add(nt);
    const sy = y + h - 12;
    if (equipped) c.add(addText(this, x + w / 2, sy, ellipsize(t('shop.equipped'), w - 8, false, 6), 'reward', 0.5).setFontSize(6));
    else if (owned) c.add(addText(this, x + w / 2, sy, ellipsize(t('econ.owned'), w - 8, false, 6), 'good', 0.5).setFontSize(6));
    else if (!forSale) {
      const why = cm.source === 'season_pass' ? t('shop.passOnly') : cm.source === 'duel_season' ? t('shop.duelSeason') : t('shop.notForSale');
      c.add(addText(this, x + w / 2, sy, ellipsize(why, w - 8, false, 6), 'muted', 0.5).setFontSize(6));
    } else {
      const pt = addText(this, 0, sy, `${cm.drachmae}`, 'premium').setFontSize(6);
      const both = 10 + 2 + pt.width;
      const px = Math.round(x + w / 2 - both / 2);
      c.add(scaleIcon(addIcon(this, px, sy - 1, 'drachma'), 10 / 12));
      c.add(pt.setX(px + 12));
    }
  }

  openCosmetic(cm: CosmeticInfo): void {
    const d = this.loaded;
    if (!d) return;
    const { VW } = this.m;
    const owned = d.wallet.cosmetics.includes(cm.id);
    const equipped = d.wallet.loadout[cm.slot] === cm.id;
    const w = Math.min(VW - 16, 190);
    const m = openModal(this, { title: cosmeticName(cm), w, h: 26 + 64 + 30 + SIZE.btnH + 12 });
    const { c, x, y } = m;
    const g = this.add.graphics();
    g.fillStyle(0x2a1d18, 1);
    g.fillRect(x + w / 2 - 31, y + 24, 62, 62);
    g.lineStyle(2, 0xb8863b, 1);
    g.strokeRect(x + w / 2 - 31, y + 24, 62, 62);
    c.add(g);
    c.add(addCosmetic(this, Math.round(x + w / 2 - 28), y + 27, cm.id, cm.slot, 56));
    const line = `${tOr(`shop.slot.${cm.slot}`, cm.slot)}${cm.drachmae !== null && !owned ? ' · ' + t('econ.dr', { n: cm.drachmae }) : ''}`;
    c.add(addText(this, x + w / 2, y + 92, ellipsize(line, w - 16), 'dim', 0.5));
    if (cm.source === 'season_pass' && !owned) c.add(addText(this, x + w / 2, y + 103, ellipsize(t('shop.passOnly'), w - 16), 'red', 0.5));
    const by = m.y + m.h - 9 - SIZE.btnH;
    const bw = Math.floor((w - 12 - 6 - SIZE.gap) / 2);
    c.add(new Button(this, x + 6, by, bw, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
    let act: Button;
    if (owned)
      act = new Button(this, x + w - 6 - bw, by, bw, SIZE.btnH, {
        label: equipped ? t('shop.unequip') : t('shop.equip'),
        icon: equipped ? 'back' : 'check',
        variant: 'primary',
        id: 'shop.equip',
        onClick: () => (m.close(), void this.equipCosmetic(cm, !equipped)),
      });
    else {
      act = new Button(this, x + w - 6 - bw, by, bw, SIZE.btnH, { label: `${cm.drachmae ?? '-'}`, icon: 'drachma', variant: 'primary', id: 'shop.buyCosmetic', onClick: () => (m.close(), this.askBuy(cm.id, cosmeticName(cm), cm.drachmae ?? 0, 'drachmae')) });
      if (cm.drachmae === null) act.setEnabled(false, cm.source === 'season_pass' ? t('shop.passOnly') : cm.source === 'duel_season' ? t('shop.duelSeason') : t('shop.notForSale'));
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
    if (currency === 'drachmae' && d.wallet.drachmae < price) {
      toast(this, t('econ.noFundsDr'), 'bad');
      this.tab = 'wallet';
      this.render();
      return;
    }
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
    // the season card: tier, XP to the next, the premium track, Claim all
    const hh = 70;
    this.page.add(addPanel(this, x0, top, w, hh, 'cardRaised'));
    const ends = addText(this, x0 + w - 8, top + 7, t('pass.endsIn', { d: days }), 'sec', 1);
    this.page.add(ends);
    this.page.add(addText(this, x0 + 8, top + 6, ellipsize(`${t('pass.season', { n: p.season.id })} · ${t('pass.tierOf', { n: p.tier, max: p.tiers.length })}`, w - 20 - ends.width, false, 7, 'head'), 'head'));
    this.page.add(new ProgressBar(this, x0 + 8, top + 18, w - 16, { value: prog.maxed ? 1 : prog.into, max: prog.maxed ? 1 : prog.need, label: prog.maxed ? t('pass.maxed') : t('v3.passXp'), right: prog.maxed ? '' : t('pass.xp', { into: prog.into, need: prog.need }), h: 4, color: ACCENT.gold }));
    const by = top + hh - 26 - 6;
    const bw = Math.floor((w - 16 - SIZE.gap) / 2);
    if (p.premium) addChip(this, this.page, x0 + 8, by + 7, t('pass.unlocked'), ROLE.elite, bw);
    else this.page.add(new Button(this, x0 + 8, by, bw, 26, { label: t('pass.unlock', { n: p.premiumDrachmae }), icon: 'drachma', inline: true, id: 'pass.unlock', onClick: () => this.unlockPremium(p) }));
    const ca = new Button(this, x0 + 8 + bw + SIZE.gap, by, w - 16 - bw - SIZE.gap, 26, { label: t('pass.claimAll', { n: claimN }), icon: 'check', inline: true, variant: 'primary', id: 'pass.claimAll', onClick: () => void this.claimAll() });
    ca.setEnabled(claimN > 0, t('pass.xpHint'));
    this.page.add(ca);
    // the two tracks, then the tiers
    const ly = top + hh + 5;
    const cellW = Math.floor((w - 26 - 2 * SIZE.gap) / 2);
    this.page.add(addText(this, x0 + 26 + cellW / 2, ly, t('pass.free'), 'sec', 0.5));
    this.page.add(addText(this, x0 + 26 + SIZE.gap + cellW + cellW / 2, ly, t('pass.premium'), 'premium', 0.5));
    const list = new ScrollList(this, this.page, x0, ly + 12, w, this.pageBottom() - ly - 12, {
      count: p.tiers.length,
      rowH: 42,
      fade: SURFACE.bg,
      render: (i, row, rw, rh, area) => this.tierRow(d, p, i, row, rw, rh, area),
    });
    this.areas.push(list);
    list.scrollToIndex(focusTier(p) - 1);
  }

  private tierRow(d: Loaded, p: SeasonPassInfo, i: number, row: Phaser.GameObjects.Container, rw: number, rh: number, area: ScrollArea): void {
    const tier = p.tiers[i];
    const reached = tier.tier <= p.tier;
    row.add(addPanel(this, 0, 4, 22, rh - 8, reached ? 'thumb' : 'well'));
    row.add(uiFrame(addText(this, 11, rh / 2 - 5, `${tier.tier}`, reached ? 'onAccent' : 'muted', 0.5), row, 22, rh));
    const cellW = Math.floor((rw - 26 - SIZE.gap) / 2);
    (['free', 'premium'] as Track[]).forEach((track, k) => this.rewardCell(d, p, tier.tier, track, track === 'free' ? tier.free : tier.premium, row, 26 + k * (cellW + SIZE.gap), cellW, rh, area));
  }

  /** A reward in one of four states: claimable (lit, a glow), claimed (a tick), not reached (locked), premium (locked: unlock the track). */
  private rewardCell(d: Loaded, p: SeasonPassInfo, tier: number, track: Track, r: PassReward, row: Phaser.GameObjects.Container, x: number, w: number, h: number, area: ScrollArea): void {
    const st = tierState(p, tier, track);
    if (st === 'claimable') addClaimGlow(this, row, x, 0, w, h);
    row.add(addPanel(this, x, 0, w, h, st === 'claimable' ? 'cardSel' : st === 'claimed' ? 'well' : st === 'premium' || st === 'locked' ? 'cardLocked' : 'card'));
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
    // narrow cells (small phones): the words get the room, the icon goes
    const showIcon = w >= 72;
    if (!showIcon) {
      /* no picture */
    } else if (r.kind === 'cosmetic') {
      const cm = d.cat.cosmetics.find((c) => c.id === r.id);
      row.add(addCosmetic(this, x + 3, Math.round((h - 28) / 2), r.id, cm?.slot ?? 'emblem'));
    } else {
      const sub = r.kind === 'consumable' ? { consumable: r.id } : { resource: r.kind === 'gold' ? 'gold' : 'drachmae' };
      row.add(new ItemIcon(this, x + 4, Math.round((h - 24) / 2), sub, { size: 24, tip: false, glow: false, rarity: track === 'premium' ? 'epic' : 'common' }));
    }
    const tx = x + (showIcon ? 32 : 5);
    const tw = w - (showIcon ? 36 : 9);
    // the name gets the room; "Claim" is the only state in words (claimed / locked show as a tick / a lock, the track as its column)
    const claimable = st === 'claimable';
    const lines = wrapText(name, tw - (claimable ? 0 : 10), claimable ? 2 : 3).lines;
    row.add(addText(this, tx, 4, lines.join('\n'), st === 'claimed' ? 'muted' : 'ink').setFontSize(6.5));
    if (claimable) row.add(addText(this, tx, h - 12, ellipsize(t('pass.claim'), tw), 'reward'));
    if (st === 'claimed') row.add(scaleIcon(addIcon(this, x + w - 13, h - 13, 'check'), 0.8));
    if (st === 'premium' || st === 'locked') row.add(scaleIcon(addIcon(this, x + w - 13, h - 13, 'lock', 'D'), 0.8));
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
    if (d.wallet.drachmae < p.premiumDrachmae) {
      toast(this, t('econ.noFundsDr'), 'bad');
      this.tab = 'wallet';
      this.render();
      return;
    }
    confirmDialog(this, {
      title: t('pass.unlockTitle'),
      body: t('pass.unlockBody', { n: p.premiumDrachmae }),
      ok: t('pass.unlock', { n: p.premiumDrachmae }),
      okIcon: 'drachma',
      cancel: t('common.cancel'),
      onOk: () => void this.buy('season_pass', t('pass.premium'), 'drachmae'),
    });
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
    d.cat.packs.forEach((pk, i) => {
      const px = (i % cols) * (pw + SIZE.gap);
      const py = y + Math.floor(i / cols) * (ph + SIZE.gap);
      c.add(addPanel(this, px, py, pw, ph, 'card'));
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
      const when = addText(this, w - 12 - delta.width, y + 7, ago(l.at, now), 'muted', 1);
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

