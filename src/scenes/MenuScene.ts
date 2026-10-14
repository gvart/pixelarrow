import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { state } from '../state';
import { online } from '../platform/cloud';
import type { SyncStatus } from '../platform/online';
import { confirmNewCampaign, openSettings } from '../ui/settings';
import { canUsePasswordForms, openAccountForm, openAccountRoute } from '../ui/account';
import { askTwoCampaigns, openTwoCampaigns } from '../ui/account/twoCampaigns';
import { demoAccountSource, openAccountPage } from '../ui/account/accountPage';
import { openDevices } from '../ui/account/devices';
import { addTipLine } from '../ui/mosaic';
import { tipHidden } from '../ui/mosaic/tips';
import { Campaign } from '../game/campaign';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { addSyncBadge } from '../ui/online';
import { FrescoBanner, MButton, ProfileCard, QuestCard, StoneTile, addHubShell, goTab, mtext, mw, wrapWords, type HubShell, type ProfileCardOpts, type QuestCardOpts } from '../ui/mosaic';
import { COMPACT_CSS_H, frescoSlot, hubStatusLine, pendingMen } from '../ui/mosaic/campaignHub';
import { PANE_GUTTER, columns, layoutVariant, type Box } from '../ui/mosaic/layout/geometry';
import { uiCollapsed, uiLayout, uiPrimary } from '../ui/layout';
import { focusPane } from '../ui/focusRing';
import { CTA_MAX, ROW_MAX } from '../ui/sizeClass';
import { TEXT_MIN, lineHeight } from '../ui/tokens';
import { RS } from '../platform/renderScale';
import { toast } from '../ui/widgets';
import { t } from '../i18n';
import { heroName } from '../i18n/names';
import { placeName } from '../i18n/places';

const GAP = 4;
const CTA_H = 30;
/** The fresco on a tablet upright: full width, at most this tall (landscape-v6 §6.2). */
const FRESCO_MEDIUM_MAX = 200;

/**
 * The Campaign hub, direction A "Fresco Hall" (design/ux/screens-campaign.md C-3,
 * docs/v5/ux/HUB_PICK.md, V5-047), built from src/ui/mosaic: the strategos' card
 * with the status line, the first-steps quest (until done), the fresco (tap =
 * continue; a one-line banner on short phones), the one primary (Continue the
 * march), the Army / Stash / Camp tiles always above the fold, and the mode tab
 * bar. Settings is the gear; the sync badge shows only while the cloud save fails.
 */
export class MenuScene extends BaseScene {
  private overlay: Phaser.GameObjects.Container | null = null;
  /** Migrated to the size classes (ADR-0013, V6-RSCR-01): the whole safe area, a rail in landscape. */
  protected override readonly responsive = true;

  constructor() {
    super('Menu');
  }

  create(data?: { settings?: 'notify'; account?: { view?: string } }): void {
    this.initUi();
    this.screen({ back: null }); // root: Telegram shows Close
    const shell = addHubShell(this, { title: 'Pixelarrow', active: 'campaign' });
    this.syncBadge(shell.frame.topBar.x + 5, shell.frame.topBar.y + 7);
    uiLayout(this, this.m.cls, this.m.land);
    const v = layoutVariant(this.m);
    if (v === 'compactPortrait') this.layPortrait(shell);
    else if (v === 'compactLandscape') this.layCompactLandscape(shell);
    else if (v === 'medium' && !this.m.land) this.layMediumPortrait(shell);
    else this.layExpanded(shell);

    // What happened to the save at boot (V5-011), once.
    if (state.notice) {
      toast(this, t(state.notice), state.notice === 'battle.abandoned' ? 'info' : 'bad', 7000);
      state.notice = null;
    }

    // Opened from a bot message's "Open in the game" (startapp=settings).
    if (data?.settings === 'notify') this.openNotifications();
    // Opened at #login or #forgot (an email-link page's "Log in", V6-071): the form, once (not again on a relayout).
    if (data?.account && openAccountRoute(this, data.account)) delete data.account;
    // #account and startapp=account (the bot's /delete_my_data, the re-auth Reopen path): Settings → Account, once
    if (data?.account?.view === 'account') {
      delete data.account;
      clearHash('#account');
      this.openAccount();
    }
    // The first sync after a log-in found progress on both sides (AU-08, V6-ACCT-07): the player picks.
    askTwoCampaigns(this, () => this.scene.restart());
  }

  /**
   * AU-07 the guest tip (accounts-v6.md §4.3 step 4, V6-ACCT-07): on a platform with email forms, with no
   * session, once the first battle is won; dismissed for good with its X. Null when it does not show.
   */
  private guestTip(w: number): { c: Phaser.GameObjects.Container; h: number } | null {
    if (!canUsePasswordForms() || online.signedIn || !state.hasSave || state.campaign.data.won <= 0 || tipHidden('guestSave')) return null;
    const c = this.add.container(0, 0);
    const h = addTipLine(this, c, 0, 0, w, {
      text: t('auth.guest.tip'),
      icon: 'people',
      card: true,
      dismissId: 'guestSave',
      id: 'menu.guestTip',
      action: { label: t('auth.guest.tipCta'), id: 'menu.guestTip.create', onClick: () => openAccountForm(this, 'signup', { onSignedIn: () => this.scene.restart() }) },
    });
    return { c, h };
  }

  // ------------------------------------------------------------------ the parts (every layout shows all of them)

  /** The save: the strategos, where the army is, what is up, the arc; campaign gold, battles won, men. */
  private profileOpts(): ProfileCardOpts {
    const c = state.campaign.data;
    const world = state.campaign.world;
    const lead = c.heroes[0];
    const inside = state.hasSave ? world.s.inside : -1;
    const lairs = world.map.settlements.filter((st) => st.kind === 'lair');
    const status = hubStatusLine({
      hasSave: state.hasSave,
      day: Math.floor(c.world.time / 24) + 1,
      place: inside >= 0 ? placeName(world.settlement(inside)?.name ?? '') || undefined : undefined,
      hurt: c.heroes.filter((h) => (h.wound ?? 0) > 0).length,
      lairsDown: lairs.filter((l) => world.s.lairs?.[l.id]?.fallen).length,
      lairs: lairs.length,
      arc: world.s.arc?.stage ?? 'lairs',
    });
    return {
      portrait: 'ui_portrait_leader',
      name: state.hasSave && lead ? t('hub.leader', { name: heroName(lead.name) }) : t('hub.newCampaign'),
      subtitle: status,
      stats: [
        { icon: 'coin', text: t('hub.gold', { n: c.gold }), right: { icon: 'trophy', text: t('hub.trophies', { n: c.won }) } },
        { icon: 'people', text: t('hub.warband', { n: c.heroes.length }) },
      ],
      id: 'menu.save',
    };
  }

  /** First steps, until they are done (null after). */
  private questOpts(compact: boolean): QuestCardOpts | null {
    const steps = this.firstSteps();
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);
    if (!next) return null;
    return { title: t('menu.firstSteps', { done: t('strat.ofCount', { a: done, b: steps.length }) }), total: steps.length, done, next: next.text, compact, id: 'menu.quest' };
  }

  /**
   * Army, Stash and Camp in a row `w` wide at `x`, `th` tall, with the reasons of the disabled tiles under it
   * (no save yet: Army and Stash wait for the march to begin, C-3 "No save"; live tiles are bronze, grey stone
   * means disabled only: V5-046, C-3 colour roles). `h` is the row with its reasons; `build(y)` adds it.
   */
  private tileRow(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, x: number, w: number, maxH: number): { th: number; h: number; build: (y: number) => void } {
    const c = state.campaign.data;
    const world = state.campaign.world;
    const tw = Math.floor((w - 2 * GAP) / 3);
    const th = Math.min(tw, maxH);
    const lastW = w - 2 * (tw + GAP);
    const noSave = state.hasSave ? undefined : t('hub.beginFirst');
    const pending = state.hasSave ? pendingMen(c.heroes) : 0;
    const campOff = world.camp ? undefined : t('hub.pitchCamp');
    // the reasons of the disabled tiles, one line each across the row (the mockup's "Pitch camp on the map"):
    // under Army and Stash at the left, under Camp at the right
    const lh = Math.ceil(lineHeight(TEXT_MIN));
    const reasons: { lines: string[]; x: number; align: 0 | 1 }[] = [];
    if (noSave) reasons.push({ lines: wrapWords(noSave, w, (s) => mw(s, 'pSec', TEXT_MIN)), x: x + 1, align: 0 });
    if (campOff) reasons.push({ lines: wrapWords(campOff, w, (s) => mw(s, 'pSec', TEXT_MIN)), x: x + w, align: 1 });
    const reasonH = reasons.reduce((a, r) => a + r.lines.length * lh, 0);
    const tiles = [
      new StoneTile(this, x, 0, tw, th, { icon: 'helmet', label: t('hub.army'), variant: 'bronze', badge: pending || undefined, disabled: noSave, caption: false, tip: t('hub.tip.army'), id: 'menu.army', onClick: () => this.scene.start('Army', { from: 'Menu' }) }),
      new StoneTile(this, x + tw + GAP, 0, tw, th, { icon: 'chest', label: t('hub.stash'), variant: 'bronze', disabled: noSave, caption: false, tip: t('hub.tip.stash'), id: 'menu.stash', onClick: () => this.scene.start('Army', { from: 'Menu', tab: 'stash' }) }),
      new StoneTile(this, x + 2 * (tw + GAP), 0, lastW, th, { icon: 'tent', label: t('hub.camp'), variant: 'bronze', disabled: campOff, caption: false, tip: t('hub.tip.camp'), id: 'menu.camp', onClick: () => this.scene.start('Camp', { mode: 'field' }) }),
    ];
    return {
      th,
      h: th + (reasonH ? 2 + reasonH : 0),
      build: (y) => {
        for (const tile of tiles) add(tile.setY(y));
        let ry = y + th + 2;
        for (const r of reasons)
          for (const line of r.lines) {
            add(mtext(this, r.x, ry, line, 'pSec', { size: TEXT_MIN, align: r.align }));
            ry += lh;
          }
      },
    };
  }

  /** Continue the march (or begin one: "New campaign" over a save lives in Settings, confirmed). */
  private readonly go = () => (state.hasSave ? this.continueCampaign() : this.newCampaign());

  /** The one primary, shown whole at scroll 0 at every size (above-fold). */
  private primary(x: number, y: number, w: number): MButton {
    const id = state.hasSave ? 'menu.continue' : 'menu.new';
    return uiPrimary(new MButton(this, x, y, w, CTA_H, { label: state.hasSave ? t('menu.continueMarch') : t('menu.beginMarch'), icon: 'march', variant: 'primaryHero', id, onClick: this.go }));
  }

  /** The fresco: a tap marches on. Where a layout has no room for it, its action is the primary's (element-parity). */
  private fresco(x: number, y: number, w: number, h: number): FrescoBanner {
    return new FrescoBanner(this, x, y, w, h, { image: 'ui_banner_campaign', label: t('menu.continueMarch'), id: 'menu.banner', onClick: this.go });
  }

  /** Tab reads the left pane, then the right one (landscape-v6 §4): the controls from `x` on are the second pane. */
  private secondPane(shell: HubShell, x: number): void {
    for (const o of shell.area.content.list) if ((o as Phaser.GameObjects.Container).x >= x) focusPane(o, 1);
  }

  private noFresco(): void {
    uiCollapsed(this, 'menu.banner', state.hasSave ? 'menu.continue' : 'menu.new');
  }

  // ------------------------------------------------------------------ layouts (design/ux/landscape-v6.md §6.2)

  /** Compact portrait: the v5 hub, unchanged (§16.9). */
  private layPortrait(shell: HubShell): void {
    const { area, w } = shell;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (area.content.add(o), o);
    // short phones (MENU-1): a smaller portrait, a one-row quest, lower tiles and tighter gaps
    const compact = (this.m.VH * this.m.S) / RS < COMPACT_CSS_H;
    const gap = compact ? GAP : GAP + 2;
    let y = 2;
    const profile = add(new ProfileCard(this, 1, y, w, { ...this.profileOpts(), portraitSize: compact ? 24 : w >= 180 ? 40 : 32, statsBelow: compact || 'auto' }));
    y += profile.h + GAP;
    const q = this.questOpts(compact);
    if (q) y += add(new QuestCard(this, 1, y, w, q)).h + GAP;
    const tip = this.guestTip(w);
    if (tip) {
      add(tip.c.setPosition(1, y));
      y += tip.h + GAP;
    }
    // Army, Stash and Camp, built first: the fresco takes what they leave above the fold
    const row = this.tileRow(add, 1, w, compact ? 36 : 56);
    // the fresco (a one-line banner, or none, when the tiles would fall below the fold)
    const room = area.viewHeight - y - (gap + CTA_H + gap + row.h + 4);
    const fresco = frescoSlot(w, room);
    // room left over (first steps done, a tall phone): shared above and below the fresco, so the
    // primary and the tiles keep to the thumb zone without a hole under the cards
    if (fresco.kind === 'full') y += Math.max(0, Math.floor((room - fresco.h) / 2));
    if (fresco.kind !== 'none') {
      add(this.fresco(1, y, w, fresco.h));
      y += fresco.h + gap;
    } else this.noFresco();
    y += Math.max(0, Math.floor(area.viewHeight - y - (CTA_H + gap + row.h + 4)));
    add(this.primary(1, y, w));
    y += CTA_H + gap;
    row.build(y);
    y += row.h + 4;
    area.setContentHeight(y);
  }

  /**
   * Compact landscape, 844x390 (§6.2, §6.5): two panes beside the rail. Left the profile and the quest; right
   * the primary at the top (always above the fold), the tiles and the disabled reasons. No fresco (`short`).
   */
  private layCompactLandscape(shell: HubShell): void {
    const { area, w } = shell;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (area.content.add(o), o);
    // two panes at every compact-landscape width (the Telegram safe area leaves 279 UI px, under `columns`' 300)
    const lw = Math.floor((w - PANE_GUTTER) / 2);
    const rx = 1 + lw + PANE_GUTTER;
    const rw = w - lw - PANE_GUTTER;
    let ly = 2;
    ly += add(new ProfileCard(this, 1, ly, lw, { ...this.profileOpts(), portraitSize: 24, statsBelow: true })).h + GAP;
    const q = this.questOpts(true);
    if (q) ly += add(new QuestCard(this, 1, ly, lw, q)).h + GAP;
    const tip = this.guestTip(lw);
    if (tip) {
      add(tip.c.setPosition(1, ly));
      ly += tip.h + GAP;
    }
    let ry = 2;
    add(this.primary(rx, ry, Math.min(rw, CTA_MAX)));
    ry += CTA_H + GAP;
    const row = this.tileRow(add, rx, rw, 36);
    row.build(ry);
    ry += row.h + 4;
    this.noFresco();
    this.secondPane(shell, rx);
    area.setContentHeight(Math.max(ly, ry));
  }

  /**
   * Medium portrait, tablets upright (§6.2): one column with the tab bar, the profile and the quest side by
   * side, the fresco across (at most 200 tall), then the primary and the tiles (at most 300 wide, centred).
   */
  private layMediumPortrait(shell: HubShell): void {
    const { area, w } = shell;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (area.content.add(o), o);
    const gap = GAP + 2;
    let y = 2;
    const q = this.questOpts(false);
    const half = Math.floor((w - PANE_GUTTER) / 2);
    const profile = add(new ProfileCard(this, 1, y, q ? half : w, { ...this.profileOpts(), portraitSize: 40, statsBelow: 'auto' }));
    const quest = q ? add(new QuestCard(this, 1 + half + PANE_GUTTER, y, w - half - PANE_GUTTER, q)) : null;
    y += Math.max(profile.h, quest?.h ?? 0) + GAP;
    const tip = this.guestTip(w);
    if (tip) {
      add(tip.c.setPosition(1, y));
      y += tip.h + GAP;
    }
    const cw = Math.min(w, CTA_MAX);
    const cx = 1 + Math.floor((w - cw) / 2);
    const row = this.tileRow(add, cx, cw, 56);
    const fw = Math.min(w, ROW_MAX);
    const room = area.viewHeight - y - (gap + CTA_H + gap + row.h + 4);
    const fresco = frescoSlot(fw, Math.min(room, FRESCO_MEDIUM_MAX));
    if (fresco.kind === 'full') y += Math.max(0, Math.floor((room - fresco.h) / 2));
    if (fresco.kind !== 'none') {
      add(this.fresco(1 + Math.floor((w - fw) / 2), y, fw, fresco.h));
      y += fresco.h + gap;
    } else this.noFresco();
    y += Math.max(0, Math.floor(area.viewHeight - y - (CTA_H + gap + row.h + 4)));
    add(this.primary(cx, y, cw));
    y += CTA_H + gap;
    row.build(y);
    y += row.h + 4;
    area.setContentHeight(y);
  }

  /**
   * Expanded, laptops and desktops, and near-square windows (§6.2, §6.3): two panes beside the rail. Left the
   * hero pane, the fresco (16:9, at most 300 wide) with the primary under it; right the profile, the quest and
   * the tiles. Each pane's group is centred in the height, so neither leaves an empty band.
   */
  private layExpanded(shell: HubShell): void {
    const { area, w } = shell;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (area.content.add(o), o);
    const view = area.viewHeight;
    const [hero, side] = columns({ x: 1, y: 0, w, h: view }, [
      { min: 200, max: CTA_MAX, priority: 2 },
      { min: 180, max: 320, priority: 1 },
    ]).panes as Box[];
    // the hero pane: fresco + primary, as tall as the view allows
    const fh = Math.max(0, Math.min(Math.round((hero.w * 9) / 16), view - 4 - CTA_H - GAP - 4));
    const heroH = (fh ? fh + GAP + 2 : 0) + CTA_H;
    let hy = Math.max(2, Math.floor((view - heroH) / 2));
    if (fh) {
      add(this.fresco(hero.x, hy, hero.w, fh));
      hy += fh + GAP + 2;
    } else this.noFresco();
    add(this.primary(hero.x, hy, hero.w));
    // the side pane: profile, quest, tiles
    const q = this.questOpts(false);
    const parts: Phaser.GameObjects.Container[] = [];
    const profile = new ProfileCard(this, side.x, 0, side.w, { ...this.profileOpts(), portraitSize: 40, statsBelow: 'auto' });
    parts.push(profile);
    const quest = q ? new QuestCard(this, side.x, 0, side.w, q) : null;
    if (quest) parts.push(quest);
    const row = this.tileRow(add, side.x, side.w, 56);
    const tip = this.guestTip(side.w);
    const sideH = profile.h + GAP + (quest ? quest.h + GAP + 2 : 2) + (tip ? tip.h + GAP : 0) + row.h;
    let sy = Math.max(2, Math.floor((view - sideH) / 2));
    for (const p of parts) {
      add(p.setY(sy));
      sy += (p === profile ? profile.h : quest!.h) + GAP + (p === quest ? 2 : 0);
    }
    if (!quest) sy += 2;
    if (tip) {
      add(tip.c.setPosition(side.x, sy));
      sy += tip.h + GAP;
    }
    row.build(sy);
    this.secondPane(shell, side.x);
    area.setContentHeight(Math.max(hy + CTA_H, sy + row.h) + 4);
  }

  /** The cloud badge at the left of the top bar, only while the cloud save fails (C-3, MENU-4); World and Army always show it. */
  private syncBadge(x: number, y: number): void {
    let badge: Phaser.GameObjects.Image | null = null;
    const apply = (s: SyncStatus) => {
      if (s === 'offline' && !badge) badge = addSyncBadge(this, this.ui, x, y);
      else if (s !== 'offline' && badge) {
        badge.destroy();
        badge = null;
      }
    };
    apply(online.status);
    this.events.once('shutdown', online.onStatus(apply));
  }

  /** The first-steps checklist: what the save says the player has done. */
  private firstSteps(): { text: string; done: boolean }[] {
    const c = state.campaign.data;
    const st = c.settings;
    const tut = st.tutorial?.status;
    const seen = st.seenHints ?? [];
    return [
      { text: t('menu.step.tutorial'), done: tut === 'done' || tut === 'skipped' },
      { text: t('menu.step.battle'), done: c.won > 0 },
      { text: t('menu.step.hire'), done: c.heroes.length >= 4 },
      { text: t('menu.step.gear'), done: seen.includes('*') || seen.includes('army') || seen.includes('hero') },
    ];
  }

  /** Settings with the notification switches on top (`demo`: in-memory switches, for the layout check). */
  openNotifications(demo = false): void {
    this.openSettings();
    openNotifySettings(this, demo ? { source: demoNotifySource() } : {});
  }

  /** Settings → Account (`demo`: an in-memory account for the layout check and the regression run). */
  openAccount(demo?: 'live' | 'guest' | 'pending'): void {
    this.openSettings();
    openAccountPage(this, demo ? { source: demoAccountSource(demo) } : {});
  }

  /** Settings → Account → Signed-in devices, on an in-memory account (layout check). */
  openDevicesDemo(): void {
    this.openAccount('live');
    openDevices(this, { source: demoAccountSource('live') });
  }

  /** AU-08 with two sample campaigns (layout check); nothing is kept. */
  openTwoCampaignsDemo(): void {
    const local = Campaign.fresh(7).sync();
    const cloud = Campaign.fresh(8).sync();
    Object.assign(local, { won: 6, gold: 344 });
    Object.assign(cloud, { won: 22, gold: 1210 });
    cloud.world.time = 30 * 24;
    openTwoCampaigns(this, { local, cloud, prefer: 'cloud', keep: async () => true });
  }

  /** Settings → About (terms, privacy, refunds). */
  openAboutPage(): void {
    this.openSettings();
    openAbout(this);
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  /** The shop scene (wallet, cosmetics, consumables, season pass). */
  openShop(): void {
    this.closeOverlay();
    goTab(this, 'shop');
  }

  /** The duel hub: the persistent duel army, the ladder and the duel shop. */
  openDuels(): void {
    this.closeOverlay();
    goTab(this, 'duels');
  }

  private openSettings(): void {
    this.closeOverlay();
    openSettings(this);
  }

  private continueCampaign(): void {
    const w = state.campaign.world;
    if (w.s.inside >= 0) this.scene.start('Settlement', { id: w.s.inside });
    else this.scene.start('World', {});
  }

  private newCampaign(): void {
    void state.reset().then(() => this.scene.start('World', {}));
  }

  /** "New campaign?" (the shared confirmation; Settings → Account opens the same). */
  confirmReset(): void {
    const prev = this.overlay;
    const c = confirmNewCampaign(this);
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
    prev?.destroy();
  }
}

/** Drops a handled hash route from the address, so a reload doesn't reopen it. */
function clearHash(hash: string): void {
  try {
    if (location.hash === hash) history.replaceState(history.state, '', location.pathname + location.search);
  } catch {
    /* no history: the route stays in the address */
  }
}
