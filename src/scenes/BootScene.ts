import Phaser from 'phaser';
import { registerUiAssets, addText, uiMetrics } from '../ui/kit';
import { registerMisc } from '../ui/sprites';
import { loadUiFonts } from '../art/vectorFont';
import { ICON_ATLASES, registerIconFrames } from '../art/iconBitmaps';
import { platform } from '../platform';
import { launchRoute, sceneForRoute } from '../online/deeplink';
import { setPendingInvite } from '../online/client';
import { state } from '../state';
import { refreshLang } from '../ui/lang';
import { hintStore } from '../ui/widgets';
import { ongoingMatch } from '../duel/match';
import { online } from '../platform/cloud';
import { preloadRasters } from '../ui/mosaic/raster';
import { MButton } from '../ui/mosaic';
import { t } from '../i18n';
import { firstRunEntry } from './bootRoute';
import { loadLazyScenes } from './lazy';

export class BootScene extends Phaser.Scene {
  /** The loading line (replaced by the error and Retry on a failure). */
  private status: Phaser.GameObjects.BitmapText | null = null;
  private failed = false;

  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadRasters(this);
    // the drawn icons (src/art/iconBitmaps.ts): the WebP, else the PNG (pngFallback); a failed
    // load of both leaves the vector icons in place
    for (const a of ICON_ATLASES) this.load.atlas(a.key, a.webp, a.json);
  }

  create(): void {
    // canvas text does not wait for web fonts: the atlases need the bundled faces loaded first
    void Promise.all([loadUiFonts(), this.pngFallback()]).finally(() => this.start());
  }

  /** Icon atlases whose WebP did not load or decode (a browser without WebP): load their PNG. */
  private pngFallback(): Promise<void> {
    const missing = ICON_ATLASES.filter((a) => !this.textures.exists(a.key));
    if (!missing.length) return Promise.resolve();
    return new Promise((done) => {
      for (const a of missing) this.load.atlas(a.key, a.png, a.json);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => done());
      this.load.start();
    });
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
    try {
      this.registerIcons();
      registerUiAssets(this);
      registerMisc(this);
    } catch (e) {
      return this.fail(e);
    }
    // the language before the save is read (URL, Telegram, browser); the player's own setting is applied after the load
    refreshLang();
    const m = uiMetrics(this);
    this.status = addText(this, 0, 0, t('boot.loading'), 'light', 0.5).setScale(m.S);
    this.status.setPosition((m.VW / 2) * m.S, (m.VH / 2) * m.S);
    // a failure on the way in (storage, Telegram, the first screen) is never a dead end: Retry (C-1, N35)
    this.route().catch((e: unknown) => this.fail(e));
  }

  private async route(): Promise<void> {
    // Test scripts force the error screen with window.__bootFail (as they skip first run with __noFirstRun).
    if ((window as { __bootFail?: boolean }).__bootFail) throw new Error('boot: forced failure (test)');
    await platform.init();
    await state.load();
    // every scene key exists before the first screen (the second chunk: scenes/lazy.ts)
    await loadLazyScenes(this.game);
    refreshLang();
    hintStore.seen = () => state.campaign.data.settings.seenHints ?? [];
    hintStore.mark = (id) => {
      const st = state.campaign.data.settings;
      st.seenHints = [...(st.seenHints ?? []), id];
      void state.save();
    };
    // Opened through a deep link (src/online/deeplink.ts): a clan invite
    // (startapp=clan_<code>), a bot notification's button (loc_<id>, duel,
    // market, account, ...), a link request (link_<code>) or a web hash route
    // (#login, #account, ...) goes straight to its screen, before first run.
    const route = launchRoute(platform.launchParam(), location.hash);
    if (route?.kind === 'invite') setPendingInvite(route.code);
    const target = sceneForRoute(route);
    // Debug: ?scene=Kit opens the UI kit gallery.
    const debugScene = new URLSearchParams(location.search).get('scene') === 'Kit' ? 'Kit' : null;
    // First launch: the tutorial is offered; an interrupted one can be resumed (src/scenes/FirstRunScene.ts).
    // A save with no tutorial record (every player from before it) never sees first run (bootRoute.ts).
    // A deep link wins. Test scripts that drive the menu set window.__noFirstRun.
    const first = firstRunEntry(state.campaign.data.settings, !!target || !!debugScene || !!(window as { __noFirstRun?: boolean }).__noFirstRun);
    // Reloaded during a live duel (Telegram reopens a mini app the system closed): back into the match,
    // or its report, instead of the menu while the match is lost by abandonment.
    const live = !target && !debugScene && (online.signedIn || online.canSignIn()) ? ongoingMatch() : null;
    if (live) this.scene.start('Duel', { tab: 'ranked', arena: 'home', rejoin: { id: live.id, mode: live.mode } });
    // Closed during a campaign battle: it was fought out at load (V5-011), show its report.
    else if (state.last && !target && !debugScene) this.scene.start('Results', {});
    else if (first) this.scene.start('FirstRun', { mode: first });
    else if (target) this.scene.start(target.scene, target.data);
    else this.scene.start(debugScene ?? 'Menu', {});
  }

  /** The load failed: say so and offer Retry (a fresh load of the app) instead of a dead end (C-1, N35). */
  private fail(e: unknown): void {
    console.error('boot failed', e);
    if (this.failed || !this.sys.isActive()) return;
    this.failed = true;
    this.status?.destroy();
    this.status = null;
    const m = uiMetrics(this);
    const ui = this.add.container(0, 0).setScale(m.S);
    const cx = m.VW / 2;
    const y = Math.round(m.VH * 0.55);
    ui.add(addText(this, cx, y - 26, t('boot.error'), 'light', 0.5));
    ui.add(addText(this, cx, y - 14, t('boot.errorHint'), 'dim', 0.5, m.VW - 24));
    const retry = () => location.reload();
    const bw = Math.min(150, m.VW - 32);
    try {
      ui.add(new MButton(this, Math.round(cx - bw / 2), y + 4, bw, 26, { label: t('boot.retry'), variant: 'secondary', id: 'boot.retry', onClick: retry }));
    } catch {
      // the UI art itself did not register: the whole screen is the Retry button
      ui.add(addText(this, cx, y + 10, t('boot.retry'), 'gold', 0.5));
      this.input.once('pointerup', retry);
    }
  }
}
