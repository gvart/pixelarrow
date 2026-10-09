/**
 * The shell of a v4 sub-screen (V4_SPEC "Navigation"): the framed page with a
 * top bar that carries the screen's name and a back arrow, no tab bar, and a
 * scroll area for the content (see addHubShell for a mode hub).
 */
import Phaser from 'phaser';
import { ScrollArea, type UIMetrics } from '../kit';
import { openSettings } from '../settings';
import { showInGameBack } from '../../platform/nav';
import { t } from '../../i18n';
import { ScreenFrame } from './ScreenFrame';
import { TopBar, type TopAction } from './TopBar';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface SubShell {
  frame: ScreenFrame;
  top: TopBar;
  area: ScrollArea;
  /** Content width inside the scroll area, UI px. */
  w: number;
  /** Bottom of the content area (above the frame's lower band), UI px. */
  bottom: number;
}

export interface SubShellOpts {
  title: string;
  /** Back one level (the arrow is drawn outside Telegram only: its header has one). */
  back?: () => void;
  /** Extra actions at the right of the bar (default: the gear opening Settings). */
  actions?: TopAction[];
  /** UI px kept free at the bottom of the content for a fixed action. */
  reserve?: number;
  /** The container the parts go into (default the scene's UI root). */
  parent?: Phaser.GameObjects.Container;
  id?: string;
}

/** A sub-screen: back arrow, title plaque, gear; the content scrolls in `area`. */
export function addSubShell(scene: UiScene, o: SubShellOpts): SubShell {
  const { VW, VH, S } = scene.m;
  const parent = o.parent ?? scene.ui;
  const frame = new ScreenFrame(scene, VW, VH, {});
  parent.add(frame);
  const actions = o.actions ?? [{ icon: 'gear', label: t('menu.settings'), onClick: () => openSettings(scene) }];
  const top = new TopBar(scene, frame.topBar, { title: o.title, id: o.id ?? 'sub.topbar', back: o.back && showInGameBack() ? o.back : undefined, actions });
  parent.add(top);
  const c = frame.content;
  const area = new ScrollArea(scene, parent, c.x + 4, c.y + 3, c.w - 8, c.h - 3 - (o.reserve ?? 0), S);
  parent.bringToTop(top);
  return { frame, top, area, w: c.w - 8 - 2, bottom: c.y + c.h };
}
