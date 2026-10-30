/**
 * Phaser 4.2's typings narrowed Graphics.fillPoints / strokePoints to Vector2[]; the code reads only `.x` and `.y`
 * (src/gameobjects/graphics/Graphics.js), as 3.x's typings allowed. Plain points are what the view passes.
 */
declare namespace Phaser.GameObjects {
  interface Graphics {
    fillPoints(points: readonly Phaser.Types.Math.Vector2Like[], closeShape?: boolean, closePath?: boolean, endIndex?: number): this;
    strokePoints(points: readonly Phaser.Types.Math.Vector2Like[], closeShape?: boolean, closePath?: boolean, endIndex?: number): this;
  }
}
