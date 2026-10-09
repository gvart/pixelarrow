/**
 * TabBar: the v4 mode navigation (V4_SPEC "Navigation"): Campaign, Duels, WAR
 * (the centre: a round bronze shield rising above the bar), Codex, Shop. Dark
 * teal stone with a gold top rim; the selected tab is a block of parchment (the
 * War medallion glows). Each tab is the hub of its mode; badges are red counts.
 */
import Phaser from 'phaser';
import { addIcon, fitCinzel, scaleIcon } from '../kit';
import { uiId } from '../layout';
import { pulse } from '../motion';
import { t } from '../../i18n';
import { MBadge, makePressable, mosaicImage, mtext, mw } from './base';
import { MEDALLION_RISE, MODE_TABS, TAB_H, tabLayout, type TabId } from './tabLayout';
import { MEDALLION_GLOW } from '../../art/mosaicUi';

export interface TabBarOpts {
  active?: TabId;
  badges?: Partial<Record<TabId, number | string>>;
  onSelect: (id: TabId) => void;
}

const ICON_K = 1.5;
const LABEL_SIZES = [6, 5.5, 5, 4.5, 4];

export { MODE_TABS, type TabId };

export class TabBar extends Phaser.GameObjects.Container {
  readonly w: number;
  /** Bar height (below the gold rim); the medallion rises `rise` above it. */
  readonly h = TAB_H;
  readonly rise = MEDALLION_RISE;
  /** Y of the bar's top edge on screen. */
  readonly top: number;
  private current: TabId | undefined;
  private badges: Partial<Record<TabId, number | string>>;
  private page: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, VW: number, VH: number, private o: TabBarOpts) {
    super(scene, 0, VH - TAB_H);
    this.w = VW;
    this.top = VH - TAB_H;
    this.current = o.active;
    this.badges = { ...o.badges };
    this.add(mosaicImage(scene, 0, 0, VW, TAB_H, 'tabBar'));
    this.page = scene.add.container(0, 0);
    this.add(this.page);
    uiId(this, 'tabbar');
    this.build();
    scene.add.existing(this);
  }

  /** Select a tab (no callback). */
  select(id: TabId | undefined): this {
    if (id === this.current) return this;
    this.current = id;
    this.build();
    return this;
  }

  setBadge(id: TabId, n: number | string | undefined): this {
    if (n === undefined || n === 0) delete this.badges[id];
    else this.badges[id] = n;
    this.build();
    return this;
  }

  private build(): void {
    const scene = this.scene;
    this.page.removeAll(true);
    const lay = tabLayout(this.w, MODE_TABS.length);
    // one size for all five labels: the largest at which the longest still fits its slot
    const room0 = lay.slots[0].w - 5;
    const size = LABEL_SIZES.find((s) => MODE_TABS.every((tab) => mw(t(tab.key).toUpperCase(), 'rCream', s) <= room0)) ?? LABEL_SIZES[LABEL_SIZES.length - 1];
    MODE_TABS.forEach((tab, i) => {
      const slot = lay.slots[i];
      const sel = tab.id === this.current;
      const war = tab.id === 'war';
      const cx = slot.x + slot.w / 2;
      const c = scene.add.container(0, 0);
      this.page.add(c);
      if (sel) c.add(mosaicImage(scene, slot.x + 1, -3, slot.w - 2, TAB_H + 3, 'tabSel'));
      const font = sel ? 'rInk' : 'rCream';
      const room = slot.w - 5;
      const ly = TAB_H - 14;
      // the label that does not fit as capitals at this size is written in Inter instead (then cut as a last resort)
      const fl = fitCinzel(t(tab.key), font, room, [size]);
      const text = mtext(scene, cx, ly, fl.text, fl.font, { size, align: 0.5, maxW: room, box: { owner: this, w: this.w, h: TAB_H } });
      if (war) {
        const d = lay.medallionD;
        const glow = Math.round(d * MEDALLION_GLOW);
        const dd = d + glow * 2;
        const med = mosaicImage(scene, lay.medallionX - glow, -MEDALLION_RISE - glow, dd, dd, sel ? 'medallionSel' : 'medallion');
        c.add(med);
        if (sel) pulse(scene, med, 'alpha', 0.82, 1, 1400);
      } else {
        const icon = scaleIcon(addIcon(scene, 0, 0, tab.icon, sel ? '' : ''), ICON_K);
        icon.setPosition(Math.round(cx - icon.displayWidth / 2), 6);
        c.add(icon);
      }
      c.add(text);
      // touch area: the slot, or the medallion's whole diameter rising above the bar (2 UI px short of its top, to keep clear of the frame's content)
      const hit = scene.add.container(slot.hitX, war ? -MEDALLION_RISE + 2 : 0);
      const hh = war ? TAB_H + MEDALLION_RISE - 2 : TAB_H;
      makePressable(hit, { w: slot.hitW, h: hh, onTap: () => scene.time.delayedCall(0, () => this.o.onSelect(tab.id)), tip: t(tab.key) });
      uiId(hit, `tab.${tab.id}`);
      Object.assign(hit, { opts: { label: t(tab.key) } });
      this.page.add(hit);
    });
    // badges last: the medallion must not cover a neighbour's
    MODE_TABS.forEach((tab, i) => {
      const badge = this.badges[tab.id];
      if (badge === undefined) return;
      const slot = lay.slots[i];
      const war = tab.id === 'war';
      this.page.add(new MBadge(scene, war ? lay.medallionX + lay.medallionD - 4 : slot.x + slot.w / 2 + 9, war ? -MEDALLION_RISE + 8 : 8, badge));
    });
  }
}
