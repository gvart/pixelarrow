/** The settings modal: opened from the menu and from Telegram's ⋯ → Settings on any screen. */
import Phaser from 'phaser';
import { Button, addScroll, addText, type UIMetrics } from './kit';
import { state } from '../state';
import { haptic, setHaptics } from '../platform/telegram';
import { navLayer } from '../platform/nav';
import type { Settings } from '../game/save';

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

const open = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** Open (or bring back) the settings modal on top of the scene's UI. `onClose` runs when it closes. */
export function openSettings(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  open.get(scene)?.destroy();
  const s = state.campaign.data.settings;
  const rows: [keyof Settings, string][] = [
    ['pauseContact', 'Pause on first contact'],
    ['pauseFlank', 'Pause when flanked'],
    ['pauseRout', 'Pause when a group routs'],
    ['pauseDeath', 'Pause on hero death'],
    ['haptics', 'Haptic feedback'],
    ['dmgNumbers', 'Damage numbers'],
  ];
  const { VW, VH } = scene.m;
  const h = 30 + rows.length * 26 + 36;
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  c.add(scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive());
  const w = Math.min(VW - 16, 180);
  const x = Math.round((VW - w) / 2);
  const y = Math.round((VH - h) / 2);
  addScroll(scene, c, x, y, w, h);
  c.add(addText(scene, VW / 2, y + 12, 'Settings', 'red', 0.5));
  rows.forEach(([k, label], i) => {
    const by = y + 28 + i * 26;
    c.add(addText(scene, x + 10, by + 7, label, 'ink', 0, w - 60));
    const b = new Button(scene, x + w - 44, by, 34, 22, { label: s[k] ? 'On' : 'Off', style: s[k] ? 'buttonSel' : 'button' });
    b.on('pointerup', () => {
      s[k] = !s[k];
      b.setLabel(s[k] ? 'On' : 'Off');
      b.setSelected(s[k]);
      if (k === 'haptics') setHaptics(s.haptics);
      haptic('light');
      void state.save();
    });
    c.add(b);
  });
  const close = () => c.destroy();
  c.add(new Button(scene, x + w / 2 - 35, y + 30 + rows.length * 26, 70, 22, { label: 'Close', icon: 'check', onClick: close }));
  open.set(scene, c);
  c.once('destroy', () => {
    if (open.get(scene) === c) open.delete(scene);
    onClose?.();
  });
  navLayer(c, close, scene);
  return c;
}
