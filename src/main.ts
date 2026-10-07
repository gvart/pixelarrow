import Phaser from 'phaser';
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

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2b1d1a',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 3 },
  scene: [BootScene, MenuScene, WorldScene, SettlementScene, ArmyScene, HeroScene, BattleScene, ResultsScene, OnlineScene, OnlineArmyScene, ClanScene],
});

// Telegram full screen: keep the canvas inside the safe area (status bar,
// notch, Telegram's floating buttons, home indicator) and re-layout on change.
// Measure #game first: refresh() alone sizes the canvas from the previously
// measured parent (and then records the new size, so Phaser's own polling
// never catches up). A move without a resize still needs fresh input bounds.
trackSafeArea(() => {
  if (game.scale.getParentBounds()) game.scale.refresh();
  else game.scale.updateBounds();
});
// Ask before closing while a save is still uploading.
online.onStatus((s) => nav.setUnsaved(s === 'syncing'));

// Cloud sync: a newer save from another device replaces the campaign only
// outside battle, then the game returns to the menu.
online.canAdopt = () =>
  !state.pending && !game.scene.isActive('Battle') && !game.scene.isActive('Results') && !game.scene.isActive('Boot') && !['Online', 'OnlineArmy', 'OnlineClan'].some((k) => game.scene.isActive(k));
online.onAdopt = async (data) => {
  await state.adoptRemote(data);
  game.scene.getScenes(true).forEach((s) => s.scene.start('Menu'));
};
// Upload right away when the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void online.flush();
});

// Debug handles (used by the screenshot script).
Object.assign(window, { __game: game, __state: state, __online: online, __nav: nav });
