import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { state } from '../state';
import { perkSlots } from '../data/perks';
import { confirmNewCampaign, openSettings } from '../ui/settings';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { addSyncBadge } from '../ui/online';
import { FrescoBanner, MButton, ProfileCard, QuestCard, StoneTile, addHubShell, goTab } from '../ui/mosaic';
import { t } from '../i18n';

const GAP = 4;

/**
 * The Campaign hub (docs/redesign/V4_SPEC.md, mockup A1), built from
 * src/ui/mosaic: the strategos' card, the first-steps quest (until done), the
 * fresco (tap = continue), the one hero action (Continue the march), the
 * Army / Stash / Camp tiles, and the mode tab bar (Duels, War, Codex and Shop
 * open their hubs). Settings is the gear in the top bar.
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
    const shell = addHubShell(this, { title: 'Pixelarrow', active: 'campaign' });
    const { area, w } = shell;
    // where the save lives (the cloud badge), at the left of the top bar
    addSyncBadge(this, this.ui, shell.frame.topBar.x + 5, shell.frame.topBar.y + 7);
    const content = area.content;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (content.add(o), o);
    let y = 2;

    // ---- the save: the strategos, where the army is, what is up; campaign gold, battles won, men
    const lead = c.heroes[0];
    const day = Math.floor(c.world.time / 24) + 1;
    const inside = state.hasSave ? state.campaign.world.s.inside : -1;
    const place = inside >= 0 ? state.campaign.world.settlement(inside)?.name : undefined;
    const hurt = c.heroes.filter((h) => (h.wound ?? 0) > 0).length;
    const where = !state.hasSave ? t('menu.status.noSave') : place ? t('menu.where.inside', { n: day, place }) : t('menu.where.day', { n: day });
    // the more urgent half: wounded men before the day
    const subtitle = !state.hasSave ? t('menu.status.fresh') : hurt > 0 ? t('menu.status.hurt', { n: hurt }) : where;
    const profile = add(
      new ProfileCard(this, 1, y, w, {
        portrait: 'ui_portrait_leader',
        name: lead ? t('hub.leader', { name: lead.name }) : t('hub.newCampaign'),
        subtitle,
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
      const quest = add(new QuestCard(this, 1, y, w, { title: t('menu.firstSteps', { done: t('strat.ofCount', { a: done, b: steps.length }) }), total: steps.length, done, next: next.text, id: 'menu.quest' }));
      y += quest.h + GAP;
    }

    // ---- the fresco: a tap marches on
    // (the fresco takes what the rest leaves, between 2.2 and 3.4 wide per high)
    const tw = Math.floor((w - 2 * GAP) / 3);
    const th = Math.min(tw, 56);
    const campOff = !state.campaign.world.camp;
    const below = 30 + GAP + 2 + th + 4 + (campOff ? 18 : 0);
    const bh = Math.max(Math.round(w / 3.4), Math.min(Math.round(w / 2.2), area.viewHeight - y - below - GAP - 2));
    const go = () => (state.hasSave ? this.continueCampaign() : this.newCampaign());
    add(new FrescoBanner(this, 1, y, w, bh, { image: 'ui_banner_campaign', label: t('menu.continueMarch'), id: 'menu.banner', onClick: go }));
    y += bh + GAP + 2;

    // ---- the one hero action
    // (no save yet: the same place begins one; "New campaign" over a save lives in Settings, confirmed)
    add(new MButton(this, 1, y, w, 30, { label: state.hasSave ? t('menu.continueMarch') : t('menu.beginMarch'), icon: 'march', variant: 'primaryHero', id: state.hasSave ? 'menu.continue' : 'menu.new', onClick: go }));
    y += 30 + GAP + 2;

    // ---- Army, Stash and Camp
    const pending = c.heroes.some((h) => h.points > 0 || h.perks.length < perkSlots(h.level));
    const lastW = w - 2 * (tw + GAP);
    add(new StoneTile(this, 1, y, tw, th, { icon: 'helmet', label: t('hub.army'), badge: pending ? '!' : undefined, tip: t('hub.tip.army'), id: 'menu.army', onClick: () => this.scene.start('Army', { from: 'Menu' }) }));
    add(new StoneTile(this, 1 + tw + GAP, y, tw, th, { icon: 'chest', label: t('hub.stash'), variant: 'bronze', tip: t('hub.tip.stash'), id: 'menu.stash', onClick: () => this.scene.start('Army', { from: 'Menu', tab: 'stash' }) }));
    const camp = add(
      new StoneTile(this, 1 + 2 * (tw + GAP), y, lastW, th, {
        icon: 'tent',
        label: t('hub.camp'),
        disabled: campOff ? t('hub.pitchCamp') : undefined,
        tip: t('hub.tip.camp'),
        id: 'menu.camp',
        onClick: () => this.scene.start('Camp', { mode: 'field' }),
      }),
    );
    y += camp.totalH + 4;
    area.setContentHeight(y);

    // Opened from a bot message's "Open in the game" (startapp=settings).
    if (data?.settings === 'notify') this.openNotifications();
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
    else this.scene.start('World');
  }

  private newCampaign(): void {
    void state.reset().then(() => this.scene.start('World'));
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
