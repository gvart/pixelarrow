/**
 * The page shells of the v4 UI (V4_SPEC "Navigation"). One sub-screen shell,
 * `addSubShell`: the framed page with a top bar (back arrow, title plaque,
 * gear), no tab bar, and a scroll area for the content when asked (`scroll:
 * false` leaves the content box to the screen). `map: true` is the variant for
 * a full-screen map (World, Camp): no frame, just the top bar on its own stone
 * strip over the map. A mode hub uses `addHubShell` (hub.ts), which is built
 * from the same `buildPage` (frame, top bar with the gear, scroll area).
 */
import Phaser from 'phaser';
import { ScrollArea, type UIMetrics } from '../kit';
import { openSettings } from '../settings';
import { showInGameBack } from '../../platform/nav';
import { t } from '../../i18n';
import { MOSAIC } from '../tokens';
import { mosaicImage } from './base';
import { ScreenFrame, TOPBAR_H, type Box } from './ScreenFrame';
import { TopBar, type TopAction } from './TopBar';

export type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface SubShell {
  /** The stone frame (absent in a `map` shell). */
  frame: ScreenFrame | null;
  top: TopBar;
  /** The area to fill, UI px: inside the frame, or the screen below the bar of a map shell. */
  content: Box;
  /** The scroll area (unless `scroll: false` or `map`). */
  area?: ScrollArea;
  /** Content width inside the scroll area, UI px. */
  w: number;
  /** Bottom of the content area (above the frame's lower band), UI px. */
  bottom: number;
  /** Replace the title on the plaque (a screen that pages through heroes). */
  retitle: (title: string, back?: () => void) => void;
}

export interface SubShellOpts {
  title: string;
  /** Back one level (the arrow is drawn outside Telegram only: its header has one). */
  back?: () => void;
  /** Actions at the right of the bar (default: the gear opening Settings). */
  actions?: TopAction[];
  /** No scroll area: the screen lays out `content` itself. */
  scroll?: boolean;
  /** A full-screen map window: no frame, the bar on its own strip. */
  map?: boolean;
  /** UI px kept free at the bottom of the content for a fixed action. */
  reserve?: number;
  /** The container the parts go into (default the scene's UI root). */
  parent?: Phaser.GameObjects.Container;
  id?: string;
}

/** The gear that opens Settings. */
export const gearAction = (scene: UiScene): TopAction => ({ icon: 'gear', label: t('menu.settings'), onClick: () => openSettings(scene) });

export interface PageOpts {
  title: string;
  id: string;
  /** Height of the tab bar under the frame (a hub). */
  tabBar?: number;
  back?: () => void;
  actions?: TopAction[];
  scroll?: boolean;
  reserve?: number;
  parent?: Phaser.GameObjects.Container;
}

/** The framed page: frame, top bar (gear by default) and scroll area. Shared by the hub and the sub-screen shell. */
export function buildPage(scene: UiScene, o: PageOpts): Pick<SubShell, 'top' | 'content' | 'w' | 'bottom' | 'area'> & { frame: ScreenFrame } {
  const { VW, VH, S } = scene.m;
  const parent = o.parent ?? scene.ui;
  const frame = new ScreenFrame(scene, VW, VH, o.tabBar ? { tabBar: o.tabBar } : {});
  parent.add(frame);
  const top = new TopBar(scene, frame.topBar, { title: o.title, id: o.id, back: o.back && showInGameBack() ? o.back : undefined, actions: o.actions ?? [gearAction(scene)] });
  parent.add(top);
  const c = frame.content;
  const area = o.scroll === false ? undefined : new ScrollArea(scene, parent, c.x + 4, c.y + 3, c.w - 8, c.h - 3 - (o.reserve ?? 0), S);
  // above the scrolled content: a row scrolled under the bar must not take the gear's taps
  parent.bringToTop(top);
  return { frame, top, content: c, area, w: c.w - 8 - 2, bottom: c.y + c.h };
}

/** A framed shell (the usual one): the frame is always there. */
export type FramedSubShell = SubShell & { frame: ScreenFrame };

export function addSubShell(scene: UiScene, o: SubShellOpts & { map: true }): SubShell;
export function addSubShell(scene: UiScene, o: SubShellOpts & { scroll: false }): FramedSubShell;
export function addSubShell(scene: UiScene, o: SubShellOpts): FramedSubShell & { area: ScrollArea };
export function addSubShell(scene: UiScene, o: SubShellOpts): SubShell {
  const id = o.id ?? 'sub.topbar';
  if (o.map) {
    const { VW, VH } = scene.m;
    const parent = o.parent ?? scene.ui;
    const bar = (title: string, back?: () => void): TopBar => {
      const g = new TopBar(scene, { x: 0, y: 0, w: VW, h: TOPBAR_H }, { title, id, back: back && showInGameBack() ? back : undefined, actions: o.actions });
      return g;
    };
    parent.add(mosaicImage(scene, 0, 0, VW, TOPBAR_H, 'topBar'));
    const line = scene.add.graphics();
    line.fillStyle(MOSAIC.meander, 0.9);
    line.fillRect(0, TOPBAR_H - 1, VW, 1);
    parent.add(line);
    const shell: SubShell = { frame: null, top: bar(o.title, o.back), content: { x: 0, y: TOPBAR_H, w: VW, h: VH - TOPBAR_H }, w: VW, bottom: VH, retitle: () => undefined };
    parent.add(shell.top);
    shell.retitle = (title, back = o.back) => {
      shell.top.destroy();
      shell.top = bar(title, back);
      parent.add(shell.top);
    };
    return shell;
  }
  const parent = o.parent ?? scene.ui;
  const page = buildPage(scene, { title: o.title, id, back: o.back, actions: o.actions, scroll: o.scroll, reserve: o.reserve, parent });
  const shell: SubShell = { ...page, retitle: () => undefined };
  shell.retitle = (title, back = o.back) => {
    shell.top.destroy();
    shell.top = new TopBar(scene, page.frame.topBar, { title, id, back: back && showInGameBack() ? back : undefined, actions: o.actions ?? [gearAction(scene)] });
    parent.add(shell.top);
  };
  return shell;
}
