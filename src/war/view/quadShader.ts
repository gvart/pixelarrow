/**
 * Our sprite shaders on Phaser 4's quad batcher: a BatchHandlerQuad whose tint step (Phaser's `Tint` shader addition) is
 * replaced by our own GLSL, batched like any sprite. The replacement's header comes after Phaser's own `applyTint`
 * (still defined, so a shader can fall back to it) and defines `vec4 <fn>(vec4 texel)` on the premultiplied texel.
 * The fragment shader sees `outTint` (the tint, 0xRRGGBB as .bgr, alpha in .a) and `outTintEffect` (the secondary tint
 * as .bgr, the tint mode 0-255 in .a).
 * An image takes a node with useQuad(img, node) and goes back to Phaser's own with useQuad(img, null).
 */
import Phaser from 'phaser';

type Quad = Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad;
type Addition = Phaser.Types.Renderer.WebGL.ShaderAdditionConfig;
export type QuadCtor = new (manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager, config?: Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerConfig) => Quad;

export interface QuadShader {
  /** GLSL defining `fn` (and any uniforms it reads). */
  header: string;
  /** The function the tint step calls: `fragColor = fn(fragColor)`. */
  fn: string;
  /** Extension directives, e.g. derivatives. */
  extensions?: string;
}

/** Phaser's default quad additions with the tint step swapped for `s`. */
function additions(s: QuadShader): Addition[] {
  const base = Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad.prototype.defaultConfig.shaderAdditions as Addition[];
  return base.map((a) => {
    if (a.name !== 'Tint') return a;
    const phaserTint = (a.additions as { fragmentHeader: string }).fragmentHeader;
    const add: Record<string, string> = { fragmentHeader: `${phaserTint}\n${s.header}`, fragmentProcess: `fragColor = ${s.fn}(fragColor);` };
    if (s.extensions) add.extensions = s.extensions;
    return { name: 'Tint', additions: add, tags: ['TINT'] };
  });
}

/** The node `name` on the scene's WebGL renderer, made on first use; null: no WebGL. */
export function addQuadShader<T extends Quad = Quad>(scene: Phaser.Scene, name: string, s: QuadShader, Ctor: QuadCtor = Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad): T | null {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  const m = r.renderNodes;
  const have = m.getNode(name) as T | null;
  if (have) return have;
  // its own shaderName: Phaser caches programs by shader name and addition names, and ours keeps the name `Tint`
  const node = new Ctor(m, { name, shaderName: name, shaderAdditions: additions(s) }) as T;
  m.addNode(name, node);
  return node;
}

/** Draw `img` through `node` (null: Phaser's own batcher); a no-op when it already does. */
export function useQuad(img: Phaser.GameObjects.Image, node: Quad | null): Phaser.GameObjects.Image {
  if (((img.customRenderNodes as { BatchHandler?: Quad } | null)?.BatchHandler ?? null) !== node) img.setRenderNodeRole('BatchHandler', node);
  return img;
}
