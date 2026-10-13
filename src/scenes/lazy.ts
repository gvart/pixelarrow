import type Phaser from 'phaser';

let loading: Promise<void> | null = null;

/**
 * Load the second scene chunk (./lazyScenes.ts) and add its scenes to the game, once. main.ts
 * calls it with the game, so the chunk downloads while Boot draws its textures; BootScene
 * awaits it before routing to the first screen. A failed load rejects (Boot shows Retry).
 */
export function loadLazyScenes(game: Phaser.Game): Promise<void> {
  loading ??= import('./lazyScenes').then(({ LAZY_SCENES }) => {
    for (const S of LAZY_SCENES) {
      const scene = new S();
      game.scene.add(scene.sys.settings.key, scene, false);
    }
  });
  return loading;
}
