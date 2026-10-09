/**
 * TopBar: the dark stone strip of a v4 screen: a teal plaque with the title
 * ("PIXELARROW" on a hub, the screen's name on a sub-screen), a back arrow at
 * the left on sub-screens and round actions (the gear, ...) at the right, each
 * with an optional red badge. Place it at `ScreenFrame.topBar`.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon } from '../kit';
import { uiId } from '../layout';
import { t } from '../../i18n';
import { MBadge, GAP, TAP, makePressable, mosaicImage, mtext, mw, midY } from './base';
import { TOPBAR_H, type Box } from './ScreenFrame';

export interface TopAction {
  icon: string;
  /** Accessible name: the long-press text and the id for scripts. */
  label: string;
  onClick: () => void;
  badge?: number | string;
}

export interface TopBarOpts {
  title: string;
  /** Draw a back arrow (not inside Telegram, whose header has one: pass `showInGameBack()`). */
  back?: () => void;
  /** Actions from the right edge inwards. */
  actions?: TopAction[];
  id?: string;
}

const PLAQUE_H = 16;
const TITLE_SIZE = 8;

export class TopBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly buttons: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene, box: Box, o: TopBarOpts) {
    super(scene, box.x, box.y);
    this.w = box.w;
    this.h = box.h || TOPBAR_H;
    const actions = o.actions ?? [];
    const left = o.back ? TAP + 2 : 0;
    const right = actions.length ? actions.length * (TAP + GAP) - GAP + 2 : 0;
    // the plaque stays centred: room is what is left of the wider side
    const side = Math.max(left, right);
    const title = o.title.toUpperCase();
    const pw = Math.round(Math.min(this.w - side * 2 - 4, Math.max(60, mw(title, 'rCream', TITLE_SIZE) + 20)));
    const px = Math.round((this.w - pw) / 2);
    const py = Math.round((this.h - PLAQUE_H) / 2) - 1;
    this.add(mosaicImage(scene, px, py, pw, PLAQUE_H, 'plaque'));
    const t0 = mtext(scene, this.w / 2, py + midY(PLAQUE_H - 1, TITLE_SIZE), title, 'rCream', { size: TITLE_SIZE, align: 0.5, maxW: pw - 8, box: { owner: this, w: this.w, h: this.h } });
    this.add(t0);
    if (o.back) this.addButton(2, 'chevL', t('v3.back'), o.back, undefined, `${o.id ?? 'topbar'}.back`);
    let x = this.w - 2 - TAP;
    for (const a of actions) {
      this.addButton(x, a.icon, a.label, a.onClick, a.badge, `${o.id ?? 'topbar'}.${a.icon}`);
      x -= TAP + GAP;
    }
    uiId(this, o.id ?? 'topbar');
    scene.add.existing(this);
  }

  private addButton(x: number, icon: string, label: string, onClick: () => void, badge: number | string | undefined, id: string): void {
    const scene = this.scene;
    const b = scene.add.container(x, Math.round((this.h - TAP) / 2));
    const face = scene.add.container(TAP / 2, TAP / 2);
    const img = scaleIcon(addIcon(scene, 0, 0, icon), 1.5);
    img.setPosition(-img.displayWidth / 2, -img.displayHeight / 2);
    face.add(img);
    b.add(face);
    makePressable(b, { face, w: TAP, h: TAP, onTap: onClick, tip: label });
    uiId(b, id);
    Object.assign(b, { opts: { label, icon } });
    if (badge !== undefined && badge !== 0) b.add(new MBadge(scene, TAP - 3, 4, badge));
    this.add(b);
    this.buttons.push(b);
  }
}

