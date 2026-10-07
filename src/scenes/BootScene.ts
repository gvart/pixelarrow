import Phaser from 'phaser';
import { registerUiAssets, addText, uiMetrics } from '../ui/kit';
import { registerMisc } from '../ui/sprites';
import { initTelegram, startParam } from '../platform/telegram';
import { inviteCodeFrom } from '../online/rules';
import { setPendingInvite } from '../online/client';
import { state } from '../state';
import { refreshLang } from '../ui/lang';
import { hintStore } from '../ui/widgets';
import { canResume, progressOf } from '../game/tutorial';

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
      refreshLang();
      hintStore.seen = () => state.campaign.data.settings.seenHints ?? [];
      hintStore.mark = (id) => {
        const st = state.campaign.data.settings;
        st.seenHints = [...(st.seenHints ?? []), id];
        void state.save();
      };
      // Opened through a clan invite link (startapp=clan_<code>): straight to the online mode.
      const invite = inviteCodeFrom(startParam());
      if (invite) setPendingInvite(invite);
      // Debug: ?scene=Kit opens the UI kit gallery.
      const debugScene = new URLSearchParams(location.search).get('scene') === 'Kit' ? 'Kit' : null;
      // First launch: the tutorial is offered; an interrupted one can be resumed (src/scenes/FirstRunScene.ts).
      // Test scripts that drive the menu set window.__noFirstRun.
      const tut = progressOf(state.campaign.data.settings);
      const first = !invite && !debugScene && !(window as { __noFirstRun?: boolean }).__noFirstRun ? (tut.status === 'offer' ? 'offer' : canResume(tut) ? 'resume' : null) : null;
      if (first) this.scene.start('FirstRun', { mode: first });
      else this.scene.start(invite ? 'Online' : debugScene ?? 'Menu', {});
    })();
  }
}
