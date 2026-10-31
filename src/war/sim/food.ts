/**
 * W-60 hunger (docs/WAR.md "Food"): every man of a player has a satiety, 0..HUNGER.max. It runs down as time passes; below
 * HUNGER.eatAt he eats on his own, one bite a check: a ration from his pack, else plain food from his pack, else the same
 * from a store of his team within HUNGER.storeR tiles. Unfed, he goes Hungry, then Starving: mild steps on his pace and
 * blows, and a starving man slowly loses health down to HUNGER.floor of his max (hunger never kills). The wild's men
 * (MOB_TEAM) do not eat. A dish or a cook's meal (the fed buff) fills him up.
 */
export const HUNGER = {
  max: 100,
  /** Satiety lost a second: full to empty in 30 minutes. */
  decay: 100 / 1800,
  /** He eats below this. */
  eatAt: 60,
  /** Stage thresholds: Hungry below `hungry`, Starving below `starving`. */
  hungry: 40,
  starving: 15,
  /** Satiety a bite gives: a ration twice plain food (and it weighs half: holders.ts perLoad). */
  ration: 60,
  food: 30,
  /**
   * W-79: rations a man's pack holds without making him laden; a new player's start squad marches in with this many each
   * (online: server/src/war/guide.ts on his first visit home), about two hours fed with no store near.
   */
  kit: 8,
  /** W-80: plain food a store packs into one ration when it refills a pack (a ration feeds as two). */
  packFood: 2,
  /** A store of his team this near feeds him and refills his pack (tiles). */
  storeR: 6,
  /** Ticks between checks. */
  every: 10,
  /** Starving: share of max hp lost a second, never below `floor` of it. */
  drain: 0.002,
  floor: 0.25,
  /** By stage (fed, hungry, starving): pace and blow multipliers. */
  pace: [1, 0.9, 0.75],
  attack: [1, 0.9, 0.75],
} as const;

export type HungerStage = 0 | 1 | 2;
export const HUNGER_NAMES = ['Fed', 'Hungry', 'Starving'] as const;

/** 0 fed, 1 hungry, 2 starving. */
export const hungerStage = (sat: number): HungerStage => (sat < HUNGER.starving ? 2 : sat < HUNGER.hungry ? 1 : 0);
export const pace = (sat: number): number => HUNGER.pace[hungerStage(sat)];
export const blow = (sat: number): number => HUNGER.attack[hungerStage(sat)];
