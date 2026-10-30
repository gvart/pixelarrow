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
 * `fled` and `back` for one that escapes (the Bandit King). `mute`: a beast, its lines are told, not said.
 */
export interface BossVoice {
  title: string; wake: string; phases: readonly string[]; epitaph: string; fled?: string; back?: string; mute?: true;
}

export const WAR_BOSSES: readonly WarBoss[] = [
  // depth 2 pockets: tier 1, no signature
  { id: 'moor_bear', name: 'Great Bear of the Moors', region: 'moors', tier: 1, signature: [], phases: [1] ,
    voice: { title: 'Warden of the Heather', mute: true, wake: 'The Great Bear rises from the heather, and the moor falls silent.', phases: [], epitaph: 'It lies down in the heather it guarded. The moor is open.' } },
  { id: 'griffin', name: 'Griffin of the Kimmerian Hills', region: 'kimmeria', tier: 1, signature: [], phases: [1] ,
    voice: { title: 'Gold-Keeper of the Crags', mute: true, wake: 'A shriek from the crags: the Griffin guards its gold.', phases: [], epitaph: 'The Griffin falls from the grey sky. Its hoard lies unwatched.' } },
  { id: 'savanna_lion', name: 'Lion of the Savanna', region: 'savanna', tier: 1, signature: [], phases: [1] ,
    voice: { title: 'Lord of the Burnt Grass', mute: true, wake: 'The grass parts. The Lion has your scent, shade.', phases: [], epitaph: 'The Lion breathes its last into the dust it ruled.' } },
  { id: 'maenad_queen', name: 'the Maenad Queen', region: 'bacchae', tier: 1, signature: [], phases: [1] ,
    voice: { title: 'Queen of the Bacchae', wake: 'Dance with us, dead man. You will dance until you tear.', phases: [], epitaph: 'The flutes fall silent. The god still drinks.' } },
  // depth 3 gates: tier 2, each in its landmark
  { id: 'brontes', name: 'Brontes the Cyclops', region: 'saddle', tier: 2, signature: [], landmark: 'cyclopean_gatehouse', phases: [1, 0.85], rare: { good: 'starIron', n: 10 } ,
    voice: { title: 'Thunder of the Saddle Gate', wake: 'Little shades at my gate. I will bury you under it.', phases: ['Enough stones. I come down to break you myself.'], epitaph: 'My thunder is spent. Let the gate fall with me.' } },
  // M7d: the Oracle Grove's guardians are the god's maenads and their queen (the art built them; docs/WAR.md "Landmarks")
  { id: 'grove_queen', name: 'the Maenad Queen of the Grove', region: 'erymanthos', tier: 2, signature: [], landmark: 'oracle_grove', phases: [1, 0.4], rare: { good: 'asphodel', n: 10 } ,
    voice: { title: 'Voice of the Oracle Grove', wake: 'The oracle foretold you. It foretold your bones as well.', phases: ['Sisters, come! Tear them as we tore the king!'], epitaph: 'The grove will speak again. It will not speak of you.' } },
  // E3: the Erymanthian Boar (Heracles' fourth labour) roots in a meadow by the south road below the Grove: a second guardian of the
  // region (both keep its claim points shut, as the Titan and the Minotaur do Omphalos'); its tusks are its trophy
  { id: 'erymanthian_boar', name: 'the Erymanthian Boar', region: 'erymanthos', tier: 2, signature: [], phases: [1, 0.5], trophy: 'the tusks of the Erymanthian Boar', deed: 'Boar-slayer' ,
    voice: { title: 'Terror of Erymanthos', mute: true, wake: 'The Boar lowers its tusks. The snow remembers Heracles.', phases: ['Bristles rise, blood in its eye: the sounder answers its squeal.'], epitaph: 'The Boar falls where no hero chained it. Take the tusks.' } },
  { id: 'gyges', name: 'Gyges the Hundred-Handed', region: 'gorge', tier: 2, signature: [], landmark: 'titans_forge', phases: [1, 0.5], rare: { good: 'titanBronze', n: 10 } ,
    voice: { title: 'Chained Giant of the Forge', wake: 'A hundred hands, and every one of them wants your throat.', phases: ['The chains of Zeus are broken. Now run, little shades.'], epitaph: 'Chained by gods, slain by ghosts. Tartarus will laugh.' } },
  { id: 'chimera', name: 'the Chimera', region: 'canyons', tier: 2, signature: [], landmark: 'obsidian_hold', phases: [1], rare: { good: 'obsidian', n: 10 } ,
    voice: { title: 'Fire of the Obsidian Hold', mute: true, wake: 'Lion roars, goat bleats, serpent hisses: the Chimera wakes in fire.', phases: [], epitaph: 'Three heads, one death. The fire in the hold goes cold.' } },
  // depth 4 rim edges: tier 3, the four signature legendaries
  // a dragon on the titan frozen in the glacier: the aegis of the god who threw the titans down
  { id: 'drakon', name: 'Drakon the White', region: 'krios', tier: 3, signature: ['aegis_of_zeus'], landmark: 'drakons_citadel', phases: [1, 0.6, 0.565], rare: { good: 'dragonbone', n: 20 } ,
    voice: { title: 'Guardian of the Citadel', wake: "I sleep on a titan's corpse. You will lie beside it.", phases: ['Burn, then. Ash does not climb to heaven.', 'Enough! I will bring the citadel down upon you.'], epitaph: 'The ice takes me back. Take the aegis, and fear Zeus.' } },
  // the estuary where the sea meets the rim: the sea god's trident
  { id: 'scylla', name: 'Scylla of the Estuary', region: 'siren', tier: 3, signature: ['poseidon_trident'], landmark: 'rim_watchtower', phases: [1, 0.5], rare: { good: 'nereidPearl', n: 15 } ,
    voice: { title: 'Devourer of the Estuary', wake: 'Six mouths, and every one of them hungry for the dead.', phases: ['You drag me from my cave? Then come closer.'], epitaph: 'Once I was a nymph. Now I am nothing at all.' } },
  // the oracle that named Alexander son of a god: his armour on a king of thieves
  { id: 'bandit_king', name: 'the Bandit King of Ammon', region: 'ammon', tier: 3, signature: ['alexander'], landmark: 'dead_city', phases: [1, 0.6, 0.3] ,
    voice: { title: 'King of the Dead City', wake: "Ammon's dead city is mine, and so is all you carry.", phases: ['To the palace! Make them pay for every street.', 'Hold them. A king does not die in the gutter.'], epitaph: "Take Alexander's armour, then. It never fit me.", fled: 'Laugh while you can. I will be back for the rest.', back: 'Miss me? The dead city never forgets its king.' } },
  // the river that fought Achilles at Troy, here as the Achelous: the arms of Achilles
  { id: 'river_god', name: 'Achelous the River-God', region: 'delta', tier: 3, signature: ['achilles'], landmark: 'sunken_temple', phases: [1, 0.66, 0.33] ,
    voice: { title: 'Lord of the Sunken Temple', wake: 'I fought Achilles at Troy. You are no Achilles.', phases: ['Water takes every shape. Try to hold me now.', 'As a bull, then. Heracles took a horn; you take nothing.'], epitaph: 'The river runs on without me. It always has.' } },
  // the navel of the in-between: two guardians, two fights at once
  { id: 'titan', name: 'the Titan of the Navel', region: 'omphalos', tier: 3, signature: [], landmark: 'temple_city', phases: [1, 0.5] ,
    voice: { title: 'Keeper of the Navel', wake: 'I held up the sky. I can hold back the dead.', phases: ['Then I shake the Navel until the world splits.'], epitaph: 'The Navel is yours. May it weigh on you as on me.' } },
  { id: 'minotaur', name: 'the Minotaur', region: 'omphalos', tier: 3, signature: [], landmark: 'temple_city', phases: [1] ,
    voice: { title: 'Horror of the Temple Maze', mute: true, wake: "A bellow from the temple's dark: the Minotaur smells the dead.", phases: [], epitaph: 'The bull-man falls. No thread is needed to leave now.' } },
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

/**
 * world-fill: a region's local mini-boss (a "chief"): a named beast or bandit chief on its kind's own art, drawn larger
 * and tinted, leading a small escort of its kind from its own lair (`RegionData.lairs[].chief`, placed by the region
 * kit's fill pass; or spawned by a hidden quest's last step). His stats, loot and look come from his kind's row of
 * CHIEF_KINDS, so a new mob kind gets chiefs by adding a row there and a few names to WAR_CHIEFS.
 */
export interface WarChief {
  id: string;
  name: string;
  /** Under his name on the plate. */
  title: string;
  /** His mob kind (src/war/sim/mobs.ts MOBS). */
  kind: string;
}

/** Per mob kind: the chief's look, his stats over a man of his kind (before depth), his escort, and his loot. */
export interface ChiefKind {
  /** Draw scale over the kind's sheet, and a multiply tint (0xffffff: none). */
  scale: number; tint: number;
  /** Hp and damage over a man of his kind. */
  hp: number; dmg: number;
  /** Men of his kind with him. */
  escort: number;
  /** His kill drops (a pile where he fell): coin and goods, each x (1 + per x depth); an item at `item.chance`. */
  loot: { coin: number; goods: Readonly<Record<string, number>>; per: number; item: { chance: number; rarity: readonly (readonly [Rarity, number])[] } };
}

const BEAST_ITEM = { chance: 0.35, rarity: [['uncommon', 60], ['rare', 35], ['epic', 5]] as const };
export const CHIEF_KINDS: Readonly<Record<string, ChiefKind>> = {
  wolf: { scale: 1.4, tint: 0xc4c8d8, hp: 7, dmg: 2.2, escort: 5, loot: { coin: 12, goods: { hides: 6 }, per: 0.5, item: BEAST_ITEM } },
  boar: { scale: 1.35, tint: 0xa88a78, hp: 4.5, dmg: 1.8, escort: 2, loot: { coin: 12, goods: { hides: 6, food: 10 }, per: 0.5, item: BEAST_ITEM } },
  bear: { scale: 1.3, tint: 0x9a8a80, hp: 2.6, dmg: 1.5, escort: 1, loot: { coin: 15, goods: { hides: 8 }, per: 0.5, item: BEAST_ITEM } },
  bandit: { scale: 1.2, tint: 0xd8b890, hp: 5, dmg: 1.6, escort: 6, loot: { coin: 25, goods: { iron: 4 }, per: 0.5, item: { chance: 0.5, rarity: [['uncommon', 45], ['rare', 45], ['epic', 10]] } } },
  jackal: { scale: 1.45, tint: 0xd8b070, hp: 9, dmg: 2.6, escort: 5, loot: { coin: 10, goods: { hides: 5 }, per: 0.5, item: BEAST_ITEM } },
  lion: { scale: 1.35, tint: 0xe0a860, hp: 4.5, dmg: 1.7, escort: 2, loot: { coin: 15, goods: { hides: 8 }, per: 0.5, item: BEAST_ITEM } },
  serpent: { scale: 1.35, tint: 0x8ab088, hp: 3, dmg: 1.5, escort: 1, loot: { coin: 15, goods: { hides: 6, herbs: 4 }, per: 0.5, item: BEAST_ITEM } },
};

/** The named chiefs (a region's fill pass picks from those of its lair kinds; hidden quests name theirs). */
export const WAR_CHIEFS: readonly WarChief[] = [
  { id: 'greymaw', name: 'Old Greymaw', title: 'Leader of the pack', kind: 'wolf' },
  { id: 'ashpelt', name: 'Ashpelt the Widow-Maker', title: 'Leader of the pack', kind: 'wolf' },
  { id: 'rimefang', name: 'Rimefang', title: 'Wolf of the cold passes', kind: 'wolf' },
  { id: 'hollow_eye', name: 'Hollow-Eye', title: 'The one-eyed pack-father', kind: 'wolf' },
  { id: 'bloodmuzzle', name: 'Lykos Bloodmuzzle', title: 'Leader of the pack', kind: 'wolf' },
  { id: 'tuskmother', name: 'Tuskmother', title: 'Sow of the thickets', kind: 'boar' },
  { id: 'ironbristle', name: 'Old Ironbristle', title: 'Boar of the oak glades', kind: 'boar' },
  { id: 'mud_king', name: 'the Mud-King', title: 'Boar of the wallows', kind: 'boar' },
  { id: 'gorehide', name: 'Gorehide', title: 'The scarred boar', kind: 'boar' },
  { id: 'kapros', name: 'Kapros the Black', title: 'Boar of the old shrines', kind: 'boar' },
  { id: 'grizzleback', name: 'Old Grizzle-Back', title: 'Bear of the high woods', kind: 'bear' },
  { id: 'arktos', name: 'Arktos the Shambler', title: 'Bear of the caves', kind: 'bear' },
  { id: 'mosspaw', name: 'Moss-Paw', title: 'Bear of the stream banks', kind: 'bear' },
  { id: 'grave_bear', name: 'the Grave-Bear', title: 'It digs where the dead lie', kind: 'bear' },
  { id: 'crooked_blade', name: 'Kallias Crooked-Blade', title: 'Bandit chief', kind: 'bandit' },
  { id: 'toll_taker', name: 'Drakos the Toll-Taker', title: 'Bandit chief', kind: 'bandit' },
  { id: 'one_ear', name: 'One-Ear Nikon', title: 'Bandit chief', kind: 'bandit' },
  { id: 'flayer', name: 'Zopyros the Flayer', title: 'Bandit chief', kind: 'bandit' },
  { id: 'red_hand', name: 'Lampon Red-Hand', title: 'Bandit chief', kind: 'bandit' },
  { id: 'sly_hunger', name: 'Sly Hunger', title: 'The grinning pack-mother', kind: 'jackal' },
  { id: 'dust_tail', name: 'Dust-Tail', title: 'Pack-leader of the waste', kind: 'jackal' },
  { id: 'old_carrion', name: 'Old Carrion', title: 'It follows the dying', kind: 'jackal' },
  { id: 'stingmother', name: 'the Sting-Mother', title: 'Queen of the burrows', kind: 'jackal' },
  { id: 'scarmane', name: 'Old Scarmane', title: 'Lion of the dry grass', kind: 'lion' },
  { id: 'aithon', name: 'Aithon the Red', title: 'Lion of the kopjes', kind: 'lion' },
  { id: 'thorn_lion', name: 'the Thorn-Lion', title: 'Lion of the scrub', kind: 'lion' },
  { id: 'reed_mother', name: 'the Reed-Mother', title: 'Serpent of the shallows', kind: 'serpent' },
  { id: 'old_coil', name: 'Old Coil', title: 'Serpent of the ford', kind: 'serpent' },
  { id: 'mud_drinker', name: 'the Mud-Drinker', title: 'Serpent of the fens', kind: 'serpent' },
];

const CHIEF_BY_ID = new Map(WAR_CHIEFS.map((c) => [c.id, c]));
export const warChief = (id: string): WarChief | undefined => CHIEF_BY_ID.get(id);
/** A chief's kind row (undefined: a kind with no chiefs yet). */
export const chiefKind = (id: string): ChiefKind | undefined => CHIEF_KINDS[warChief(id)?.kind ?? ''];
/** The chiefs of a kind (the fill pass picks from these). */
export const chiefsOfKind = (kind: string): WarChief[] => WAR_CHIEFS.filter((c) => c.kind === kind);
/** Ticks a slain chief's lair stays clear: 37.5 min at depth 1 (30 at home), 60 on the rim. */
export const chiefRespawn = (depth: number): number => Math.round(18000 + 4500 * Math.max(0, Math.min(4, depth)));

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
