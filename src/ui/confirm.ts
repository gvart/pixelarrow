/** A small yes/no modal; Back (Telegram or in-game) answers "cancel". */
import Phaser from 'phaser';
import { Button, addPanel, addText, type UIMetrics } from './kit';
import { navLayer } from '../platform/nav';

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
  onOk: () => void;
  onCancel?: () => void;
}

export function confirmModal(scene: UiScene, o: ConfirmOpts): Phaser.GameObjects.Container {
  const { VW, VH } = scene.m;
  const lines = o.lines ?? [];
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  c.add(scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive());
  const w = Math.min(VW - 24, 200);
  const h = 56 + lines.length * 10;
  const x = Math.round((VW - w) / 2);
  const y = Math.round(VH / 2 - h / 2 - 20);
  c.add(addPanel(scene, x, y, w, h, 'parch'));
  c.add(addText(scene, VW / 2, y + 8, o.title, 'red', 0.5));
  lines.forEach((t, i) => c.add(addText(scene, VW / 2, y + 22 + i * 10, t, 'ink', 0.5, w - 10)));
  const bw = Math.floor((w - 18) / 2);
  const cancel = () => {
    c.destroy();
    o.onCancel?.();
  };
  c.add(new Button(scene, x + 6, y + h - 30, bw, 24, { label: o.cancel ?? 'Stay', onClick: cancel }));
  c.add(
    new Button(scene, x + 12 + bw, y + h - 30, bw, 24, {
      label: o.ok,
      icon: o.okIcon,
      style: 'buttonSel',
      onClick: () => {
        c.destroy();
        o.onOk();
      },
    }),
  );
  navLayer(c, cancel, scene);
  return c;
}
