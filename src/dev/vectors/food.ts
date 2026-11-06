/** Food vectors (src/war/sim/food.ts): hungerStage, pace and blow across satiety, edges included. */
import { blow, hungerStage, pace } from '../../war/sim/food';
import { Rng } from '../../sim/rng';

export const vectors = () => {
  const r = new Rng(37), sats = [-5, 0, 14.999, 15, 15.001, 39.999, 40, 40.001, 60, 100, 120];
  for (let i = 0; i < 60; i++) sats.push(r.range(-10, 110));
  return { cases: sats.map((s) => [s, hungerStage(s), pace(s), blow(s)]) };
};
