/**
 * The per-man look on the GPU (./look.ts): Phaser's single-texture sprite pipeline whose fragment shader finds a
 * pixel's colour in its class's block of the palette texture (one hashed slot, checked against the exact colour) and
 * draws the man's colour from it; any other saturated red of the player's side turns blue as TEAM_SWAP does. One pass,
 * batched like any sprite: the look rides in the sprite's tint and tint effect (lookCode), the team multiply
 * (TEAM_TINT) is applied here.
 * The palette sits on texture unit 1, bound before every flush (Phaser's other pipelines forget their bindings on
 * bind, so they rebind unit 1 themselves).
 */
import Phaser from 'phaser';
import { PAL_ROWS, PAL_VARIANTS, buildPalette, type LookPalette } from './look';
import type { SheetManifest } from '../../art/sheetManifest';

export const LOOK = 'WarLook';
const PALETTE_KEY = 'war-look-palette';

const hex = (c: number) => `vec3(${(((c >> 16) & 255) / 255).toFixed(4)}, ${(((c >> 8) & 255) / 255).toFixed(4)}, ${((c & 255) / 255).toFixed(4)})`;

const frag = (tints: readonly number[], w: number) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform sampler2D uPalette;
uniform vec2 uPalSize;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
vec4 pal(float x, float y) { return texture2D(uPalette, vec2((x + 0.5) / uPalSize.x, (y + 0.5) / uPalSize.y)); }
void main() {
  vec4 t = texture2D(uMainSampler, outTexCoord);
  if (outTintEffect < 7.5) { // Phaser's own effects: multiply (0), fill (1), solid (2)
    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = t * texel;
    if (outTintEffect > 0.5 && outTintEffect < 1.5) color.rgb = mix(t.rgb, outTint.bgr * outTint.a, t.a);
    else if (outTintEffect > 1.5) color = texel;
    gl_FragColor = color;
    return;
  }
  float e = floor(outTintEffect - 8.0 + 0.5);
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
  if (!hit && team < 0.5) {
    float r = max(c.r, 0.001);
    float w = smoothstep(0.3, 0.55, (c.r - max(c.g, c.b)) / r) * (1.0 - smoothstep(0.1, 0.25, (c.g - c.b) / r));
    c = mix(c, vec3(c.b * 0.6, c.g * 0.8 + c.r * 0.3, c.r * 1.2 + 0.06), w);
  }
  vec3 tint = team < 0.5 ? ${hex(tints[0])} : team < 1.5 ? ${hex(tints[1])} : team < 2.5 ? ${hex(tints[2])} : ${hex(tints[3])};
  gl_FragColor = vec4(c * t.a, t.a) * vec4(tint * outTint.a, outTint.a);
}`;

class LookPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  palette: WebGLTexture | null = null;
  boot(): void {
    super.boot();
    this.set1i('uPalette', 1);
  }
  onBeforeFlush(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    gl.activeTexture(gl.TEXTURE0);
  }
}

/**
 * Add the look pipeline and its palette (the sheets with recolourable groups); per class its block in the palette
 * (lookCode's `ci`). null: no WebGL, or no sheet has groups.
 */
export function addLookPipeline(scene: Phaser.Scene, sheets: Iterable<[string, SheetManifest]>, tints: readonly number[]): Map<string, number> | null {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  const pal: LookPalette = buildPalette(sheets);
  if (!pal.index.size) return null;
  if (!scene.textures.exists(PALETTE_KEY)) {
    const c = document.createElement('canvas');
    c.width = pal.w;
    c.height = pal.h;
    c.getContext('2d')!.putImageData(new ImageData(pal.data, pal.w, pal.h), 0, 0);
    scene.textures.addCanvas(PALETTE_KEY, c)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  let p = r.pipelines.get(LOOK) as LookPipeline | undefined;
  if (!p) {
    p = new LookPipeline({ game: scene.game, fragShader: frag(tints, pal.w) });
    r.pipelines.add(LOOK, p);
  }
  p.palette = (scene.textures.get(PALETTE_KEY).source[0].glTexture as { webGLTexture: WebGLTexture | null } | null)?.webGLTexture ?? null;
  p.set2f('uPalSize', pal.w, pal.h);
  return pal.index;
}
