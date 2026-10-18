/**
 * The shell shared by the v4 mode hubs (Campaign hub, Duels, War, Codex, Shop):
 * the framed page, the top bar with the gear, a scroll area for the content
 * and the tab bar with its navigation (V4_SPEC "Navigation"). Sub-screens use
 * `addSubShell` (subShell.ts): the same page without the tab bar.
 */
import Phaser from 'phaser';
import type { ScrollArea } from '../kit';
import { ScreenFrame, type Box } from './ScreenFrame';
import { NavRail, TabBar, type ModeNav } from './TabBar';
import { TAB_H, type TabId } from './tabLayout';
import { buildPage, type UiScene } from './subShell';

/** Open the hub of a mode. */
export function goTab(scene: Phaser.Scene, id: TabId): void {
  switch (id) {
    case 'campaign': return void scene.scene.start('Menu', {});
    case 'duels': return void scene.scene.start('Duel', {});
    case 'war': return void scene.scene.start('Online', {});
    case 'codex': return void scene.scene.start('Codex', {});
    case 'shop': return void scene.scene.start('Shop', {});
  }
}

export interface HubShell {
  frame: ScreenFrame;
  /** The tab bar (portrait) or the nav rail (landscape, design/ux/landscape-v6.md §3.1). */
  tabs: ModeNav;
  area: ScrollArea;
  /** The parchment area inside the frame, UI px. */
  content: Box;
  /** Content width inside the scroll area, UI px. */
  w: number;
}

/**
 * The framed page of a mode hub: `title` on the plaque, the gear opening Settings, `active` lit in the tab bar.
 * `reserve`: UI px kept free at the bottom of the content for a fixed action; `parent`: the container the
 * parts go into (default the scene's UI root).
 */
export function addHubShell(scene: UiScene, o: { title: string; active: TabId; reserve?: number; parent?: Phaser.GameObjects.Container }): HubShell {
  const { VW, VH, land, cls, navW } = scene.m;
  const parent = o.parent ?? scene.ui;
  const onSelect = (id: TabId) => id !== o.active && goTab(scene, id);
  // landscape (§3.1): the five modes in a rail down the left edge, the page beside it at full height
  if (land) {
    const page = buildPage(scene, { title: o.title, id: 'hub.topbar', reserve: o.reserve, parent, x: navW });
    const rail = new NavRail(scene, VH, cls === 'compact', { active: o.active, onSelect });
    parent.add(rail);
    return { frame: page.frame, tabs: rail, area: page.area!, content: page.content, w: page.w };
  }
  const page = buildPage(scene, { title: o.title, id: 'hub.topbar', tabBar: TAB_H, reserve: o.reserve, parent });
  const tabs = new TabBar(scene, VW, VH, { active: o.active, onSelect });
  parent.add(tabs);
  return { frame: page.frame, tabs, area: page.area!, content: page.content, w: page.w };
}
