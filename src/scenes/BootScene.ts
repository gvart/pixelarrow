import Phaser from 'phaser';
import { registerUiAssets, addText, uiMetrics } from '../ui/kit';
import { registerMisc } from '../ui/sprites';
import { initTelegram, startParam } from '../platform/telegram';
import { parseStartParam, sceneForRoute } from '../online/deeplink';
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
      // Opened through a deep link (src/online/deeplink.ts): a clan invite
      // (startapp=clan_<code>) or a bot notification's button (hex_<q>_<r>,
      // duel, market, ...) goes straight to its screen.
      const route = parseStartParam(startParam());
      if (route?.kind === 'invite') setPendingInvite(route.code);
      const target = sceneForRoute(route);
      // Debug: ?scene=Kit opens the UI kit gallery.
      const debugScene = new URLSearchParams(location.search).get('scene') === 'Kit' ? 'Kit' : null;
      // First launch: the tutorial is offered; an interrupted one can be resumed (src/scenes/FirstRunScene.ts).
      // A deep link wins. Test scripts that drive the menu set window.__noFirstRun.
      const tut = progressOf(state.campaign.data.settings);
      const first = !target && !debugScene && !(window as { __noFirstRun?: boolean }).__noFirstRun ? (tut.status === 'offer' ? 'offer' : canResume(tut) ? 'resume' : null) : null;
      if (first) this.scene.start('FirstRun', { mode: first });
      else if (target) this.scene.start(target.scene, target.data);
      else this.scene.start(debugScene ?? 'Menu', {});
    })();
  }
}
