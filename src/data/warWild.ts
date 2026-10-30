/**
 * world-fill data the region kit (scripts/war/regions/fill.ts, run by node without a bundler) reads as well as the
 * game: the named local mini-bosses (chiefs) and their per-kind table, and the hidden quest templates' ids. No value
 * imports here (node resolves only explicit paths); the chiefs' loot roll lives in ./warBosses.ts, the hidden quests'
 * stories in ./warStories.ts.
 */
import type { Rarity } from './items';

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
  /** Hp and damage over a man of his kind, and armour on top of his (a chief fight lasts 60-90 s against 20 men). */
  hp: number; dmg: number; armor: number;
  /** Men of his kind with him. */
  escort: number;
  /** His kill drops (a pile where he fell): coin and goods, each x (1 + per x depth); an item at `item.chance`. */
  loot: { coin: number; goods: Readonly<Record<string, number>>; per: number; item: { chance: number; rarity: readonly (readonly [Rarity, number])[] } };
}

const BEAST_ITEM = { chance: 0.35, rarity: [['uncommon', 60], ['rare', 35], ['epic', 5]] as const };
export const CHIEF_KINDS: Readonly<Record<string, ChiefKind>> = {
  wolf: { scale: 1.4, tint: 0xc4c8d8, hp: 73, dmg: 2.2, armor: 6, escort: 5, loot: { coin: 12, goods: { hides: 6 }, per: 0.5, item: BEAST_ITEM } },
  boar: { scale: 1.35, tint: 0xa88a78, hp: 29, dmg: 1.8, armor: 6, escort: 2, loot: { coin: 12, goods: { hides: 6, food: 10 }, per: 0.5, item: BEAST_ITEM } },
  bear: { scale: 1.3, tint: 0x9a8a80, hp: 7, dmg: 1.5, armor: 6, escort: 1, loot: { coin: 15, goods: { hides: 8 }, per: 0.5, item: BEAST_ITEM } },
  bandit: { scale: 1.2, tint: 0xd8b890, hp: 19, dmg: 1.6, armor: 6, escort: 6, loot: { coin: 25, goods: { iron: 4 }, per: 0.5, item: { chance: 0.5, rarity: [['uncommon', 45], ['rare', 45], ['epic', 10]] } } },
  jackal: { scale: 1.45, tint: 0xd8b070, hp: 100, dmg: 2.6, armor: 6, escort: 5, loot: { coin: 10, goods: { hides: 5 }, per: 0.5, item: BEAST_ITEM } },
  lion: { scale: 1.35, tint: 0xe0a860, hp: 33, dmg: 1.7, armor: 6, escort: 2, loot: { coin: 15, goods: { hides: 8 }, per: 0.5, item: BEAST_ITEM } },
  serpent: { scale: 1.35, tint: 0x8ab088, hp: 15.5, dmg: 1.5, armor: 6, escort: 1, loot: { coin: 15, goods: { hides: 6, herbs: 4 }, per: 0.5, item: BEAST_ITEM } },
  scorpion: { scale: 1.4, tint: 0x6a5048, hp: 20, dmg: 1.6, armor: 6, escort: 2, loot: { coin: 15, goods: { hides: 4, herbs: 4 }, per: 0.5, item: BEAST_ITEM } },
  harpy: { scale: 1.3, tint: 0xa898b8, hp: 58, dmg: 1.8, armor: 6, escort: 3, loot: { coin: 12, goods: { linen: 3 }, per: 0.5, item: BEAST_ITEM } },
  cyclops: { scale: 1.2, tint: 0xc0a890, hp: 3.6, dmg: 1.2, armor: 6, escort: 1, loot: { coin: 25, goods: { bronze: 4, food: 10 }, per: 0.5, item: { chance: 0.5, rarity: [['uncommon', 40], ['rare', 48], ['epic', 12]] } } },
  drake: { scale: 1.35, tint: 0xd07858, hp: 20, dmg: 1.6, armor: 6, escort: 2, loot: { coin: 15, goods: { hides: 8 }, per: 0.5, item: BEAST_ITEM } },
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
  { id: 'ursa', name: 'Old Ursa', title: 'Mother of the high dens', kind: 'bear' },
  { id: 'brokentooth', name: 'Brokentooth', title: 'Bear of the scree', kind: 'bear' },
  { id: 'crooked_blade', name: 'Kallias Crooked-Blade', title: 'Bandit chief', kind: 'bandit' },
  { id: 'toll_taker', name: 'Drakos the Toll-Taker', title: 'Bandit chief', kind: 'bandit' },
  { id: 'one_ear', name: 'One-Ear Nikon', title: 'Bandit chief', kind: 'bandit' },
  { id: 'flayer', name: 'Zopyros the Flayer', title: 'Bandit chief', kind: 'bandit' },
  { id: 'red_hand', name: 'Lampon Red-Hand', title: 'Bandit chief', kind: 'bandit' },
  { id: 'sly_hunger', name: 'Sly Hunger', title: 'The grinning pack-mother', kind: 'jackal' },
  { id: 'dust_tail', name: 'Dust-Tail', title: 'Pack-leader of the waste', kind: 'jackal' },
  { id: 'old_carrion', name: 'Old Carrion', title: 'It follows the dying', kind: 'jackal' },
  { id: 'gnaw_jaw', name: 'Gnaw-Jaw', title: 'Jackal of the tombs', kind: 'jackal' },
  { id: 'scarmane', name: 'Old Scarmane', title: 'Lion of the dry grass', kind: 'lion' },
  { id: 'aithon', name: 'Aithon the Red', title: 'Lion of the kopjes', kind: 'lion' },
  { id: 'thorn_lion', name: 'the Thorn-Lion', title: 'Lion of the scrub', kind: 'lion' },
  { id: 'reed_mother', name: 'the Reed-Mother', title: 'Serpent of the shallows', kind: 'serpent' },
  { id: 'old_coil', name: 'Old Coil', title: 'Serpent of the ford', kind: 'serpent' },
  { id: 'mud_drinker', name: 'the Mud-Drinker', title: 'Serpent of the fens', kind: 'serpent' },
  { id: 'old_hiss', name: 'Old Hiss', title: 'Serpent of the reed beds', kind: 'serpent' },
  { id: 'stingmother', name: 'the Sting-Mother', title: 'Queen of the burrows', kind: 'scorpion' },
  { id: 'black_tail', name: 'Black-Tail', title: 'Scorpion of the salt flats', kind: 'scorpion' },
  { id: 'old_pincer', name: 'Old Pincer', title: 'Scorpion of the dry wadis', kind: 'scorpion' },
  { id: 'kelaino', name: 'Kelaino the Dark', title: 'Mother of the roost', kind: 'harpy' },
  { id: 'aello', name: 'Aello Storm-Swift', title: 'Harpy of the cliffs', kind: 'harpy' },
  { id: 'okypete', name: 'Okypete', title: 'The swift-wing', kind: 'harpy' },
  { id: 'stone_eye', name: 'Old Stone-Eye', title: 'Cyclops of the high caves', kind: 'cyclops' },
  { id: 'glacier_maw', name: 'Glacier-Maw', title: 'Cyclops of the glacier', kind: 'cyclops' },
  { id: 'cairn_breaker', name: 'Cairn-Breaker', title: 'Cyclops of the passes', kind: 'cyclops' },
  { id: 'ember_jaw', name: 'Ember-Jaw', title: 'Eldest of the brood', kind: 'drake' },
  { id: 'scale_mother', name: 'the Scale-Mother', title: 'Drake of the bone pits', kind: 'drake' },
  { id: 'ashwyrm', name: 'Ashwyrm', title: 'Drake of the scree', kind: 'drake' },
];

const CHIEF_BY_ID = new Map(WAR_CHIEFS.map((c) => [c.id, c]));
export const warChief = (id: string): WarChief | undefined => CHIEF_BY_ID.get(id);
/** A chief's kind row (undefined: a kind with no chiefs yet). */
export const chiefKind = (id: string): ChiefKind | undefined => CHIEF_KINDS[warChief(id)?.kind ?? ''];
/** The chiefs of a kind (the fill pass picks from these). */
export const chiefsOfKind = (kind: string): WarChief[] => WAR_CHIEFS.filter((c) => c.kind === kind);
/** Ticks a slain chief's lair stays clear: 37.5 min at depth 1 (30 at home), 60 on the rim. */
export const chiefRespawn = (depth: number): number => Math.round(18000 + 4500 * Math.max(0, Math.min(4, depth)));


/** The hidden quest templates (src/data/warStories.ts HIDDEN), by id: the fill pass names one per spot. */
export const HIDDEN_IDS = ['corpse', 'cache', 'shrine', 'ruin'] as const;
