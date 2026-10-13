/**
 * TabBar: the v4 mode navigation (V4_SPEC "Navigation"): Campaign, Duels, WAR
 * (the centre: a round bronze shield rising above the bar), Codex, Shop. Dark
 * teal stone with a gold top rim; the selected tab is a block of parchment with
 * a bronze rim and ink label (the War medallion glows). Each tab is the hub of
 * its mode; badges are red counts. The five labels share one face, case and size
 * (`fitTabLabels`, ADR-0005): Cinzel capitals when they all fit, else Inter; when none fits at 6.5,
 * only the active tab keeps its label (V5-068).
 * A hub's tab bar makes its view a root (HUB-01, `hubView`).
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon, type FontKey } from '../kit';
import { uiId } from '../layout';
import { pulse } from '../motion';
import { t } from '../../i18n';
import { MBadge, makePressable, mosaicImage, mtext, mw } from './base';
import { MEDALLION_RISE, MODE_TABS, TAB_H, fitTabLabels, tabLayout, type TabId } from './tabLayout';
import { MEDALLION_GLOW } from '../../art/mosaicUi';
import { hubView } from '../../platform/nav';

export interface TabBarOpts {
  active?: TabId;
  badges?: Partial<Record<TabId, number | string>>;
  onSelect: (id: TabId) => void;
}

const ICON_K = 1.5;
/** The War glyph's size as a fraction of the medallion's diameter (inside its dished face). */
const WAR_GLYPH = 0.62;

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
    // a hub's tab bar is on screen: this view is the root (no Back; Telegram shows Close)
    hubView(scene, null);
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
    // one face, case and size for all five labels; the slots follow them (the medallion stays centred)
    const labels = fitTabLabels(this.w, MODE_TABS.map((tab) => t(tab.key)), (str, face, z) => mw(str, face === 'roman' ? 'rCream' : 'light', z));
    const lay = tabLayout(this.w, MODE_TABS.length, labels.slots ?? undefined);
    const { face, size } = labels.style;
    // not all five fit at 6.5 (a 274 px Telegram canvas, V5-068): every tab keeps its icon, only the active
    // one its label; the others say their name on long-press and hover (their tip)
    const iconOnly = !labels.slots;
    MODE_TABS.forEach((tab, i) => {
      const slot = lay.slots[i];
      const sel = tab.id === this.current;
      const war = tab.id === 'war';
      const font: FontKey = face === 'roman' ? (sel ? 'rInk' : 'rCream') : sel ? 'pInk' : 'light';
      const showLabel = !iconOnly || sel;
      // icon-only: the active label may be wider than its slot; it, its icon and its block stay on the bar
      const lw = mw(labels.texts[i], font, size);
      const cx = iconOnly && sel ? Math.min(Math.max(slot.x + slot.w / 2, lw / 2 + 2), this.w - lw / 2 - 2) : slot.x + slot.w / 2;
      const c = scene.add.container(0, 0);
      this.page.add(c);
      if (sel) {
        const bw = iconOnly ? Math.max(slot.w - 2, Math.ceil(lw) + 4) : slot.w - 2;
        const bx = iconOnly ? Math.min(Math.max(Math.round(cx - bw / 2), 0), this.w - bw) : slot.x + 1;
        c.add(mosaicImage(scene, bx, -3, bw, TAB_H + 3, 'tabSel'));
      }
      const ly = TAB_H - 14;
      if (war) {
        const d = lay.medallionD;
        const glow = Math.round(d * MEDALLION_GLOW);
        const dd = d + glow * 2;
        const med = mosaicImage(scene, lay.medallionX - glow, -MEDALLION_RISE - glow, dd, dd, sel ? 'medallionSel' : 'medallion');
        c.add(med);
        if (sel) pulse(scene, med, 'alpha', 0.82, 1, 1400);
        // the engraved War glyph on the dished face (ui:war, MENU-2, AS-07)
        const glyph = scaleIcon(addIcon(scene, 0, 0, 'war'), (d * WAR_GLYPH) / 12);
        glyph.setPosition(Math.round(lay.medallionX + (d - glyph.displayWidth) / 2), Math.round(-MEDALLION_RISE + (d - glyph.displayHeight) / 2));
        c.add(glyph);
      } else {
        const icon = scaleIcon(addIcon(scene, 0, 0, tab.icon, sel ? '' : ''), ICON_K);
        icon.setPosition(Math.round(cx - icon.displayWidth / 2), showLabel ? 6 : Math.round((TAB_H - icon.displayHeight) / 2));
        c.add(icon);
      }
      if (showLabel) c.add(mtext(scene, cx, ly, labels.texts[i], font, { size, align: 0.5, box: { owner: this, w: this.w, h: TAB_H } }));
      // touch area: the slot, or the medallion's whole diameter rising above the bar (2 UI px short of its top, to keep clear of the frame's content)
      const hit = scene.add.container(slot.hitX, war ? -MEDALLION_RISE + 2 : 0);
      const hh = war ? TAB_H + MEDALLION_RISE - 2 : TAB_H;
      // pressed: the tab dims while held (tabs are never disabled: every mode hub opens, and says itself what is locked)
      makePressable(hit, { w: slot.hitW, h: hh, onTap: () => scene.time.delayedCall(0, () => this.o.onSelect(tab.id)), tip: t(tab.key), down: () => c.setAlpha(0.7), up: () => c.setAlpha(1) });
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
