/**
 * The map key cycle in a region (./fullMap.ts): M opens the region map, M again zooms out to the world map (an overlay
 * over the running region, ../../world-view/overlay.ts), M a third time closes back to play; Esc closes either map.
 * The World button (Shift+W) jumps straight to the world map, or closes it when it is up.
 */
export type MapStep = 'play' | 'region' | 'world';
/** map: the M key; back: Esc; world: the World button; close: a click that leaves the map (go there, enter a region). */
export type MapInput = 'map' | 'back' | 'world' | 'close';

export function nextStep(step: MapStep, input: MapInput): MapStep {
  if (input === 'back' || input === 'close') return 'play';
  if (input === 'world') return step === 'world' ? 'play' : 'world';
  return step === 'play' ? 'region' : step === 'region' ? 'world' : 'play';
}

/** The key hint in a map frame: what the next M does there. */
export const stepHint = (step: MapStep, key = 'M'): string => (step === 'region' ? `${key}: world map` : step === 'world' ? `${key}: close` : '');
