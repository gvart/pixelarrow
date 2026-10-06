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

// Debug handles (used by the screenshot script).
Object.assign(window, { __game: game, __state: state });
