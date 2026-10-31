import { describe, expect, it } from 'vitest';
import { nextStep, stepHint, type MapInput, type MapStep } from '../../src/war/view/hud/mapCycle';

const run = (inputs: MapInput[], from: MapStep = 'play') => inputs.reduce<MapStep[]>((seen, i) => [...seen, nextStep(seen[seen.length - 1], i)], [from]);

describe('map key cycle', () => {
  it('M opens the region map, then the world map, then closes', () => {
    expect(run(['map', 'map', 'map'])).toEqual(['play', 'region', 'world', 'play']);
  });

  it('keeps cycling', () => {
    expect(run(['map', 'map', 'map', 'map', 'map'])).toEqual(['play', 'region', 'world', 'play', 'region', 'world']);
  });

  it('Esc closes either map, and does nothing in play', () => {
    expect(nextStep('region', 'back')).toBe('play');
    expect(nextStep('world', 'back')).toBe('play');
    expect(nextStep('play', 'back')).toBe('play');
  });

  it('a click that leaves the map closes it', () => {
    for (const s of ['region', 'world'] as const) expect(nextStep(s, 'close')).toBe('play');
  });

  it('the World button jumps to the world map from anywhere and closes it when up', () => {
    expect(nextStep('play', 'world')).toBe('world');
    expect(nextStep('region', 'world')).toBe('world');
    expect(nextStep('world', 'world')).toBe('play');
  });

  it('the frames hint what the next M does', () => {
    expect(stepHint('region')).toBe('M: world map');
    expect(stepHint('world')).toBe('M: close');
    expect(stepHint('play')).toBe('');
    expect(stepHint('region', 'Q')).toBe('Q: world map');
  });
});
