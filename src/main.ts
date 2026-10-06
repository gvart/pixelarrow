import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ArmyScene } from './scenes/ArmyScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultsScene } from './scenes/ResultsScene';
import { WorldScene } from './scenes/WorldScene';
import { SettlementScene } from './scenes/SettlementScene';
import { HeroScene } from './scenes/HeroScene';
import { state } from './state';
import { online } from './platform/cloud';

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
  scene: [BootScene, MenuScene, WorldScene, SettlementScene, ArmyScene, HeroScene, BattleScene, ResultsScene],
});

// Cloud sync: a newer save from another device replaces the campaign only
// outside battle, then the game returns to the menu.
online.canAdopt = () => !state.pending && !game.scene.isActive('Battle') && !game.scene.isActive('Results') && !game.scene.isActive('Boot');
online.onAdopt = async (data) => {
  await state.adoptRemote(data);
  game.scene.getScenes(true).forEach((s) => s.scene.start('Menu'));
};
// Upload right away when the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void online.flush();
});

// Debug handles (used by the screenshot script).
Object.assign(window, { __game: game, __state: state, __online: online });
