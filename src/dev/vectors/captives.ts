/** Captive vectors (src/war/sim/captives.ts): refuseChance, refuses (the per-man hash, non-ASCII ids too), askAt, soulRegions. */
import { askAt, refuseChance, refuses, soulRegions } from '../../war/sim/captives';
import { WORLD_REGIONS } from '../../war/world/regions';
import { Rng } from '../../sim/rng';

export const vectors = () => {
  const r = new Rng(41);
  const chances = [0, 1, 2, 5, 10, 14, 15, 20, 3.5].map((l) => [l, refuseChance(l)]);
  const ids = ['', 'a', 'p1:0', 'Ελαία-7', 'emoji 🐗 boar', ...Array.from({ length: 120 }, (_, i) => `u${r.int(0, 99999)}:${i}`)];
  // every level from 1 to 15 (refuseChance 0.3 .. 1): the per-man hash itself is private, so its value shows only against these steps
  const refusals = ids.flatMap((id) => Array.from({ length: 15 }, (_, l) => [id, l + 1, refuses(id, l + 1)]));
  const asks = [0, 86_400_000, 1_700_000_000_000, 123.5].map((u) => [u, askAt(u)]);
  const souls = [...WORLD_REGIONS.map((x) => x.id), 'test-ridge', 'nowhere'].map((id) => [id, soulRegions(id)]);
  return { chances, refusals, asks, souls };
};
