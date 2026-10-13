/**
 * The data side of the online camps (docs/DESIGN_V2.md "Camp"), shared by the
 * Camp scene (src/scenes/CampScene.ts) and the war map: where the camps come
 * from (a CampSource: the server, /api/online/camps, or the demo shard, where
 * nothing is sent) and the effect line of a building.
 *
 * The checks are the shared ones of src/online/camps.ts; the server decides.
 */
import { t } from '../../i18n';
import { PALISADE, WATCHTOWER_SIGHT, campBuildingIncome, type CampBuildingId } from '../../online/rules';
import type { CampsView } from '../../online/camps';
import { online } from '../../platform/cloud';
import type { DemoShard } from '../../online/demoShard';

/** Where the camp data comes from. */
export interface CampSource {
  camps(): Promise<CampsView>;
  claim(loc: number): Promise<CampsView>;
  build(loc: number, kind: CampBuildingId, slot: number | null): Promise<CampsView>;
  rest(loc: number): Promise<CampsView & { energy: number }>;
}

export const liveCampSource: CampSource = {
  camps: () => online.api.camps(),
  claim: (loc) => online.api.campClaim(loc),
  build: (loc, kind, slot) => online.api.campBuild(loc, kind, slot),
  rest: (loc) => online.api.campRest(loc),
};

/** The demo shard's camps; its clock runs on from the demo's "now". */
export function demoCampSource(d: DemoShard): CampSource {
  const t0 = Date.now();
  const now = () => d.now + (Date.now() - t0);
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    camps: async () => clone(d.camp.view(now())),
    claim: async (loc) => clone(d.camp.claim(loc, now())),
    build: async (loc, kind, slot) => clone(d.camp.build(loc, kind, slot, now())),
    rest: async (loc) => clone(d.camp.rest(loc, now())),
  };
}

/** The effect line of a building at a level ("+8 food / h", "Garrison 14 · militia +1"). */
export function effectText(kind: CampBuildingId, level: number, garrisonBase: number): string {
  const inc = campBuildingIncome(kind, level);
  switch (kind) {
    case 'palisade':
      return t('ocamp.e.palisade', { g: garrisonBase + (PALISADE.garrison[level] ?? 0), m: PALISADE.militia[level] ?? 0 });
    case 'granary':
      return t('ocamp.e.granary', { n: inc.food });
    case 'forge':
      return t('ocamp.e.forge', { n: inc.bronze });
    case 'barracks':
      return t('ocamp.e.barracks', { n: inc.recruits });
    case 'watchtower':
      return t('ocamp.e.watchtower', { n: WATCHTOWER_SIGHT[level] ?? 0 });
  }
}
