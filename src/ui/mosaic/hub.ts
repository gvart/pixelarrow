/**
 * The shell shared by the v4 mode hubs (Campaign hub, Codex, later Duels, War,
 * Shop): the framed page, the top bar with the gear, a scroll area for the
 * content and the tab bar with its navigation (V4_SPEC "Navigation").
 */
import Phaser from 'phaser';
import { ScrollArea, type UIMetrics } from '../kit';
import { openSettings } from '../settings';
import { t } from '../../i18n';
import { ScreenFrame } from './ScreenFrame';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { TAB_H, type TabId } from './tabLayout';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

/** Open the hub of a mode. Duels, War and Shop are the existing scenes until they are migrated. */
export function goTab(scene: Phaser.Scene, id: TabId): void {
  switch (id) {
    case 'campaign': return void scene.scene.start('Menu');
    case 'duels': return void scene.scene.start('Duel', {});
    case 'war': return void scene.scene.start('Online', {});
    case 'codex': return void scene.scene.start('Codex');
    case 'shop': return void scene.scene.start('Shop', {});
  }
}

export interface HubShell {
  frame: ScreenFrame;
  tabs: TabBar;
  area: ScrollArea;
  /** Content width inside the scroll area, UI px. */
  w: number;
}

/** The framed page of a mode hub: `title` on the plaque, the gear opening Settings, `active` lit in the tab bar. */
export function addHubShell(scene: UiScene, o: { title: string; active: TabId }): HubShell {
  const { VW, VH, S } = scene.m;
  const frame = new ScreenFrame(scene, VW, VH, { tabBar: TAB_H });
  scene.ui.add(frame);
  scene.ui.add(new TopBar(scene, frame.topBar, { title: o.title, id: 'hub.topbar', actions: [{ icon: 'gear', label: t('menu.settings'), onClick: () => openSettings(scene) }] }));
  const c = frame.content;
  const area = new ScrollArea(scene, scene.ui, c.x + 4, c.y + 3, c.w - 8, c.h - 3, S);
  const tabs = new TabBar(scene, VW, VH, { active: o.active, onSelect: (id) => id !== o.active && goTab(scene, id) });
  scene.ui.add(tabs);
  return { frame, tabs, area, w: c.w - 8 - 2 };
}
