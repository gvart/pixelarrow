import Phaser from 'phaser';
import '@fontsource/inter/500.css';
import '@fontsource/cormorant-sc/700.css';
import '@fontsource/cinzel/700.css';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ArmyScene } from './scenes/ArmyScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultsScene } from './scenes/ResultsScene';
import { WorldScene } from './scenes/WorldScene';
import { SettlementScene } from './scenes/SettlementScene';
import { HeroScene } from './scenes/HeroScene';
import { OnlineScene } from './scenes/online/OnlineScene';
import { OnlineArmyScene } from './scenes/online/OnlineArmyScene';
import { ClanScene } from './scenes/online/ClanScene';
import { state } from './state';
import { online } from './platform/cloud';
import { trackSafeArea } from './platform/safeArea';
import { nav } from './platform/nav';
import { installAudio } from './audio';
import { KitScene } from './scenes/KitScene';
import { ShopScene } from './scenes/ShopScene';
import { MarketScene } from './scenes/MarketScene';
import { MerchantScene } from './scenes/online/MerchantScene';
import { BeastTrialScene } from './scenes/BeastTrialScene';
import { FirstRunScene } from './scenes/FirstRunScene';
import { DuelScene } from './scenes/duel/DuelScene';
import { CampScene } from './scenes/CampScene';
import { CodexScene } from './scenes/CodexScene';
import { installWidgets } from './ui/widgets';
import { installDuelInvites } from './ui/duelInvites';
import { checkUi, collectUi } from './ui/layout';
import { scrollAllAreas } from './ui/kit';
import { refreshLang } from './ui/lang';
import { lang, setLang, type Lang } from './i18n';
import { installMonitoring } from './platform/monitoring';
import type { GameLike } from './platform/telemetry';
import { installRenderScale, RS } from './platform/renderScale';

installWidgets();
installRenderScale();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14100c',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth * RS,
    height: window.innerHeight * RS,
  },
  input: { activePointers: 3 },
  audio: { noAudio: true }, // all sound is our own Web Audio (src/audio)
  scene: [BootScene, MenuScene, WorldScene, SettlementScene, ArmyScene, HeroScene, BattleScene, ResultsScene, OnlineScene, OnlineArmyScene, ClanScene, KitScene, ShopScene, MarketScene, MerchantScene, BeastTrialScene, FirstRunScene, DuelScene, CampScene, CodexScene],
});

// Crash reports and product analytics (docs/OPS.md); analytics honours the Settings toggle.
installMonitoring(game as unknown as GameLike, { analyticsEnabled: () => state.campaign?.data.settings.analytics !== false, lang: () => lang() });

// Telegram full screen: keep the canvas inside the safe area (status bar,
// notch, Telegram's floating buttons, home indicator) and re-layout on change.
// Measure #game first, then always refresh: refresh() alone sizes the canvas
// from the previously measured parent, and Phaser's own polling may already
// have recorded the new parent size without resizing (insets reported at
// start-up, e.g. when Telegram opens straight in full screen). BaseScene
// ignores refreshes that do not change the game size.
trackSafeArea(() => {
  game.scale.getParentBounds();
  game.scale.refresh();
});
installAudio(game, () => state.campaign?.data.settings);
// Duel challenges pop up on every online screen (map, army, clan).
installDuelInvites(game);
// Ask before closing while a save is still uploading.
online.onStatus((s) => nav.setUnsaved(s === 'syncing'));

// Cloud sync: a newer save from another device replaces the campaign only
// outside battle, then the game returns to the menu.
online.canAdopt = () =>
  !state.pending && !game.scene.isActive('Battle') && !game.scene.isActive('Results') && !game.scene.isActive('Boot') && !['Online', 'OnlineArmy', 'OnlineClan'].some((k) => game.scene.isActive(k));
online.onAdopt = async (data) => {
  await state.adoptRemote(data);
  refreshLang();
  // The duel screens show the server's duel army, not the campaign: they stay (a match just
  // played must not end on the menu).
  const hero = game.scene.getScene('Hero') as HeroScene;
  if (game.scene.isActive('Duel') || (game.scene.isActive('Hero') && !hero.campaignArmy)) return;
  // canAdopt was asked before the download: a duel or online battle begun since then (not fought with the
  // campaign's army) or its report must not be cut short by the menu
  const sourced = (key: string) => game.scene.isActive(key) && !!(game.scene.getScene(key).sys.settings.data as { source?: unknown; done?: unknown } | undefined)?.[key === 'Battle' ? 'source' : 'done'];
  if (sourced('Battle') || sourced('Results')) return;
  game.scene.getScenes(true).forEach((s) => s.scene.start('Menu'));
};
// Upload right away when the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void online.flush();
});

// Debug handles (used by the screenshot script).
Object.assign(window, { __game: game, __state: state, __online: online, __nav: nav });
// Layout check (scripts/layout-check.mjs): UI element bounds and rule violations of the current screen.
Object.assign(window, {
  __layout: {
    collect: () => collectUi(game),
    check: () => checkUi(game),
    scrollAll: (v: number) => scrollAllAreas(v),
    lang: () => lang(),
    setLang: (l: Lang) => setLang(l),
  },
});
