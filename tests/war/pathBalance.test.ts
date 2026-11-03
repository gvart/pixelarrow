// W-203: the balance tool's per-path rows are deterministic and answer to the path's limits. Only the quick rows run here;
// `npm run balance:war` plays the rest.
import { describe, expect, it } from 'vitest';
import { builderBoard, traderRun } from '../../src/dev/pathBalance';

describe('W-203 paths played', () => {
  it('a trader starts with a cart, grows to his cap and earns; the same seed gives the same row', () => {
    const a = traderRun(false);
    expect(a.coin).toBeGreaterThan(0);
    expect(a.pts).toBeGreaterThan(0);
    expect(a.level).toBeGreaterThan(1);
    expect(traderRun(false)).toEqual(a);
  }, 60_000);

  it('a builder on the board earns more with more hands and his work perks', () => {
    const start = builderBoard(false), grown = builderBoard(true);
    expect(start.coin).toBeGreaterThan(0);
    expect(grown.coin).toBeGreaterThan(start.coin);
    expect(grown.pts).toBeGreaterThan(start.pts);
  });
});
