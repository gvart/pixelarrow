import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, ScrollArea, addIcon, addPanel, addText } from '../ui/kit';
import { ItemIcon, ScrollList, Tabs, addScrollHint, confirmDialog, openModal, showTooltip, toast } from '../ui/widgets';
import { uiFrame, uiId } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE, COLOR, RARITY_COLOR } from '../ui/theme';
import { ensureFonts } from '../ui/fonts';
import { addChip, addTabBadge, frameScrollTexts } from '../ui/sheet';
import { econ, newRequestId, setEconSource, type ConsumableInfo } from '../ui/econ/source';
import { DemoEconSource } from '../ui/econ/demo';
import { pickBattleConsumable } from '../ui/econ/consumablePicker';
import { addEconState, addPurse, ago, cosmeticName, cosmeticTexture, currencyIcon, ensureEconIcons, goodsTexture, priceText, rewardName } from '../ui/econ/widgets';
import { claimableCount, econState, focusTier, passProgress, tierState, withClaim, type EconState, type Track } from '../game/economy';
import { isApiError, type CosmeticInfo, type Currency, type EconomyCatalog, type PassReward, type SeasonPassInfo, type WalletInfo } from '../platform/api';
import type { ProfileView } from '../online/client';
import { P } from '../art/palette';
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
  private gen = 0;

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
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
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
      this.st = 'ready';
    } catch (e) {
      if (gen !== this.gen || !this.sys.isActive()) return;
      this.st = (e as { code?: string })?.code === 'outside' ? 'outside' : econState(e, src.available());
    }
    this.render();
  }

  // ------------------------------------------------------------------ frame

  private render(): void {
    this.head.removeAll(true);
    const { VW, VH } = this.m;
    const H = this.head;
    H.add(addPanel(this, 0, 0, VW, 26, 'parch'));
    let left = 6;
    if (this.inGameBack) {
      H.add(new Button(this, 3, 2, 26, 22, { icon: 'back', onClick: () => this.leave() }));
      left = 33;
    }
    const d = this.loaded;
    const purseW = addPurse(this, H, VW - 6, 7, { drachmae: d?.wallet.drachmae ?? null, gold: d?.profile?.resources.gold ?? null }, VW - left - 50);
    const pz = this.add.zone(VW - 4 - Math.max(24, purseW), 2, Math.max(24, purseW), 22).setOrigin(0, 0).setInteractive();
    uiId(pz, 'shop.purse');
    pz.on('pointerup', () => showTooltip(this, t('econ.purseTip'), pz));
    H.add(pz);
    H.add(addText(this, left, 9, ellipsize(t('shop.title'), VW - left - purseW - 12), 'red'));
    const ty = 29;
    const tabs = new Tabs(this, 4, ty, VW - 8, TABS.map((k) => t(`shop.tab.${k}` as TKey)), {
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `shop.tab.${k}`),
      icons: VW >= 170 ? ['coin', 'star', 'drachma'] : undefined,
      onChange: (i) => {
        this.tab = TABS[i];
        this.buildPage();
      },
    });
    H.add(addPanel(this, 0, ty + SIZE.tabH - 2, VW, VH - ty - SIZE.tabH + 2, 'parch'));
    H.add(tabs);
    if (d?.pass) {
      const n = claimableCount(d.pass);
      if (n) addTabBadge(this, H, 4, ty, VW - 8, 3, 1, n);
    }
    this.pageTop = ty + SIZE.tabH + 4;
    this.buildPage();
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.page.removeAll(true);
  }

  private buildPage(): void {
    this.clearPage();
    const { VW, VH } = this.m;
    const top = this.pageTop;
    if (this.st !== 'ready' || !this.loaded) {
      addEconState(this, this.page, 4, top, VW - 8, VH - top - 4, this.st as EconState | 'loading', () => void this.fetchAll());
      return;
    }
    if (this.tab === 'shop') this.buildShop(this.loaded);
    else if (this.tab === 'pass') this.buildPass(this.loaded);
    else this.buildWallet(this.loaded);
  }

  private area(y: number, h: number): ScrollArea {
    const { VW, S } = this.m;
    const a = new ScrollArea(this, this.page, 4, y, VW - 8, h, S);
    this.areas.push(a);
    addScrollHint(this, this.page, a);
    return a;
  }

  // ------------------------------------------------------------------ shop: consumables and cosmetics

  private buildShop(d: Loaded): void {
    const { VW, VH } = this.m;
    const top = this.pageTop;
    const area = this.area(top, VH - top - 4);
    const c = area.content;
    const w = VW - 8 - 4;
    let y = 0;
    // consumables moved onto the war map: the merchants of towns and trading posts (docs/DUELS.md)
    c.add(addText(this, 0, y, t('shop.consumables'), 'red'));
    y += 11;
    const mm = wrapText(t('shop.mapMerchants'), w - 36, 6);
    const mh = Math.max(32, mm.lines.length * LINE_H + 10);
    c.add(addPanel(this, 0, y, w, mh, 'inset'));
    c.add(new ItemIcon(this, 4, y + Math.round((mh - 24) / 2), { consumable: 'morale_wine' }, { rarity: 'rare', tip: false }));
    c.add(addText(this, 32, y + 5, mm.lines.join('\n'), 'ink'));
    y += mh + SIZE.gap;
    // cosmetics by slot: preview tiles
    y += 6;
    c.add(addText(this, 0, y, t('shop.cosmetics'), 'red'));
    y += 11;
    const ch = wrapText(t('shop.cosmeticsHint'), w, 2);
    c.add(addText(this, 0, y, ch.lines.join('\n'), 'dim'));
    y += ch.lines.length * LINE_H + 3;
    const cols = Math.max(2, Math.floor((w + SIZE.gap) / (58 + SIZE.gap)));
    const tw = Math.floor((w - (cols - 1) * SIZE.gap) / cols);
    const th = 62;
    for (const slot of d.cat.slots) {
      const list = d.cat.cosmetics.filter((x) => x.slot === slot);
      if (!list.length) continue;
      c.add(addText(this, 0, y + 1, ellipsize(tOr(`shop.slot.${slot}`, slot), w), 'ink'));
      y += 11;
      list.forEach((cm, i) => {
        const tx = (i % cols) * (tw + SIZE.gap);
        const ty = y + Math.floor(i / cols) * (th + SIZE.gap);
        this.cosmeticTile(c, area, tx, ty, tw, th, cm, d);
      });
      y += Math.ceil(list.length / cols) * (th + SIZE.gap) + 4;
    }
    area.setContentHeight(y);
    frameScrollTexts(area, VW - 8);
  }

  private cosmeticTile(c: Phaser.GameObjects.Container, area: ScrollArea, x: number, y: number, w: number, h: number, cm: CosmeticInfo, d: Loaded): void {
    const owned = d.wallet.cosmetics.includes(cm.id);
    const equipped = d.wallet.loadout[cm.slot] === cm.id;
    c.add(addPanel(this, x, y, w, h, equipped ? 'buttonSel' : 'button'));
    const bg = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiId(bg, `cosmetic:${cm.id}`);
    bg.on('pointerup', () => !area.moved && this.openCosmetic(cm));
    c.add(bg);
    const g = this.add.graphics();
    g.fillStyle(0x2a1d18, 1);
    g.fillRect(x + Math.round((w - 32) / 2), y + 3, 32, 32);
    g.lineStyle(1, cm.drachmae === null ? RARITY_COLOR.epic : 0x8a6128, 1);
    g.strokeRect(x + Math.round((w - 32) / 2) + 0.5, y + 3.5, 31, 31);
    c.add(g);
    c.add(this.add.image(x + Math.round((w - 28) / 2), y + 5, cosmeticTexture(this, cm.id, cm.slot)).setOrigin(0, 0));
    const light = equipped;
    c.add(addText(this, x + w / 2, y + 38, ellipsize(cosmeticName(cm), w - 10), light ? 'light' : 'ink', 0.5));
    let status: string;
    let font: 'light' | 'good' | 'dim' | 'ink' = 'ink';
    if (equipped) (status = t('shop.equipped')), (font = 'light');
    else if (owned) (status = t('econ.owned')), (font = 'good');
    else if (cm.drachmae === null) (status = cm.source === 'season_pass' ? t('shop.passOnly') : cm.source === 'duel_season' ? t('shop.duelSeason') : t('shop.notForSale')), (font = 'dim');
    else status = t('econ.dr', { n: cm.drachmae });
    c.add(addText(this, x + w / 2, y + 49, ellipsize(status, w - 10), font, 0.5));
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
    c.add(this.add.image(Math.round(x + w / 2 - 28), y + 27, cosmeticTexture(this, cm.id, cm.slot)).setOrigin(0, 0).setScale(2));
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
    const { VW, VH } = this.m;
    const top = this.pageTop;
    const p = d.pass;
    if (!p) {
      addEconState(this, this.page, 4, top, VW - 8, VH - top - 4, 'error', () => void this.fetchAll());
      return;
    }
    const w = VW - 8;
    const prog = passProgress(p);
    const days = Math.max(0, Math.ceil((p.season.endsAt - Date.now()) / 86_400_000));
    const claimN = claimableCount(p);
    // header: season, tier, XP, premium / claim all
    const hh = 64;
    this.page.add(addPanel(this, 4, top, w, hh, 'dark'));
    const ends = addText(this, 4 + w - 5, top + 5, t('pass.endsIn', { d: days }), 'title', 1);
    this.page.add(ends);
    this.page.add(addText(this, 9, top + 5, ellipsize(`${t('pass.season', { n: p.season.id })} · ${t('pass.tierOf', { n: p.tier, max: p.tiers.length })}`, w - 14 - ends.width), 'gold'));
    const xpT = addText(this, 4 + w - 5, top + 16, prog.maxed ? t('pass.maxed') : t('pass.xp', { into: prog.into, need: prog.need }), 'title', 1);
    this.page.add(xpT);
    this.page.add(new Meter(this, 9, top + 18, Math.max(20, w - 14 - xpT.width - 4), 5, COLOR.xp).setValue(prog.frac, 1));
    const by = top + hh - SIZE.btnH - 6;
    const bw = Math.floor((w - 10 - SIZE.gap) / 2);
    if (p.premium) addChip(this, this.page, 9, by + 6, t('pass.unlocked'), RARITY_COLOR.epic, bw);
    else
      this.page.add(
        new Button(this, 9, by, bw, SIZE.btnH, {
          label: t('pass.unlock', { n: p.premiumDrachmae }),
          icon: 'drachma',
          id: 'pass.unlock',
          onClick: () => this.unlockPremium(p),
        }),
      );
    const ca = new Button(this, 9 + bw + SIZE.gap, by, w - 10 - bw - SIZE.gap, SIZE.btnH, { label: t('pass.claimAll', { n: claimN }), icon: 'check', variant: 'primary', id: 'pass.claimAll', onClick: () => void this.claimAll() });
    ca.setEnabled(claimN > 0, t('pass.xpHint'));
    this.page.add(ca);
    // column titles and the tiers
    const ly = top + hh + 3;
    const cellW = Math.floor((w - 26 - 2 * SIZE.gap) / 2);
    this.page.add(addText(this, 4 + 26 + cellW / 2, ly, t('pass.free'), 'red', 0.5));
    this.page.add(addText(this, 4 + 26 + SIZE.gap + cellW + cellW / 2, ly, t('pass.premium'), FONT_EPIC, 0.5));
    const list = new ScrollList(this, this.page, 4, ly + 11, w, VH - ly - 11 - 4, {
      count: p.tiers.length,
      rowH: 34,
      render: (i, row, rw, rh, area) => this.tierRow(d, p, i, row, rw, rh, area),
    });
    this.areas.push(list);
    list.scrollToIndex(focusTier(p) - 1);
  }

  private tierRow(d: Loaded, p: SeasonPassInfo, i: number, row: Phaser.GameObjects.Container, rw: number, rh: number, area: ScrollArea): void {
    const tier = p.tiers[i];
    const reached = tier.tier <= p.tier;
    const g = this.add.graphics();
    g.fillStyle(0x1d140f, 1);
    g.fillRect(0, 4, 22, rh - 8);
    g.fillStyle(reached ? 0xd8a840 : 0x6e5a44, 1);
    g.fillRect(1, 5, 20, rh - 10);
    row.add(g);
    row.add(uiFrame(addText(this, 11, rh / 2 - 4, `${tier.tier}`, reached ? 'ink' : 'title', 0.5), row, 22, rh));
    const cellW = Math.floor((rw - 26 - SIZE.gap) / 2);
    (['free', 'premium'] as Track[]).forEach((track, k) => this.rewardCell(d, p, tier.tier, track, track === 'free' ? tier.free : tier.premium, row, 26 + k * (cellW + SIZE.gap), cellW, rh, area));
  }

  private rewardCell(d: Loaded, p: SeasonPassInfo, tier: number, track: Track, r: PassReward, row: Phaser.GameObjects.Container, x: number, w: number, h: number, area: ScrollArea): void {
    const st = tierState(p, tier, track);
    const style = st === 'claimable' ? 'buttonSel' : st === 'claimed' ? 'inset' : st === 'premium' ? 'buttonOff' : 'button';
    row.add(addPanel(this, x, 0, w, h, style));
    const bg = this.add.zone(x, 0, w, h).setOrigin(0, 0).setInteractive();
    uiId(bg, `pass:${tier}:${track}`);
    row.add(bg);
    const name = rewardName(r, d.cat);
    bg.on('pointerup', () => {
      if (area.moved) return;
      if (st === 'claimable') void this.claim(tier, track, r);
      else showTooltip(this, `${name}\n${st === 'claimed' ? t('pass.claimed') : st === 'premium' ? t('pass.premiumLocked') : t('pass.locked', { n: tier })}`, bg);
    });
    // reward icon
    if (r.kind === 'cosmetic') {
      const cm = d.cat.cosmetics.find((c) => c.id === r.id);
      row.add(this.add.image(x + 3, 3, cosmeticTexture(this, r.id, cm?.slot ?? 'emblem')).setOrigin(0, 0));
    } else {
      const sub = r.kind === 'consumable' ? { consumable: r.id } : { resource: r.kind === 'gold' ? 'gold' : 'drachmae' };
      row.add(new ItemIcon(this, x + 4, 5, sub, { size: 24, tip: false, glow: false, rarity: track === 'premium' ? 'epic' : 'common' }));
    }
    const light = st === 'claimable';
    const tx = x + 32;
    const tw = w - 36;
    const amount = r.kind === 'gold' || r.kind === 'drachmae' ? `${r.amount}` : r.kind === 'consumable' ? `${r.qty}x` : '';
    const label = r.kind === 'cosmetic' ? rewardName(r, d.cat) : r.kind === 'consumable' ? tOr(`consumable.${r.id}.name`, r.id) : t(r.kind === 'gold' ? 'common.gold' : 'econ.drachmae');
    row.add(addText(this, tx, 6, ellipsize(`${amount} ${label}`.trim(), tw), light ? 'light' : st === 'claimed' ? 'dim' : 'ink'));
    const stText = st === 'claimable' ? t('pass.claim') : st === 'claimed' ? t('pass.claimed') : st === 'premium' ? t('pass.premium') : t('pass.tier', { n: tier });
    row.add(addText(this, tx, 18, ellipsize(stText, tw), light ? 'gold' : st === 'claimed' ? 'good' : 'dim'));
    if (st === 'claimed') row.add(addIcon(this, x + w - 15, h - 15, 'check'));
    if (st === 'premium') row.add(addIcon(this, x + w - 15, h - 15, 'close', 'D'));
    if (st === 'claimable') {
      const glow = this.add.rectangle(x + 1, 1, w - 2, h - 2).setOrigin(0, 0).setStrokeStyle(1, 0xffe080);
      row.add(glow);
      this.tweens.add({ targets: glow, alpha: { from: 1, to: 0.2 }, duration: 600, yoyo: true, repeat: -1 });
    }
  }

  async claim(tier: number, track: Track, r: PassReward): Promise<void> {
    if (this.busy || !this.loaded?.pass) return;
    this.busy = true;
    try {
      await econ().claimPass(tier, track);
      if (!this.loaded?.pass || !this.sys.isActive()) return;
      this.loaded.pass = withClaim(this.loaded.pass, tier, track);
      hapticNotify('success');
      uiCoin();
      toast(this, t('pass.got', { reward: rewardName(r, this.loaded.cat) }), 'good');
      if (r.kind === 'drachmae') this.loaded.wallet.drachmae += r.amount;
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
    const { VW, VH } = this.m;
    const top = this.pageTop;
    const area = this.area(top, VH - top - 4);
    const c = area.content;
    const w = VW - 8 - 4;
    let y = 0;
    // balance
    c.add(addPanel(this, 0, y, w, 40, 'dark'));
    c.add(this.add.image(8, y + 8, 'icon_drachma').setOrigin(0, 0).setScale(2));
    const bal = addText(this, 38, y + 7, `${d.wallet.drachmae}`, 'title');
    bal.setFontSize(14);
    c.add(bal);
    c.add(addText(this, 38 + bal.width + 5, y + 14, ellipsize(t('econ.drachmae'), w - 46 - bal.width), 'gold'));
    c.add(addText(this, 38, y + 28, ellipsize(t('wallet.balance'), w - 42), 'title'));
    y += 44;
    if (!d.wallet.canSpend) {
      const ws = wrapText(t('wallet.cannotSpend'), w, 2);
      c.add(addText(this, 0, y, ws.lines.join('\n'), 'red'));
      y += ws.lines.length * LINE_H + 3;
    }
    const note = wrapText(t('wallet.note'), w, 4);
    c.add(addText(this, 0, y, note.lines.join('\n'), 'dim'));
    y += note.lines.length * LINE_H + 5;
    // packs
    c.add(addText(this, 0, y, t('wallet.packs'), 'red'));
    y += 11;
    const cols = 2;
    const pw = Math.floor((w - SIZE.gap) / cols);
    const ph = 58;
    d.cat.packs.forEach((pk, i) => {
      const px = (i % cols) * (pw + SIZE.gap);
      const py = y + Math.floor(i / cols) * (ph + SIZE.gap);
      c.add(addPanel(this, px, py, pw, ph, 'parch'));
      c.add(this.add.image(px + 5, py + 5, goodsTexture(this, 'resource', 'drachmae')).setOrigin(0, 0));
      const amt = addText(this, px + 24, py + 6, `${pk.drachmae}`, 'red');
      c.add(amt);
      const bonus = Math.round((pk.drachmae / pk.stars - 1) * 100);
      if (bonus > 0) addChip(this, c, px + pw - 4, py + 4, t('wallet.bonus', { n: bonus }), COLOR.good, pw - 30 - amt.width, true);
      c.add(addText(this, px + 24, py + 16, ellipsize(t('econ.drachmae'), pw - 28), 'dim'));
      c.add(new Button(this, px + 4, py + ph - SIZE.btnH - 4, pw - 8, SIZE.btnH, { label: `${pk.stars}`, icon: 'star', variant: 'primary', id: `wallet.pack.${pk.id}`, tip: t('econ.stars', { n: pk.stars }), onClick: () => this.askPack(pk) }));
    });
    y += Math.ceil(d.cat.packs.length / cols) * (ph + SIZE.gap) + 4;
    // what Stars buy, and the legal pages (Telegram's payment rules)
    const legal = wrapText(t('wallet.legal'), w, 3);
    c.add(addText(this, 0, y, legal.lines.join('\n'), 'dim'));
    y += legal.lines.length * LINE_H + 3;
    const lw = Math.floor((w - SIZE.gap) / 2);
    c.add(new Button(this, 0, y, lw, SIZE.btnH, { label: t('wallet.terms'), id: 'wallet.terms', onClick: () => openExternalLink(legalUrl('terms', lang())) }));
    c.add(new Button(this, lw + SIZE.gap, y, lw, SIZE.btnH, { label: t('wallet.refunds'), id: 'wallet.refunds', onClick: () => openExternalLink(legalUrl('refunds', lang())) }));
    y += SIZE.btnH + 8;
    // history
    c.add(addText(this, 0, y, t('wallet.history'), 'red'));
    y += 11;
    if (!d.wallet.ledger.length) {
      c.add(addText(this, 0, y, t('wallet.noHistory'), 'dim'));
      y += 11;
    }
    const now = Date.now();
    for (const l of d.wallet.ledger.slice(0, 30)) {
      c.add(addPanel(this, 0, y, w, 22, 'inset'));
      const delta = addText(this, w - 5, y + 7, `${l.delta > 0 ? '+' : ''}${l.delta}`, l.delta >= 0 ? 'good' : 'red', 1);
      c.add(delta);
      const when = addText(this, w - 10 - delta.width, y + 7, ago(l.at, now), 'dim', 1);
      c.add(when);
      c.add(addText(this, 5, y + 7, ellipsize(tOr(`wallet.kind.${l.kind}`, l.kind), w - 20 - delta.width - when.width), 'ink'));
      y += 22 + 2;
    }
    area.setContentHeight(y + 4);
    frameScrollTexts(area, VW - 8);
  }

  private askPack(pk: { id: string; stars: number; drachmae: number }): void {
    confirmDialog(this, {
      title: t('wallet.packs'),
      body: t('wallet.buyPack', { n: pk.drachmae, stars: pk.stars }),
      ok: `${pk.stars}`,
      okIcon: 'star',
      cancel: t('common.cancel'),
      onOk: () => void this.buyPack(pk.id, pk.drachmae),
    });
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

const FONT_EPIC = 'rar_epic' as 'ink';
