/**
 * The per-man look on the GPU (./look.ts): Phaser's sprite batcher with its tint step replaced (./quadShader.ts): the
 * shader finds a pixel's colour in its class's block of the palette texture (one hashed slot, checked against the exact
 * colour) and draws the man's colour from it; any other saturated red takes his team's dye (./look.ts DYE_GLSL) as
 * ./units.ts does. One pass, batched like any sprite: a look sprite has tint mode LOOK_MODE, its block (lookCode's `fx`)
 * rides in the secondary tint and its look in the tint; the team multiply (TEAM_TINT) is applied here. Other tint
 * modes draw as Phaser's own.
 * The palette rides in each batch entry as texture 1 (as Phaser's normal maps do), so the texture units stay Phaser's.
 */
import Phaser from 'phaser';
import { addQuadShader } from './quadShader';
import { DYE_GLSL, PAL_ROWS, PAL_VARIANTS, RED_W_GLSL, buildPalette, type LookPalette } from './look';
import type { SheetManifest } from '../../art/sheetManifest';

export const LOOK = 'WarLook';
/** The tint mode of a look sprite (Phaser's own are 0-7). */
export const LOOK_MODE = 8;
const PALETTE_KEY = 'war-look-palette';

const hex = (c: number) => `vec3(${(((c >> 16) & 255) / 255).toFixed(4)}, ${(((c >> 8) & 255) / 255).toFixed(4)}, ${((c & 255) / 255).toFixed(4)})`;

const header = (tints: readonly number[], w: number) => `
uniform sampler2D uPalette;
uniform vec2 uPalSize;
vec4 pal(float x, float y) { return texture2D(uPalette, vec2((x + 0.5) / uPalSize.x, 1.0 - (y + 0.5) / uPalSize.y)); } // GL orientation: row 0 at the top is v 1
vec4 applyLook(vec4 t) {
  if (outTintEffect.a < 7.5) return applyTint(t);
  float e = floor(outTintEffect.r * 255.0 + 0.5) + 256.0 * floor(outTintEffect.g * 255.0 + 0.5); // the secondary tint 0x00GGBB: .r is its low byte
  float q = floor((e + 0.5) / 3.0), tier = e - q * 3.0;
  float ci = floor((q + 0.5) / 4.0), team = q - ci * 4.0;
  float R = floor(outTint.b * 255.0 + 0.5), G = floor(outTint.g * 255.0 + 0.5);
  float skin = floor((R + 0.5) / 32.0), cloak = floor((R - skin * 32.0 + 0.5) / 4.0), crest = R - skin * 32.0 - cloak * 4.0;
  float trim = floor((G + 0.5) / 64.0), hair = floor((G - trim * 64.0 + 0.5) / 8.0);
  vec3 c = t.a > 0.0 ? t.rgb / t.a : t.rgb;
  bool hit = false;
  if (t.a > 0.99) {
    float y0 = ci * ${PAL_ROWS}.0;
    vec3 k = floor(pal(0.0, y0).rgb * 255.0 + 0.5);
    vec3 c8 = floor(c * 255.0 + 0.5);
    float slot = mod(dot(c8, k), ${w}.0);
    vec4 src = pal(slot, y0 + 1.0);
    if (src.a > 0.5 && all(lessThan(abs(floor(src.rgb * 255.0 + 0.5) - c8), vec3(0.5)))) {
      float g = floor(pal(slot, y0 + 2.0).r * 255.0 / 16.0 + 0.5);
      float v = g < 0.5 ? cloak : g < 1.5 ? crest : g < 2.5 ? trim : g < 3.5 ? skin : g < 4.5 ? 0.0 : hair;
      c = pal(slot, y0 + 3.0 + (team * 3.0 + tier) * ${PAL_VARIANTS}.0 + v).rgb;
      hit = true;
    }
  }
  if (!hit && (team < 1.5 || team > 2.5)) { // Kyrene (2) keeps the art's red
    float w = ${RED_W_GLSL};
    c = mix(c, team < 0.5 ? ${DYE_GLSL[0]} : team < 1.5 ? ${DYE_GLSL[1]} : ${DYE_GLSL[3]}, w);
  }
  vec3 tint = team < 0.5 ? ${hex(tints[0])} : team < 1.5 ? ${hex(tints[1])} : team < 2.5 ? ${hex(tints[2])} : ${hex(tints[3])};
  return vec4(c * t.a, t.a) * vec4(tint * outTint.a, outTint.a);
}`;

type Tex = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/** One texture per batch entry (the sprite's) plus the palette as texture 1. */
class LookQuad extends Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad {
  palette: Tex | null = null;
  palSize = [1, 1];
  updateRenderOptions(o: Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions): void {
    const multi = o.multiTexturing;
    o.multiTexturing = false;
    super.updateRenderOptions(o);
    o.multiTexturing = multi;
  }
  finalizeTextureCount(): void {
    super.finalizeTextureCount(1);
  }
  batchTextures(glTexture: Tex): number {
    const e = this.currentBatchEntry;
    if (e.texture[0] !== glTexture || e.texture[1] !== this.palette) {
      this.pushCurrentBatchEntry();
      const n = this.currentBatchEntry;
      glTexture.batchUnit = 0;
      n.texture[0] = glTexture;
      n.texture[1] = this.palette!;
      n.unit = 2;
    }
    return 0;
  }
  setupUniforms(dc: Phaser.Renderer.WebGL.DrawingContext): void {
    super.setupUniforms(dc);
    this.programManager.setUniform('uPalette', 1);
    this.programManager.setUniform('uPalSize', this.palSize);
  }
}

/**
 * Add the look node and its palette (the sheets with recolourable groups); per class its block in the palette
 * (lookCode's `ci`). null: no WebGL, or no sheet has groups.
 */
export function addLookPipeline(scene: Phaser.Scene, sheets: Iterable<[string, SheetManifest]>, tints: readonly number[]): { node: LookQuad; index: Map<string, number> } | null {
  if (!(scene.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  const pal: LookPalette = buildPalette(sheets);
  if (!pal.index.size) return null;
  if (!scene.textures.exists(PALETTE_KEY)) {
    const c = document.createElement('canvas');
    c.width = pal.w;
    c.height = pal.h;
    c.getContext('2d')!.putImageData(new ImageData(pal.data, pal.w, pal.h), 0, 0);
    scene.textures.addCanvas(PALETTE_KEY, c)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  const node = addQuadShader<LookQuad>(scene, LOOK, { header: header(tints, pal.w), fn: 'applyLook' }, LookQuad);
  if (!node) return null;
  node.palette = scene.textures.get(PALETTE_KEY).source[0].glTexture;
  node.palSize = [pal.w, pal.h];
  return { node, index: pal.index };
}
