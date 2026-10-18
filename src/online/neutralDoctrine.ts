/**
 * Doctrines of the war map's bots (pure, shared; design/gdd/ai-doctrines.md
 * R4 "War-map neutral defenders: the same mapping by mix"). The server builds
 * every war setup and stores it in the ticket; the client plays it verbatim.
 */
import type { Culture } from '../data/names';
import { doctrineFor, type ArmyMix } from '../game/enemy';
import { DEFAULT_DOCTRINE, type BattleSetup, type DoctrineId, type Side } from '../sim/types';
import { defenderFor } from './defenders';
import type { RegionInfo } from './world';

/** Each neutral defender kind (src/online/defenders.ts DEFENDERS) as the campaign army mix it mirrors. */
const NEUTRAL_MIX: Readonly<Record<string, ArmyMix>> = {
  militia: 'militia',
  beasts: 'beasts',
  outlaws: 'outlaws',
  tribes: 'hill_tribe',
  pirates: 'pirates',
  deserters: 'deserters',
  city: 'garrison',
  cultists: 'cultists',
};

/**
 * The doctrine of a region's neutrals: hill tribes and pirates swarm,
 * cultists fury, the rest steady. A kind not in NEUTRAL_MIX plays steady.
 */
export function neutralDoctrine(seed: number, region: Pick<RegionInfo, 'id' | 'kind' | 'site' | 'coast'>): DoctrineId {
  const def = defenderFor(seed, region);
  const mix = NEUTRAL_MIX[def.id];
  if (!mix) return DEFAULT_DOCTRINE;
  // only mercenaries depend on the culture, and no neutral is one
  const culture: Culture = def.culture === 'local' ? 'greek' : def.culture;
  return doctrineFor(mix, culture);
}

/** The setup with `side`'s bot fighting under `doctrine` (a human side ignores it). */
export function withDoctrine(setup: BattleSetup, doctrine: DoctrineId, side: Side = 1): BattleSetup {
  setup.armies[side].doctrine = doctrine;
  return setup;
}
