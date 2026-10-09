/**
 * The duel hub's icons (trophy, chest, lock, pen, copy, bin) are kit icons now
 * (src/art/uiIcons.ts, registered by registerUiAssets). Kept so older callers
 * still compile: nothing left to register.
 */
import type Phaser from 'phaser';

export function ensureDuelIcons(_scene: Phaser.Scene): void {}
