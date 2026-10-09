import Phaser from 'phaser';
import { registerUiAssets, addText, uiMetrics } from '../ui/kit';
import { registerMisc } from '../ui/sprites';
import { loadUiFonts } from '../art/vectorFont';
import { ICON_ATLASES, registerIconFrames } from '../art/iconBitmaps';
import { initTelegram, startParam } from '../platform/telegram';
import { parseStartParam, sceneForRoute } from '../online/deeplink';
import { setPendingInvite } from '../online/client';
import { state } from '../state';
import { refreshLang } from '../ui/lang';
import { hintStore } from '../ui/widgets';
import { canResume, progressOf } from '../game/tutorial';
import { ongoingMatch } from '../duel/match';
import { online } from '../platform/cloud';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // the drawn icons (src/art/iconBitmaps.ts); a failed load leaves the vector icons in place
    for (const a of ICON_ATLASES) this.load.atlas(a.key, a.png, a.json);
  }

  create(): void {
    // canvas text does not wait for web fonts: the atlases need the bundled faces loaded first
    void loadUiFonts().finally(() => this.start());
  }

  /** Hand the loaded icon atlases' frames to the icon painters. */
  private registerIcons(): void {
    for (const a of ICON_ATLASES) {
      if (!this.textures.exists(a.key)) continue;
      const tex = this.textures.get(a.key);
      const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const name of tex.getFrameNames()) {
        const f = tex.get(name);
        frames[name] = { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
      }
      registerIconFrames(tex.getSourceImage() as CanvasImageSource, frames);
    }
  }

  private start(): void {
    this.registerIcons();
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
      // Reloaded during a live duel (Telegram reopens a mini app the system closed): back into the match,
      // or its report, instead of the menu while the match is lost by abandonment.
      const live = !target && !debugScene && online.available ? ongoingMatch() : null;
      if (live) this.scene.start('Duel', { tab: 'ranked', arena: 'home', rejoin: { id: live.id, mode: live.mode } });
      else if (first) this.scene.start('FirstRun', { mode: first });
      else if (target) this.scene.start(target.scene, target.data);
      else this.scene.start(debugScene ?? 'Menu', {});
    })();
  }
}
