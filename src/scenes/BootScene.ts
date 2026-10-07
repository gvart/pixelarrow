import Phaser from 'phaser';
import { registerUiAssets, addText, uiMetrics } from '../ui/kit';
import { registerMisc } from '../ui/sprites';
import { initTelegram, startParam } from '../platform/telegram';
import { inviteCodeFrom } from '../online/rules';
import { setPendingInvite } from '../online/client';
import { state } from '../state';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    registerUiAssets(this);
    registerMisc(this);
    const m = uiMetrics(this);
    const t = addText(this, m.VW / 2, m.VH / 2 - 4, 'Mustering the hoplites...', 'light', 0.5).setScale(m.S);
    t.setPosition((m.VW / 2) * m.S, (m.VH / 2) * m.S);
    void (async () => {
      await initTelegram();
      await state.load();
      // Opened through a clan invite link (startapp=clan_<code>): straight to the online mode.
      const invite = inviteCodeFrom(startParam());
      if (invite) setPendingInvite(invite);
      this.scene.start(invite ? 'Online' : 'Menu', {});
    })();
  }
}
