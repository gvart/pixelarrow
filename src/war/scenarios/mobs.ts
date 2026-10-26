/**
 * Mob scenarios: one pack of each kind (src/war/sim/mobs.ts, class mob_<kind>) comes at a squad of hoplites and one of
 * archers on open grass. The lairs with their aggro and leash, and the claim, are neutral-clear's (./index.ts).
 */
import type { MobKind } from '../types';
import type { Scenario } from './types';
import { at, FIELD, you } from './kit';

const PACK: Record<MobKind, { n: number; note: string; check: string }> = {
  wolf: { n: 6, note: 'A wolf pack runs in fast and bites.', check: 'Wolves close fast and circle; they break off when hurt' },
  boar: { n: 4, note: 'Boars charge.', check: 'Boars charge home and knock men about' },
  bear: { n: 2, note: 'Two bears: few, hard to kill.', check: 'A bear takes many blows; its swipes hit hard' },
  bandit: { n: 10, note: 'A bandit band attacks like soldiers.', check: 'Bandits fight as a squad (their archers shoot)' },
  jackal: { n: 6, note: 'Jackals: many, weak, quick.', check: 'Jackals swarm; each falls fast' },
  ibex: { n: 6, note: 'An ibex herd grazes: hunt it (right-click it with the archers).', check: 'The herd bolts when shot; fallen ibex leave hides' },
};

export const MOB_SCENARIOS: Scenario[] = (Object.keys(PACK) as MobKind[]).map((kind): Scenario => ({
  id: `mob-${kind}`,
  name: `Mob: ${kind}`,
  group: 'mobs',
  goal: `${PACK[kind].note} Your hoplites and archers stand on the open grass by the east road.`,
  check: [PACK[kind].check, 'Their sprites, walk, attack and fall animations play', 'Score panel: the pack against your men'],
  squads: [
    you('hoplite', at(FIELD, -4, 6)), you('archer', at(FIELD, 4, 8), 8),
    { team: 1, cls: `mob_${kind}`, count: PACK[kind].n, x: FIELD[0], y: FIELD[1] - 22, owner: 'raiders', ...(kind === 'ibex' ? {} : { bot: { kind: 'attackMove' as const, x: FIELD[0], y: FIELD[1] + 6 } }) },
  ],
  camera: { x: FIELD[0], y: FIELD[1] - 6, zoom: 1 / 2 },
}));
