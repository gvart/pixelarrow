/**
 * Boss raids (src/war/sim/bosses.ts) for the guardians the landmark scenarios (./index.ts, ./trailer.ts: Drakon, the
 * Bandit King, Gyges, the Chimera, Scylla, the Titan) leave out. Neutral play: the region's lairs and guardians spawn
 * first; each raid squad attack-moves on its guardian as it stands (ScenarioSquad.go), sized by the guardian's tier.
 */
import type { Scenario } from './types';
import { attackMove, you } from './kit';

type Raid = { id: string; boss: string; name: string; region: string; at: [number, number]; from: [number, number]; tier: 1 | 2 | 3; goal: string; check: string[]; to?: number };
const TIER: Record<1 | 2 | 3, string[]> = {
  1: ['hoplite', 'archer', 'celt_sword'],
  2: ['hoplite', 'hoplite', 'archer', 'archer'],
  3: ['hoplite', 'hoplite', 'celt_sword', 'archer', 'archer'],
};

const RAIDS: Raid[] = [
  { id: 'boss-moor-bear', boss: 'moor_bear', name: 'Great Bear of the Moors', region: 'moors', at: [169, 93], from: [169, 113], tier: 1,
    goal: 'A 3-squad raid on the Great Bear in its den on the moors.', check: ['One huge beast: blows land slowly, hit hard', 'The guardian bar shows its hp', 'Its kill drops loot and opens the claim'] },
  { id: 'boss-griffin', boss: 'griffin', name: 'Griffin of the Kimmerian Hills', region: 'kimmeria', at: [237, 197], from: [237, 217], tier: 1,
    goal: 'A 3-squad raid on the Griffin at its eyrie in the Kimmerian hills.', check: ['The Griffin fights the raid at its post', 'Archers keep hitting it', 'Its kill opens the claim point it guards'] },
  { id: 'boss-savanna-lion', boss: 'savanna_lion', name: 'Lion of the Savanna', region: 'savanna', at: [189, 209], from: [189, 229], tier: 1,
    goal: 'A 3-squad raid on the Lion of the Savanna.', check: ['The lion goes for the nearest men', 'The jackal lairs round it stay out unless pulled', 'Its kill drops loot'] },
  { id: 'boss-maenad-queen', boss: 'maenad_queen', name: 'the Maenad Queen', region: 'bacchae', at: [69, 49], from: [80, 68], tier: 1,
    goal: 'A 3-squad raid on the Maenad Queen and her thiasos.', check: ['Her thiasos dances fast through the trees', 'Kill the guard or go for the Queen', 'Her kill opens the claim'] },
  { id: 'boss-brontes', boss: 'brontes', name: 'Brontes the Cyclops', region: 'saddle', at: [257, 279], from: [257, 302], tier: 2,
    goal: 'A 4-squad raid at the Cyclopean gatehouse: Brontes hurls rocks from the gate top, then comes down.', check: ['P1: rocks from the gate top (range 25), breaking wood', 'P2 (under 85%): he comes down and smashes (knock 2)', 'His blows wreck buildings, his own walls too'] },
  { id: 'boss-grove-queen', boss: 'grove_queen', name: 'Maenad Queen of the Grove', region: 'erymanthos', at: [159, 357], from: [170, 376], tier: 2,
    goal: 'A 4-squad raid into the Oracle Grove on the Maenad Queen.', check: ['The thiasos dances fast through the trees', 'P2 (under 40%): frenzied, she calls two maenad packs', 'Her kill drops asphodel'] },
  { id: 'boss-river-god', boss: 'river_god', name: 'Achelous the River-God', region: 'delta', at: [236, 353], from: [236, 374], tier: 3,
    goal: 'A 5-squad raid at the sunken temple on Achelous: giant, serpent in the channels, bull.', check: ['As the serpent he is reached only from the fords (aloft 2)', 'Venom from the serpent; the bull charges through the ranks', 'Phases at 66% and 33%'] },
  { id: 'boss-minotaur', boss: 'minotaur', name: 'the Minotaur', region: 'omphalos', at: [397, 193], from: [397, 214], tier: 3,
    goal: 'A 5-squad raid on the Minotaur in the Temple City (the Titan holds the arena to the south).', check: ['The Minotaur fights as a brute: heavy blows, much hp', 'The raid scales him only past its tier size', 'Keep clear of the Titan\'s arena'] },
  { id: 'boss-drakon-late', boss: 'drakon', name: 'Drakon, late phase', region: 'krios', at: [280, 350.5], from: [292, 370], tier: 3, to: 0.55,
    goal: 'Drakon the White starts at 55%: past the roof phase, crashing down enraged, the drakes coming from the bone pit.', check: ['He starts in P3: knockdown on landing, enraged', 'Drake packs come from the bone pit', 'The guardian bar shows the phase marks'] },
];

export const BOSS_SCENARIOS: Scenario[] = RAIDS.map((r): Scenario => ({
  id: r.id,
  name: `Boss: ${r.name}`,
  group: 'bosses',
  goal: r.goal,
  check: [...r.check, 'G: the boss camera; L: the landmark panel'],
  region: r.region,
  neutral: true,
  ...(r.to ? { bosses: [{ boss: r.boss, to: r.to }] } : {}),
  squads: TIER[r.tier].map((cls, i) => you(cls, [r.from[0] + (i - (TIER[r.tier].length - 1) / 2) * 6, r.from[1] + (i % 2) * 4], 12, attackMove(r.at))),
  camera: { x: (r.at[0] + r.from[0]) / 2, y: (r.at[1] + r.from[1]) / 2, zoom: 1 / 2 },
}));
