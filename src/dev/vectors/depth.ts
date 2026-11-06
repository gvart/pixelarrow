/** Depth vectors (src/war/sim/depth.ts): depthOf of every region as parsed, of world ids without their own field, and of odd ones. */
import { depthOf, depthRule, REGION_DEPTH } from '../../war/sim/depth';
import { parseRegion } from '../../war/region/schema';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

export const vectors = () => {
  const regions = Object.values(regionFiles).map((raw) => parseRegion(raw)).map((r) => ({ id: r.id, ...(r.depth !== undefined ? { depth: r.depth } : {}) }));
  const odd = [{ id: 'test-ridge' }, { id: 'nowhere' }, { id: 'dodona', depth: 3 }, { id: 'omphalos', depth: 0 }, { id: 'x', depth: 7 }, { id: 'x', depth: -2 },
    ...Object.keys(REGION_DEPTH).map((id) => ({ id }))];
  return { cases: [...regions, ...odd].map((r) => [r, depthOf(r), depthRule(r).mob, depthRule(r).respawn, depthRule(r).claim.ticks]) };
};
