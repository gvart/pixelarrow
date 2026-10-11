import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { state } from '../state';
import { online } from '../platform/cloud';
import type { SyncStatus } from '../platform/online';
import { confirmNewCampaign, openSettings } from '../ui/settings';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { addSyncBadge } from '../ui/online';
import { FrescoBanner, MButton, ProfileCard, QuestCard, StoneTile, addHubShell, goTab, mtext, mw, wrapWords } from '../ui/mosaic';
import { COMPACT_CSS_H, frescoSlot, hubStatusLine, pendingMen } from '../ui/mosaic/campaignHub';
import { TEXT_MIN, lineHeight } from '../ui/tokens';
import { RS } from '../platform/renderScale';
import { toast } from '../ui/widgets';
import { t } from '../i18n';

const GAP = 4;
const CTA_H = 30;

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

  constructor() {
    super('Menu');
  }

  create(data?: { settings?: 'notify' }): void {
    this.initUi();
    this.screen({ back: null }); // root: Telegram shows Close
    const c = state.campaign.data;
    const world = state.campaign.world;
    const shell = addHubShell(this, { title: 'Pixelarrow', active: 'campaign' });
    const { area, w } = shell;
    this.syncBadge(shell.frame.topBar.x + 5, shell.frame.topBar.y + 7);
    const content = area.content;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (content.add(o), o);
    // short phones (MENU-1): a smaller portrait, a one-row quest, lower tiles and tighter gaps
    const compact = (this.m.VH * this.m.S) / RS < COMPACT_CSS_H;
    const gap = compact ? GAP : GAP + 2;
    let y = 2;

    // ---- the save: the strategos, where the army is, what is up, the arc; campaign gold, battles won, men
    const lead = c.heroes[0];
    const inside = state.hasSave ? world.s.inside : -1;
    const lairs = world.map.settlements.filter((st) => st.kind === 'lair');
    const status = hubStatusLine({
      hasSave: state.hasSave,
      day: Math.floor(c.world.time / 24) + 1,
      place: inside >= 0 ? world.settlement(inside)?.name : undefined,
      hurt: c.heroes.filter((h) => (h.wound ?? 0) > 0).length,
      lairsDown: lairs.filter((l) => world.s.lairs?.[l.id]?.fallen).length,
      lairs: lairs.length,
      arc: world.s.arc?.stage ?? 'lairs',
    });
    const profile = add(
      new ProfileCard(this, 1, y, w, {
        portrait: 'ui_portrait_leader',
        portraitSize: compact ? 24 : w >= 180 ? 40 : 32,
        statsBelow: compact || 'auto',
        name: state.hasSave && lead ? t('hub.leader', { name: lead.name }) : t('hub.newCampaign'),
        subtitle: status,
        stats: [
          { icon: 'coin', text: t('hub.gold', { n: c.gold }), right: { icon: 'trophy', text: t('hub.trophies', { n: c.won }) } },
          { icon: 'people', text: t('hub.warband', { n: c.heroes.length }) },
        ],
        id: 'menu.save',
      }),
    );
    y += profile.h + GAP;

    // ---- first steps, until they are done
    const steps = this.firstSteps();
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);
    if (next) {
      const quest = add(new QuestCard(this, 1, y, w, { title: t('menu.firstSteps', { done: t('strat.ofCount', { a: done, b: steps.length }) }), total: steps.length, done, next: next.text, compact, id: 'menu.quest' }));
      y += quest.h + GAP;
    }

    // ---- Army, Stash and Camp, built first: the fresco takes what they leave above the fold
    // (no save yet: Army and Stash wait for the march to begin, C-3 "No save")
    const tw = Math.floor((w - 2 * GAP) / 3);
    const th = Math.min(tw, compact ? 36 : 56);
    const lastW = w - 2 * (tw + GAP);
    const noSave = state.hasSave ? undefined : t('hub.beginFirst');
    const pending = state.hasSave ? pendingMen(c.heroes) : 0;
    const campOff = world.camp ? undefined : t('hub.pitchCamp');
    const tiles = [
      new StoneTile(this, 1, 0, tw, th, { icon: 'helmet', label: t('hub.army'), badge: pending || undefined, disabled: noSave, caption: false, tip: t('hub.tip.army'), id: 'menu.army', onClick: () => this.scene.start('Army', { from: 'Menu' }) }),
      new StoneTile(this, 1 + tw + GAP, 0, tw, th, { icon: 'chest', label: t('hub.stash'), variant: 'bronze', disabled: noSave, caption: false, tip: t('hub.tip.stash'), id: 'menu.stash', onClick: () => this.scene.start('Army', { from: 'Menu', tab: 'stash' }) }),
      new StoneTile(this, 1 + 2 * (tw + GAP), 0, lastW, th, { icon: 'tent', label: t('hub.camp'), disabled: campOff, caption: false, tip: t('hub.tip.camp'), id: 'menu.camp', onClick: () => this.scene.start('Camp', { mode: 'field' }) }),
    ];
    // the reasons of the disabled tiles, one line each across the row (the mockup's "Pitch camp on the map"):
    // under Army and Stash at the left, under Camp at the right
    const lh = Math.ceil(lineHeight(TEXT_MIN));
    const reasons: { lines: string[]; x: number; align: 0 | 1 }[] = [];
    if (noSave) reasons.push({ lines: wrapWords(noSave, w, (s) => mw(s, 'pSec', TEXT_MIN)), x: 2, align: 0 });
    if (campOff) reasons.push({ lines: wrapWords(campOff, w, (s) => mw(s, 'pSec', TEXT_MIN)), x: 1 + w, align: 1 });
    const reasonH = reasons.reduce((a, r) => a + r.lines.length * lh, 0);
    const tilesH = th + (reasonH ? 2 + reasonH : 0);

    // ---- the fresco: a tap marches on (a one-line banner, or none, when the tiles would fall below the fold)
    const go = () => (state.hasSave ? this.continueCampaign() : this.newCampaign());
    const room = area.viewHeight - y - (gap + CTA_H + gap + tilesH + 4);
    const fresco = frescoSlot(w, room);
    // room left over (first steps done, a tall phone): shared above and below the fresco, so the
    // primary and the tiles keep to the thumb zone without a hole under the cards
    if (fresco.kind === 'full') y += Math.max(0, Math.floor((room - fresco.h) / 2));
    if (fresco.kind !== 'none') {
      add(new FrescoBanner(this, 1, y, w, fresco.h, { image: 'ui_banner_campaign', label: t('menu.continueMarch'), id: 'menu.banner', onClick: go }));
      y += fresco.h + gap;
    }
    y += Math.max(0, Math.floor(area.viewHeight - y - (CTA_H + gap + tilesH + 4)));

    // ---- the one primary
    // (no save yet: the same place begins one; "New campaign" over a save lives in Settings, confirmed)
    add(new MButton(this, 1, y, w, CTA_H, { label: state.hasSave ? t('menu.continueMarch') : t('menu.beginMarch'), icon: 'march', variant: 'primaryHero', id: state.hasSave ? 'menu.continue' : 'menu.new', onClick: go }));
    y += CTA_H + gap;

    for (const tile of tiles) add(tile.setY(y));
    let ry = y + th + 2;
    for (const r of reasons)
      for (const line of r.lines) {
        add(mtext(this, r.x, ry, line, 'pSec', { size: TEXT_MIN, align: r.align }));
        ry += lh;
      }
    y += tilesH + 4;
    area.setContentHeight(y);

    // What happened to the save at boot (V5-011), once.
    if (state.notice) {
      toast(this, t(state.notice), state.notice === 'battle.abandoned' || state.notice === 'save.replaced' ? 'info' : 'bad', 7000);
      state.notice = null;
    }

    // Opened from a bot message's "Open in the game" (startapp=settings).
    if (data?.settings === 'notify') this.openNotifications();
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
