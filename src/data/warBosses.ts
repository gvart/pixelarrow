/**
 * War region bosses and their drop tables (W-45; docs/WAR.md "Crafting": set pieces and named legendaries stay drops).
 *
 * Some neutral regions hold a boss: a unique, powerful mob guarding the region (the boss sim, its AI and claim gating
 * live in src/war/sim). Killing it drops gear: `BOSS_TIERS[tier].picks` pieces of rolled rarity from the base items,
 * and, `signature` of the time, the first is one of the boss's own legendaries. The bosses are the war's only source
 * of the Arms of Achilles, the Panoply of Alexander, the Trident of Poseidon and the Aegis of Zeus, all on the rim.
 * M7c (docs/WAR.md "Region lore and depth"): every home faces the same guardians at the same depth: four tier-1 pocket
 * bosses (depth 2), four tier-2 gate bosses (depth 3) and four tier-3 rim bosses (depth 4) in their landmarks, and the
 * Titan and the Minotaur of Omphalos.
 *
 * Pure and seeded: the same kill (seed) always drops the same table.
 */
import { BASE_ITEMS, type Rarity } from './items';
import { setPieces } from './sets';
import { Rng, hashString } from '../sim/rng';
import type { RareGood } from './warLandmarks';
import { chiefKind } from './warWild';

export type BossTier = 1 | 2 | 3;

export interface WarBoss {
  id: string;
  name: string;
  /** The neutral region it guards (src/war/world/regions.ts). */
  region: string;
  /** M7c: tier = the region's depth - 1 (src/war/sim/depth.ts), Omphalos 3 (docs/WAR.md "Region lore and depth"). */
  tier: BossTier;
  /** Its own legendaries: item ids and set ids (a set drops one of its pieces). */
  signature: readonly string[];
  /** M7c: the landmark it holds (docs/WAR.md "Landmarks"; ./warLandmarks.ts), absent for a pocket boss. */
  landmark?: string;
  /** Its phases, by the share of max hp they start below (the first starts at 1): src/war/sim/bosses.ts. */
  phases: readonly number[];
  /** M7e: the rare good its kill drops into the loot pile (docs/WAR.md "Rare goods"). */
  rare?: { good: RareGood; n: number };
  /** E3: the trophy its killers hang in their home town (src/war/view/memorial.ts); default: bossTrophy's. */
  trophy?: string;
  /** E3: the deed its slayers carry on their record (src/war/sim/deeds.ts); default: bossDeed's. */
  deed?: string;
  /** W-67: what it says (src/war/view/hud/bossBanner.ts): its taunt at the wake, a line per phase past the first, its epitaph. */
  voice: BossVoice;
}

/**
 * W-67: a guardian's lines (grim Greek myth, the world between death and the afterlife, W-42; 12 words at most). `title`
 * under its name on the wake banner; `wake` its taunt; `phases[i]` as it enters phase i + 1; `epitaph` at its death;
 * `fled` and `back` for one that escapes (the Bandit King). `mute`: its lines are told, not said (the Erymanthian Boar; every other guardian speaks of the oath it failed).
 */
export interface BossVoice {
  title: string; wake: string; phases: readonly string[]; epitaph: string; fled?: string; back?: string; mute?: true;
}

export const WAR_BOSSES: readonly WarBoss[] = [
  // depth 2 pockets: tier 1, no signature
  { id: 'moor_bear', name: 'Great Bear of the Moors', region: 'moors', tier: 1, signature: [], phases: [1] ,
    voice: { title: "Last Watch of the Moors", wake: "The Wardens bid me keep this march. I keep it still.", phases: [], epitaph: "Tell the Wardens the moor held. Tell them no one came." } },
  { id: 'griffin', name: 'Griffin of the Kimmerian Hills', region: 'kimmeria', tier: 1, signature: [], phases: [1] ,
    voice: { title: "Gold-Keeper of the Broken Gate", wake: "I watched the mist take the Kimmerians whole. Not their gold.", phases: [], epitaph: "I kept their gold. I could not keep them." } },
  { id: 'savanna_lion', name: 'Lion of the Savanna', region: 'savanna', tier: 1, signature: [], phases: [1] ,
    voice: { title: "Lord of the Burnt Grass", wake: "My hide was the rim's shield once. Now I wear it alone.", phases: [], epitaph: "Skin me with my own claws. The oath had softer hide." } },
  { id: 'maenad_queen', name: 'the Maenad Queen', region: 'bacchae', tier: 1, signature: [], phases: [1] ,
    voice: { title: "Queen of the Bacchae", wake: "Wardens gone, the god is ours. Dance, dead man, until you tear.", phases: [], epitaph: "The flutes stop. Out past the rim, something else is dancing." } },
  // depth 3 gates: tier 2, each in its landmark
  { id: 'brontes', name: 'Brontes the Cyclops', region: 'saddle', tier: 2, signature: [], landmark: 'cyclopean_gatehouse', phases: [1, 0.85], rare: { good: 'starIron', n: 10 } ,
    voice: { title: "Thunder of the Saddle Gate", wake: "I walled this gate for the Wardens. They left. I stayed.", phases: ["Enough stones. I keep their oath with my own hands."], epitaph: "Tell them the gate held longer than their word." } },
  // M7d: the Oracle Grove's guardians are the god's maenads and their queen (the art built them; docs/WAR.md "Landmarks")
  { id: 'grove_queen', name: 'the Maenad Queen of the Grove', region: 'erymanthos', tier: 2, signature: [], landmark: 'oracle_grove', phases: [1, 0.4], rare: { good: 'asphodel', n: 10 } ,
    voice: { title: "Voice of the Oracle Grove", wake: "Memory or Lethe, shade? The Wardens drank from the left spring.", phases: ["Sisters, come! Tear them as we tore the forsworn!"], epitaph: "Lethe takes me now. No one will remember this grove." } },
  // E3: the Erymanthian Boar (Heracles' fourth labour) roots in a meadow by the south road below the Grove: a second guardian of the
  // region (both keep its claim points shut, as the Titan and the Minotaur do Omphalos'); its tusks are its trophy
  { id: 'erymanthian_boar', name: 'the Erymanthian Boar', region: 'erymanthos', tier: 2, signature: [], phases: [1, 0.5], trophy: 'the tusks of the Erymanthian Boar', deed: 'Boar-slayer' ,
    voice: { title: "Terror of Erymanthos", mute: true, wake: "The Boar lowers its tusks. An old Warden brand scars its flank.", phases: ["Bristles rise, blood in its eye: the sounder answers its squeal."], epitaph: "The Boar falls. Its brand reads: kept until relieved. No one came." } },
  { id: 'gyges', name: 'Gyges the Hundred-Handed', region: 'gorge', tier: 2, signature: [], landmark: 'titans_forge', phases: [1, 0.5], rare: { good: 'titanBronze', n: 10 } ,
    voice: { title: "Chained Giant of the Forge", wake: "They chained me here to forge the oath-bronze. Then they forgot me.", phases: ["Their chains rust like their word. Now run, little shades."], epitaph: "Forged for an oath no one keeps. Let the falls cool me." } },
  { id: 'chimera', name: 'the Chimera', region: 'canyons', tier: 2, signature: [], landmark: 'obsidian_hold', phases: [1], rare: { good: 'obsidian', n: 10 } ,
    voice: { title: "Fire of the Obsidian Hold", wake: "Three throats swore to burn whatever climbs the vent. You climbed.", phases: [], epitaph: "Something still climbs the vent. Who burns it now?" } },
  // depth 4 rim edges: tier 3, the four signature legendaries
  // a dragon on the titan frozen in the glacier: the aegis of the god who threw the titans down
  { id: 'drakon', name: 'Drakon the White', region: 'krios', tier: 3, signature: ['aegis_of_zeus'], landmark: 'drakons_citadel', phases: [1, 0.6, 0.565], rare: { good: 'dragonbone', n: 20 } ,
    voice: { title: "Guardian of the Citadel", wake: "I sleep on the titan the Wardens froze. Lie down beside it.", phases: ["Burn, then. Ash cannot climb to Elysion.", "Enough! Their citadel falls on you, as it fell on me."], epitaph: "The ice takes me back. Hold the north, if anyone can." } },
  // the estuary where the sea meets the rim: the sea god's trident
  { id: 'scylla', name: 'Scylla of the Estuary', region: 'siren', tier: 3, signature: ['poseidon_trident'], landmark: 'rim_watchtower', phases: [1, 0.5], rare: { good: 'nereidPearl', n: 15 } ,
    voice: { title: "Devourer of the Estuary", wake: "The beacon is dark. Every ship that comes now is mine.", phases: ["You drag me from my cave? The Abyss waits behind me."], epitaph: "Light the beacon, then. Something bigger than me is coming." } },
  // the oracle that named Alexander son of a god: his armour on a king of thieves
  { id: 'bandit_king', name: 'the Bandit King of Ammon', region: 'ammon', tier: 3, signature: ['alexander'], landmark: 'dead_city', phases: [1, 0.6, 0.3] ,
    voice: { title: "King of the Dead City", wake: "Wardens gone, gods silent. Ammon's dead city is mine. Pay its king.", phases: ["To the palace! Make them pay for every street.", "Hold them. A king does not die in the gutter."], epitaph: "Take the conqueror's armour. It kept nothing out either.", fled: "Laugh while you can. I will be back for the rest.", back: "Miss me? The dead city never forgets its king." } },
  // the river that fought Achilles at Troy, here as the Achelous: the arms of Achilles
  { id: 'river_god', name: 'Achelous the River-God', region: 'delta', tier: 3, signature: ['achilles'], landmark: 'sunken_temple', phases: [1, 0.66, 0.33] ,
    voice: { title: "Lord of the Sunken Temple", wake: "I held this delta beside the Wardens. You are no Warden.", phases: ["Water takes every shape. Try to hold me now.", "As a bull, then. The sea is rising behind you."], epitaph: "The river runs on. Soon the Abyss drinks it too." } },
  // the navel of the in-between: two guardians, two fights at once
  { id: 'titan', name: 'the Titan of the Navel', region: 'omphalos', tier: 3, signature: [], landmark: 'temple_city', phases: [1, 0.5] ,
    voice: { title: "Keeper of the Navel", wake: "I held up the sky. Now I hold the oath-stone. Earn it.", phases: ["Then I shake the Navel until the rim splits."], epitaph: "Swear it at the Navel. Break it, and Lethe drinks you." } },
  { id: 'minotaur', name: 'the Minotaur', region: 'omphalos', tier: 3, signature: [], landmark: 'temple_city', phases: [1] ,
    voice: { title: "Horror of the Temple Maze", wake: "Bull-born, maze-bound. The Wardens shut me in with their oath.", phases: [], epitaph: "No thread leads out. Only the oath, and the dark." } },
];

/** Per tier: pieces dropped, rarity weights of each, the least item tier, and the chance the first is a signature legendary. */
export const BOSS_TIERS: Record<BossTier, { picks: number; rarity: readonly (readonly [Rarity, number])[]; minTier: number; signature: number }> = {
  1: { picks: 2, rarity: [['rare', 70], ['epic', 28], ['legendary', 2]], minTier: 2, signature: 0 },
  2: { picks: 3, rarity: [['rare', 40], ['epic', 50], ['legendary', 10]], minTier: 3, signature: 0 },
  3: { picks: 4, rarity: [['rare', 15], ['epic', 55], ['legendary', 30]], minTier: 3, signature: 0.25 },
};

const BY_ID = new Map(WAR_BOSSES.map((b) => [b.id, b]));
export const warBoss = (id: string): WarBoss | undefined => BY_ID.get(id);
/** The (first) boss of a region; Omphalos has two (bossesOfRegion). */
export const bossOfRegion = (region: string): WarBoss | undefined => WAR_BOSSES.find((b) => b.region === region);
export const bossesOfRegion = (region: string): WarBoss[] => WAR_BOSSES.filter((b) => b.region === region);

/** E3: the trophy a kill of `boss` gives its killers ("the head of ..." unless the boss names its own). */
export const bossTrophy = (boss: string): string => {
  const b = warBoss(boss);
  return b?.trophy ?? `the head of ${b?.name ?? boss}`;
};
/** E3: the deed its slayers earn ("Bane of ..." unless the boss names its own). */
export const bossDeed = (boss: string): string => {
  const b = warBoss(boss);
  return b?.deed ?? `Bane of ${(b?.name ?? boss).replace(/^the /, '')}`;
};

export interface BossDrop { def: string; rarity: Rarity }

/** M7e: the goods a kill of `boss` drops into its loot pile (its rare good; none for most). */
export const bossGoods = (boss: string): { r: RareGood; n: number }[] => {
  const g = warBoss(boss)?.rare;
  return g ? [{ r: g.good, n: g.n }] : [];
};

/** The item ids a signature entry may drop: a set's pieces, or the item itself. */
const signatureItems = (s: string): string[] => {
  const pieces = setPieces(s);
  return pieces.length ? pieces : [s];
};

/** What a kill of `boss` drops; `seed` names the kill (the same seed, the same drop). Unknown boss: nothing. */
export function bossLoot(boss: string, seed: string): BossDrop[] {
  const b = warBoss(boss);
  if (!b) return [];
  const t = BOSS_TIERS[b.tier];
  const rng = new Rng(hashString(`${boss}:${seed}:bossloot`) || 1);
  const pool = BASE_ITEMS.filter((d) => d.tier >= t.minTier);
  const out: BossDrop[] = [];
  for (let i = 0; i < t.picks; i++) {
    if (i === 0 && b.signature.length && rng.chance(t.signature)) {
      out.push({ def: rng.pick(signatureItems(rng.pick(b.signature))), rarity: 'legendary' });
      continue;
    }
    out.push({ def: rng.pick(pool).id, rarity: rng.weighted(t.rarity) });
  }
  return out;
}

// ---------------------------------------------------------------- world-fill: local mini-bosses (chiefs)

export { CHIEF_KINDS, WAR_CHIEFS, warChief, chiefKind, chiefsOfKind, chiefRespawn, type WarChief, type ChiefKind } from './warWild';

/** What a kill of chief `id` at `depth` drops; `seed` names the kill (the same seed, the same drop). */
export function chiefLoot(id: string, depth: number, seed: string): { goods: Record<string, number>; item: BossDrop | null } {
  const k = chiefKind(id);
  if (!k) return { goods: {}, item: null };
  const m = 1 + k.loot.per * depth, goods: Record<string, number> = { coin: Math.round(k.loot.coin * m) };
  for (const [g, n] of Object.entries(k.loot.goods)) goods[g] = Math.round(n * m);
  const rng = new Rng(hashString(`${id}:${seed}:chiefloot`) || 1);
  if (!rng.chance(k.loot.item.chance)) return { goods, item: null };
  const pool = BASE_ITEMS.filter((d) => d.tier <= 2 + Math.floor(depth / 2));
  return { goods, item: { def: rng.pick(pool).id, rarity: rng.weighted(k.loot.item.rarity) } };
}
