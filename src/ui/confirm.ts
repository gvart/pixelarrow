/** A small yes/no modal; Back (Telegram or in-game) answers "cancel". Kept for older call sites: use confirmDialog (widgets.ts). */
import Phaser from 'phaser';
import type { UIMetrics } from './kit';
import { confirmDialog } from './widgets';

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

export interface ConfirmOpts {
  title: string;
  lines?: string[];
  ok: string;
  okIcon?: string;
  cancel?: string;
  /** The OK action destroys something (dark red button). */
  destructive?: boolean;
  onOk: () => void;
  onCancel?: () => void;
}

export function confirmModal(scene: UiScene, o: ConfirmOpts): Phaser.GameObjects.Container {
  return confirmDialog(scene, { title: o.title, lines: o.lines, ok: o.ok, okIcon: o.okIcon, cancel: o.cancel, destructive: o.destructive, onOk: o.onOk, onCancel: o.onCancel });
}
