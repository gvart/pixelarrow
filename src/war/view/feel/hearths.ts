/**
 * E4: where a building's smoke rises, per sprite (../build/buildArt.ts texture keys), as a share of the sprite's width
 * and height from its top left (mirrored when it is drawn turned), read off the art: a chimney's mouth, a roof's ridge
 * where there is none, an open hearth or a campfire. A sprite not listed does not smoke.
 */
export type HearthKind = 'chimney' | 'roof' | 'fire';
export interface Hearth { x: number; y: number; depth: number; id: number; kind: HearthKind }

export const HEARTH: Record<string, [number, number, HearthKind]> = {
  'bld-camp-done': [0.485, 0.73, 'fire'],
  'bld-cookhouse-done': [0.49, 0.66, 'fire'],
  'bld-cookhouse2-done': [0.62, 0.2, 'roof'],
  'bld-cookhouse3-done': [0.49, 0.05, 'chimney'],
  'bld-forge-done': [0.31, 0.42, 'fire'],
  'bld-forge2-done': [0.735, 0.05, 'chimney'],
  'bld-forge3-done': [0.3, 0.04, 'chimney'],
  'bld-elaia-town-house-a': [0.6, 0.2, 'roof'],
  'bld-elaia-town-house-b': [0.52, 0.07, 'roof'],
  'bld-elaia-town-cottage': [0.62, 0.2, 'roof'],
};
